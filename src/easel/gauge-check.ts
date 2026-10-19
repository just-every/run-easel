// Explicit connection checks update health metadata without accepting actuals.
// Import preview remains a read with no writes.
import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { connectionAuthority } from './gauge-connection'
import { gaugeSource, GaugeFailure } from './gauge-source'
import { month } from './months'
import { Fault, get, put, type Data } from './types'

export async function gaugeCheck(c: Context, env: Bindings, b: Data) {
 connectionAuthority(c)
 const period = month(b.month, 'Connection check month')
 const connection = get(c.s, 'connection', 'gauge')
 let error: string | null = null, rateLimit: string | null = null
 let refreshed: Data = {}
 try {
  const source = await gaugeSource(c, env, period)
  refreshed = { lastRefresh: c.now, rowCount: 1, checkedMonth: period, observedAt: source.asOf }
 } catch (e) {
  if (!(e instanceof Fault)) throw e
  error = e.message
  rateLimit = e instanceof GaugeFailure ? e.rateLimit : null
 }
 put(c.s, 'connection', 'gauge', { ...connection, ...refreshed, lastChecked: c.now, error, rateLimit })
 c.activity.push({ action: 'gauge-connection-checked', record: 'gauge', detail: { month: period, confirmed: !error, error, rateLimit } })
}
