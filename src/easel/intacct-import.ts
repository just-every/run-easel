import { assertSourceGuardAcceptance,completeSourceGuards,sourceGuardCommands } from './agents/source-guard'
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { intacctAuthority, intacctKey } from './intacct-connection'
import { readIntacctLedger, type IntacctLedgerRow } from './intacct-provider'
import { intacctUrl } from './intacct-provider'
import { boundEntity } from './entity-scope'
import { sourceImpacts } from './agents/source-guard-detection'
import { all, find, put, requireThat, type Data } from './types'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const decimal = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const safe = (n: number) => { requireThat(Number.isSafeInteger(n), 'Intacct actuals exceed exact cents', 409); return n }

type SourceRow = IntacctLedgerRow & { opening?: boolean }

/** Finance reviews the source and mapping fingerprint before the journal accepts a delta. */
export async function intacctImport(c: Context, env: Bindings, op: string, b: Data): Promise<KitStep | undefined> {
 intacctAuthority(c)
 requireThat(op === 'preview' || op === 'commit' || op==='stage', 'Use the ordinary actuals journal to resume or undo Intacct imports', 404)
 const key = await intacctKey(c, env)
 const binding=find(c.s,'intacct-entity',key.companyId+':'+b.sourceEntity)
 requireThat(binding,'Map the Intacct entity to its source plan first',409)
 const entity=find(c.s,'entity',binding.entity)!
 const realmId=key.companyId+':'+binding.source
 const environment='web-services'
 const source = await readIntacctLedger(key,binding.source,b.month,c.now.slice(0,10))
 const unsupportedTransactions=[...new Map(source.rows.filter(row=>!intacctUrl(row.providerUrl)).map(row=>[JSON.stringify([row.transactionId,row.transactionType]),{transactionId:row.transactionId,type:row.transactionType}])).values()]
 if(op==='commit')requireThat(!unsupportedTransactions.length,'This source transaction type has no supported Intacct destination; no rows were accepted',409)
 if(op==='commit')requireThat(source.trialBalance.balanced,'Intacct ledger and source trial balance differ; review the displayed account differences before acceptance',409)
 if(op==='commit'&&source.nonPostingRows.length)requireThat(b.acknowledgeNonPosting===source.nonPostingRows.length,'Confirm the reviewed nonposting observations stay out of ledger amounts',409)
 requireThat(source.to <= c.now.slice(0, 10), 'A Intacct import cannot include future dates')
 requireThat(entity.currency === source.currency, 'Intacct and Easel currencies differ; no exchange rate is inferred', 409)
 requireThat(typeof b.includeOpening === 'boolean', 'Choose whether this is the first Intacct month')
 const old = await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.intacctRealm')=? AND json_extract(value,'$.intacctEnvironment')=? AND json_extract(value,'$.intacctMonth')=?")
  .bind(realmId, environment, source.month).all<{ value: string }>()
 const existing = await c.db.prepare("SELECT MIN(json_extract(value,'$.intacctMonth')) AS firstMonth FROM e_actuals WHERE json_extract(value,'$.intacctRealm')=? AND json_extract(value,'$.intacctEnvironment')=?")
  .bind(realmId, environment).first<{ firstMonth: string | null }>()
 const history=all(c.s,'intacct-month').filter(row=>row.realmId===realmId&&row.environment===environment)
 const months = history.filter(row=>row.status==='accepted').map(row=>row.month as string)
 const firstMonth = [existing?.firstMonth, ...history.map(row=>row.month)].filter((value): value is string => typeof value === 'string').sort()[0] ?? null
 if (!firstMonth) requireThat(b.includeOpening, 'Include the source opening trial balance with the first Intacct month', 409)
 else {
  requireThat(source.month >= firstMonth, 'An earlier Intacct month would change the reviewed opening boundary', 409)
  requireThat(b.includeOpening === (source.month === firstMonth), 'Include the source opening only with the first imported Intacct month', 409)
  if (source.month > firstMonth && !months.includes(source.month)) {
   const previous = new Date(Date.UTC(Number(source.month.slice(0, 4)), Number(source.month.slice(5)) - 2, 1)).toISOString().slice(0, 7)
   requireThat(months.includes(previous), `Import ${previous} before ${source.month} so the source trial balance stays continuous`, 409)
  }
 }

 const desired: SourceRow[] = [...source.rows]
 if (b.includeOpening) for (const account of source.chart) {
  const amount = source.trialBalance.opening[account.id] ?? 0
  if (!amount) continue
  desired.push({ id: `opening:${account.id}:${source.from}`, transactionId: '', transactionType: 'Opening', date: new Date(Date.parse(`${source.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), accountId: account.id, account: account.code, accountName: account.name, accountType: account.type, amount, class_name: '', location_name: '', customer_name: '', vendor_name: '', description: 'Source trial balance opening', reference: '', sourceDimensions:{}, opening: true })
 }
 const identity=(row:Data)=>canonicalJson([row.account,row.accountType,row.date,row.department,row.sourceDimensions])
 const accepted=new Map<string,Map<string,Data>>()
 for(const item of old.results) {
  const row:Data=JSON.parse(item.value)
  requireThat(typeof row.intacctLine==='string'&&Number.isSafeInteger(row.amount),'Accepted Intacct provenance is incomplete',409)
  const groups=accepted.get(row.intacctLine)??new Map<string,Data>(),key=identity(row),before=groups.get(key)
  groups.set(key,{...row,amount:safe((before?.amount??0)+row.amount)})
  accepted.set(row.intacctLine,groups)
 }
 const prior=new Map<string,Data>()
 for(const [id,groups] of accepted) {
  const live=[...groups.values()].filter(r=>r.amount!==0)
  requireThat(live.length<=1,'Accepted Intacct record has conflicting live identities; review its journal',409)
  prior.set(id,live[0]??[...groups.values()].at(-1)!)
 }
 const deltas: SourceRow[] = [], metadata: Record<number, Data> = {},identityChanges:Data[]=[]
 const push = (row: SourceRow, amount: number, firstObservation=false,reversal=false) => {
  if (!amount && !firstObservation) return
  deltas.push({ ...row, amount })
  metadata[deltas.length + 1] = {
   entity:entity.id, intacctRealm: realmId, intacctEnvironment: environment, intacctMonth: source.month,
   ...(row.providerUrl?{intacctUrl:row.providerUrl}:{}),
   entityDimension:entity.dimension,entityMember:entity.member,
   intacctLine: row.id, intacctOpening: row.opening === true, intacctReversal:reversal,
   intacctTransactionId: row.transactionId, intacctTransactionType: row.transactionType, intacctAccountId: row.accountId,
   sourceDimensions: { ...(row.opening ? {entity:binding.source} : row.sourceDimensions), 'easel-entity':entity.id },
  }
 }
 const sourceRow=(before:Data):SourceRow=>({id:before.intacctLine,transactionId:before.intacctTransactionId,transactionType:before.intacctTransactionType,date:before.date,accountId:before.intacctAccountId,account:before.account,accountName:before.accountName,accountType:before.accountType,amount:before.amount,class_name:before.department==='(blank)'?'':before.department,location_name:before.sourceDimensions?.location??'',customer_name:before.sourceDimensions?.customer??'',vendor_name:before.sourceDimensions?.vendor??'',description:before.description??'',reference:before.reference??'',sourceDimensions:before.sourceDimensions,providerUrl:before.intacctUrl,opening:before.intacctOpening})
 for(const row of desired) {
  const before=prior.get(row.id)
  const dimensions={...(row.opening?{entity:binding.source}:row.sourceDimensions),'easel-entity':entity.id}
  const currentIdentity=identity({account:row.account,accountType:row.accountType,date:row.date,department:row.class_name||'(blank)',sourceDimensions:dimensions})
  if(before&&identity(before)!==currentIdentity) {
   identityChanges.push({record:row.id,before:{account:before.account,date:before.date,dimensions:before.sourceDimensions},after:{account:row.account,date:row.date,dimensions}})
   push(sourceRow(before),safe(-before.amount),false,true)
   push(row,row.amount,true)
  } else push(row,safe(row.amount-(before?.amount??0)),!before)
  prior.delete(row.id)
 }
 // Journal explicit reversals for removed records, retaining their original source identity.
 for(const before of prior.values())push(sourceRow(before),safe(-before.amount),false,true)
 const digest = sha256(canonicalJson({ source: source.digest, binding, deltas, metadata }))
 const inventory={chart:source.chart,classes:source.dimensions.classes,locations:source.dimensions.locations}
 const priorInventory=history.filter(r=>r.inventory).at(-1)?.inventory
 const changes=(current:Data[],prior:Data[]=[])=>(current.map(row=>{const before=prior.find(r=>(r.id??r.RECORDNO)===(row.id??row.RECORDNO));return{...row,change:!before?'new':canonicalJson(before)!==canonicalJson(row)?'changed':'unchanged'}})).filter(row=>row.change!=='unchanged')
 const sourceChanges={records:identityChanges,accounts:changes(inventory.chart,priorInventory?.chart),classes:changes(inventory.classes,priorInventory?.classes),locations:changes(inventory.locations,priorInventory?.locations)}
 const changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const sourceSummary = { entity:entity.id, sourceEntity:binding.source, impacts:sourceImpacts(c,source.month), month: source.month, from: source.from, to: source.to, currency: source.currency, chart: source.chart,
  dimensions: source.dimensions,
  trialBalance: source.trialBalance, ledgerRows: source.rows.length,nonPostingRows:source.nonPostingRows,unsupportedTransactions, openingIncluded: b.includeOpening,changes:sourceChanges }
 const monthId = `${environment}:${realmId}:${source.month}`
 const recordMonth = (context: Context) => {
  put(context.s, 'intacct-month', monthId, { environment, realmId, entity:entity.id, inventory, month: source.month, through: source.to, sourceFingerprint: digest, sourceDigest: source.digest, trialBalance: source.trialBalance, ledgerRows: source.rows.length, changedRows: deltas.length, openingIncluded: b.includeOpening, status: 'accepted', acceptedAt: context.now })
  context.activity.push({ action: 'intacct-month-accepted', record: monthId, detail: { month: source.month, through: source.to, ledgerRows: source.rows.length, changedRows: deltas.length, reconciled: true } })
  put(context.s,'connection','intacct',{...find(context.s,'connection','intacct'),inventory,lastRefresh:context.now,rowCount:source.rows.length,error:null,rateLimit:null})
 }
 const rows = [['Date', 'Account', 'Account name', 'Account type', 'Department', 'Amount', 'Description', 'Reference'],
  ...deltas.map(r => [r.date, r.account, r.accountName, r.accountType, r.class_name, decimal(r.amount), r.description, r.opening ? `Intacct opening ${r.accountId}` : `Intacct ${r.transactionType} ${r.transactionId} ${r.reference}`])]
 const input = {
  filename: `intacct-${environment}-${realmId}-${source.month}-${digest.slice(0, 12)}.csv`,
  csv: rows.map(row => row.map(csv).join(',')).join('\n'),
  columns: { date: 'Date', account: 'Account', accountName: 'Account name', accountType: 'Account type', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' },
  dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive', fingerprint: b.fingerprint, acknowledgeRejected: 0,
 }
 if (op === 'commit') requireThat(b.sourceFingerprint === digest, 'Intacct changed after preview; review again', 409)
 const acceptanceSha=sha256(new TextEncoder().encode(input.csv))
 if(op==='commit')for(const guard of all(c.s,'source-guard').filter(g=>g.entity===entity.id&&g.month===source.month&&g.id==='intacct:'+realmId))
  requireThat(guard.sourceDigest===source.digest,'Intacct changed after source review; stage the changed observation again',409)
 if(op==='stage') {
  requireThat(!b.includeOpening,'Stage refresh observations after the initial opening import',409)
  const forecast=all(c.s,'scenario').find(sc=>sc.kind==='forecast'&&sc.status==='working'&&sc.id===b.scenario)
  requireThat(forecast&&boundEntity(c.s,forecast)?.id===entity.id,'Choose the mapped entity forecast for source review',409)
  const id='intacct:'+realmId,priorGuard=find(c.s,'source-guard',id)
  const observationRows=[rows[0],...source.rows.map(r=>[r.date,r.account,r.accountName,r.accountType,r.class_name,decimal(r.amount),r.description,'Intacct '+r.transactionType+' '+r.transactionId+' '+r.reference])]
  const observedMetadata={headers:rows[0],accounts:source.chart.map(a=>({account:a.code,name:a.name,types:[a.type]})),dimensions:[...new Set(source.rows.map(r=>canonicalJson(r.sourceDimensions)))].sort()}
  const result=await sourceGuardCommands(c,'source-guard-stage',{...b,source:id,label:'Intacct '+binding.source,actuals:{...input,csv:observationRows.map(row=>row.map(csv).join(',')).join('\n')},revision:priorGuard?.revision,observedAt:c.now,nextExpectedAt:b.nextExpectedAt,expectedPayroll:b.expectedPayroll},Object.fromEntries(source.rows.map((r,i)=>[i+2,{entity:entity.id,sourceDimensions:{...r.sourceDimensions,'easel-entity':entity.id}}])),{month:source.month,metadata:observedMetadata})
  requireThat(result,'Source review was not staged',409)
  const guard:Data={...find(c.s,'source-guard',id),sha256:acceptanceSha,sourceDigest:source.digest}
  guard.fingerprint=sha256(canonicalJson({fingerprint:result.fingerprint,source:source.digest,acceptanceSha}))
  put(c.s,'source-guard',id,guard)
  return{result:{guard:{...guard,unresolved:result.unresolved},source:sourceSummary}}
 }
 if(!deltas.length) {
  if(op==='commit') {
   requireThat(b.sourceFingerprint===digest,'Intacct changed after preview; review again',409)
   assertSourceGuardAcceptance(c,acceptanceSha,[source.month],entity.id)
   recordMonth(c);completeSourceGuards(c,{sha256:acceptanceSha})
  }
  return{result:{source:sourceSummary,sourceFingerprint:digest,changedRows:0,changedTransactions:0,unchanged:true,accepted:op==='commit'}}
 }
 const step = await actualsCommand(c, op, input, metadata)
 requireThat(step, 'Unknown actuals step', 404)
 if (op === 'preview') step.result = { ...step.result, source: sourceSummary, sourceFingerprint: digest, changedRows: deltas.length,changedTransactions }
 if (op === 'commit' && step.record) {
  const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing')
  requireThat(batch,'Intacct journal batch was not created',409)
  put(c.s,'batch',batch.id,{...batch,intacctSource:{id:monthId,entity:entity.id,environment:environment,realmId:realmId,month:source.month,through:source.to,sourceFingerprint:digest,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory}})
 }
 return step
}
