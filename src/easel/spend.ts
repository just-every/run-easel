import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { scopedReader } from './group-projections'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { actualCells, rowsFor } from './actuals-read'
import { requireEditable, workspace } from './model'
import { datePeriod } from './fiscal-calendar'
import { month } from './months'
import { cents } from './units'
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
 const configured = (p === 'ramp' || p === 'brex') || !!(p === 'purse' ? env.PURSE_ORIGIN : env.COASTER_ORIGIN)
 return { ...row, provider: p, configured, canDisconnect: !!(stored || row?.connected), connected: !!(stored && row?.connected && configured && row.origin === spendOrigin(env, p)), scope: p === 'purse' ? 'read-purchase-orders' : p === 'coaster' ? 'claim-reports:read' : p === 'brex' ? 'transactions.card.readonly' : 'transactions:read', schedule: 'Manual', ownerStep: spendOwnerStep(p), error: row?.connected && !stored ? 'Reconnect after restore; spend credentials are excluded from archives' : row?.error ?? null }
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
 requireThat(Array.isArray(selected) && selected.length > 0 && selected.length <= 4 && new Set(selected).size === selected.length, 'Choose distinct spend providers')
 const rows: Data[] = []
 for (const name of selected) {
  const p = spendProvider(name), ids = p === 'purse' ? b.orders : p === 'coaster' ? b.reports : []
  const received = await source(c, env, p, Array.isArray(ids) ? ids : [])
  rows.push(...received.filter(r => b.allPeriods === true || !['ramp','brex'].includes(p) || datePeriod(workspace(c.s) as any, r.sourceDate.slice(0,10)) === period))
 }
 return rows
}
export function spendReadFailed(c: Context, error: unknown, providers?: unknown) {
 if (!(error instanceof Fault) || error.status !== 502) return false
 authority(c)
 for (const p of Array.isArray(providers) ? providers : ['ramp','purse','coaster','brex']) {
  const row = find(c.s, 'connection', secretId(p))
  if (row?.connected) put(c.s, 'connection', secretId(p), { ...row, error: error.message, failedAt: c.now, rateLimit: error.message.includes('429') ? 'Provider rate limit; retry explicitly later' : null })
 }
 c.activity.push({ action: 'spend-read-failed', record: 'spend', detail: { error: error.message, acceptedDataUnchanged: true } })
 return true
}
/** Explicit operational allocations replace only the reviewed forecast cells.
 * Accounting rows and provider payments are never changed. */
