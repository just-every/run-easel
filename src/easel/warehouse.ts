// REPORT-007, REPORT-009: operational metrics from a warehouse as driver actuals. Finance
// connects Snowflake, BigQuery or Databricks (credentials sealed, never
// archived or returned), writes one read-only query that returns period and
// value, previews its result, and approves that exact query text and result
// fingerprint. A refresh runs only the approved query and stores monthly
// values that a usage revenue driver bound to the metric uses in place of its
// growth arithmetic for those months. Nothing here writes to the warehouse.
import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { readOnlyQuery } from './warehouse-query-policy'
import { scopedReader } from './group-projections'
import { sha256 } from './store'
import { all, choice, find, get, put, remove, requireThat, text, uid, type Data } from './types'
import { runWarehouseQuery, warehouseCredentials, warehousePurpose, WAREHOUSE_LABEL, WAREHOUSES, type Warehouse } from './warehouse-provider'

const secretId = (w: Warehouse) => `warehouse:${w}`
export const METRIC = /^[a-z][a-z0-9_]{0,59}$/
function authority(c: Context) {
 requireCapability(c.x, 'connections')
 requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a native finance session with company-wide access for warehouse metrics', 403)
}

export async function warehouseStatus(c: Context) {
 authority(c)
 const connections = await Promise.all(WAREHOUSES.map(async w => {
  const row = find(c.s, 'connection', secretId(w)), stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(secretId(w)).first()
  return { warehouse: w, label: WAREHOUSE_LABEL[w], connected: Boolean(stored && row?.connected), target: row?.connected ? row.target : null, owner: row?.owner ?? null, connectedAt: row?.connectedAt ?? null, error: row?.connected && !stored ? `Reconnect ${WAREHOUSE_LABEL[w]} after restore; credentials are excluded from archives` : null }
 }))
 const metrics = all(c.s, 'warehouse-metric')
 return { connections, queries: all(c.s, 'warehouse-query').sort((a, b) => a.name.localeCompare(b.name)).map(q => ({ ...q, periods: metrics.filter(m => m.metric === q.metric).map(m => m.period).sort() })) }
}

export async function warehouseConnection(c: Context, env: Bindings, warehouse: string, op: string, b: Data): Promise<D1PreparedStatement[]> {
 authority(c)
 const w = choice(warehouse, WAREHOUSES, 'a warehouse')
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown warehouse action', 404)
 const id = secretId(w)
 if (op === 'disconnect') {
  put(c.s, 'connection', id, { ...find(c.s, 'connection', id), connected: false, disconnectedAt: c.now })
  c.activity.push({ action: 'warehouse-disconnected', record: id, detail: { warehouse: w } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(id)]
 }
 const { secret, target, label } = warehouseCredentials(w, b)
 const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify({ secret, target }), warehousePurpose(w))
 put(c.s, 'connection', id, { connected: true, warehouse: w, target: label, owner: c.x.actor.email, connectedAt: c.now })
 c.activity.push({ action: 'warehouse-connected', record: id, detail: { warehouse: w, target: label } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id, sealed)]
}

async function custody(c: Context, env: Bindings, w: Warehouse) {
 const row = find(c.s, 'connection', secretId(w)), stored = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(secretId(w)).first<{ sealed: string }>()
 requireThat(row?.connected && stored, `Connect ${WAREHOUSE_LABEL[w]} before running its queries`, 409)
 try { return JSON.parse(await openConnection(env.SESSION_SECRET, stored.sealed, warehousePurpose(w), WAREHOUSE_LABEL[w])) as { secret: Data; target: Data } } catch { throw new Error(`${WAREHOUSE_LABEL[w]} credentials could not be opened; reconnect`) }
}

const sqlSha = (q: Data) => sha256(JSON.stringify([q.warehouse, q.metric, q.sql]))
const fingerprint = (sha: string, rows: Data[]) => sha256(JSON.stringify([sha, rows]))

