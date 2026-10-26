import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { xeroAuthority, xeroKey } from './xero-connection'
import { readXeroLedger, type XeroLedgerRow } from './xero-provider'
import { xeroTransactionUrl } from './xero-links'
import { workspace } from './model'
import { all, find, put, requireThat, type Data } from './types'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const decimal = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const safe = (n: number) => { requireThat(Number.isSafeInteger(n), 'Xero actuals exceed exact cents', 409); return n }

type SourceRow = XeroLedgerRow & { opening?: boolean }

/** Finance reviews the source and mapping fingerprint before the journal accepts a delta. */
export async function xeroImport(c: Context, env: Bindings, op: string, b: Data): Promise<KitStep | undefined> {
 xeroAuthority(c)
 requireThat(op === 'preview' || op === 'commit', 'Use the ordinary actuals journal to resume or undo Xero imports', 404)
 const key = await xeroKey(c, env)
 const source = await readXeroLedger(key, b.month, c.now.slice(0, 10))
 const unsupportedTransactions=[...new Map(source.rows.filter(row=>!xeroTransactionUrl(key.environment,row.transactionType,row.transactionId)).map(row=>[JSON.stringify([row.transactionId,row.transactionType]),{transactionId:row.transactionId,type:row.transactionType}])).values()]
 if(op==='commit')requireThat(!unsupportedTransactions.length,'This source transaction type has no supported Xero destination; no rows were accepted',409)
 if(op==='commit')requireThat(source.trialBalance.balanced,'Xero ledger and source trial balance differ; review the displayed account differences before acceptance',409)
 if(op==='commit'&&source.nonPostingRows.length)requireThat(b.acknowledgeNonPosting===source.nonPostingRows.length,'Confirm the reviewed nonposting observations stay out of ledger amounts',409)
 requireThat(source.to <= c.now.slice(0, 10), 'A Xero import cannot include future dates')
 requireThat(workspace(c.s).currency === source.currency, 'Xero and Easel currencies differ; no exchange rate is inferred', 409)
 requireThat(typeof b.includeOpening === 'boolean', 'Choose whether this is the first Xero month')
 const old = await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.xeroRealm')=? AND json_extract(value,'$.xeroEnvironment')=? AND json_extract(value,'$.xeroMonth')=?")
  .bind(key.realmId, key.environment, source.month).all<{ value: string }>()
 const existing = await c.db.prepare("SELECT MIN(json_extract(value,'$.xeroMonth')) AS firstMonth FROM e_actuals WHERE json_extract(value,'$.xeroRealm')=? AND json_extract(value,'$.xeroEnvironment')=?")
  .bind(key.realmId, key.environment).first<{ firstMonth: string | null }>()
 const history=all(c.s,'xero-month').filter(row=>row.realmId===key.realmId&&row.environment===key.environment)
 const months = history.filter(row=>row.status==='accepted').map(row=>row.month as string)
 const firstMonth = [existing?.firstMonth, ...history.map(row=>row.month)].filter((value): value is string => typeof value === 'string').sort()[0] ?? null
 if (!firstMonth) requireThat(b.includeOpening, 'Include the source opening trial balance with the first Xero month', 409)
 else {
  requireThat(source.month >= firstMonth, 'An earlier Xero month would change the reviewed opening boundary', 409)
  requireThat(b.includeOpening === (source.month === firstMonth), 'Include the source opening only with the first imported Xero month', 409)
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
  requireThat(typeof row.xeroLine === 'string' && typeof row.amount === 'number' && Number.isSafeInteger(row.amount), 'Accepted Xero provenance is incomplete', 409)
  const before = prior.get(row.xeroLine)
  if (before) requireThat(before.account === row.account && before.date === row.date && before.department === row.department && before.accountType === row.accountType, 'Accepted Xero line provenance changed', 409)
  prior.set(row.xeroLine, { ...row, amount: safe((before?.amount ?? 0) + row.amount) })
 }
 const deltas: SourceRow[] = [], metadata: Record<number, Data> = {}
 const push = (row: SourceRow, amount: number, firstObservation=false) => {
  if (!amount && !firstObservation) return
  deltas.push({ ...row, amount })
  metadata[deltas.length + 1] = {
   xeroRealm: key.realmId, xeroEnvironment: key.environment, xeroMonth: source.month,
   xeroLine: row.id, xeroOpening: row.opening === true,
   xeroTransactionId: row.transactionId, xeroTransactionType: row.transactionType, xeroAccountId: row.accountId,
   sourceDimensions: row.opening ? {} : { department: row.class_name, class: row.class_name, location: row.location_name, 'tracking-option': row.location_name, customer: row.customer_name, vendor: row.vendor_name },
  }
 }
 for (const row of desired) {
  const before = prior.get(row.id)
  if (before) requireThat(before.account === row.account && before.date === row.date && before.department === (row.class_name || '(blank)') && before.accountType === row.accountType && before.sourceDimensions?.location === row.location_name && before.sourceDimensions?.customer === row.customer_name && before.sourceDimensions?.vendor === row.vendor_name, 'Xero changed an accepted line identity; review a correcting import', 409)
  push(row, safe(row.amount - (before?.amount ?? 0)), !before)
  prior.delete(row.id)
 }
 // Removed provider lines are journaled as visible reversals.
 for (const before of prior.values()) push({ id: before.xeroLine, transactionId: before.xeroTransactionId, transactionType: before.xeroTransactionType, date: before.date, accountId: before.xeroAccountId ?? '', account: before.account, accountName: before.accountName, accountType: before.accountType, amount: 0, class_name: before.department === '(blank)' ? '' : before.department, location_name: before.sourceDimensions?.location ?? '', customer_name: before.sourceDimensions?.customer ?? '', vendor_name: before.sourceDimensions?.vendor ?? '', description: before.description ?? '', reference: before.reference ?? '', opening: before.xeroOpening }, safe(-before.amount))
 const digest = sha256(canonicalJson({ source: source.digest, deltas, metadata }))
 const inventory={chart:source.chart,classes:source.dimensions.classes,locations:source.dimensions.locations}
 const priorInventory=find(c.s,'connection','xero')?.inventory
 const changes=(current:Data[],prior:Data[]=[])=>(current.map(row=>{const before=prior.find(r=>r.id===row.id);return{...row,change:!before?'new':canonicalJson(before)!==canonicalJson(row)?'changed':'unchanged'}})).filter(row=>row.change!=='unchanged')
 const sourceChanges={accounts:changes(inventory.chart,priorInventory?.chart),classes:changes(inventory.classes,priorInventory?.classes),locations:changes(inventory.locations,priorInventory?.locations)}
 const changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const sourceSummary = { month: source.month, from: source.from, to: source.to, currency: source.currency, chart: source.chart,
  dimensions: { categories: source.dimensions.categories, classes: source.dimensions.classes, locations: source.dimensions.locations, customerCount: source.dimensions.customers.length, vendorCount: source.dimensions.vendors.length },
  trialBalance: source.trialBalance, ledgerRows: source.rows.length,nonPostingRows:source.nonPostingRows,unsupportedTransactions, openingIncluded: b.includeOpening,changes:sourceChanges }
 const monthId = `${key.environment}:${key.realmId}:${source.month}`
 const recordMonth = (context: Context) => {
  put(context.s, 'xero-month', monthId, { environment: key.environment, realmId: key.realmId, month: source.month, through: source.to, sourceFingerprint: digest, sourceDigest: source.digest, trialBalance: source.trialBalance, ledgerRows: source.rows.length, changedRows: deltas.length, openingIncluded: b.includeOpening, status: 'accepted', acceptedAt: context.now })
  context.activity.push({ action: 'xero-month-accepted', record: monthId, detail: { month: source.month, through: source.to, ledgerRows: source.rows.length, changedRows: deltas.length, reconciled: true } })
  put(context.s,'connection','xero',{...find(context.s,'connection','xero'),inventory,lastRefresh:context.now,rowCount:source.rows.length,error:null,rateLimit:null})
 }
 if (!deltas.length) {
  if (op === 'commit') {
   requireThat(b.sourceFingerprint === digest, 'Xero changed after preview; review again', 409)
   recordMonth(c)
  }
  return { result: { source: sourceSummary, sourceFingerprint: digest, changedRows: 0, changedTransactions:0, unchanged: true, accepted: op === 'commit' } }
 }
 const rows = [['Date', 'Account', 'Account name', 'Account type', 'Department', 'Amount', 'Description', 'Reference'],
  ...deltas.map(r => [r.date, r.account, r.accountName, r.accountType, r.class_name, decimal(r.amount), r.description, r.opening ? `Xero opening ${r.accountId}` : `Xero ${r.transactionType} ${r.transactionId} ${r.reference}`])]
 const input = {
  filename: `xero-${key.environment}-${key.realmId}-${source.month}-${digest.slice(0, 12)}.csv`,
  csv: rows.map(row => row.map(csv).join(',')).join('\n'),
  columns: { date: 'Date', account: 'Account', accountName: 'Account name', accountType: 'Account type', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' },
  dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive', fingerprint: b.fingerprint, acknowledgeRejected: 0,
 }
 if (op === 'commit') requireThat(b.sourceFingerprint === digest, 'Xero changed after preview; review again', 409)
 const step = await actualsCommand(c, op, input, metadata)
 requireThat(step, 'Unknown actuals step', 404)
 if (op === 'preview') step.result = { ...step.result, source: sourceSummary, sourceFingerprint: digest, changedRows: deltas.length,changedTransactions }
 if (op === 'commit' && step.record) {
  const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing')
  requireThat(batch,'Xero journal batch was not created',409)
  put(c.s,'batch',batch.id,{...batch,xeroSource:{id:monthId,environment:key.environment,realmId:key.realmId,month:source.month,through:source.to,sourceFingerprint:digest,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory}})
 }
 return step
}
