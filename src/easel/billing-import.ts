import { ledgerScope } from './ledger-scope'
import type { Bindings } from '../auth.server'
import { actualCells } from './actuals-read'
import { billingAuthority, billingKey } from './billing-connection'
import { calculateBilling } from './billing-metrics'
import { fetchStripeBilling } from './billing-provider'
import type { Context } from './context'
import { requireEditable, scenarioInputs, workspace } from './model'
import { addMonths, month, monthsBetween, range } from './months'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { sha256 } from './store'
import { all, find, get, put, requireThat, type Data } from './types'

export async function billingImport(c: Context, env: Bindings, op: string, b: Data) {
 billingAuthority(c)
 const sc = scenarioAccess(c.s, c.x, b.scenario), driver = get(c.s, 'revenue', b.driver)
 requireThat(driver.scenario === sc.id && ['customers', 'seats'].includes(driver.kind), 'Choose a subscription customer or seat driver in this scenario')
 requireEditable(c.s, c.x, sc, driver.department)
 requireThat(sc.revision === Number(b.scenarioRevision), 'The scenario changed; review billing again', 409)
 if (op === 'undo') {
  requireThat(driver.billingUndo?.resultingRevision === sc.revision, 'A later edit prevents this undo; review a new billing pull', 409)
  put(c.s, 'revenue', driver.id, { ...driver, billingActuals: driver.billingUndo.before, billingUndo: null })
  bump(c, sc, 'billing-import-undone', driver.id)
  return { undone: true }
 }
 requireThat(['preview', 'accept'].includes(op), 'Unknown billing import action', 404)
 const from = month(b.from), to = month(b.to), w = workspace(c.s)
 requireThat(from <= to && monthsBetween(from, to) < 36 && to < c.now.slice(0, 7), 'Choose up to 36 complete calendar months')
 requireThat(!w.calendar || w.calendar === 'calendar-month', 'Billing observations use calendar months; a non-calendar fiscal plan needs an explicit period mapping', 409)
 requireThat(from >= driver.start && from >= w.planStart && to <= addMonths(w.planStart, (sc.horizon ?? w.horizon) - 1), 'Billing months must be within this driver and plan horizon')
 const months = range(from, monthsBetween(from, to) + 1)
 requireThat(!scenarioInputs(c.s, sc.id, 'revenue').some(r => r.id !== driver.id && months.some(m => r.billingActuals?.[m])), 'A billing month is already assigned to another driver; undo it there first', 409)
 const source = await fetchStripeBilling(await billingKey(c, env), months)
 requireThat(source.observations.every(r => r.currency.toUpperCase() === w.currency), 'Billing currency differs from the workspace; no exchange rate is inferred', 409)
 const metrics = calculateBilling(source.observations, months)
 const ledger = await actualCells(c.db, c.s,undefined,ledgerScope(c.s,sc)), explanations = b.explanations ?? {}
 const reconciliation = months.map(period => {
  const rows = ledger.filter(r => r.month === period && r.line === driver.line && r.department === driver.department)
  const billing = metrics.bridge.find((r: Data) => r.month === period) ?? { revenueCents: 0, deferredCents: 0, refundsCents: 0, taxCents: 0 }
  const ledgerRevenueCents = rows.length ? rows.reduce((n, r) => n + r.amount, 0) : null
  const differenceCents = ledgerRevenueCents === null ? null : billing.revenueCents - ledgerRevenueCents
  const explanation = typeof explanations[period] === 'string' ? explanations[period].trim().slice(0, 2000) : ''
  return { month: period, ledgerRevenueCents, serviceRevenueCents: billing.revenueCents, deferredCents: billing.deferredCents, refundsCents: billing.refundsCents, taxCents: billing.taxCents, differenceCents, explanation,
   basis: 'Invoice service-period allocation before tax; credit notes separate. Deferred balance is the unearned service allocation. Ledger revenue uses the selected line and department.', complete: ledgerRevenueCents !== null && (differenceCents === 0 || !!explanation) }
 })
 const digest = await sha256(JSON.stringify({ driver: driver.id, revision: sc.revision, from, to, observations: source.observations, reconciliation }))
 const result = { digest, scenario: sc.id, driver: driver.id, scenarioRevision: sc.revision, from, to, currency: w.currency, rowCount: source.rowCount, ...metrics, reconciliation }
 if (op === 'preview') return result
 requireThat(b.digest === digest, 'Billing, ledger or explanation changed after review; preview again', 409)
 requireThat(reconciliation.every(r => r.complete), 'Accept ledger revenue and explain every billing difference before accepting this review', 409)
 const before = driver.billingActuals ?? {}, actuals = { ...before }
 for (const period of months) {
  const row = metrics.bridge.find((r: Data) => r.month === period)
  actuals[period] = { amountCents: row?.endingMrrCents ?? 0, customers: row?.activeCustomers ?? 0, arrCents: row?.arrCents ?? 0, digest, source: 'Stripe Billing', acceptedBy: c.x.actor.email, acceptedAt: c.now }
 }
 put(c.s, 'revenue', driver.id, { ...driver, billingActuals: actuals, billingUndo: { before, resultingRevision: sc.revision + 1 } })
 put(c.s, 'billing-review', `${sc.id}:${driver.originId}:${from}:${to}`, { ...result, acceptedBy: c.x.actor.email, acceptedAt: c.now })
 put(c.s, 'connection', 'stripe', { ...get(c.s, 'connection', 'stripe'), lastRefresh: c.now, rowCount: source.rowCount, error: null, rateLimit: source.rateLimit })
 bump(c, sc, 'billing-import-accepted', driver.id, { digest, from, to, rows: source.rowCount })
 return result
}

export function billingReviews(c: Context, scenario: unknown) {
 billingAuthority(c); scenarioAccess(c.s, c.x, scenario)
 return all(c.s, 'billing-review').filter(r => r.scenario === scenario && find(c.s, 'revenue', r.driver))
}
