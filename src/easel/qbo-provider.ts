import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { reconcileQboTrial } from './qbo-trial'
import { Fault, requireThat, type Data } from './types'

export type QboCredentials = {
 environment: 'sandbox' | 'production'
 realmId: string
 clientId: string
 clientSecret: string
 accessToken: string
 refreshToken: string
 expiresAt: number
}

export type QboResource = 'companyinfo' | 'account' | 'class' | 'department' | 'customer' | 'vendor' | 'GeneralLedger' | 'TrialBalance'
export class QboFailure extends Fault {
 constructor(message:string,public httpStatus:number|null=null,public rateLimit:string|null=null){super(502,message)}
}
export type QboLedgerRow = {
 id: string; transactionId: string; transactionType: string; date: string
 accountId: string; account: string; accountName: string; accountType: string; amount: number
 class_name: string; location_name: string; customer_name: string; vendor_name: string
 description: string; reference: string
}

const origin = (key: QboCredentials) => key.environment === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com'
const id = (value: unknown, label: string) => {
 requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value), `QuickBooks returned an invalid ${label}`, 502)
 return value
}
const date = (value: unknown, label: string) => {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, `QuickBooks returned an invalid ${label}`, 502)
 return value
}
const string = (value: unknown, label: string, max = 500) => {
 requireThat(typeof value === 'string' && value.length <= max, `QuickBooks returned an invalid ${label}`, 502)
 return value
}
const safe = (value: number, label: string) => {
 requireThat(Number.isSafeInteger(value), `QuickBooks returned an inexact ${label}`, 502)
 return value
}
export function qboCents(value: unknown): number {
 if (value === '' || value === null || value === undefined) return 0
 requireThat(typeof value === 'string' && /^-?(?:(?:0|[1-9]\d*)(?:\.\d{1,2})?|\.\d{1,2})$/.test(value), 'QuickBooks returned an inexact amount', 502)
 const negative = value.startsWith('-'), digits = negative ? value.slice(1) : value
 const [whole, fraction = ''] = digits.split('.')
 return safe((negative ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))), 'amount')
}

/** Fixed GET surface. Query text is restricted to our own entity pagination grammar. */
export async function qboRequest(key: QboCredentials, resource: QboResource, query: Record<string, string> = {}): Promise<Data> {
 id(key.realmId, 'company ID')
 requireThat(key.environment === 'sandbox' || key.environment === 'production', 'Unknown QuickBooks environment', 400)
 const reports = resource === 'GeneralLedger' || resource === 'TrialBalance'
 const entities = ['account', 'class', 'department', 'customer', 'vendor']
 requireThat(reports || resource === 'companyinfo' || entities.includes(resource), 'Unsupported QuickBooks read', 400)
 const allowed = reports ? ['start_date', 'end_date', 'accounting_method', 'columns'] : resource === 'companyinfo' ? [] : ['startposition', 'maxresults']
 requireThat(Object.keys(query).every(k => allowed.includes(k)), 'Unsupported QuickBooks read option', 400)
 let path: string
 const params = new URLSearchParams()
 if (reports) {
  date(query.start_date, 'report start date'); date(query.end_date, 'report end date')
  requireThat(query.start_date <= query.end_date && query.accounting_method === 'Accrual', 'QuickBooks reports must use an accrual date range')
  path = `reports/${resource}`
  for (const [name, value] of Object.entries(query)) params.set(name, value)
 } else if (resource === 'companyinfo') path = `companyinfo/${key.realmId}`
 else {
  const start = Number(query.startposition), count = Number(query.maxresults)
  requireThat(Number.isSafeInteger(start) && start >= 1 && Number.isSafeInteger(count) && count >= 1 && count <= 1000, 'Invalid QuickBooks page', 400)
  path = 'query'
  params.set('query', `select * from ${resource[0].toUpperCase()}${resource.slice(1)} where Active IN (true, false) startposition ${start} maxresults ${count}`)
 }
 const url = new URL(`/v3/company/${key.realmId}/${path}`, origin(key))
 url.search = params.toString()
 let response: Response
 try { response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${key.accessToken}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20000) }) }
 catch { throw new QboFailure('QuickBooks could not be reached; no data was accepted') }
 if (response.status !== 200) {
  await response.body?.cancel()
  const retry=response.headers.get('retry-after')
  throw new QboFailure(`QuickBooks refused a read (HTTP ${response.status}); no data was accepted`,response.status,response.status===429?retry&&/^\d{1,6}$/.test(retry)?`Retry after ${retry} seconds`:'Rate limited; try explicitly later':null)
 }
 const reader = response.body?.getReader()
 requireThat(reader, 'QuickBooks returned an empty response', 502)
 const chunks: Uint8Array[] = []; let size = 0
 for (;;) {
  const part = await reader.read(); if (part.done) break
  size += part.value.length
  if (size > 8_000_000) { await reader.cancel(); throw new Fault(409, 'QuickBooks report exceeds the monthly read limit') }
  chunks.push(part.value)
 }
 const bytes = new Uint8Array(size); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
 let body: Data
 try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Fault(502, 'QuickBooks returned unreadable data') }
 requireThat(body && typeof body === 'object' && !Array.isArray(body) && !body.Fault, 'QuickBooks returned an invalid response', 502)
 return body
}