/** Query commands run in a signed-in finance session; refresh and preview contact the warehouse. */
export async function warehouseCommand(c: Context, env: Bindings, op: string, b: Data): Promise<Data> {
 authority(c)
 if (op === 'warehouse-query-save') {
  const prior = b.id ? get(c.s, 'warehouse-query', b.id, 'query') : null
  requireThat(!prior || Number(b.revision) === prior.revision, 'The query changed; reload', 409)
  const warehouse = choice(b.warehouse, WAREHOUSES, 'a warehouse'), metric = text(b.metric, 'Metric name', 60)
  requireThat(METRIC.test(metric), 'Metric names use lowercase letters, digits and underscores, starting with a letter')
  requireThat(!all(c.s, 'warehouse-query').some(q => q.id !== prior?.id && q.metric === metric), 'Another query already supplies this metric', 409)
  const id = prior?.id ?? uid(), next = { name: text(b.name, 'Query name'), warehouse, metric, sql: readOnlyQuery(b.sql, warehouse) }
  const changed = !prior || prior.sql !== next.sql || prior.warehouse !== warehouse || prior.metric !== metric
  put(c.s, 'warehouse-query', id, { ...(prior ?? {}), ...next, revision: (prior?.revision ?? 0) + 1, ...(changed ? { preview: null, approved: null } : {}), savedBy: c.x.actor.email, savedAt: c.now })
  if (prior && prior.metric !== metric) for (const m of all(c.s, 'warehouse-metric').filter(m => m.metric === prior.metric)) remove(c.s, 'warehouse-metric', m.id)
  c.activity.push({ action: op, record: id, detail: { warehouse, metric, changed } })
  return get(c.s, 'warehouse-query', id)
 }
 const q = get(c.s, 'warehouse-query', b.id, 'query')
 requireThat(Number(b.revision) === q.revision, 'The query changed; reload', 409)
 if (op === 'warehouse-query-delete') {
  for (const m of all(c.s, 'warehouse-metric').filter(m => m.metric === q.metric)) remove(c.s, 'warehouse-metric', m.id)
  remove(c.s, 'warehouse-query', q.id)
  c.activity.push({ action: op, record: q.id, detail: { metric: q.metric } })
  return { deleted: q.id }
 }
 if (op === 'warehouse-query-preview' || op === 'warehouse-refresh') {
  const sha = await sqlSha(q)
  if (op === 'warehouse-refresh') requireThat(q.approved?.sqlSha === sha, 'Finance must review and approve this exact query before it supplies metrics', 409)
  const { secret, target } = await custody(c, env, q.warehouse)
  const rows = await runWarehouseQuery(q.warehouse, secret, target, q.sql)
  const print = await fingerprint(sha, rows)
  if (op === 'warehouse-query-preview') {
   put(c.s, 'warehouse-query', q.id, { ...q, preview: { fingerprint: print, at: c.now, rows: rows.length } })
   return { ...get(c.s, 'warehouse-query', q.id), rows, fingerprint: print }
  }
  for (const m of all(c.s, 'warehouse-metric').filter(m => m.metric === q.metric)) remove(c.s, 'warehouse-metric', m.id)
  for (const r of rows) put(c.s, 'warehouse-metric', `${q.metric}|${r.period}`, { metric: q.metric, period: r.period, hundredths: r.hundredths, query: q.id, sqlSha: sha, fetchedAt: c.now })
  put(c.s, 'warehouse-query', q.id, { ...q, lastRefresh: { at: c.now, rows: rows.length, fingerprint: print, by: c.x.actor.email } })
  c.activity.push({ action: op, record: q.id, detail: { metric: q.metric, rows: rows.length } })
  return get(c.s, 'warehouse-query', q.id)
 }
 requireThat(op === 'warehouse-query-approve', 'Unknown warehouse action', 404)
 const sha = await sqlSha(q)
 requireThat(q.preview && b.fingerprint === q.preview.fingerprint, 'Preview the query and approve the result you reviewed', 409)
 put(c.s, 'warehouse-query', q.id, { ...q, approved: { by: c.x.actor.email, at: c.now, sqlSha: sha, fingerprint: q.preview.fingerprint } })
 c.activity.push({ action: op, record: q.id, detail: { metric: q.metric, sqlSha: sha } })
 return get(c.s, 'warehouse-query', q.id)
}
