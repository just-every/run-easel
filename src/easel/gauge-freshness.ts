import { dimensionAllowed, visibleInput } from './access'
import type { Context } from './context'
import { gaugeStale } from './gauge-schedule'
import { find, put, type Data } from './types'

/** A successful observation belongs to its source period, never to another month. */
export function recordGaugeObservation(c: Context, period: string, source: Data | null, error: string | null, rateLimit: string | null = null) {
 const connection = find(c.s, 'connection', 'gauge') ?? {}
 const prior = connection.observations?.[period] ?? (connection.checkedMonth === period ? connection : {})
 const health = { ...prior, ...(source ? { lastRefresh: c.now, observedAt: source.asOf, observation: source } : {}), lastChecked: c.now, error, rateLimit }
 // Store only period health, without recursively copying the connection record.
 const { lastRefresh = null, observedAt = null, observation = null, lastChecked } = health
 put(c.s, 'connection', 'gauge', { ...connection, ...(source ? { lastRefresh, observedAt, observation, checkedMonth: period, rowCount: 1 } : {}), lastChecked, error, rateLimit,
  observations: { ...connection.observations, [period]: { lastRefresh, observedAt, observation, lastChecked, error, rateLimit } } })
}
const stable = (source: Data) => JSON.stringify([source.origin, source.from, source.to, source.participantCount, source.availableSeconds, source.approvedBillableSeconds, source.knownAvailableSeconds, source.missingCalendarDays])

/** Live health overlays accepted provenance; it never changes accepted or captured arithmetic. */
export async function gaugeFreshness(c: Context, revenue: Data[], filter: { department?: string; lines?: string[]; months?: string[] } = {}) {
 const inputs = revenue.filter(r => (!filter.department || r.department === filter.department) && (!filter.lines || filter.lines.includes(r.line)) && dimensionAllowed(c.s, c.x, r.dimensions, false, r.department))
 if (!inputs.some(r => Object.keys(r.gaugeActuals ?? {}).length)) return []
 const connection = find(c.s, 'connection', 'gauge') ?? {}
 const secret = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('gauge').first()
 return inputs.flatMap(r => Object.entries(r.gaugeActuals ?? {}).filter(([period]) => !filter.months || filter.months.includes(period)).map(([period, value]) => {
  const accepted = value as Data, sameOrigin = connection.origin === accepted.source.origin
  const health = sameOrigin ? connection.observations?.[period] ?? (connection.checkedMonth === period ? connection : {}) : {}
  const scheduled = connection.refreshSchedule?.month === period
  const cadence = scheduled ? connection.refreshSchedule.cadence : 'manual'
  const connected = sameOrigin && connection.connected && !!secret
  const error = !connected ? 'Gauge source disconnected; reconnect before refreshing' : health.error ?? null
  const observed = health.observation
  return { source: 'Gauge', month: period, line: r.line, department: r.department, dimensions: r.dimensions ?? {},
   lastSuccess: health.lastRefresh ?? null, observedAt: health.observedAt ?? null, lastChecked: health.lastChecked ?? null,
   cadence, stale: !connected || gaugeStale({ ...health, refreshSchedule: { cadence } }, c.now), error,
   acceptedAt: accepted.acceptedAt, acceptedObservedAt: accepted.source.asOf,
   observationStatus: !observed ? 'unavailable' : stable(observed) === stable(accepted.source) ? 'matches-accepted' : 'changed-since-acceptance',
   ...(visibleInput(c.x, 'revenue', r) ? { driver: r.id, name: r.name, acceptedDigest: accepted.digest } : {}) }
 }))
}
