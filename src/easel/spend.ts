import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { scopedReader } from './group-projections'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { actualCells } from './actuals-read'
import { requireEditable, workspace } from './model'
import { datePeriod } from './fiscal-calendar'
import { month } from './months'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { scenarioView } from './views'
import { pantryDigest } from './pantry-provider'
import { readSpend, spendOrigin, spendOwnerStep, spendProvider } from './spend-provider'
import { all, Fault, find, get, put, requireThat, text, type Data } from './types'

function authority(c: Context) {
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a native finance session with company-wide access for spend', 403)
}
const secretId = (p: string) => `spend-${p}`
const purpose = (p: string) => `easel:spend:${p}:read:v1`
export async function spendStatus(c: Context, env: Bindings, name: string) {
 authority(c); const p = spendProvider(name), row = find(c.s, 'connection', secretId(p))
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(secretId(p)).first()
 const configured = p === 'ramp' || !!env.PURSE_ORIGIN
 return { ...row, provider: p, configured, connected: !!(stored && row?.connected && configured && row.origin === spendOrigin(env, p)), scope: p === 'purse' ? 'read-purchase-orders' : 'transactions:read', schedule: 'Manual', ownerStep: spendOwnerStep(p), error: row?.connected && !stored ? 'Reconnect after restore; spend credentials are excluded from archives' : row?.error ?? null }
}
export async function spendConnection(c: Context, env: Bindings, name: string, op: string, b: Data) {
 authority(c); const p = spendProvider(name), id = secretId(p), prior = find(c.s, 'connection', id)
 requireThat(['connect','disconnect'].includes(op), 'Unknown spend connection action', 404)
 if (op === 'disconnect') {
  put(c.s, 'connection', id, { ...prior, connected: false, disconnectedAt: c.now, providerRevocation: { status: 'unsupported', ownerStep: spendOwnerStep(p) } })
  c.activity.push({ action: 'spend-disconnected', record: id, detail: { localCredentialDeleted: true, providerRevocation: 'unsupported', ownerStep: spendOwnerStep(p) } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(id)]
 }
 requireThat(!prior?.connected, 'Disconnect before replacing the spend credential', 409)
 requireThat(b.consent === true, 'Explicitly approve read-only spend access')
 const token = text(b.key, 'Read-only spend credential', 2000); requireThat(!/\s/.test(token), 'Credential cannot contain whitespace')
 const origin = spendOrigin(env, p), sealed = await sealConnection(env.SESSION_SECRET, token, purpose(p))
 put(c.s, 'connection', id, { origin, connected: true, suffix: token.slice(-4), owner: c.x.actor.email, connectedAt: c.now, lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
 c.activity.push({ action: 'spend-connected', record: id, detail: { consent: true, suffix: token.slice(-4), origin } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id, sealed)]
}
async function source(c: Context, env: Bindings, p: 'ramp' | 'purse', ids: string[]) {
 const row = find(c.s, 'connection', secretId(p)), stored = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(secretId(p)).first<{ sealed: string }>()
 const origin = spendOrigin(env, p)
 requireThat(row?.connected && row.origin === origin && stored, `Connect ${p} before reviewing spend`, 409)
 return readSpend(p, origin, await openConnection(env.SESSION_SECRET, stored.sealed, purpose(p), p), ids)
}
export async function spendSources(c: Context, env: Bindings, b: Data) {
 authority(c)
 const period = month(b.month)
 const cards = await source(c, env, 'ramp', [])
 return [...cards.filter(r => datePeriod(workspace(c.s) as any, r.sourceDate.slice(0,10)) === period), ...await source(c, env, 'purse', Array.isArray(b.orders) ? b.orders : [])]
}
export function spendReadFailed(c: Context, error: unknown) {
 if (!(error instanceof Fault) || error.status !== 502) return false
 authority(c)
 for (const p of ['ramp','purse']) {
  const row = find(c.s, 'connection', secretId(p))
  if (row?.connected) put(c.s, 'connection', secretId(p), { ...row, error: error.message, failedAt: c.now, rateLimit: error.message.includes('429') ? 'Provider rate limit; retry explicitly later' : null })
 }
 c.activity.push({ action: 'spend-read-failed', record: 'spend', detail: { error: error.message, acceptedDataUnchanged: true } })
 return true
}
/** Read-only operational spend. Finance replaces a reviewed one-off assumption;
 * accounting rows are never fabricated and ambiguous ledger overlaps refuse. */
export async function spendReview(c: Context, env: Bindings, op: string, b: Data) {
 authority(c); requireThat(['preview','accept'].includes(op), 'Unknown spend review action', 404)
 const sc = scenarioAccess(c.s, c.x, b.scenario), driver = get(c.s, 'expense', b.driver), period = month(b.month)
 requireEditable(c.s, c.x, sc, driver.department)
 requireThat(sc.kind === 'forecast' && !sc.sandbox && (!sc.currency || sc.currency === workspace(c.s).currency) && driver.scenario === sc.id && driver.kind === 'one-off' && driver.start === period && !Object.keys(driver.dimensions ?? {}).length, 'Select a company forecast one-off expense in the reviewed month', 409)
 requireThat(sc.revision === b.revision && (!sc.actualsThrough || period > sc.actualsThrough), 'Forecast changed or month is closed; review again', 409)
 const line = get(c.s, 'line', driver.line); requireThat(!line.payroll && !line.nonCash, 'Spend requires an ordinary non-payroll expense line')
 const cells = await actualCells(c.db, c.s)
 requireThat(!cells.some(v => v.line === driver.line && v.department === driver.department && v.month === period), 'Accepted ledger actuals overlap this spend cell; reconcile explicitly before importing', 409)
 const current = await scenarioView(c, sc.id)
 const currentCell = current.calculation.cells.find(r => r.line === driver.line && r.department === driver.department && r.month === period)
 requireThat(currentCell && currentCell.sources.every(r => r.kind === 'expense' && r.id === driver.originId), 'The forecast cell mixes other sources; use a dedicated spend assumption', 409)
 const ids = Array.isArray(b.orders) ? b.orders : []
 const sourceRows = await spendSources(c, env, { orders: ids, month: period })
 const ramp = sourceRows.filter(r => r.provider === 'ramp'), purse = sourceRows.filter(r => r.provider === 'purse')
 const rows = [...ramp, ...purse]
 requireThat(rows.length > 0 && rows.every(r => r.currency === workspace(c.s).currency), 'Spend source currency differs; no exchange rate is inferred', 409)
 requireThat(Array.isArray(b.mapping) && b.mapping.length === rows.length, 'Map every selected source row explicitly')
 const mapped = new Set<string>(), linked = new Map<string, number>()
 const reviewed = rows.map(row => {
  const k = `${row.provider}:${row.id}`, maps = b.mapping.filter((m: Data) => m.source === k)
  requireThat(maps.length === 1 && !mapped.has(k), 'Source mapping must be unique'); mapped.add(k)
  const map = maps[0]; requireThat(map.line === driver.line && map.department === driver.department && map.month === period, 'Review the exact expense line, department and month for every source')
  if (row.provider === 'ramp' && map.order) {
   requireThat(purse.some(p => p.id === map.order), 'Linked PO is not in this reviewed source')
   linked.set(map.order, (linked.get(map.order) ?? 0) + row.amount)
  }
  return { ...row, line: map.line, department: map.department, month: map.month, order: map.order ?? null }
 })
 for (const po of purse) requireThat((linked.get(po.id) ?? 0) <= po.amount, 'Linked card actuals exceed the PO; reconcile before accepting', 409)
 const actual = ramp.reduce((n, r) => n + r.amount, 0), committed = purse.reduce((n, r) => n + r.amount - (linked.get(r.id) ?? 0), 0)
 requireThat(Number.isSafeInteger(actual + committed), 'Spend total exceeds exact money limits')
 // A source record can replace the same driver again, but cannot enter two forecasts or cells.
 for (const review of all(c.s, 'spend-review').filter(r => r.driver !== driver.id)) requireThat(!review.rows.some((r: Data) => mapped.has(`${r.provider}:${r.id}`)), 'This source is already accepted into another driver', 409)
 const budget = all(c.s, 'scenario').find(s => s.kind === 'budget' && s.status === 'frozen')
 requireThat(budget, 'Approve a budget before reviewing committed spend', 409)
 const budgetView = await scenarioView(c, budget.id)
 requireThat(budgetView.calculation.currency === workspace(c.s).currency && budgetView.calculation.months.includes(period), 'Budget has no comparable month or currency', 409)
 const budgetAmount = budgetView.calculation.cells.filter((r: Data) => r.line === driver.line && r.department === driver.department && r.month === period).reduce((n: number, r: Data) => n + r.amount, 0)
 const result = { scenario: sc.id, revision: sc.revision, driver: driver.id, month: period, currency: workspace(c.s).currency, line: driver.line, department: driver.department, budget: budgetAmount, actual, committed, remaining: budgetAmount - actual - committed, forecast: actual + committed, rows: reviewed, budgetSnapshot: budget.id }
 const fingerprint = pantryDigest(result)
 if (op === 'preview') return { ...result, fingerprint }
 requireThat(b.fingerprint === fingerprint, 'Spend source or mapping changed; preview again', 409)
 put(c.s, 'expense', driver.id, { ...driver, amountCents: actual + committed })
 put(c.s, 'spend-review', driver.id, { ...result, fingerprint, acceptedAt: c.now, acceptedBy: c.x.actor.email })
 for (const p of ['ramp','purse']) { const row = find(c.s, 'connection', secretId(p))!; put(c.s, 'connection', secretId(p), { ...row, lastRefresh: c.now, rowCount: rows.filter(r => r.provider === p).length, error: null }) }
 bump(c, sc, 'spend-accepted', driver.id, { fingerprint, actual, committed, remaining: result.remaining })
 return { ...result, fingerprint }
}
export async function spendReviews(c: Context) {
 authority(c)
 return all(c.s, 'spend-review').filter(r => { try { scenarioAccess(c.s, c.x, r.scenario); return true } catch { return false } }).map(r => ({ ...r, forecastChanged: get(c.s, 'scenario', r.scenario).revision !== r.revision + 1 }))
}
