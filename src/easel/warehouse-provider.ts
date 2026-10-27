// REPORT-007 warehouse inputs. Snowflake and Databricks hosts are owner
// entered but confined to the vendors' own domains; BigQuery uses its fixed
// host with a read-only OAuth grant. Finance's query is the only statement
// ever sent; the service role or grant must itself be read-only, and this
// module additionally refuses anything but one SELECT. Credentials never
// enter URLs, errors or logs, and a provider body is never echoed.
import { hundredths } from './units'
import { Fault, requireThat, text, type Data } from './types'
import { month } from './months'
import { readOnlyQuery } from './warehouse-query-policy'

export const WAREHOUSES = ['snowflake', 'bigquery', 'databricks'] as const
export type Warehouse = typeof WAREHOUSES[number]
export const WAREHOUSE_LABEL: Record<Warehouse, string> = { snowflake: 'Snowflake', bigquery: 'BigQuery', databricks: 'Databricks' }
export const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly'
export const warehousePurpose = (w: Warehouse) => `easel:warehouse:${w}:query:v1`
const MAX_ROWS = 600
/** A warehouse period is a calendar month written YYYY-MM, or a first-of-month date. */
const period = (v: unknown) => month(typeof v === 'string' && /^\d{4}-\d{2}-01$/.test(v) ? v.slice(0, 7) : v, 'Metric period')

const token = (v: unknown, label: string) => { const t = text(v, label, 4096); requireThat(/^[\x21-\x7e]+$/.test(t), `${label} cannot contain spaces or control characters`); return t }
const ident = (v: unknown, label: string, optional = false) => { if (optional && (v === undefined || v === '')) return ''; const t = text(v, label, 200); requireThat(/^[A-Za-z0-9_$.\- ]+$/.test(t), `${label} uses letters, digits and _ $ . - only`); return t }

export function warehouseCredentials(w: Warehouse, b: Data): { secret: Data; target: Data; label: string } {
 if (w === 'snowflake') {
  const account = text(b.account, 'Snowflake account', 120).toLowerCase()
  requireThat(/^[a-z0-9][a-z0-9._-]*$/.test(account) && !account.includes('..') && !account.endsWith('.'), 'Use the Snowflake account identifier, for example xy12345.us-east-1')
  return { secret: { token: token(b.token, 'Snowflake token') }, target: { account, host: `${account}.snowflakecomputing.com`, warehouse: ident(b.warehouse, 'Warehouse', true), role: ident(b.role, 'Role', true), database: ident(b.database, 'Database', true), schema: ident(b.schema, 'Schema', true) }, label: `Snowflake ${account}` }
 }
 if (w === 'databricks') {
  const host = text(b.host, 'Databricks workspace host', 200).toLowerCase()
  requireThat(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com)$/.test(host), 'Use the workspace host name, for example dbc-1234.cloud.databricks.com')
  return { secret: { token: token(b.token, 'Databricks token') }, target: { host, warehouseId: ident(b.warehouseId, 'SQL warehouse ID') }, label: `Databricks ${host}` }
 }
 const projectId = text(b.projectId, 'BigQuery project ID', 100)
 requireThat(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId), 'Use the BigQuery project ID')
 return { secret: { clientId: token(b.clientId, 'Google OAuth client ID'), clientSecret: token(b.clientSecret, 'Google OAuth client secret'), refreshToken: token(b.refreshToken, 'Google refresh token') }, target: { projectId }, label: `BigQuery ${projectId}` }
}

const MAX_BYTES = 4_000_000
const DEADLINE_MS = 25000

/** The same deadline covers headers and every body chunk, including OAuth. */
function beforeDeadline<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
 return new Promise((resolve, reject) => {
  const expired = () => reject(new Fault(502, 'Warehouse request timed out; prior metrics were kept'))
  if (signal.aborted) { expired(); return }
  signal.addEventListener('abort', expired, { once: true })
  pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', expired))
 })
}

async function send(url: string, init: RequestInit, what: string, signal: AbortSignal): Promise<Data> {
 let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
 let response: Response | undefined
 try {
  response = await beforeDeadline(fetch(url, { ...init, redirect: 'manual', signal }), signal)
  requireThat(response.ok, `${what} refused the query (HTTP ${response.status}); prior metrics were kept`, 502)
  const length = response.headers.get('content-length')
  requireThat(length === null || (/^\d+$/.test(length) && Number(length) <= MAX_BYTES), `${what} response is too large; prior metrics were kept`, 502)
  requireThat(response.body, `${what} returned an empty response; prior metrics were kept`, 502)
  reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0, body = ''
  while (true) {
   const { value, done } = await beforeDeadline(reader.read(), signal)
   if (done) break
   size += value.byteLength
   requireThat(size <= MAX_BYTES, `${what} response is too large; prior metrics were kept`, 502)
   body += decoder.decode(value, { stream: true })
  }
  body += decoder.decode()
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Fault(502, `${what} returned invalid JSON; prior metrics were kept`) }
  requireThat(value && typeof value === 'object' && !Array.isArray(value), `${what} returned invalid data; prior metrics were kept`, 502)
  return value as Data
 } catch (error) {
  // A stalled upstream cancel must not extend the deadline either.
  if (reader) void reader.cancel().catch(() => {})
  else if (response?.body) void response.body.cancel().catch(() => {})
  if (error instanceof Fault) throw error
  throw new Fault(502, `${what} could not be read; prior metrics were kept`)
 } finally { reader?.releaseLock() }
}