async function collection(key: QboCredentials, resource: 'account' | 'class' | 'department' | 'customer' | 'vendor') {
 const name = resource[0].toUpperCase() + resource.slice(1), rows: Data[] = [], seen = new Set<string>()
 for (let start = 1; start <= 5000; start += 1000) {
  const body = await qboRequest(key, resource, { startposition: String(start), maxresults: '1000' })
  requireThat(body.QueryResponse && typeof body.QueryResponse === 'object', 'QuickBooks returned an invalid account or dimension page', 502)
  const batch = body.QueryResponse?.[name]
  requireThat(batch === undefined || Array.isArray(batch), 'QuickBooks returned an invalid account or dimension page', 502)
  for (const item of batch ?? []) {
   const sourceId = id(item.Id, `${name} ID`)
   requireThat(!seen.has(sourceId), 'QuickBooks returned a repeated account or dimension', 502)
   seen.add(sourceId); rows.push(item)
  }
  requireThat(rows.length <= 5000, 'QuickBooks source exceeds the monthly read limit', 409)
  if ((batch?.length ?? 0) < 1000) return rows
 }
 throw new Fault(409, 'QuickBooks source pagination did not complete')
}

type ReportRow = { type?: string; group?: string; Header?: { ColData?: Data[] }; ColData?: Data[]; Rows?: { Row?: ReportRow[] }; Summary?: { ColData?: Data[] } }
const noReportData=(report:Data)=>report.Header?.Option?.some((o:Data)=>o.Name==='NoReportData'&&o.Value==='true')===true
const colKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
function columns(report: Data) {
 const raw = report.Columns?.Column
 if(noReportData(report)&&!report.Rows?.Row?.length)return (_names:string[],_required=true)=>-1
 requireThat(Array.isArray(raw) && raw.length > 0, 'QuickBooks report has no column descriptors', 502)
 const types = raw.map((c: Data) => [colKey(c.ColType), colKey(c.ColTitle)])
 return (names: string[], required = true): number => {
  const wanted = names.map(colKey)
  const hits = types.flatMap((parts: string[], i: number) => parts.some(p => wanted.includes(p)) ? [i] : [])
  requireThat(!required || hits.length === 1, `QuickBooks report has a missing or ambiguous ${names[0]} column`, 502)
  requireThat(hits.length <= 1, `QuickBooks report has an ambiguous ${names[0]} column`, 502)
  return hits[0] ?? -1
 }
}
function cells(row: ReportRow, width: number) {
 requireThat(Array.isArray(row.ColData) && row.ColData.length === width, 'QuickBooks report row width changed', 502)
 return row.ColData
}
function cell(row: Data[], position: number) { return position < 0 ? { value: '' } : row[position] }
function walk(report: Data, visit: (row: ReportRow, account: string | null) => void) {
 const root = report.Rows?.Row
 if(noReportData(report)&&root===undefined)return
 requireThat(Array.isArray(root), 'QuickBooks report rows are incomplete', 502)
 const recur = (rows: ReportRow[], account: string | null, depth: number) => {
  requireThat(depth < 20, 'QuickBooks report nesting is too deep', 502)
  for (const row of rows) {
   const section = row.Header?.ColData?.[0]?.id
   const current = section ? id(section, 'report account ID') : account
   if (row.type === 'Data' || !row.type && row.ColData) visit(row, current)
   else requireThat(row.type === 'Section' || !row.type, 'QuickBooks returned an unknown report row type', 502)
   if (row.Rows) { requireThat(Array.isArray(row.Rows.Row), 'QuickBooks report section is incomplete', 502); recur(row.Rows.Row, current, depth + 1) }
  }
 }
 recur(root, null, 0)
}
function header(report: Data, name: string, end: string, currency: string) {
 const h = report.Header
 requireThat(h?.ReportName === name && h.ReportBasis === 'Accrual' && h.EndPeriod === end && h.Currency === currency, 'QuickBooks returned a different report period, basis or currency', 502)
}
function trial(report: Data, end: string, currency: string, chart: Map<string, Data>) {
 header(report, 'TrialBalance', end, currency)
 if(noReportData(report)&&!report.Rows?.Row?.length)return new Map<string,number>()
 const column = columns(report), account = column(['Account']), debit = column(['Debit']), credit = column(['Credit'])
 const width = report.Columns.Column.length, balance = new Map<string, number>()
 let totalDebit = 0, totalCredit = 0
 walk(report, row => {
  const values = cells(row, width), accountId = id(cell(values, account).id, 'trial account ID')
  requireThat(chart.has(accountId) && !balance.has(accountId), 'QuickBooks trial balance has an unknown or repeated account', 502)
  const dr = qboCents(cell(values, debit).value), cr = qboCents(cell(values, credit).value)
  requireThat(dr >= 0 && cr >= 0 && !(dr && cr), 'QuickBooks trial balance has an invalid debit or credit', 502)
  balance.set(accountId, safe(dr - cr, 'trial balance'))
  totalDebit = safe(totalDebit + dr, 'trial debit'); totalCredit = safe(totalCredit + cr, 'trial credit')
 })
 requireThat(totalDebit === totalCredit, `QuickBooks trial balance debit minus credit is ${totalDebit-totalCredit} minor units`, 409)
 return balance
}

