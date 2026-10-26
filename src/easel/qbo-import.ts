import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { qboAuthority, qboKey } from './qbo-connection'
import { readQboLedger, type QboLedgerRow } from './qbo-provider'
import { qboTransactionUrl } from './qbo-links'
import { workspace } from './model'
import { all, find, put, requireThat, type Data } from './types'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const decimal = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const safe = (n: number) => { requireThat(Number.isSafeInteger(n), 'QuickBooks actuals exceed exact cents', 409); return n }

type SourceRow = QboLedgerRow & { opening?: boolean }

/** Finance reviews the source and mapping fingerprint before the journal accepts a delta. */
export async function qboImport(c: Context, env: Bindings, op: string, b: Data): Promise<KitStep | undefined> {
 qboAuthority(c)
 requireThat(op === 'preview' || op === 'commit', 'Use the ordinary actuals journal to resume or undo QuickBooks imports', 404)
 const key = await qboKey(c, env)
 const source = await readQboLedger(key, b.month, c.now.slice(0, 10))
 const unsupportedTransactions=[...new Map(source.rows.filter(row=>!qboTransactionUrl(key.environment,row.transactionType,row.transactionId)).map(row=>[JSON.stringify([row.transactionId,row.transactionType]),{transactionId:row.transactionId,type:row.transactionType}])).values()]
 if(op==='commit')requireThat(!unsupportedTransactions.length,'This source transaction type has no supported QuickBooks destination; no rows were accepted',409)
 if(op==='commit')requireThat(source.trialBalance.balanced,'QuickBooks ledger and source trial balance differ; review the displayed account differences before acceptance',409)
 if(op==='commit'&&source.nonPostingRows.length)requireThat(b.acknowledgeNonPosting===source.nonPostingRows.length,'Confirm the reviewed nonposting observations stay out of ledger amounts',409)
 requireThat(source.to <= c.now.slice(0, 10), 'A QuickBooks import cannot include future dates')
 requireThat(workspace(c.s).currency === source.currency, 'QuickBooks and Easel currencies differ; no exchange rate is inferred', 409)
 requireThat(typeof b.includeOpening === 'boolean', 'Choose whether this is the first QuickBooks month')
 const old = await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.qboRealm')=? AND json_extract(value,'$.qboEnvironment')=? AND json_extract(value,'$.qboMonth')=?")
  .bind(key.realmId, key.environment, source.month).all<{ value: string }>()
 const existing = await c.db.prepare("SELECT MIN(json_extract(value,'$.qboMonth')) AS firstMonth FROM e_actuals WHERE json_extract(value,'$.qboRealm')=? AND json_extract(value,'$.qboEnvironment')=?")
  .bind(key.realmId, key.environment).first<{ firstMonth: string | null }>()
 const history=all(c.s,'qbo-month').filter(row=>row.realmId===key.realmId&&row.environment===key.environment)
 const months = history.filter(row=>row.status==='accepted').map(row=>row.month as string)
 const firstMonth = [existing?.firstMonth, ...history.map(row=>row.month)].filter((value): value is string => typeof value === 'string').sort()[0] ?? null
 if (!firstMonth) requireThat(b.includeOpening, 'Include the source opening trial balance with the first QuickBooks month', 409)
 else {
  requireThat(source.month >= firstMonth, 'An earlier QuickBooks month would change the reviewed opening boundary', 409)
  requireThat(b.includeOpening === (source.month === firstMonth), 'Include the source opening only with the first imported QuickBooks month', 409)
  if (source.month > firstMonth && !months.includes(source.month)) {
   const previous = new Date(Date.UTC(Number(source.month.slice(0, 4)), Number(source.month.slice(5)) - 2, 1)).toISOString().slice(0, 7)
   requireThat(months.includes(previous), `Import ${previous} before ${source.month} so the source trial balance stays continuous`, 409)
  }
 }

 const desired: SourceRow[] = [...source.rows]
 if (b.includeOpening) for (const account of source.chart) {
  const amount = source.trialBalance.opening[account.id] ?? 0
  if (!amount) continue
  desired.push({ id: `opening:${account.id}:${source.from}`, transactionId: '', transactionType: 'Opening', date: new Date(Date.parse(`${source.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), accountId: account.id, account: account.code, accountName: account.name, accountType: account.type, amount, class_name: '', location_name: '', customer_name: '', vendor_name: '', description: 'Source trial balance opening', reference: '', opening: true })
 }
 const prior = new Map<string, Data>()
 for (const item of old.results) {
  const row: Data = JSON.parse(item.value)
  requireThat(typeof row.qboLine === 'string' && typeof row.amount === 'number' && Number.isSafeInteger(row.amount), 'Accepted QuickBooks provenance is incomplete', 409)
  const before = prior.get(row.qboLine)
  if (before) requireThat(before.account === row.account && before.date === row.date && before.department === row.department && before.accountType === row.accountType, 'Accepted QuickBooks line provenance changed', 409)
  prior.set(row.qboLine, { ...row, amount: safe((before?.amount ?? 0) + row.amount) })
 }
 const deltas: SourceRow[] = [], metadata: Record<number, Data> = {}
 const push = (row: SourceRow, amount: number, firstObservation=false) => {
  if (!amount && !firstObservation) return
  deltas.push({ ...row, amount })
  metadata[deltas.length + 1] = {
   qboRealm: key.realmId, qboEnvironment: key.environment, qboMonth: source.month,
   qboLine: row.id, qboOpening: row.opening === true,
   qboTransactionId: row.transactionId, qboTransactionType: row.transactionType, qboAccountId: row.accountId,
   sourceDimensions: { department: row.class_name, class: row.class_name, location: row.location_name, customer: row.customer_name, vendor: row.vendor_name },
  }
 }
 for (const row of desired) {
  const before = prior.get(row.id)
  if (before) requireThat(before.account === row.account && before.date === row.date && before.department === (row.class_name || '(blank)') && before.accountType === row.accountType && before.sourceDimensions?.location === row.location_name && before.sourceDimensions?.customer === row.customer_name && before.sourceDimensions?.vendor === row.vendor_name, 'QuickBooks changed an accepted line identity; review a correcting import', 409)
  push(row, safe(row.amount - (before?.amount ?? 0)), !before)
  prior.delete(row.id)
 }
 // Removed provider lines are journaled as visible reversals.
 for (const before of prior.values()) push({ id: before.qboLine, transactionId: before.qboTransactionId, transactionType: before.qboTransactionType, date: before.date, accountId: before.qboAccountId ?? '', account: before.account, accountName: before.accountName, accountType: before.accountType, amount: 0, class_name: before.department === '(blank)' ? '' : before.department, location_name: before.sourceDimensions?.location ?? '', customer_name: before.sourceDimensions?.customer ?? '', vendor_name: before.sourceDimensions?.vendor ?? '', description: before.description ?? '', reference: before.reference ?? '', opening: before.qboOpening }, safe(-before.amount))
 const digest = sha256(canonicalJson({ source: source.digest, deltas, metadata }))
 const inventory={chart:source.chart,classes:source.dimensions.classes,locations:source.dimensions.locations}
 const priorInventory=find(c.s,'connection','qbo')?.inventory
 const changes=(current:Data[],prior:Data[]=[])=>(current.map(row=>{const before=prior.find(r=>r.id===row.id);return{...row,change:!before?'new':canonicalJson(before)!==canonicalJson(row)?'changed':'unchanged'}})).filter(row=>row.change!=='unchanged')
 const sourceChanges={accounts:changes(inventory.chart,priorInventory?.chart),classes:changes(inventory.classes,priorInventory?.classes),locations:changes(inventory.locations,priorInventory?.locations)}
 const changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const sourceSummary = { month: source.month, from: source.from, to: source.to, currency: source.currency, chart: source.chart,
  dimensions: { classes: source.dimensions.classes, locations: source.dimensions.locations, customerCount: source.dimensions.customers.length, vendorCount: source.dimensions.vendors.length },
  trialBalance: source.trialBalance, ledgerRows: source.rows.length,nonPostingRows:source.nonPostingRows,unsupportedTransactions, openingIncluded: b.includeOpening,changes:sourceChanges }
 const monthId = `${key.environment}:${key.realmId}:${source.month}`
 const recordMonth = (context: Context) => {
  put(context.s, 'qbo-month', monthId, { environment: key.environment, realmId: key.realmId, month: source.month, through: source.to, sourceFingerprint: digest, sourceDigest: source.digest, trialBalance: source.trialBalance, ledgerRows: source.rows.length, changedRows: deltas.length, openingIncluded: b.includeOpening, status: 'accepted', acceptedAt: context.now })
  context.activity.push({ action: 'qbo-month-accepted', record: monthId, detail: { month: source.month, through: source.to, ledgerRows: source.rows.length, changedRows: deltas.length, reconciled: true } })
  put(context.s,'connection','qbo',{...find(context.s,'connection','qbo'),inventory,lastRefresh:context.now,rowCount:source.rows.length,error:null,rateLimit:null})
 }
 if (!deltas.length) {
  if (op === 'commit') {
   requireThat(b.sourceFingerprint === digest, 'QuickBooks changed after preview; review again', 409)
   recordMonth(c)
  }
  return { result: { source: sourceSummary, sourceFingerprint: digest, changedRows: 0, changedTransactions:0, unchanged: true, accepted: op === 'commit' } }
 }
 const rows = [['Date', 'Account', 'Account name', 'Account type', 'Department', 'Amount', 'Description', 'Reference'],
  ...deltas.map(r => [r.date, r.account, r.accountName, r.accountType, r.class_name, decimal(r.amount), r.description, r.opening ? `QuickBooks opening ${r.accountId}` : `QuickBooks ${r.transactionType} ${r.transactionId} ${r.reference}`])]
 const input = {
  filename: `qbo-${key.environment}-${key.realmId}-${source.month}-${digest.slice(0, 12)}.csv`,
  csv: rows.map(row => row.map(csv).join(',')).join('\n'),
  columns: { date: 'Date', account: 'Account', accountName: 'Account name', accountType: 'Account type', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' },
  dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive', fingerprint: b.fingerprint, acknowledgeRejected: 0,
 }
 if (op === 'commit') requireThat(b.sourceFingerprint === digest, 'QuickBooks changed after preview; review again', 409)
 const step = await actualsCommand(c, op, input, metadata)
 requireThat(step, 'Unknown actuals step', 404)
 if (op === 'preview') step.result = { ...step.result, source: sourceSummary, sourceFingerprint: digest, changedRows: deltas.length,changedTransactions }
 if (op === 'commit' && step.record) {
  const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing')
  requireThat(batch,'QuickBooks journal batch was not created',409)
  put(c.s,'batch',batch.id,{...batch,qboSource:{id:monthId,environment:key.environment,realmId:key.realmId,month:source.month,through:source.to,sourceFingerprint:digest,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory}})
 }
 return step
}
