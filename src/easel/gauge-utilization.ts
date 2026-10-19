import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { connectionAuthority } from './gauge-connection'
import { gaugeSource } from './gauge-source'
import { requireEditable, scenarioInputs, workspace } from './model'
import { month, addMonths } from './months'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { sha256 } from './store'
import { all, get, put, requireThat, type Data } from './types'
import { mulDiv } from './units'

export async function gaugeUtilization(c: Context, env: Bindings, op: string, b: Data) {
 connectionAuthority(c)
 const scenario = scenarioAccess(c.s, c.x, b.scenario), driver = get(c.s, 'revenue', b.driver)
 requireThat(driver.scenario === scenario.id && driver.kind === 'services', 'Select a services driver in this scenario')
 requireEditable(c.s, c.x, scenario, driver.department)
 requireThat(b.scenarioRevision === scenario.revision, 'Scenario changed; preview again', 409)
 if (op === 'undo') {
  const undo = driver.gaugeUndo
  requireThat(undo && undo.resultingRevision === scenario.revision, 'A later scenario change prevents undo; preview a new import instead', 409)
  put(c.s, 'revenue', driver.id, { ...driver, gaugeActuals: undo.before, gaugeUndo: null })
  bump(c, scenario, 'gauge-utilization-undone', driver.id, { digest: undo.digest, month: undo.month })
  return { undone: true }
 }
 requireThat(op === 'preview' || op === 'accept', 'Unknown Gauge import action', 404)
 const period = month(b.month, 'Utilization month'), w = workspace(c.s)
 requireThat(period >= driver.start && period >= w.planStart && period <= addMonths(w.planStart, (scenario.horizon ?? w.horizon) - 1), 'Utilization month must be in this driver and plan horizon')
 requireThat(!scenario.actualsThrough || period > scenario.actualsThrough, 'Closed ledger months cannot be replaced by operational utilization', 409)
 requireThat(!scenarioInputs(c.s, scenario.id, 'revenue').some(r => r.id !== driver.id && r.gaugeActuals?.[period]), 'This agency-wide Gauge month is already attached to another driver; undo it there first', 409)
 const source = await gaugeSource(c, env, period)
 const amountCents = mulDiv(source.approvedBillableSeconds, driver.hourlyRateCents, 3600)
 requireThat(Number.isSafeInteger(amountCents), 'Operational revenue exceeds the supported exact range')
 const { asOf, ...stable } = source
 const digest = await sha256(JSON.stringify({ scenario: scenario.id, driver: driver.id, scenarioRevision: scenario.revision, month: period, source: stable, hourlyRateCents: driver.hourlyRateCents, currency: w.currency }))
 const result = { digest, scenario: scenario.id, driver: driver.id, scenarioRevision: scenario.revision, month: period, source, amountCents, currency: w.currency }
 if (op === 'preview') return result
 requireThat(b.digest === digest, 'Gauge source or plan changed since preview; review again', 409)
 const before = driver.gaugeActuals ?? {}, prior = before[period]
 if (prior && JSON.stringify({ ...prior.source, asOf: null }) === JSON.stringify({ ...source, asOf: null }) && prior.hourlyRateCents === driver.hourlyRateCents) return { ...result, unchanged: true }
 put(c.s, 'revenue', driver.id, { ...driver, gaugeActuals: { ...before, [period]: { source, digest, amountCents, hourlyRateCents: driver.hourlyRateCents, acceptedBy: c.x.actor.email, acceptedAt: c.now } }, gaugeUndo: { before, resultingRevision: scenario.revision + 1, digest, month: period } })
 const connection = get(c.s, 'connection', 'gauge')
 put(c.s, 'connection', 'gauge', { ...connection, lastRefresh: c.now, rowCount: 1, error: null, rateLimit: null })
 bump(c, scenario, 'gauge-utilization-accepted', driver.id, { digest, month: period, source: stable, amountCents })
 return result
}
