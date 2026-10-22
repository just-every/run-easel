import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob, readD1ImportUndoReport, resumeD1Import, sha256, undoD1Import, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import { access, requireFinance, requireMember, requirePayDetail } from './access'
import type { Context, KitStep } from './context'
import { base64 } from './kit'
import { moveContext, MOVE_NAMESPACE, structureAssumptions } from './move-journal'
import { moveIdentityMapping } from './move-identities'
import { mapMove } from './move-mapping'
import { parseAdaptive } from './move-adaptive'
import { parseTabular } from './move-tabular'
import { moveBytes, type MoveArtifact } from './move-source'
import { filterCalculation } from './views'
import { all, choice, find, get, put, requireThat, text, type Data } from './types'

export async function previewMove(c: Context, b: Data) {
 requireMember(c.x)
 const provider = choice(b.provider, ['adaptive','planful','anaplan','runway','pigment'] as const, 'an export provider')
 requireThat(Array.isArray(b.files) && b.files.length > 0 && b.files.length <= 40, 'Choose between 1 and 40 export files')
 const files = b.files as MoveArtifact[]
 for (const file of files) file.name = text(file.name, 'Export filename', 200)
 requireThat(new Set(files.map(f=>f.name)).size === files.length, 'Export filenames must be unique')
 const originals = files.map(f=>({file:f,bytes:moveBytes(f)}))
 requireThat(originals.reduce((n,f)=>n+f.bytes.length,0) <= 6_000_000, 'Split export bundles larger than 6 MB')
 const source = provider === 'adaptive' ? await parseAdaptive(files,b.options ?? {}) : await parseTabular(provider,files,b.options ?? {})
 requireThat(source.versions.length && source.data.length, 'The export needs versions and monthly account data')
 requireThat(source.data.length <= 5000 && source.personnel.length <= 2000, 'Split this export into smaller version bundles')
 const mapping = b.mapping ?? {}
 const identity = sha256(canonicalJson({provider,artifacts:originals.map(({file:{text:_text,base64:_base64,...context},bytes})=>({...context,sha256:sha256(bytes)})),options:b.options ?? {},mapping}))
 const id = `move-${identity.slice(0,24)}`, destination = `incumbent:${identity.slice(0,24)}`
 const prior = find(c.s,'move-import',id)
 requireThat(!prior || ['undone','failed'].includes(prior.status),'This export is already imported or awaiting continuation; continue it or undo it first',409)
 const mapped = mapMove(source,c.s,mapping,id,c.x.actor.email,provider)
 const artifacts = originals.map(({file,bytes})=>({name:file.name,sha256:sha256(bytes),size:bytes.length,original:{status:'available' as const,base64:base64(bytes)}}))
 const identities = moveIdentityMapping(mapped.state,source,files,artifacts,mapping,b.options ?? {},provider,destination,mapped.positions)
 mapped.records.push({kind:'move-personnel-mapping',id:`${id}:identities`,value:identities,location:'reviewed-personnel-associations'})
 // Binding current assumptions and target rows makes a stale review fail before writing.
 const ctx = moveContext(c,destination,`move-v1:${sha256(canonicalJson({provider,identity,records:mapped.records,targets:structureAssumptions(c,destination)})).slice(0,24)}`,undefined,true)
 const records = mapped.records.map((r,i)=>({namespace:MOVE_NAMESPACE,kind:r.kind,sourceId:String(i),payload:{targetId:r.id,value:r.value},payloadHash:sha256(canonicalJson({targetId:r.id,value:r.value})),artifactHash:artifacts[0].sha256,location:{artifact:artifacts[0].name,pointer:r.location}}))
 const bundle: SourceBundle = {diagnostics:[],artifacts,records}
 const map: ImportMapping = {version:ctx.mappingVersion,map:record=>({effects:[{targetKind:record.kind,targetId:(record.payload as Data).targetId,value:(record.payload as Data).value}]})}
 const plan = await planD1Import(bundle,map,ctx)
 const ready = !mapped.unresolved.length && mapped.reconciliation.length > 0 && mapped.reconciliation.every(r=>r.status === 'reconciled')
 const reader = access(mapped.state,c.x.actor)
 const versions = mapped.calculations.map(({version,scenario,calculation})=>{
  const calc = filterCalculation(reader,calculation,all(mapped.state,'line').filter(l=>l.payroll).map(l=>l.id),mapped.state)
  return {sourceVersion:version,id:scenario,name:get(mapped.state,'scenario',scenario).name,months:calc.months,headcount:calc.headcount,cells:calc.cells.map(cell=>({line:cell.line,department:cell.department,month:cell.month,amount:cell.amount})),profit:calc.profit}
 })
 const safe = {id,provider,versions,ready,files:artifacts.map(({name,size,sha256})=>({name,size,sha256}))}
 const detailed = c.x.role === 'finance' && c.x.payDetail
 const result = detailed ? {...safe,created:mapped.created,unresolved:mapped.unresolved,unmapped:mapped.unmapped,reconciliation:mapped.reconciliation,positions:mapped.positions,fingerprint:plan.fingerprint,counts:plan.counts} : safe
 return {id,destination,provider,ctx,plan,fingerprint:plan.fingerprint,ready,mapped,result,artifacts}
}

