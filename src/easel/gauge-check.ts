// Explicit connection checks update health metadata without accepting actuals.
// Import preview remains a read with no writes.
import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { gaugeObservationAuthority } from './gauge-connection'
import { gaugeSource, GaugeFailure } from './gauge-source'
import { month } from './months'
import { recordGaugeObservation } from './gauge-freshness'
import { notify, financeRecipients } from './notify'
import { Fault, type Data } from './types'

export async function gaugeCheck(c: Context, env: Bindings, b: Data) {
 gaugeObservationAuthority(c)
 const period = month(b.month, 'Connection check month')
 let error: string | null = null, rateLimit: string | null = null
 let observed: Data | null = null
 try {
  const source = await gaugeSource(c, env, period)
  observed = source
 } catch (e) {
  if (!(e instanceof Fault)) throw e
  error = e.message
  rateLimit = e instanceof GaugeFailure ? e.rateLimit : null
 }
 recordGaugeObservation(c, period, observed, error, rateLimit)
 if (error) notify(c, 'refresh-failed', await financeRecipients(c), { title: 'Gauge refresh failed', tab: 'settings', record: 'gauge', department: '', body: error }, { includeActor: true })
 c.activity.push({ action: 'gauge-connection-checked', record: 'gauge', detail: { month: period, confirmed: !error, error, rateLimit } })
}