/** A single closed month, with source report evidence checked before any write. */
export async function readQboLedger(key: QboCredentials, month: string, asOf = new Date().toISOString().slice(0, 10)) {
 requireThat(typeof month === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month), 'Choose a QuickBooks month')
 date(asOf, 'as-of date')
 const from = `${month}-01`, monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10)
 requireThat(from <= asOf, 'Choose a month that has started')
 const to = monthEnd < asOf ? monthEnd : asOf
 const before = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
 const company = await qboRequest(key, 'companyinfo')
 requireThat(company.CompanyInfo && typeof company.CompanyInfo === 'object', 'QuickBooks company metadata is unavailable', 502)
 const companyCurrency = company.CompanyInfo.CompanyCurrency?.value
 const [accounts, classes, departments, customers, vendors] = await Promise.all([
  collection(key, 'account'), collection(key, 'class'), collection(key, 'department'), collection(key, 'customer'), collection(key, 'vendor'),
 ])
 const chart = new Map<string, Data>(), codes = new Set<string>()
 for (const account of accounts) {
  const accountId = id(account.Id, 'account ID'), code = account.AcctNum === undefined ? accountId : string(account.AcctNum, 'account number', 120)
  requireThat(!chart.has(accountId) && !codes.has(code), 'QuickBooks returned duplicate account numbers', 502)
  chart.set(accountId, { id: accountId, code, name: string(account.FullyQualifiedName ?? account.Name, 'account name'), type: string(account.AccountType, 'account type'), subtype: account.AccountSubType === undefined ? '' : string(account.AccountSubType, 'account subtype') })
  codes.add(code)
 }
 requireThat(chart.size > 0, 'QuickBooks returned no chart of accounts', 502)
 const names = (items: Data[], label: string) => items.map(item => ({ id: id(item.Id, `${label} ID`), name: string(item.FullyQualifiedName ?? item.DisplayName ?? item.Name, `${label} name`) }))
 const dimensions = { classes: names(classes, 'class'), locations: names(departments, 'location'), customers: names(customers, 'customer'), vendors: names(vendors, 'vendor') }
 const detailColumns = ['tx_date', 'txn_type', 'doc_num', 'name', 'memo', 'split_acc', 'debt_amt', 'credit_amt', 'cust_name', 'vend_name', 'account_name']
 if (classes.length) detailColumns.push('klass_name')
 if (departments.length) detailColumns.push('dept_name')
 const [ledger, openingReport, closingReport] = await Promise.all([
  qboRequest(key, 'GeneralLedger', { start_date: from, end_date: to, accounting_method: 'Accrual', columns: detailColumns.join(',') }),
  qboRequest(key, 'TrialBalance', { start_date: '1900-01-01', end_date: before, accounting_method: 'Accrual' }),
  qboRequest(key, 'TrialBalance', { start_date: '1900-01-01', end_date: to, accounting_method: 'Accrual' }),
 ])
 const currency = string(ledger.Header?.Currency, 'report currency', 3)
 requireThat(/^[A-Z]{3}$/.test(currency) && (companyCurrency === undefined || companyCurrency === currency), 'QuickBooks report and company currencies disagree', 502)
 header(ledger, 'GeneralLedger', to, currency)
 requireThat(ledger.Header.StartPeriod === from, 'QuickBooks returned a different ledger start date', 502)
 const column = columns(ledger), txDate = column(['tx_date', 'Date']), txType = column(['txn_type', 'Transaction Type', 'Type'])
 const debit = column(['debt_amt', 'Debit']), credit = column(['credit_amt', 'Credit'])
 const accountColumn = column(['account_name', 'Account'], false)
 const classColumn = column(['klass_name', 'class_name', 'Class'], false)
 const locationColumn = column(['dept_name', 'department_name', 'Location'], false)
 const customerColumn = column(['cust_name', 'Customer'], false), vendorColumn = column(['vend_name', 'Vendor'], false)
 const memoColumn = column(['memo', 'Memo'], false), docColumn = column(['doc_num', 'Num', 'No.'], false)
 const width = ledger.Columns?.Column?.length??0, postings = new Map<string,QboLedgerRow>(), movement = new Map<string, number>(), nonPostingRows:Data[]=[]
 walk(ledger, (row, sectionAccount) => {
  const values = cells(row, width), transaction = cell(values, txType)
  const transactionId = transaction.id
  if (!transactionId && /^(opening|beginning) balance$/i.test(String(cell(values, txDate).value ?? ''))) {
   requireThat(!qboCents(cell(values,debit).value) && !qboCents(cell(values,credit).value), 'QuickBooks has an unclassified opening movement',502)
   return
  }
  id(transactionId, 'transaction ID')
  const transactionType = string(transaction.value, 'transaction type', 80), posted = date(cell(values, txDate).value, 'transaction date')
  requireThat(posted >= from && posted <= to, 'QuickBooks ledger includes a transaction outside the month', 502)
  const dr = qboCents(cell(values, debit).value), cr = qboCents(cell(values, credit).value)
  requireThat(dr >= 0 && cr >= 0 && !(dr && cr), 'QuickBooks ledger has an invalid debit or credit', 502)
  const amount = safe(dr - cr, 'ledger amount')
  const sourceAccount=sectionAccount??cell(values,accountColumn).id
  if(!sourceAccount && dr===0 && cr===0){
   nonPostingRows.push({transactionId,transactionType,date:posted,reason:'No debit, credit or posting account; excluded from ledger amounts'})
   return
  }
  const accountId=id(sourceAccount,'ledger account ID'),account=chart.get(accountId)
  requireThat(account,'QuickBooks ledger has an unknown account',502)
  const class_name = string(cell(values, classColumn).value, 'class'), location_name = string(cell(values, locationColumn).value, 'location')
  const customer_name = string(cell(values, customerColumn).value, 'customer'), vendor_name = string(cell(values, vendorColumn).value, 'vendor')
  const description = string(cell(values, memoColumn).value, 'memo'), reference = string(cell(values, docColumn).value, 'document number', 200)
  const identity = sha256(canonicalJson([transactionId, transactionType, posted, accountId, class_name, location_name,cell(values,customerColumn).id??customer_name,cell(values,vendorColumn).id??vendor_name]))
  const prior=postings.get(identity)
  // General Ledger omits posting-line IDs. A transaction's same-account,
  // same-dimension splits are one stable source posting group, independent of order.
  postings.set(identity,{ id:identity, transactionId, transactionType, date:posted, accountId, account:account.code, accountName:account.name, accountType:account.type, amount:safe((prior?.amount??0)+amount,'posting group'), class_name, location_name, customer_name, vendor_name, description:prior && prior.description!==description?'Multiple source splits; open the QuickBooks transaction':description, reference })
  movement.set(accountId, safe((movement.get(accountId) ?? 0) + amount, 'account movement'))
 })
 const rows=[...postings.values()]
 requireThat(rows.length <= 5000, 'QuickBooks month exceeds the import row limit', 409)
 const opening = trial(openingReport, before, currency, chart), closing = trial(closingReport, to, currency, chart)
 rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
 const trialBalance = reconcileQboTrial(chart,opening,movement,closing,from,company.CompanyInfo.FiscalYearStartMonth)
 return { month, from, to, currency, rows, nonPostingRows,chart: [...chart.values()], dimensions, trialBalance, digest: sha256(canonicalJson({ rows,nonPostingRows, chart: [...chart.values()], dimensions, trialBalance })) }
}
