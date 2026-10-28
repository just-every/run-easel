import { stageProviderSource,assertSourceGuardAcceptance,completeSourceGuards } from './agents/source-guard'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { intacctAuthority, intacctKey } from './intacct-connection'
import { readIntacctLedger } from './intacct-provider'

import { all, find, put, requireThat, type Data } from './types'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const decimal = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const safe = (n: number) => { requireThat(Number.isSafeInteger(n), 'Intacct actuals exceed exact cents', 409); return n }

type SourceRow = Data & { opening?: boolean }

/** Finance reviews the source and mapping fingerprint before the journal accepts a delta. */
export async function intacctImport(c: Context, env: Bindings, op: string, b: Data): Promise<KitStep | undefined> {
 intacctAuthority(c)
 requireThat(op === 'preview' || op === 'stage' || op === 'commit', 'Use the ordinary actuals journal to resume or undo Intacct imports', 404)
 const key = await intacctKey(c, env)
 const binding=all(c.s,'intacct-entity-map').find(r=>r.company===key.companyId&&r.sourceEntity===b.sourceEntity&&r.book==='ACCRUAL')
 requireThat(binding,'Bind the Intacct legal entity to its Easel source plan first',409)
 const source = await readIntacctLedger(key, binding.sourceEntity, b.month, c.now.slice(0, 10))
 requireThat(source.currency===binding.currency,'The bound entity base currency changed',409)
 if(op==='commit')requireThat(source.trialBalance.balanced,'Intacct ledger and independent trial balance differ; review account differences before acceptance',409)
 requireThat(source.to <= c.now.slice(0, 10), 'A Intacct import cannot include future dates')
 requireThat(all(c.s,'entity').some(e=>e.id===binding.entity&&e.currency===source.currency),'The bound entity currency changed',409)
 requireThat(typeof b.includeOpening === 'boolean', 'Choose whether this is the first Intacct month')
 const old = await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.intacctCompany')=? AND json_extract(value,'$.intacctBook')='ACCRUAL' AND json_extract(value,'$.entity')=? AND json_extract(value,'$.intacctMonth')=?").bind(key.companyId,binding.entity,source.month).all<{value:string}>()
 const history=all(c.s,'intacct-month').filter(row=>row.company===key.companyId&&row.entity===binding.entity&&row.book==='ACCRUAL')
 const months = history.filter(row=>row.status==='accepted').map(row=>row.month as string)
 const firstMonth = history.map(row=>row.month).filter((value): value is string => typeof value === 'string').sort()[0] ?? null
 if (!firstMonth) requireThat(b.includeOpening, 'Include the source opening trial balance with the first Intacct month', 409)
 else {
  requireThat(source.month >= firstMonth, 'An earlier Intacct month would change the reviewed opening boundary', 409)
  requireThat(b.includeOpening === (source.month === firstMonth), 'Include the source opening only with the first imported Intacct month', 409)
  if (source.month > firstMonth && !months.includes(source.month)) {
   const previous = new Date(Date.UTC(Number(source.month.slice(0, 4)), Number(source.month.slice(5)) - 2, 1)).toISOString().slice(0, 7)
   requireThat(months.includes(previous), `Import ${previous} before ${source.month} so the source trial balance stays continuous`, 409)
  }
 }

 const moved:Data[]=[]
 for(let start=0;start<source.rows.length;start+=80){
  const chunk=source.rows.slice(start,start+80)
  const existing=await c.db.prepare(`SELECT value FROM e_actuals WHERE json_extract(value,'$.intacctCompany')=? AND json_extract(value,'$.entity')=? AND json_extract(value,'$.intacctLine') IN (${chunk.map(()=>'?').join(',')})`).bind(key.companyId,binding.entity,...chunk.map(r=>r.id)).all<{value:string}>()
  for(const item of existing.results){const prior=JSON.parse(item.value),current=chunk.find(r=>r.id===prior.intacctLine)!;if(prior.intacctMonth!==source.month)moved.push({record:current.id,before:{month:prior.intacctMonth,date:prior.date,account:prior.account},after:{month:source.month,date:current.date,account:current.account}})}
 }
 requireThat(!moved.length,`Intacct moved accepted records across periods; review both periods in a correcting import before acceptance: ${JSON.stringify(moved.map(r=>({record:r.record,before:r.before.month,after:r.after.month})))}`,409)
 const desired: SourceRow[] = [...source.rows]
 if (b.includeOpening) for (const account of source.chart) {
  const amount = source.trialBalance.opening[account.id] ?? 0
  if (!amount) continue
  desired.push({ id: `opening:${account.id}:${source.from}`, transactionId: '',  date: new Date(Date.parse(`${source.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), accountId: account.id, account: account.code, accountName: account.name, accountType: account.type, amount, department:'', sourceDimensions:{}, dimensionLabels:{},entryUrl:null, description: 'Source trial balance opening', reference: '', opening: true })
 }
 const prior = new Map<string,Data>()
 for(const item of old.results){
  const row:Data=JSON.parse(item.value)
  requireThat(typeof row.intacctLine==='string'&&Number.isSafeInteger(row.amount),'Accepted Intacct provenance is incomplete',409)
  const before=prior.get(row.intacctLine)
  if(before)requireThat(before.account===row.account&&before.date===row.date&&before.department===row.department&&canonicalJson(before.sourceDimensions)===canonicalJson(row.sourceDimensions),'Accepted Intacct provenance changed',409)
  prior.set(row.intacctLine,{...row,amount:safe((before?.amount??0)+row.amount)})
 }
 const deltas:SourceRow[]=[],metadata:Record<number,Data>={}
 const push=(row:SourceRow,amount:number,first=false)=>{
  if(!amount&&!first)return
  deltas.push({...row,amount})
  metadata[deltas.length+1]={intacctCompany:key.companyId,intacctBook:'ACCRUAL',intacctMonth:source.month,entity:binding.entity,intacctSourceEntity:binding.sourceEntity,intacctCurrency:source.currency,intacctLine:row.id,intacctOpening:row.opening===true,intacctTransactionId:row.transactionId,intacctAccountId:row.accountId,intacctEntryUrl:row.entryUrl??null,sourceDimensions:row.sourceDimensions,dimensionLabels:row.dimensionLabels}
 }
 for(const row of desired){
  const before=prior.get(row.id)
  if(before)requireThat(before.account===row.account&&before.date===row.date&&before.department===(row.department||'(blank)')&&before.accountType===row.accountType&&canonicalJson(before.sourceDimensions)===canonicalJson(row.sourceDimensions),'Intacct changed an accepted line identity or period; review a correcting import including both periods',409)
  push(row,safe(row.amount-(before?.amount??0)),!before)
  prior.delete(row.id)
 }
 // Removed provider lines are journaled as visible reversals.
 for(const before of prior.values())push({id:before.intacctLine,transactionId:before.intacctTransactionId,date:before.date,accountId:before.intacctAccountId,account:before.account,accountName:before.accountName,accountType:before.accountType,department:before.department==='(blank)'?'':before.department,sourceDimensions:before.sourceDimensions,dimensionLabels:before.dimensionLabels,entryUrl:before.intacctEntryUrl,description:before.description,reference:before.reference,opening:before.intacctOpening},safe(-before.amount))
 requireThat(deltas.length<=5000,'Intacct journal exceeds 5,000 rows; no partial source accepted',409)
 const digest = sha256(canonicalJson({ source: source.digest, binding, includeOpening:b.includeOpening, deltas, metadata }))
 const inventory={chart:source.chart,dimensions:source.dimensions}
 const priorInventory=history.filter(r=>r.status==='accepted').at(-1)?.inventory
 const changes=(current:Data[],prior:Data[]=[])=>(current.map(row=>{const before=prior.find(r=>r.id===row.id);return{...row,change:!before?'new':canonicalJson(before)!==canonicalJson(row)?'changed':'unchanged'}})).filter(row=>row.change!=='unchanged')
 const sourceChanges={accounts:changes(inventory.chart,priorInventory?.chart),dimensions:canonicalJson(source.dimensions)===canonicalJson(priorInventory?.dimensions??{})?[]:[{change:'changed',metadata:source.dimensions}]}
 const changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const sourceSummary={month:source.month,from:source.from,to:source.to,currency:source.currency,entity:source.entity,easelEntity:binding.entity,book:source.book,chart:source.chart,dimensions:source.dimensions,trialBalance:source.trialBalance,ledgerRows:source.rows.length,openingIncluded:b.includeOpening,changes:sourceChanges,limits:{rows:5000,bytes:2000000}}
 const monthId=JSON.stringify([key.companyId,'ACCRUAL',binding.sourceEntity,source.month])
 const receipt={id:monthId,company:key.companyId,book:'ACCRUAL',sourceEntity:binding.sourceEntity,entity:binding.entity,currency:source.currency,month:source.month,through:source.to,sourceFingerprint:digest,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory,binding}

 const recordMonth = (context: Context) => {
  put(context.s,'intacct-month',monthId,{...find(context.s,'intacct-month',monthId),...receipt,status:'accepted',acceptedAt:context.now})
  context.activity.push({action:'intacct-month-accepted',record:monthId,detail:{entity:binding.entity,month:source.month,changedRows:deltas.length,reconciled:true}})
  put(context.s,'connection','intacct',{...find(context.s,'connection','intacct'),lastRefresh:context.now,rowCount:source.rows.length,error:null,rateLimit:null})
 }
 if (!deltas.length) {
  if (op === 'commit') {
   requireThat(b.sourceFingerprint === digest, 'Intacct changed after preview; review again', 409)
   assertSourceGuardAcceptance(c,digest,[source.month],binding.entity)
   recordMonth(c)
   completeSourceGuards(c,{sha256:digest})
  }
  if(op==='stage')return{result:stageProviderSource(c,{...b,source:monthId,scenario:all(c.s,'entity').find(e=>e.id===binding.entity)?.forecast??binding.scenario,entity:binding.entity},{accounts:[],departments:[],dimensionExceptions:[],sha256:digest,sourceFingerprint:digest},{headers:[],accounts:source.chart.map(a=>({account:a.code,name:a.name,types:[a.type]})),dimensions:source.dimensions,coverage:{month:source.month,opening:b.includeOpening}})}
  return { result: { source: sourceSummary, sourceFingerprint: digest, changedRows: 0, changedTransactions:0, unchanged: true, accepted: op === 'commit' } }
 }
 const rows = [['Date', 'Account', 'Account name', 'Account type', 'Department', 'Amount', 'Description', 'Reference'],
  ...deltas.map(r => [r.date, r.account, r.accountName, r.accountType, r.department, decimal(r.amount), r.description, r.opening ? `Intacct opening ${r.accountId}` : `Intacct ${r.transactionId} ${r.reference}`])]
 const input = {
  filename: `intacct-${binding.entity}-${source.month}-${digest.slice(0, 12)}.csv`,
  csv: rows.map(row => row.map(csv).join(',')).join('\n'),
  columns: { date: 'Date', account: 'Account', accountName: 'Account name', accountType: 'Account type', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' },
  dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive', fingerprint: b.fingerprint, acknowledgeRejected: 0,
 }
 if (op === 'commit') requireThat(b.sourceFingerprint === digest, 'Intacct changed after preview; review again', 409)
 const step = await actualsCommand(c,op==='stage'?'preview':op,input,metadata)
 requireThat(step, 'Unknown actuals step', 404)
 if (op === 'preview'||op==='stage') step.result = { ...step.result, source: sourceSummary, sourceFingerprint: digest, changedRows: deltas.length,changedTransactions }
 if(op==='stage')return{result:stageProviderSource(c,{...b,source:monthId,scenario:all(c.s,'entity').find(e=>e.id===binding.entity)?.forecast??binding.scenario,entity:binding.entity},step.result,{headers:Object.keys(metadata[2]??{}),accounts:source.chart.map(a=>({account:a.code,name:a.name,types:[a.type]})),dimensions:source.dimensions,coverage:{month:source.month,opening:b.includeOpening}})}
 if (op === 'commit' && step.record) {
  const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing')
  requireThat(batch,'Intacct journal batch was not created',409)
  put(c.s,'batch',batch.id,{...batch,entity:binding.entity,intacctSource:{...receipt,priorReceipt:find(c.s,'intacct-month',monthId)??null}})
 }
 return step
}