export async function spendReview(c: Context, env: Bindings, op: string, b: Data) {
 authority(c); requireThat(['preview','accept','ledger'].includes(op), 'Unknown spend review action', 404)
 const sc = scenarioAccess(c.s, c.x, b.scenario), driver = get(c.s, 'expense', b.driver), period = month(b.month)
 requireEditable(c.s, c.x, sc, driver.department)
 const primaryDriver = driver.id
 const multiple = Array.isArray(b.targets), batch = Array.isArray(b.months)
 requireThat(!multiple || !batch, 'Choose expense cells or a monthly schedule, not both')
 const periods: string[] = batch ? b.months.map((m: unknown) => month(m)) : [period]
 requireThat(periods.length > 0 && periods.length <= 24 && new Set(periods).size === periods.length && periods[0] === period && periods.every((m, i) => i === 0 || m > periods[i - 1]), 'Choose distinct ordered allocation months starting in the reviewed month')
 const targets: { driver: Data; month: string }[] = multiple ? b.targets.map((t: Data) => ({ driver: get(c.s, 'expense', t.driver), month: month(t.month) })) : periods.map(month => ({ driver, month }))
 const targetKey = (driver: Data, period: string) => `${driver.id}:${period}`
 const targetKeys = targets.map(t => targetKey(t.driver, t.month))
 requireThat(targets.length > 0 && targets.length <= 48 && new Set(targetKeys).size === targets.length && targets[0].driver.id === driver.id && targets[0].month === period, 'Choose distinct expense cells starting with the primary expense and month')
 requireThat(new Set(targets.map(t => `${t.driver.line}:${t.driver.department}:${t.month}`)).size === targets.length, 'Choose only one expense for each line, department and month', 409)
 for (const t of targets) {
  const d = t.driver, m = t.month
  requireEditable(c.s, c.x, sc, d.department)
  requireThat(sc.kind === 'forecast' && !sc.sandbox && (!sc.currency || sc.currency === workspace(c.s).currency) && d.scenario === sc.id && ['one-off','recurring'].includes(d.kind) && !Object.keys(d.dimensions ?? {}).length && (d.kind === 'one-off' ? m === d.start : m >= d.start && (!d.end || m <= d.end)), 'Select an active company forecast expense for every reviewed month', 409)
  requireThat(d.kind !== 'recurring' || batch || multiple || op === 'ledger', 'Recurring spend requires a complete explicit allocation schedule', 409)
  requireThat(sc.revision === b.revision && (!sc.actualsThrough || m > sc.actualsThrough), 'Forecast changed or month is closed; review again', 409)
  const line = get(c.s, 'line', d.line); requireThat(!line.payroll && !line.nonCash, 'Spend requires an ordinary non-payroll expense line')
 }
 if (op === 'ledger') { const rows = await rowsFor(c.db, c.s, period, driver.line, driver.department); return { rows, total: sumMoney(rows.map(r => r.amount)) } }
 const prior = find(c.s, 'spend-review', driver.id)
 const priorCells = prior ? prior.cells ?? [prior] : []
 requireThat(priorCells.every((r: Data) => targetKeys.includes(`${r.driver}:${r.month}`)), 'Include every previously reviewed allocation cell; no prior cell may be silently dropped', 409)
 for (const d of new Map(targets.map(t => [t.driver.id, t.driver])).values()) {
  requireThat(!d.spendMonths || Object.keys(d.spendMonths).every(m => targetKeys.includes(targetKey(d, m))), 'Include every previously reviewed expense month', 409)
 }
 for (const review of all(c.s, 'spend-review').filter(r => r.driver !== primaryDriver)) {
  requireThat(!(review.cells ?? [review]).some((r: Data) => targets.some(t => t.driver.id === r.driver)), 'An expense already belongs to another spend review; revise that review instead', 409)
 }
 const sourceRows: Data[] = await spendSources(c, env, { providers: b.providers, orders: b.orders, reports: b.reports, month: period, allPeriods: batch || multiple })
 requireThat(sourceRows.length > 0 && sourceRows.every(r => r.currency === workspace(c.s).currency), 'Spend source currency differs; no exchange rate is inferred', 409)
 requireThat(Array.isArray(b.mapping) && b.mapping.length === sourceRows.length, 'Map every selected source row explicitly')
 const allocations = new Map<string, Record<string, number>>(), mapped = new Set<string>()
 for (const row of sourceRows) {
  const key = `${row.provider}:${row.id}`, maps = b.mapping.filter((m: Data) => m.source === key)
  requireThat(maps.length === 1 && !mapped.has(key), 'Source mapping must be unique'); mapped.add(key)
  const parts = maps[0].parts
  if (multiple) requireThat(Array.isArray(parts) && parts.length === targets.length && parts.every((p: Data) => p && typeof p === 'object' && targetKeys.includes(`${p.driver}:${p.month}`)) && new Set(parts.map((p: Data) => `${p.driver}:${p.month}`)).size === targets.length, 'Allocate each source across every expense cell explicitly')
  const values = batch ? maps[0].allocations : { [period]: row.amount }
  if (!multiple) requireThat(values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).length === periods.length && Object.keys(values).every(m => periods.includes(m)), 'Allocate each source across every reviewed month explicitly')
  const amounts: Record<string, number> = {}
  for (const t of targets) {
   const key = targetKey(t.driver, t.month)
   const value = multiple ? cents(parts.find((p: Data) => `${p.driver}:${p.month}` === key).amount, 'Allocated amount', { negative: true }) : batch ? cents(values[t.month], 'Allocated amount', { negative: true }) : values[t.month]
   requireThat(Number.isSafeInteger(value) && (row.amount < 0 ? value <= 0 : value >= 0), 'An allocation must retain the source amount direction', 409)
   amounts[key] = value
  }
  requireThat(sumMoney(Object.values(amounts)) === row.amount, 'Allocated amounts must sum exactly to their source; no unallocated balance is inferred', 409)
  allocations.set(key, amounts)
 }
 const current = await scenarioView(c, sc.id)
 const budget = all(c.s, 'scenario').find(s => s.kind === 'budget' && s.status === 'frozen')
 requireThat(budget, 'Approve a budget before reviewing committed spend', 409)
 const budgetView = await scenarioView(c, budget.id)
 async function cell(driver: Data, period: string) {
  const line = get(c.s, 'line', driver.line)
  const cells = await actualCells(c.db, c.s, period)
  const ledgerRows = await rowsFor(c.db, c.s, period, driver.line, driver.department)
  requireThat(ledgerRows.every(r => !Object.keys(r.dimensions ?? {}).length), 'Dimensioned ledger spend requires a dedicated dimension review', 409)
  requireThat(!cells.some(v => v.line === driver.line && v.department === driver.department && v.month === period && v.rows !== ledgerRows.length), 'Ledger row projection is incomplete', 409)
  const currentCell = current.calculation.cells.find(r => r.line === driver.line && r.department === driver.department && r.month === period)
  requireThat(currentCell && currentCell.sources.every(r => r.kind === 'expense' && r.id === driver.originId), 'The forecast cell mixes other sources; use a dedicated spend assumption', 409)
  const rows: Data[] = sourceRows.map(row => ({ ...row, sourceAmount: row.amount, amount: allocations.get(`${row.provider}:${row.id}`)![targetKey(driver, period)] })), purse = rows.filter(r => r.provider === 'purse' && r.kind === 'commitment'), actualRows = rows.filter(r => r.kind === 'actual')
  const mapped = new Set<string>(), linked = new Map<string, number>(), duplicateTotals = new Map<string, number>()
  const reviewed: Data[] = rows.map(row => {
   const k = `${row.provider}:${row.id}`, maps = b.mapping.filter((m: Data) => m.source === k)
   requireThat(maps.length === 1 && !mapped.has(k), 'Source mapping must be unique'); mapped.add(k)
   const map = maps[0]; requireThat(multiple || map.line === driver.line && map.department === driver.department && (batch || map.month === period), 'Review the exact expense line, department and month for every source')
   const order = row.order ?? map.order ?? null
   requireThat(!row.order || !map.order || row.order === map.order, 'Paid bill cannot move to another PO')
   requireThat(!map.duplicateMatches || !map.duplicateOf, 'Choose one duplicate target or explicit duplicate parts', 409)
   requireThat(map.duplicateOf || map.duplicateAmount == null && map.duplicateAmounts == null, 'A duplicate amount requires a source actual', 409)
   let matches: Data[] = []
   if (map.duplicateMatches != null) {
    requireThat(Array.isArray(map.duplicateMatches) && map.duplicateMatches.length > 0 && map.duplicateMatches.length <= actualRows.length, 'Choose explicit duplicate parts', 409)
    matches = map.duplicateMatches
   } else if (map.duplicateOf) matches = [{ source: map.duplicateOf, amount: map.duplicateAmount, amounts: map.duplicateAmounts }]
   const seen = new Set<string>(), duplicateMatches: Data[] = []
   for (const match of matches) {
    requireThat(match && typeof match === 'object' && !Array.isArray(match) && typeof match.source === 'string', 'Choose a source actual for every duplicate part', 409)
    const other = actualRows.find(r => `${r.provider}:${r.id}` === match.source)
    const otherMap = b.mapping.find((m: Data) => m.source === match.source)
    requireThat(row.kind === 'actual' && other && other !== row && other.provider !== row.provider && !otherMap?.duplicateOf && !otherMap?.duplicateMatches && !seen.has(match.source) && (other.order ?? otherMap?.order ?? null) === order, 'Duplicate parts require distinct independent actuals from another provider with the same PO', 409)
    seen.add(match.source)
    requireThat(multiple ? match.amount == null && match.amounts == null : batch ? match.amount == null && match.parts == null : match.amounts == null && match.parts == null, 'Match duplicate parts in the reviewed accounting periods', 409)
    if (multiple && match.parts != null) requireThat(Array.isArray(match.parts) && match.parts.length === targets.length && match.parts.every((p: Data) => p && targetKeys.includes(`${p.driver}:${p.month}`)) && new Set(match.parts.map((p: Data) => `${p.driver}:${p.month}`)).size === targets.length, 'Match duplicate parts in every reviewed expense cell explicitly', 409)
    if (batch && match.amounts != null) requireThat(typeof match.amounts === 'object' && !Array.isArray(match.amounts) && Object.keys(match.amounts).length === periods.length && Object.keys(match.amounts).every(m => periods.includes(m)), 'Allocate each duplicate part across every reviewed month explicitly', 409)
    const entered = multiple ? match.parts?.find((p: Data) => p.driver === driver.id && p.month === period)?.amount : batch ? match.amounts?.[period] : match.amount
    if (entered == null) requireThat(other.amount === row.amount, 'Unequal source actuals require an explicit matched amount', 409)
    const amount = entered == null ? row.amount : cents(entered, 'Duplicate matched amount', { negative: true })
    requireThat(amount === 0 || (amount > 0 ? row.amount > 0 && other.amount > 0 : row.amount < 0 && other.amount < 0), 'Duplicate parts must retain both source directions', 409)
    const total = addMoney(duplicateTotals.get(match.source) ?? 0, amount)
    requireThat(Math.abs(total) <= Math.abs(other.amount), 'Duplicate parts exceed the independent source actual; no payment may be removed twice', 409)
    duplicateTotals.set(match.source, total)
    duplicateMatches.push({ source: match.source, amount })
   }
   const duplicateAmount = sumMoney(duplicateMatches.map(m => m.amount)), countedAmount = row.amount - duplicateAmount
   requireThat(Number.isSafeInteger(countedAmount) && (row.amount >= 0 ? countedAmount >= 0 : countedAmount <= 0), 'Duplicate parts exceed the source row', 409)
   if (row.kind === 'actual' && order) {
    requireThat(purse.some(p => p.id === order), 'Linked PO is not in this reviewed source')
    linked.set(order, addMoney(linked.get(order) ?? 0, countedAmount))
   }
   return { ...row, line: driver.line, department: driver.department, month: period, order, duplicateOf: map.duplicateOf ?? null, duplicateMatches, duplicateAmount, countedAmount }
  })
  const ledgerMapping = (Array.isArray(b.ledgerMapping) ? b.ledgerMapping : []).filter((m: Data) => ledgerRows.some(r => r.id === m.row))
  requireThat(ledgerMapping.length === ledgerRows.length && (!ledgerRows.length || b.ledgerConfirmed === true), 'Review every accepted ledger row explicitly before accepting spend', 409)
  const matchedSources = new Map<string, number>()
  const reconciledLedger = ledgerRows.map(row => {
   const maps = ledgerMapping.filter((m: Data) => m.row === row.id)
   requireThat(maps.length === 1, 'Ledger mapping must cover each row exactly once', 409)
   const map = maps[0]
   requireThat(!map.source || !map.matches && !map.order, 'Choose whole-row matching or explicit parts', 409)
   const matches: Data[] = map.source ? [{ source: map.source, amount: row.amount }] : Array.isArray(map.matches) ? map.matches.map((m: Data) => ({ source: m.source, amount: cents(m.amount, 'Matched amount', { negative: true }) })) : []
   const seen = new Set<string>()
   for (const match of matches) {
    const other = reviewed.find(r => `${r.provider}:${r.id}` === match.source)
    requireThat(other?.kind === 'actual' && !seen.has(match.source) && match.amount !== 0 && (match.amount > 0 ? row.amount > 0 && other.countedAmount > 0 : row.amount < 0 && other.countedAmount < 0), 'Ledger parts must match distinct source actuals in the same direction', 409)
    seen.add(match.source)
    const matched = addMoney(matchedSources.get(match.source) ?? 0, match.amount)
    requireThat(Math.abs(matched) <= Math.abs(other.countedAmount), 'Ledger matches exceed the source actual; no duplicate amount may be removed twice', 409)
    matchedSources.set(match.source, matched)
   }
   const additionalAmount = row.amount - sumMoney(matches.map(m => m.amount))
   requireThat(Number.isSafeInteger(additionalAmount) && (row.amount >= 0 ? additionalAmount >= 0 : additionalAmount <= 0), 'Ledger matches exceed the ledger row', 409)
   if (map.order) {
    requireThat(additionalAmount !== 0 && purse.some(p => p.id === map.order), 'Link only an additional ledger amount to a reviewed PO', 409)
    linked.set(map.order, addMoney(linked.get(map.order) ?? 0, additionalAmount))
   }
   return { id: row.id, date: row.date, account: row.account, reference: row.reference, amount: row.amount, file: row.file, description: row.description, source: map.source ?? null, matches, additionalAmount, order: map.order ?? null }
  })
  for (const po of purse) requireThat((linked.get(po.id) ?? 0) >= 0 && (linked.get(po.id) ?? 0) <= po.amount, 'Net linked actuals must be between zero and the PO amount; reconcile before accepting', 409)
  const actual = sumMoney([...reviewed.filter(r => r.kind === 'actual').map(r => r.countedAmount), ...reconciledLedger.map(r => r.additionalAmount)])
  const committed = sumMoney(rows.filter(r => r.kind === 'commitment').map(r => r.provider === 'purse' ? r.status === 'closed' ? 0 : r.amount - (linked.get(r.id) ?? 0) : r.amount))
  const released = sumMoney(purse.filter(r => r.status === 'closed').map(r => r.amount - (linked.get(r.id) ?? 0)))
  requireThat([actual, committed, released, actual + committed].every(Number.isSafeInteger) && actual + committed >= 0, 'Spend total exceeds exact money limits or refunds exceed reviewed spend', 409)
  // A source record can replace the same driver again, but cannot enter two forecasts or cells.
  for (const review of all(c.s, 'spend-review').filter(r => r.driver !== primaryDriver)) requireThat(!review.rows.some((r: Data) => mapped.has(`${r.provider}:${r.id}`)), 'This source is already accepted into another driver', 409)
  requireThat(budgetView.calculation.currency === workspace(c.s).currency && budgetView.calculation.months.includes(period), 'Budget has no comparable month or currency', 409)
  const budgetAmount = budgetView.calculation.cells.filter((r: Data) => r.line === driver.line && r.department === driver.department && r.month === period).reduce((n: number, r: Data) => n + r.amount, 0)
  return { scenario: sc.id, revision: sc.revision, driver: driver.id, month: period, currency: workspace(c.s).currency, line: driver.line, lineName: line.name, department: driver.department, departmentName: get(c.s, 'department', driver.department).name, budget: budgetAmount, actual, committed, released, ledgerRows: reconciledLedger, remaining: budgetAmount - actual - committed, forecast: actual + committed, rows: reviewed, budgetSnapshot: budget!.id }

 }
 const cells = []
 for (const t of targets) cells.push(await cell(t.driver, t.month))
 const ledgerIds = cells.flatMap(r => r.ledgerRows.map((l: Data) => l.id))
 requireThat((b.ledgerMapping ?? []).length === ledgerIds.length, 'Ledger mapping contains an unreviewed row', 409)
 const result = { ...cells[0], ...(batch || multiple ? { cells } : {}) }, fingerprint = pantryDigest(result)
 if (op === 'preview') return { ...result, fingerprint }
 requireThat(b.fingerprint === fingerprint, 'Spend source or mapping changed; preview again', 409)
 for (const d of new Map(targets.map(t => [t.driver.id, t.driver])).values()) {
  const allocated = cells.filter(r => r.driver === d.id)
  put(c.s, 'expense', d.id, d.kind === 'recurring' ? { ...d, spendMonths: Object.fromEntries(allocated.map(r => [r.month, r.forecast])) } : { ...d, amountCents: allocated[0].forecast })
 }
 put(c.s, 'spend-review', driver.id, { ...result, fingerprint, acceptedAt: c.now, acceptedBy: c.x.actor.email })
 for (const p of new Set(sourceRows.map(r => r.provider))) { const row = find(c.s, 'connection', secretId(p))!; put(c.s, 'connection', secretId(p), { ...row, lastRefresh: c.now, rowCount: sourceRows.filter(r => r.provider === p).length, error: null }) }
 bump(c, sc, 'spend-accepted', driver.id, { fingerprint, cells: cells.map(r => ({ driver: r.driver, line: r.line, department: r.department, month: r.month, actual: r.actual, committed: r.committed, remaining: r.remaining })) })
 return { ...result, fingerprint }
}
export async function spendReviews(c: Context) {
 authority(c)
 return all(c.s, 'spend-review').filter(r => { try { scenarioAccess(c.s, c.x, r.scenario); return true } catch { return false } }).map(r => ({ ...r, forecastChanged: get(c.s, 'scenario', r.scenario).revision !== r.revision + 1 }))
}
