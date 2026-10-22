// REPORT-007 warehouse inputs. Snowflake and Databricks hosts are owner
// entered but confined to the vendors' own domains; BigQuery uses its fixed
// host with a read-only OAuth grant. Finance's query is the only statement
// ever sent; the service role or grant must itself be read-only, and this
// module additionally refuses anything but one SELECT. Credentials never
// enter URLs, errors or logs, and a provider body is never echoed.
import { hundredths } from './units'
import { Fault, requireThat, text, type Data } from './types'
import { month } from './months'

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

const FORBIDDEN = /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|into|copy|call|execute|exec)\b/i
/** One reviewed SELECT: no comments, no second statement, no writes. */
export function readOnlyQuery(raw: unknown): string {
 const sql = text(raw, 'Query', 8000).replace(/;\s*$/, '')
 requireThat(/^(select|with)\b/i.test(sql), 'The query must be one SELECT (or WITH … SELECT) statement')
 requireThat(!/;|--|\/\*|\*\//.test(sql), 'Use one statement without comments or semicolons')
 requireThat(!FORBIDDEN.test(sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"[^"]*"/g, '""')), 'The query may only read: writes, DDL and session commands are refused')
 return sql
}

async function send(url: string, init: RequestInit, what: string): Promise<Data> {
 let response: Response
 try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(25000) }) } catch { throw new Fault(502, `${what} could not be reached; nothing was read`) }
 if (!response.ok) { await response.body?.cancel(); throw new Fault(502, `${what} refused the query (HTTP ${response.status}); nothing was read`) }
 const length = response.headers.get('content-length')
 requireThat(length === null || (/^\d+$/.test(length) && Number(length) <= 4_000_000), `${what} response is too large`, 502)
 let value: unknown
 try { value = JSON.parse(await response.text()) } catch { throw new Fault(502, `${what} returned invalid JSON; nothing was read`) }
 requireThat(value && typeof value === 'object' && !Array.isArray(value), `${what} returned invalid data`, 502)
 return value as Data
}

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
 const what = WAREHOUSE_LABEL[w]
 if (w === 'snowflake') {
  const r = await send(`https://${target.host}/api/v2/statements`, { method: 'POST', headers: { authorization: `Bearer ${secret.token}`, 'x-snowflake-authorization-token-type': 'OAUTH', 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ statement: sql, timeout: 30, ...(target.warehouse ? { warehouse: target.warehouse } : {}), ...(target.role ? { role: target.role } : {}), ...(target.database ? { database: target.database } : {}), ...(target.schema ? { schema: target.schema } : {}) }) }, what)
  requireThat(Array.isArray(r.data) && Array.isArray(r.resultSetMetaData?.rowType), `${what} did not finish the query in time; simplify it`, 409)
  requireThat(!(r.resultSetMetaData.partitionInfo?.length > 1), `${what} returned more than one result partition`, 409)
  return rowsFrom(r.resultSetMetaData.rowType.map((c: Data) => c.name), r.data, what)
 }
 if (w === 'databricks') {
  const r = await send(`https://${target.host}/api/2.0/sql/statements`, { method: 'POST', headers: { authorization: `Bearer ${secret.token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ statement: sql, warehouse_id: target.warehouseId, wait_timeout: '30s', on_wait_timeout: 'CANCEL', row_limit: MAX_ROWS + 1, format: 'JSON_ARRAY', disposition: 'INLINE' }) }, what)
  requireThat(r.status?.state === 'SUCCEEDED', `${what} did not finish the query (${String(r.status?.state ?? 'unknown').toLowerCase()})`, 409)
  return rowsFrom((r.manifest?.schema?.columns ?? []).map((c: Data) => c.name), r.result?.data_array ?? [], what)
 }
 const grant = await send('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }) }, 'Google')
 requireThat(typeof grant.access_token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(grant.access_token) && (grant.scope === undefined || grant.scope === BIGQUERY_SCOPE), `Use a Google grant with only the bigquery.readonly scope; reconnect BigQuery`, 409)
 const r = await send(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(target.projectId)}/queries`, { method: 'POST', headers: { authorization: `Bearer ${grant.access_token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: MAX_ROWS + 1, timeoutMs: 25000 }) }, what)
 requireThat(r.jobComplete === true && !r.pageToken, `${what} did not return a complete result; simplify the query`, 409)
 return rowsFrom((r.schema?.fields ?? []).map((f: Data) => f.name), (r.rows ?? []).map((row: Data) => row.f.map((cell: Data) => cell.v)), what)
}