export async function moveImport(c: Context, op: string, b: Data): Promise<KitStep | undefined> {
 if (op === 'preview') return {result:(await previewMove(c,b)).result}
 requireFinance(c.x); requirePayDetail(c.x)
 requireThat(!c.x.actor.agent && !c.x.actor.token, 'Use your signed-in finance session to move in an incumbent model',403)
 if (op === 'commit') {
  const p = await previewMove(c,b)
  requireThat(p.ready, 'Map the unresolved items and reconcile every account, level, version and month before accepting',409)
  requireThat(b.fingerprint === p.fingerprint, 'The export, mapping or target assumptions changed; preview again',409)
  const prior = find(c.s,'move-import',p.id)
  requireThat(!prior || ['undone','failed'].includes(prior.status), 'This export is already imported',409)
  const attempt = (prior?.attempt ?? 0)+1
  put(c.s,'move-import',p.id,{destination:p.destination,provider:p.provider,files:p.artifacts.map(({name,sha256})=>({name,sha256})),scenarios:p.mapped.scenarios,rows:p.mapped.records.length,assumptions:structureAssumptions(c,p.destination),status:'importing',attempt,createdBy:c.x.actor.email,createdAt:c.now,unmapped:p.mapped.unmapped,reconciliation:p.mapped.reconciliation,created:p.mapped.created})
  c.activity.push({action:'move-import-started',record:p.id,detail:{provider:p.provider,scenarios:p.mapped.scenarios}})
  return {result:{},kit:async()=>{
   const job = await createD1ImportJob(p.plan,{...p.ctx,reviewedFingerprint:p.fingerprint,operationKey:`${p.fingerprint}:${attempt}`})
   return applyD1ImportBatches(job.id,p.ctx)
  },record:(after,job)=>finish(after,p.id,job),failed:async(after,error)=>{
   if (await after.db.prepare('SELECT 1 FROM ik_jobs WHERE destination=?').bind(p.destination).first()) return
   put(after.s,'move-import',p.id,{...get(after.s,'move-import',p.id),status:'failed',error:error.message.slice(0,300)})
  }}
 }
 if (['status','resume','undo'].includes(op)) {
  const imp = get(c.s,'move-import',b.id)
  const job = await c.db.prepare('SELECT id,state,mapping_version,principal_id FROM ik_jobs WHERE destination=? AND namespace=? ORDER BY rowid DESC LIMIT 1').bind(imp.destination,MOVE_NAMESPACE).first<any>()
  requireThat(job,'This import has no journal yet; preview again',409)
  const ctx = moveContext(c,imp.destination,job.mapping_version,job,op==='resume')
  if (op === 'status') return {result:{import:imp,job:await readD1ImportJob(job.id,ctx),undo:['undone','undoing'].includes(job.state)?await readD1ImportUndoReport(job.id,ctx):null}}
  if (op === 'resume') {requireThat(imp.status==='importing','This import is not waiting to continue',409);return {result:{},kit:()=>resumeD1Import(job.id,ctx),record:(after,result)=>finish(after,imp.id,result)}}
  requireThat(['imported','undoing'].includes(imp.status),'Only a completed import can be undone',409)
  put(c.s,'move-import',imp.id,{...imp,status:'undoing',undoErasureReceipts:imp.undoErasureReceipts ?? all(c.s,'erasure').map(m=>m.id)})
  return {result:{},kit:async()=>({job:await undoD1Import(job.id,ctx),report:await readD1ImportUndoReport(job.id,ctx)}),record:(after,{job,report})=>{
   put(after.s,'move-import',imp.id,{...get(after.s,'move-import',imp.id),status:job.state==='undone'?'undone':'undoing',undoneBy:after.x.actor.email,undoneAt:after.now})
   after.activity.push({action:'move-import-undone',record:imp.id,detail:{state:job.state}})
   return {import:get(after.s,'move-import',imp.id),job,undo:report}
  }}
 }
 return undefined
}
function finish(c: Context,id: string,job: Data) {
 const imp = get(c.s,'move-import',id)
 put(c.s,'move-import',id,{...imp,status:job.state==='completed'?'imported':'importing'})
 if (job.state==='completed') c.activity.push({action:'move-imported',record:id,detail:{provider:imp.provider,scenarios:imp.scenarios}})
 return {import:get(c.s,'move-import',id),job:{id:job.id,state:job.state,checkpoint:job.checkpoint,total:job.total}}
}
