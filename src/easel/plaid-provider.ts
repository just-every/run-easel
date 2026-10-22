// Read-only Plaid boundary: fixed provider origins, no redirects or automatic retries.
import { cents } from './units'
import { choice, Fault, requireThat, text, type Data } from './types'
export type PlaidCredentials = { environment: 'sandbox' | 'production'; clientId: string; secret: string; accessToken: string }
export const PLAID_PURPOSE = 'easel:plaid:balances-transactions:read:v1'
export const PLAID_SCOPE = 'Read balances and transactions; no payments or transfers'
export class PlaidFailure extends Fault {
 constructor(message: string, public httpStatus: number | null = null, public rateLimit: string | null = null) { super(502, message) }
}
export function plaidCredentials(b: Data): PlaidCredentials {
 const credentials = { environment: choice(b.environment, ['sandbox', 'production'] as const, 'Plaid environment'), clientId: text(b.clientId, 'Plaid client ID', 200), secret: text(b.secret, 'Plaid secret', 2000), accessToken: text(b.accessToken, 'Plaid access token', 2000) }
 requireThat([credentials.clientId, credentials.secret, credentials.accessToken].every(v => !/\s/.test(v)), 'Plaid credentials cannot contain whitespace')
 return credentials
}
export async function plaidRequest(credentials: PlaidCredentials, path: '/accounts/balance/get' | '/transactions/get' | '/item/remove', input: Data = {}): Promise<Data> {
 let response: Response
 try {
  response = await fetch(`https://${credentials.environment}.plaid.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'Plaid-Version': '2020-09-14' }, body: JSON.stringify({ ...input, client_id: credentials.clientId, secret: credentials.secret, access_token: credentials.accessToken }), redirect: 'manual', signal: AbortSignal.timeout(15000) })
 } catch { throw new PlaidFailure('Plaid could not be reached; no data was changed') }
 if (response.status !== 200) {
  await response.body?.cancel()
  throw new PlaidFailure(`Plaid refused the read (HTTP ${response.status}); check the connection in Plaid`, response.status, response.status === 429 ? 'Plaid rate limited this request; retry explicitly later' : null)
 }
 let data: Data
 try { const raw = await response.text(); requireThat(raw.length <= 4_000_000, 'Plaid response is too large'); data = JSON.parse(raw) }
 catch { throw new PlaidFailure('Plaid returned an unreadable response; no data was changed', 200) }
 requireThat(data && typeof data === 'object' && !Array.isArray(data), 'Plaid returned an invalid response', 502)
 return data
}
const date = (v: unknown) => {
 requireThat(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Plaid returned an invalid transaction date', 502)
 return v
}
const amount = (v: unknown): number => {
 requireThat(typeof v === 'number' && Number.isFinite(v), 'Plaid returned an unavailable amount', 502)
 try { return cents(String(v), 'Plaid amount', { negative: true }) } catch { throw new PlaidFailure('Plaid returned an amount without exact cent precision; no data was changed') }
}
export async function readPlaidCash(credentials: PlaidCredentials, asOf: string) {
 const balances = await plaidRequest(credentials, '/accounts/balance/get')
 requireThat(Array.isArray(balances.accounts) && balances.accounts.length <= 100, 'Plaid returned an invalid account list', 502)
 const accounts = balances.accounts.filter((a: Data) => a.type === 'depository')
 requireThat(accounts.length > 0 && accounts.every((a: Data) => typeof a.account_id === 'string' && a.account_id.length > 0), 'Plaid has no readable depository accounts', 502)
 requireThat(new Set(accounts.map((a: Data) => a.account_id)).size === accounts.length, 'Plaid returned duplicate accounts', 502)
 const currencies = accounts.map((a: Data) => a.balances?.iso_currency_code)
 requireThat(currencies.every((currency: unknown) => typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) && new Set(currencies).size === 1, 'Bank cash needs one explicit ISO currency across all depository accounts; no exchange rate is inferred', 409)
 const balanceCents = accounts.reduce((sum: number, a: Data) => sum + amount(a.balances?.current), 0)
 requireThat(Number.isSafeInteger(balanceCents), 'Bank cash exceeds exact integer precision', 502)
 const end = date(asOf.slice(0, 10)), start = new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10)
 const ids = new Set(accounts.map((a: Data) => a.account_id)), seen = new Set<string>(), movements = new Map<string, Data>()
 let total = -1, offset = 0
 do {
  const page = await plaidRequest(credentials, '/transactions/get', { start_date: start, end_date: end, options: { account_ids: [...ids], count: 500, offset } })
  requireThat(Number.isSafeInteger(page.total_transactions) && page.total_transactions >= 0 && page.total_transactions <= 5000 && Array.isArray(page.transactions), 'Bank transaction window is too large or incomplete; no partial source is accepted', 502)
  requireThat(total < 0 || page.total_transactions === total, 'Bank transactions changed during pagination; refresh explicitly again', 409)
  total = page.total_transactions
  requireThat(page.transactions.length <= 500 && page.transactions.length <= total - offset && (offset >= total || page.transactions.length > 0), 'Plaid returned an incomplete transaction page', 502)
  for (const transaction of page.transactions) {
   requireThat(typeof transaction.transaction_id === 'string' && !seen.has(transaction.transaction_id), 'Plaid returned duplicate or missing transaction IDs', 502)
   seen.add(transaction.transaction_id)
   requireThat(ids.has(transaction.account_id) && transaction.iso_currency_code === currencies[0], 'Plaid returned transactions outside the reviewed accounts or currency', 502)
   const when = date(transaction.date)
   requireThat(when >= start && when <= end && typeof transaction.pending === 'boolean', 'Plaid returned an invalid transaction window or pending state', 502)
   if (transaction.pending) continue
   const value = amount(transaction.amount), row = movements.get(when) ?? { date: when, collections: 0, payments: 0, count: 0 }
   if (value < 0) row.collections -= value; else row.payments += value
   requireThat(Number.isSafeInteger(row.collections) && Number.isSafeInteger(row.payments), 'Bank movement exceeds exact integer precision', 502)
   row.count++; movements.set(when, row)
  }
  offset += page.transactions.length
 } while (offset < total)
 return { asOf, currency: currencies[0], balanceCents, accountCount: accounts.length, excludedAccountCount: balances.accounts.length - accounts.length, windowStart: start, windowEnd: end, rowCount: total, movements: [...movements.values()].sort((a, b) => a.date.localeCompare(b.date)), basis: 'Plaid current depository balances, not ledger actuals. Posted transaction movement is informational; pending transactions are excluded. Movement is not added to current balances.' }
}
