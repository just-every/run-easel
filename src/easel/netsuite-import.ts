import { sourceChanges as guardIssues, sourceImpacts } from './agents/source-guard-detection'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { netsuiteAuthority, netsuiteKey } from './netsuite-connection'
import { readNetsuiteLedger, NetsuiteFailure, type NetsuiteLedgerRow } from './netsuite-provider'
import { netsuiteTransactionUrl } from './netsuite-links'
import { workspace } from './model'
import { all, Fault, find, put, requireThat, type Data } from './types'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const decimal = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const safe = (n: number) => { requireThat(Number.isSafeInteger(n), 'NetSuite actuals exceed exact cents', 409); return n }

type SourceRow = NetsuiteLedgerRow & { opening?: boolean; identity?:string }

/** Finance reviews the source and mapping fingerprint before the journal accepts a delta. */
export async function netsuiteImport(c: Context, env: Bindings, op: string, b: Data): Promise<KitStep | undefined> {
 netsuiteAuthority(c)
 requireThat(op === 'preview' || op === 'commit' || op==='observe', 'Use the ordinary actuals journal to resume or undo NetSuite imports', 404)
 const key = await netsuiteKey(c, env)
 const connection=find(c.s,'connection','netsuite')!
 const entityId=connection.subsidiaryEntities?.[b.subsidiaryId],entity=all(c.s,'entity').find(e=>e.id===entityId)
 requireThat(entity,'Map this NetSuite subsidiary to an entity before pulling actuals',409)
 let source:Awaited<ReturnType<typeof readNetsuiteLedger>>
 const observationId=`${key.environment}:${key.realmId}:${b.subsidiaryId}:${b.month}`
 try{source=await readNetsuiteLedger(key,b.month,b.subsidiaryId,c.now.slice(0,10))}catch(e){
  if(op!=='observe'||!(e instanceof Fault)||![409,502].includes(e.status))throw e
  const rateLimit=e instanceof NetsuiteFailure?e.rateLimit:null
  put(c.s,'netsuite-observation',observationId,{entity:entity.id,realmId:key.realmId,subsidiaryId:b.subsidiaryId,month:b.month,error:e.message,observedAt:c.now})
  put(c.s,'connection','netsuite',{...connection,error:e.message,rateLimit,lastCheck:c.now})
  c.activity.push({action:'netsuite-source-checked',record:observationId,detail:{month:b.month,error:e.message}})
  return{result:{error:e.message,rateLimit,accepted:false}}
 }
 requireThat(entity.currency===source.currency,'NetSuite subsidiary currency changed; review its entity',409)
 const unsupportedTransactions=[...new Map(source.rows.filter(row=>!netsuiteTransactionUrl(key.realmId,row.transactionType,row.transactionId)).map(row=>[JSON.stringify([row.transactionId,row.transactionType]),{transactionId:row.transactionId,type:row.transactionType}])).values()]
 if(op==='commit')requireThat(!unsupportedTransactions.length,'This source transaction type has no supported NetSuite destination; no rows were accepted',409)
 if(op==='commit')requireThat(source.trialBalance.balanced,'NetSuite ledger and source trial balance differ; review the displayed account differences before acceptance',409)
 if(op==='commit'&&source.nonPostingRows.length)requireThat(b.acknowledgeNonPosting===source.nonPostingRows.length,'Confirm the reviewed nonposting observations stay out of ledger amounts',409)
 requireThat(source.to <= c.now.slice(0, 10), 'A NetSuite import cannot include future dates')
 requireThat(workspace(c.s).currency === source.currency, 'NetSuite and Easel currencies differ; no exchange rate is inferred', 409)
 requireThat(typeof b.includeOpening === 'boolean', 'Choose whether this is the first NetSuite month')
 const old = await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.netsuiteRealm')=? AND json_extract(value,'$.netsuiteEnvironment')=? AND json_extract(value,'$.netsuiteMonth')=? AND json_extract(value,'$.netsuiteSubsidiary')=?")
  .bind(key.realmId, key.environment, source.month, b.subsidiaryId).all<{ value: string }>()
 const existing = await c.db.prepare("SELECT MIN(json_extract(value,'$.netsuiteMonth')) AS firstMonth FROM e_actuals WHERE json_extract(value,'$.netsuiteRealm')=? AND json_extract(value,'$.netsuiteEnvironment')=? AND json_extract(value,'$.netsuiteSubsidiary')=?")
  .bind(key.realmId, key.environment, b.subsidiaryId).first<{ firstMonth: string | null }>()
 const history=all(c.s,'netsuite-month').filter(row=>row.realmId===key.realmId&&row.environment===key.environment&&row.subsidiaryId===b.subsidiaryId)
 const months = history.filter(row=>row.status==='accepted').map(row=>row.month as string)
 const firstMonth = [existing?.firstMonth, ...history.map(row=>row.month)].filter((value): value is string => typeof value === 'string').sort()[0] ?? null
 if (!firstMonth) requireThat(b.includeOpening, 'Include the source opening trial balance with the first NetSuite month', 409)
 else {
  requireThat(source.month >= firstMonth, 'An earlier NetSuite month would change the reviewed opening boundary', 409)
  requireThat(b.includeOpening === (source.month === firstMonth), 'Include the source opening only with the first imported NetSuite month', 409)
  if (source.month > firstMonth && !months.includes(source.month)) {
   const previous = new Date(Date.UTC(Number(source.month.slice(0, 4)), Number(source.month.slice(5)) - 2, 1)).toISOString().slice(0, 7)
   requireThat(months.includes(previous), `Import ${previous} before ${source.month} so the source trial balance stays continuous`, 409)
  }
 }

 const desired: SourceRow[] = [...source.rows]
 if (b.includeOpening) for (const account of source.chart) {
  const amount = source.trialBalance.opening[account.id] ?? 0
  if (!amount) continue
  desired.push({ id: `opening:${account.id}:${source.from}`, transactionId: '', transactionType: 'Opening', date: new Date(Date.parse(`${source.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), accountId: account.id, account: account.code, accountName: account.name, accountType: account.type, amount, subsidiaryId:b.subsidiaryId,sourceDate:'',postingPeriod:source.periodId,department_name:'',class_name: '', location_name: '', customer_name: '', vendor_name: '', description: 'Source trial balance opening', reference: '', opening: true })
 }
 const prior = new Map<string, Data>()
 for (const item of old.results) {
  const row: Data = JSON.parse(item.value)
  requireThat(typeof row.netsuiteLine === 'string' && typeof row.netsuiteIdentity==='string' && typeof row.amount === 'number' && Number.isSafeInteger(row.amount), 'Accepted NetSuite provenance is incomplete', 409)
  const before = prior.get(row.netsuiteIdentity)
  if (before) requireThat(before.account === row.account && before.date === row.date && before.department === row.department && before.accountType === row.accountType, 'Accepted NetSuite line provenance changed', 409)
  prior.set(row.netsuiteIdentity, { ...row, amount: safe((before?.amount ?? 0) + row.amount) })
 }
 const deltas: SourceRow[] = [], metadata: Record<number, Data> = {}
 const push = (row: SourceRow, amount: number, firstObservation=false) => {
  if (!amount && !firstObservation) return
  deltas.push({ ...row, amount })
  metadata[deltas.length + 1] = {
   netsuiteEntity:entity.id,netsuiteSubsidiary:b.subsidiaryId,netsuiteSourceDate:row.sourceDate,netsuitePostingPeriod:row.postingPeriod,netsuiteRealm: key.realmId, netsuiteEnvironment: key.environment, netsuiteMonth: source.month,
   netsuiteLine: row.id,netsuiteIdentity:row.identity, netsuiteOpening: row.opening === true,
   netsuiteTransactionId: row.transactionId, netsuiteTransactionType: row.transactionType, netsuiteAccountId: row.accountId,
   sourceDimensions:{subsidiary:`${key.realmId}:${b.subsidiaryId}`,...(row.opening?{}:{department:row.department_name,class:row.class_name,location:row.location_name,'tracking-option':row.location_name})},
  }
 }
 // Identity includes the immutable posting shape, but never its amount. A
 // moved/reclassified line reverses its old shape and accepts the new one.
 for (const row of desired) {
  row.identity=sha256(canonicalJson([row.id,row.account,row.accountType,row.date,row.sourceDate,row.postingPeriod,row.department_name,row.class_name,row.location_name]))
  const before=prior.get(row.identity)
  push(row,safe(row.amount-(before?.amount??0)),!before)
  prior.delete(row.identity)
 }
 // Removed provider lines are journaled as visible reversals.
 for (const before of prior.values()) push({ id: before.netsuiteLine,identity:before.netsuiteIdentity,transactionId: before.netsuiteTransactionId, transactionType: before.netsuiteTransactionType, date: before.date, accountId: before.netsuiteAccountId ?? '', account: before.account, accountName: before.accountName, accountType: before.accountType, amount: 0, subsidiaryId:b.subsidiaryId,sourceDate:before.netsuiteSourceDate??'',postingPeriod:before.netsuitePostingPeriod??source.periodId,department_name:before.department === '(blank)' ? '' : before.department,class_name:before.sourceDimensions?.class??'', location_name: before.sourceDimensions?.location ?? '', customer_name: before.sourceDimensions?.customer ?? '', vendor_name: before.sourceDimensions?.vendor ?? '', description: before.description ?? '', reference: before.reference ?? '', opening: before.netsuiteOpening }, safe(-before.amount))
 const digest = sha256(canonicalJson({ source: source.digest, deltas, metadata }))
 const inventory=source.inventory
 const priorInventory=find(c.s,'connection','netsuite')?.inventory
 const changes=(current:Data[],prior:Data[]=[])=>(current.map(row=>{const before=prior.find(r=>r.id===row.id);return{...row,change:!before?'new':canonicalJson(before)!==canonicalJson(row)?'changed':'unchanged'}})).filter(row=>row.change!=='unchanged')
 const sourceChanges={accounts:changes(inventory.chart,priorInventory?.chart),classes:changes(inventory.dimensions.classes,priorInventory?.dimensions?.classes),locations:changes(inventory.dimensions.locations,priorInventory?.dimensions?.locations),departments:changes(inventory.dimensions.departments,priorInventory?.dimensions?.departments),subsidiaries:changes(inventory.subsidiaries,priorInventory?.subsidiaries)}
 const changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const sourceSummary = { month: source.month, from: source.from, to: source.to, currency: source.currency, chart: source.chart,
  subsidiary:source.subsidiary,entity:{id:entity.id,name:entity.name},dimensions: { departments:source.dimensions.departments,categories: source.dimensions.categories, classes: source.dimensions.classes, locations: source.dimensions.locations, customerCount: source.dimensions.customers.length, vendorCount: source.dimensions.vendors.length },
  trialBalance: source.trialBalance, ledgerRows: source.rows.length,nonPostingRows:source.nonPostingRows,unsupportedTransactions, openingIncluded: b.includeOpening,changes:sourceChanges }
 const monthId = `${key.environment}:${key.realmId}:${b.subsidiaryId}:${source.month}`
 const observe = (result:Data) => {
  const metadata={headers:['posted accounting lines'],accounts:source.chart.map(a=>({account:a.code,name:a.name,types:[a.type]})),dimensions:source.inventory.dimensions}
  const issues=guardIssues(c,{accounts:result.accounts??[],departments:result.departments??[],dimensionExceptions:result.dimensionExceptions??[]},metadata,find(c.s,'netsuite-observation',monthId)?.metadata?find(c.s,'netsuite-observation',monthId):undefined)
  put(c.s,'netsuite-observation',monthId,{entity:entity.id,realmId:key.realmId,subsidiaryId:b.subsidiaryId,month:source.month,sourceDigest:source.digest,observedAt:c.now,error:null,metadata,issues,changes:sourceChanges,unmappedAccounts:result.unmappedAccounts??[],dimensionExceptions:result.dimensionExceptions??[]})
  put(c.s,'connection','netsuite',{...connection,lastCheck:c.now,error:null,rateLimit:null})
  c.activity.push({action:'netsuite-source-checked',record:monthId,detail:{month:source.month,subsidiaryId:b.subsidiaryId,sourceDigest:source.digest}})
  return{...result,issues,impacts:sourceImpacts(c,source.month),observed:true}
 }
 const recordMonth = (context: Context) => {
  put(context.s, 'netsuite-month', monthId, { entity:entity.id,subsidiaryId:b.subsidiaryId,environment: key.environment, realmId: key.realmId, month: source.month, through: source.to, sourceFingerprint: digest, sourceDigest: source.digest, trialBalance: source.trialBalance, ledgerRows: source.rows.length, changedRows: deltas.length, openingIncluded: b.includeOpening, status: 'accepted', acceptedAt: context.now })
  context.activity.push({ action: 'netsuite-month-accepted', record: monthId, detail: { month: source.month, through: source.to, ledgerRows: source.rows.length, changedRows: deltas.length, reconciled: true } })
  put(context.s,'connection','netsuite',{...find(context.s,'connection','netsuite'),inventory,lastRefresh:context.now,rowCount:source.rows.length,error:null,rateLimit:null})
 }
 if (!deltas.length) {
  if (op === 'commit') {
   requireThat(b.sourceFingerprint === digest, 'NetSuite changed after preview; review again', 409)
   recordMonth(c)
  }
  const result={source:sourceSummary,sourceFingerprint:digest,changedRows:0,changedTransactions:0,unchanged:true,accepted:op==='commit'}
  return{result:op==='observe'?observe(result):result}
 }
 const rows = [['Date', 'Account', 'Account name', 'Account type', 'Department', 'Amount', 'Description', 'Reference'],
  ...deltas.map(r => [r.date, r.account, r.accountName, r.accountType, r.department_name, decimal(r.amount), r.description, r.opening ? `NetSuite opening ${r.accountId}` : `NetSuite ${r.transactionType} ${r.transactionId} ${r.reference}`])]
 const input = {
  filename: `netsuite-${key.environment}-${key.realmId}-${b.subsidiaryId}-${source.month}-${digest.slice(0, 12)}.csv`,
  csv: rows.map(row => row.map(csv).join(',')).join('\n'),
  columns: { date: 'Date', account: 'Account', accountName: 'Account name', accountType: 'Account type', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' },
  dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive', fingerprint: b.fingerprint, acknowledgeRejected: 0,
 }
 if (op === 'commit') requireThat(b.sourceFingerprint === digest, 'NetSuite changed after preview; review again', 409)
 const step = await actualsCommand(c, op==='observe'?'preview':op, input, metadata)
 requireThat(step, 'Unknown actuals step', 404)
 if (op === 'preview'||op==='observe') step.result = { ...step.result, source: sourceSummary, sourceFingerprint: digest, changedRows: deltas.length,changedTransactions }
 if (op === 'commit' && step.record) {
  const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing')
  requireThat(batch,'NetSuite journal batch was not created',409)
  put(c.s,'batch',batch.id,{...batch,netsuiteSource:{id:monthId,entity:entity.id,subsidiaryId:b.subsidiaryId,environment:key.environment,realmId:key.realmId,month:source.month,through:source.to,sourceFingerprint:digest,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory}})
 }
 if(op==='observe')step.result=observe(step.result)
 return step
}
