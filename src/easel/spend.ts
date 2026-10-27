import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { scopedReader } from './group-projections'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { actualCells, rowsFor } from './actuals-read'
import { requireEditable, workspace } from './model'
import { datePeriod } from './fiscal-calendar'
import { month } from './months'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { scenarioView } from './views'
import { pantryDigest } from './pantry-provider'
import { readSpend, spendOrigin, spendOwnerStep, spendProvider, type SpendProvider } from './spend-provider'
import { all, Fault, find, get, put, requireThat, text, type Data } from './types'

function authority(c: Context) {
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a native finance session with company-wide access for spend', 403)
}
const addMoney = (left: number, right: number) => { const total = left + right; requireThat(Number.isSafeInteger(total), 'Spend total exceeds exact money limits', 409); return total }
const sumMoney = (values: number[]) => values.reduce(addMoney, 0)
const secretId = (p: string) => `spend-${p}`
const purpose = (p: string) => `easel:spend:${p}:read:v1`
export async function spendStatus(c: Context, env: Bindings, name: string) {
 authority(c); const p = spendProvider(name), row = find(c.s, 'connection', secretId(p))
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(secretId(p)).first()
 const configured = p === 'ramp' || !!(p === 'purse' ? env.PURSE_ORIGIN : env.COASTER_ORIGIN)
 return { ...row, provider: p, configured, canDisconnect: !!(stored || row?.connected), connected: !!(stored && row?.connected && configured && row.origin === spendOrigin(env, p)), scope: p === 'purse' ? 'read-purchase-orders' : p === 'coaster' ? 'claim-reports:read' : 'transactions:read', schedule: 'Manual', ownerStep: spendOwnerStep(p), error: row?.connected && !stored ? 'Reconnect after restore; spend credentials are excluded from archives' : row?.error ?? null }
}
export async function spendConnection(c: Context, env: Bindings, name: string, op: string, b: Data) {
 authority(c); const p = spendProvider(name), id = secretId(p), prior = find(c.s, 'connection', id)
 requireThat(['connect','disconnect'].includes(op), 'Unknown spend connection action', 404)
 if (op === 'disconnect') {
  put(c.s, 'connection', id, { ...prior, connected: false, disconnectedAt: c.now, providerRevocation: { status: 'unsupported', ownerStep: spendOwnerStep(p) } })
  c.activity.push({ action: 'spend-disconnected', record: id, detail: { localCredentialDeleted: true, providerRevocation: 'unsupported', ownerStep: spendOwnerStep(p) } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(id)]
 }
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(id).first()
 requireThat(!prior?.connected || !stored, 'Disconnect before replacing the spend credential', 409)
 requireThat(b.consent === true, 'Explicitly approve read-only spend access')
 const token = text(b.key, 'Read-only spend credential', 2000); requireThat(!/\s/.test(token), 'Credential cannot contain whitespace')
 const origin = spendOrigin(env, p), sealed = await sealConnection(env.SESSION_SECRET, token, purpose(p))
 put(c.s, 'connection', id, { origin, connected: true, suffix: token.slice(-4), owner: c.x.actor.email, connectedAt: c.now, lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
 c.activity.push({ action: 'spend-connected', record: id, detail: { consent: true, suffix: token.slice(-4), origin } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id, sealed)]
}
async function source(c: Context, env: Bindings, p: SpendProvider, ids: string[]) {
 const row = find(c.s, 'connection', secretId(p)), stored = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(secretId(p)).first<{ sealed: string }>()
 const origin = spendOrigin(env, p)
 requireThat(row?.connected && row.origin === origin && stored, `Connect ${p} before reviewing spend`, 409)
 return readSpend(p, origin, await openConnection(env.SESSION_SECRET, stored.sealed, purpose(p), p), ids)
}
export async function spendSources(c: Context, env: Bindings, b: Data) {
 authority(c)
 const period = month(b.month)
 const selected = b.providers ?? ['ramp','purse', ...(Array.isArray(b.reports) && b.reports.length ? ['coaster'] : [])]
 requireThat(Array.isArray(selected) && selected.length > 0 && selected.length <= 3 && new Set(selected).size === selected.length, 'Choose distinct spend providers')
 const rows: Data[] = []
 for (const name of selected) {
  const p = spendProvider(name), ids = p === 'purse' ? b.orders : p === 'coaster' ? b.reports : []
  const received = await source(c, env, p, Array.isArray(ids) ? ids : [])
  rows.push(...received.filter(r => p !== 'ramp' || datePeriod(workspace(c.s) as any, r.sourceDate.slice(0,10)) === period))
 }
 return rows
}
export function spendReadFailed(c: Context, error: unknown) {
 if (!(error instanceof Fault) || error.status !== 502) return false
 authority(c)
 for (const p of ['ramp','purse','coaster']) {
  const row = find(c.s, 'connection', secretId(p))
  if (row?.connected) put(c.s, 'connection', secretId(p), { ...row, error: error.message, failedAt: c.now, rateLimit: error.message.includes('429') ? 'Provider rate limit; retry explicitly later' : null })
 }
 c.activity.push({ action: 'spend-read-failed', record: 'spend', detail: { error: error.message, acceptedDataUnchanged: true } })
 return true
}
/** Read-only operational spend. Finance replaces a reviewed one-off assumption;
 * accounting rows are never fabricated and ambiguous ledger overlaps refuse. */
export async function spendReview(c: Context, env: Bindings, op: string, b: Data) {
 authority(c); requireThat(['preview','accept','ledger'].includes(op), 'Unknown spend review action', 404)
 const sc = scenarioAccess(c.s, c.x, b.scenario), driver = get(c.s, 'expense', b.driver), period = month(b.month)
 requireEditable(c.s, c.x, sc, driver.department)
 requireThat(sc.kind === 'forecast' && !sc.sandbox && (!sc.currency || sc.currency === workspace(c.s).currency) && driver.scenario === sc.id && driver.kind === 'one-off' && driver.start === period && !Object.keys(driver.dimensions ?? {}).length, 'Select a company forecast one-off expense in the reviewed month', 409)
 requireThat(sc.revision === b.revision && (!sc.actualsThrough || period > sc.actualsThrough), 'Forecast changed or month is closed; review again', 409)
 const line = get(c.s, 'line', driver.line); requireThat(!line.payroll && !line.nonCash, 'Spend requires an ordinary non-payroll expense line')
 const cells = await actualCells(c.db, c.s, period)
 const ledgerRows = await rowsFor(c.db, c.s, period, driver.line, driver.department)
 requireThat(ledgerRows.every(r => !Object.keys(r.dimensions ?? {}).length), 'Dimensioned ledger spend requires a dedicated dimension review', 409)
 if (op === 'ledger') return { rows: ledgerRows, total: sumMoney(ledgerRows.map(r => r.amount)) }
 requireThat(!cells.some(v => v.line === driver.line && v.department === driver.department && v.month === period && v.rows !== ledgerRows.length), 'Ledger row projection is incomplete', 409)
 const current = await scenarioView(c, sc.id)
 const currentCell = current.calculation.cells.find(r => r.line === driver.line && r.department === driver.department && r.month === period)
 requireThat(currentCell && currentCell.sources.every(r => r.kind === 'expense' && r.id === driver.originId), 'The forecast cell mixes other sources; use a dedicated spend assumption', 409)
 const ids = Array.isArray(b.orders) ? b.orders : []
 const sourceRows = await spendSources(c, env, { providers: b.providers, orders: ids, reports: b.reports, month: period })
 const rows = sourceRows, purse = rows.filter(r => r.provider === 'purse' && r.kind === 'commitment'), actualRows = rows.filter(r => r.kind === 'actual')
 requireThat(rows.length > 0 && rows.every(r => r.currency === workspace(c.s).currency), 'Spend source currency differs; no exchange rate is inferred', 409)
 requireThat(Array.isArray(b.mapping) && b.mapping.length === rows.length, 'Map every selected source row explicitly')
 const mapped = new Set<string>(), linked = new Map<string, number>()
 const reviewed: Data[] = rows.map(row => {
  const k = `${row.provider}:${row.id}`, maps = b.mapping.filter((m: Data) => m.source === k)
  requireThat(maps.length === 1 && !mapped.has(k), 'Source mapping must be unique'); mapped.add(k)
  const map = maps[0]; requireThat(map.line === driver.line && map.department === driver.department && map.month === period, 'Review the exact expense line, department and month for every source')
  const order = row.order ?? map.order ?? null
  requireThat(!row.order || !map.order || row.order === map.order, 'Paid bill cannot move to another PO')
  if (map.duplicateOf) {
   const other = actualRows.find(r => `${r.provider}:${r.id}` === map.duplicateOf)
   const otherMap = b.mapping.find((m: Data) => m.source === map.duplicateOf)
   requireThat(row.kind === 'actual' && other && other !== row && other.provider !== row.provider && other.amount === row.amount && !otherMap?.duplicateOf && (other.order ?? otherMap?.order ?? null) === order, 'Duplicate settlement must match one independent actual and its PO exactly', 409)
  }
  if (row.kind === 'actual' && order && !map.duplicateOf) {
   requireThat(purse.some(p => p.id === order), 'Linked PO is not in this reviewed source')
   linked.set(order, addMoney(linked.get(order) ?? 0, row.amount))
  }
  return { ...row, line: map.line, department: map.department, month: map.month, order, duplicateOf: map.duplicateOf ?? null }
 })
 const ledgerMapping = Array.isArray(b.ledgerMapping) ? b.ledgerMapping : []
 requireThat(ledgerMapping.length === ledgerRows.length && (!ledgerRows.length || b.ledgerConfirmed === true), 'Review every accepted ledger row explicitly before accepting spend', 409)
 const matchedSources = new Set<string>()
 const reconciledLedger = ledgerRows.map(row => {
  const maps = ledgerMapping.filter((m: Data) => m.row === row.id)
  requireThat(maps.length === 1, 'Ledger mapping must cover each row exactly once', 409)
  const map = maps[0]
  if (map.source) {
   const other = reviewed.find(r => `${r.provider}:${r.id}` === map.source)
   requireThat(other?.kind === 'actual' && !other.duplicateOf && other.amount === row.amount && !matchedSources.has(map.source) && !map.order, 'Ledger match must equal one distinct source actual; no inferred matches', 409)
   matchedSources.add(map.source)
  } else if (map.order) {
   requireThat(purse.some(p => p.id === map.order), 'Ledger payment PO is not in this review', 409)
   linked.set(map.order, addMoney(linked.get(map.order) ?? 0, row.amount))
  }
  return { id: row.id, date: row.date, account: row.account, reference: row.reference, amount: row.amount, file: row.file, description: row.description, source: map.source ?? null, order: map.order ?? null }
 })
 for (const po of purse) requireThat((linked.get(po.id) ?? 0) >= 0 && (linked.get(po.id) ?? 0) <= po.amount, 'Net linked actuals must be between zero and the PO amount; reconcile before accepting', 409)
 const actual = sumMoney([...reviewed.filter(r => r.kind === 'actual' && !r.duplicateOf).map(r => r.amount), ...reconciledLedger.filter(r => !r.source).map(r => r.amount)])
 const committed = sumMoney(rows.filter(r => r.kind === 'commitment').map(r => r.provider === 'purse' ? r.status === 'closed' ? 0 : r.amount - (linked.get(r.id) ?? 0) : r.amount))
 const released = sumMoney(purse.filter(r => r.status === 'closed').map(r => r.amount - (linked.get(r.id) ?? 0)))
 requireThat([actual, committed, released, actual + committed].every(Number.isSafeInteger) && actual + committed >= 0, 'Spend total exceeds exact money limits or refunds exceed reviewed spend', 409)
 // A source record can replace the same driver again, but cannot enter two forecasts or cells.
 for (const review of all(c.s, 'spend-review').filter(r => r.driver !== driver.id)) requireThat(!review.rows.some((r: Data) => mapped.has(`${r.provider}:${r.id}`)), 'This source is already accepted into another driver', 409)
 const budget = all(c.s, 'scenario').find(s => s.kind === 'budget' && s.status === 'frozen')
 requireThat(budget, 'Approve a budget before reviewing committed spend', 409)
 const budgetView = await scenarioView(c, budget.id)
 requireThat(budgetView.calculation.currency === workspace(c.s).currency && budgetView.calculation.months.includes(period), 'Budget has no comparable month or currency', 409)
 const budgetAmount = budgetView.calculation.cells.filter((r: Data) => r.line === driver.line && r.department === driver.department && r.month === period).reduce((n: number, r: Data) => n + r.amount, 0)
 const result = { scenario: sc.id, revision: sc.revision, driver: driver.id, month: period, currency: workspace(c.s).currency, line: driver.line, lineName: line.name, department: driver.department, departmentName: get(c.s, 'department', driver.department).name, budget: budgetAmount, actual, committed, released, ledgerRows: reconciledLedger, remaining: budgetAmount - actual - committed, forecast: actual + committed, rows: reviewed, budgetSnapshot: budget.id }
 const fingerprint = pantryDigest(result)
 if (op === 'preview') return { ...result, fingerprint }
 requireThat(b.fingerprint === fingerprint, 'Spend source or mapping changed; preview again', 409)
 put(c.s, 'expense', driver.id, { ...driver, amountCents: actual + committed })
 put(c.s, 'spend-review', driver.id, { ...result, fingerprint, acceptedAt: c.now, acceptedBy: c.x.actor.email })
 for (const p of new Set(rows.map(r => r.provider))) { const row = find(c.s, 'connection', secretId(p))!; put(c.s, 'connection', secretId(p), { ...row, lastRefresh: c.now, rowCount: rows.filter(r => r.provider === p).length, error: null }) }
 bump(c, sc, 'spend-accepted', driver.id, { fingerprint, actual, committed, remaining: result.remaining })
 return { ...result, fingerprint }
}
export async function spendReviews(c: Context) {
 authority(c)
 return all(c.s, 'spend-review').filter(r => { try { scenarioAccess(c.s, c.x, r.scenario); return true } catch { return false } }).map(r => ({ ...r, forecastChanged: get(c.s, 'scenario', r.scenario).revision !== r.revision + 1 }))
}