const boundedCount = (count: unknown, what: string) => requireThat(count === undefined || (/^\d+$/.test(String(count)) && Number(count) <= MAX_ROWS), `${what} returned too many rows (at most ${MAX_ROWS} months)`, 409)

/** period/value rows from a provider's tabular result: the first two columns must be named period and value. */
function rowsFrom(names: unknown[], data: unknown[][], what: string) {
 const lower = names.map(n => String(n).toLowerCase()), p = lower.indexOf('period'), v = lower.indexOf('value')
 requireThat(p >= 0 && v >= 0, `${what} result needs columns named period (YYYY-MM) and value`, 409)
 requireThat(Array.isArray(data) && data.length <= MAX_ROWS, `${what} returned too many rows (at most ${MAX_ROWS} months)`, 409)
 const seen = new Set<string>()
 return data.map(row => {
  const month = period(row[p]), value = row[v]
  requireThat(!seen.has(month), `${what} returned ${month} more than once`, 409)
  seen.add(month)
  requireThat(value !== null && value !== undefined && /^\d+(\.\d{1,2})?$/.test(String(value)), `${what} value for ${month} must be a non-negative number with at most two decimals`, 409)
  return { period: month, hundredths: hundredths(String(value), 'Metric value') }
 }).sort((a, b) => a.period.localeCompare(b.period))
}

export async function runWarehouseQuery(w: Warehouse, secret: Data, target: Data, sql: string): Promise<{ period: string; hundredths: number }[]> {
 sql = readOnlyQuery(sql, w)
 const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), DEADLINE_MS)
 const signal = controller.signal
 try {
 const what = WAREHOUSE_LABEL[w]
 if (w === 'snowflake') {
  const r = await send(`https://${target.host}/api/v2/statements`, { method: 'POST', headers: { authorization: `Bearer ${secret.token}`, 'x-snowflake-authorization-token-type': 'OAUTH', 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ statement: sql, timeout: 30, ...(target.warehouse ? { warehouse: target.warehouse } : {}), ...(target.role ? { role: target.role } : {}), ...(target.database ? { database: target.database } : {}), ...(target.schema ? { schema: target.schema } : {}) }) }, what, signal)
  requireThat(Array.isArray(r.data) && Array.isArray(r.resultSetMetaData?.rowType), `${what} did not finish the query in time; simplify it`, 409)
  boundedCount(r.resultSetMetaData.numRows, what)
  requireThat(!(r.resultSetMetaData.partitionInfo?.length > 1), `${what} returned more than one result partition`, 409)
  return rowsFrom(r.resultSetMetaData.rowType.map((c: Data) => c.name), r.data, what)
 }
 if (w === 'databricks') {
  const r = await send(`https://${target.host}/api/2.0/sql/statements`, { method: 'POST', headers: { authorization: `Bearer ${secret.token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ statement: sql, warehouse_id: target.warehouseId, wait_timeout: '30s', on_wait_timeout: 'CANCEL', row_limit: MAX_ROWS + 1, format: 'JSON_ARRAY', disposition: 'INLINE' }) }, what, signal)
  requireThat(r.status?.state === 'SUCCEEDED', `${what} did not finish the query (${String(r.status?.state ?? 'unknown').toLowerCase()})`, 409)
  boundedCount(r.manifest?.total_row_count, what)
  requireThat(!r.manifest?.truncated && !(r.manifest?.total_chunk_count > 1) && r.result?.next_chunk_index == null && !r.result?.external_links?.length, `${what} did not return a complete inline result`, 409)
  return rowsFrom((r.manifest?.schema?.columns ?? []).map((c: Data) => c.name), r.result?.data_array ?? [], what)
 }
 const grant = await send('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }) }, 'Google', signal)
 requireThat(typeof grant.access_token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(grant.access_token) && (grant.scope === undefined || grant.scope === BIGQUERY_SCOPE), `Use a Google grant with only the bigquery.readonly scope; reconnect BigQuery`, 409)
 const r = await send(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(target.projectId)}/queries`, { method: 'POST', headers: { authorization: `Bearer ${grant.access_token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: MAX_ROWS + 1, timeoutMs: 25000 }) }, what, signal)
 requireThat(r.jobComplete === true && !r.pageToken, `${what} did not return a complete result; simplify the query`, 409)
 boundedCount(r.totalRows, what)
 return rowsFrom((r.schema?.fields ?? []).map((f: Data) => f.name), (r.rows ?? []).map((row: Data) => row.f.map((cell: Data) => cell.v)), what)
 } finally { clearTimeout(deadline) }
}
