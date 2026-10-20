// Roster and payroll-register files use the same reviewed import journal as GL
// and workbook imports. Mapping choices and observations share the journal.
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob, readD1ImportUndoReport, resumeD1Import, sha256, undoD1Import, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import { requireFinance, requirePayDetail } from './access'
import type { Context, KitStep } from './context'
import { base64 } from './kit'
import { payrollJournalContext } from './payroll-journal'
import { readPayrollFile } from './payroll-file'
import { rosterBuckets } from './payroll-reconciliation'
import { all, choice, find, get, put, requireThat, text, type Data } from './types'

const NAMESPACE = 'easel-payroll-files'
const publicPreview = ({ctx: _ctx, plan: _plan, ...view}: Data) => view

async function preview(c: Context, b: Data) {
 requireFinance(c.x); requirePayDetail(c.x)
 const provider = text(b.provider, 'Payroll provider', 100)
 const kind = choice(b.kind, ['roster','register'] as const, 'file kind')
 const scenario = get(c.s, 'scenario', b.scenario)
 const mappings = all(c.s, 'payroll-file-mapping')
 const saved = mappings.filter(m => m.provider === provider && m.kind === kind && all(c.s, 'payroll-import').some(i => i.destination === m.batch && i.status === 'imported')).sort((a,b) => b.order-a.order)[0]
 const file = await readPayrollFile(b, saved?.config)
 const asOf = kind === 'roster' ? text(b.asOf, 'Roster observation date', 10) : ''
 const observed = new Date(`${asOf}T00:00:00Z`)
 if (kind === 'roster') requireThat(!Number.isNaN(observed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(asOf) && observed.toISOString().slice(0,10) === asOf, 'Use a real ISO roster observation date')
 const departmentMap: Data = { ...(saved?.departmentMap ?? {}), ...(b.departmentMap ?? {}) }
 const memberMap: Data = { ...(saved?.memberMap ?? {}), ...(b.memberMap ?? {}) }
 for (const [employee, email] of Object.entries(b.memberMap ?? {})) {
  requireThat(typeof email === 'string', `Choose a member email for employee ${employee}`)
  memberMap[employee] = get(c.s, 'member', email.toLowerCase(), 'associated member').email
 }
 const positionMap: Data = { ...(saved?.positionMap ?? {}), ...(b.positionMap ?? {}) }
 const positions = all(c.s, 'position').filter(p => p.scenario === scenario.id)
 const sourceRows = all(c.s, kind === 'roster' ? 'roster-actual' : 'payroll-run').filter(r => r.provider === provider)
 const rows: Data[] = file.rows.map((row: Data) => {
  const department = departmentMap[row.department] ?? all(c.s,'department').find(d => d.name === row.department)?.id
  requireThat(department && find(c.s, 'department', department), `Map department ${row.department} first`, 409)
  const origin = positionMap[row.employeeId] ?? ''
  if (origin) requireThat(positions.some(p => p.originId === origin && p.department === department), `Choose a position in ${row.department} for employee ${row.employeeId}`, 409)
  requireThat(!sourceRows.some(r => r.employeeId === row.employeeId && (kind === 'roster' ? r.asOf === asOf : r.payDate === row.payDate)), `This employee ${kind === 'roster' ? 'observation' : 'pay run'} is already imported; undo it before replacing it`, 409)
  return { ...row, department, sourceDepartment: row.department, provider, scenario: scenario.id, ...(kind === 'roster' ? { asOf, positionOrigin: origin } : { line: get(c.s, 'line', b.line ?? saved?.line, 'payroll line').id }) }
 })
 if (kind === 'register') requireThat(get(c.s, 'line', b.line ?? saved?.line).payroll, 'Choose a payroll-classified ledger line')
 const linked = rows.map((r: Data) => r.positionOrigin).filter(Boolean)
 requireThat(new Set(linked).size === linked.length, 'A planned position cannot match two employees in one roster')
 const destination = `payroll:${sha256(canonicalJson([provider,kind,scenario.id,asOf,file.sha])).slice(0,24)}`
 const id = destination.slice(8)
 const config = { config: file.config, departmentMap, positionMap, memberMap, line: kind === 'register' ? rows[0]?.line : null }
 const ctx = payrollJournalContext(c, destination, `payroll-v1:${sha256(canonicalJson({ config, rows, positions, departments: all(c.s,'department') })).slice(0,24)}`)
 const mappingPayload = { ...config, provider, kind, batch: destination, order: Math.max(0,...mappings.map(m => m.order)) + 1 }
 const source: SourceBundle = { diagnostics: [], artifacts: [{ name: file.file, sha256: file.sha, size: file.bytes.length, original: { status: 'available', base64: base64(file.bytes) } }], records: [{ namespace: NAMESPACE, kind: 'mapping', sourceId: 'mapping', payload: mappingPayload, payloadHash: sha256(canonicalJson(mappingPayload)), artifactHash: file.sha, location: { artifact: file.file, pointer: 'column-mapping' } }, ...rows.map((r: Data) => ({ namespace: NAMESPACE, kind, sourceId: String(r.row), payload: r, payloadHash: sha256(canonicalJson(r)), artifactHash: file.sha, location: { artifact: file.file, row: r.row } }))] }
 const mapping: ImportMapping = { version: ctx.mappingVersion, map: record => record.kind === 'mapping' ? { effects: [{ targetKind: 'payroll-file-mapping', targetId: `${id}:mapping`, value: record.payload }] } : ({ effects: [{ targetKind: kind === 'roster' ? 'roster-actual' : 'payroll-run', targetId: `${id}:${record.sourceId}`, value: { ...record.payload as Data, batch: destination, file: file.file } }] }) }
 const plan = await planD1Import(source, mapping, ctx)
 return { id, destination, file: file.file, sha256: file.sha, provider, kind, scenario: scenario.id, asOf, rows, config, fingerprint: plan.fingerprint, counts: plan.counts, ...(kind === 'roster' ? { reconciliation: rosterBuckets(c.s, scenario.id, rows) } : { totalCents: rows.reduce((n: number,r: Data) => n+r.totalCents,0) }), ctx, plan }
}

export async function payrollImport(c: Context, op: string, b: Data): Promise<KitStep | undefined> {
 if (op === 'preview') return { result: publicPreview(await preview(c,b)) }
 if (op === 'commit') {
  const p = await preview(c,b)
  requireThat(b.fingerprint === p.fingerprint, 'The payroll file, mapping or plan changed; preview again', 409)
  const prior = find(c.s,'payroll-import',p.id)
  requireThat(!prior || ['undone','failed'].includes(prior.status), 'This file is already imported', 409)
  const attempt = (prior?.attempt ?? 0)+1
  put(c.s,'payroll-import',p.id,{ destination:p.destination, file:p.file, sha256:p.sha256, provider:p.provider, kind:p.kind, scenario:p.scenario, asOf:p.asOf, rows:p.rows.length, status:'importing', attempt, createdBy:c.x.actor.email, createdAt:c.now })
  c.activity.push({ action:'payroll-import-started',record:p.id,detail:{kind:p.kind,rows:p.rows.length} })
  return { result:{}, kit:async()=>{
   const job=await createD1ImportJob(p.plan,{...p.ctx,reviewedFingerprint:p.fingerprint,operationKey:`${p.fingerprint}:${attempt}`})
   return applyD1ImportBatches(job.id,p.ctx)
  },record:(after,job)=>finish(after,p.id,job),failed:async(after,error)=>{
   if(await after.db.prepare('SELECT 1 FROM ik_jobs WHERE destination=?').bind(p.destination).first())return
   put(after.s,'payroll-import',p.id,{...get(after.s,'payroll-import',p.id),status:'failed',error:error.message.slice(0,500)})
  } }
 }
 if (['resume','undo','status'].includes(op)) {
  requireFinance(c.x); requirePayDetail(c.x)
  const imp=get(c.s,'payroll-import',b.id)
  const job=await c.db.prepare('SELECT id,state,mapping_version,principal_id FROM ik_jobs WHERE destination=? AND namespace=? ORDER BY rowid DESC LIMIT 1').bind(imp.destination,NAMESPACE).first<any>()
  requireThat(job,'This import has no journal yet; preview and import again',409)
  const ctx=payrollJournalContext(c,imp.destination,job.mapping_version,job)
  if(op==='status')return {result:{import:imp,job:await readD1ImportJob(job.id,ctx),undo:['undone','undoing'].includes(job.state)?await readD1ImportUndoReport(job.id,ctx):null}}
  if(op==='resume') {requireThat(imp.status==='importing','This import is not waiting to continue',409);return {result:{},kit:()=>resumeD1Import(job.id,ctx),record:(after,result)=>finish(after,imp.id,result)}}
  requireThat(['imported','undoing'].includes(imp.status),'Only a completed import can be undone',409)
  put(c.s,'payroll-import',imp.id,{...imp,status:'undoing'})
  return {result:{},kit:async()=>({job:await undoD1Import(job.id,ctx),report:await readD1ImportUndoReport(job.id,ctx)}),record:(after,result)=>{
   const current=get(after.s,'payroll-import',imp.id)
   put(after.s,'payroll-import',imp.id,{...current,status:result.job.state==='undone'?'undone':'undoing',undoneBy:after.x.actor.email,undoneAt:after.now})
   after.activity.push({action:'payroll-undone',record:imp.id,detail:{state:result.job.state}})
   return {import:get(after.s,'payroll-import',imp.id),...result}
  }}
 }
 return undefined
}
function finish(c: Context,id:string,job:Data) {
 const imp=get(c.s,'payroll-import',id)
 put(c.s,'payroll-import',id,{...imp,status:job.state==='completed'?'imported':'importing'})
 c.activity.push({action:'payroll-import-progress',record:id,detail:{state:job.state}})
 return {import:get(c.s,'payroll-import',id),job:{id:job.id,state:job.state,checkpoint:job.checkpoint,total:job.total}}
}
