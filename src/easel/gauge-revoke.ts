import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { gaugeOrigin } from './gauge-origin'
import { openConnection } from './connection-seal'
import type { Data } from './types'

export const GAUGE_REVOCATION_WARNING = 'Gauge did not confirm revocation; revoke it in Gauge Access'

/** Revoke only the stored key, at the origin that originally received it.
 * A refusal, timeout, redirect or missing local key is never a confirmation. */
export async function revokeGauge(c: Context, env: Bindings, connection: Data | undefined) {
 const outcome = { status: 'not-confirmed', at: c.now, origin: connection?.origin ?? null, httpStatus: null as number | null }
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gauge').first<{ sealed: string }>()
 if (!row) return outcome
 try {
  const origin = gaugeOrigin({ ...env, GAUGE_ORIGIN: connection?.origin })
  const key = await openConnection(env.SESSION_SECRET, row.sealed)
  const response = await fetch(new URL('/api/gauge/keys/revoke', origin), { method: 'POST', headers: { authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
  outcome.httpStatus = response.status
  if (response.status === 200) outcome.status = 'confirmed'
  await response.body?.cancel()
 } catch { /* The local deletion still proceeds; no secret or provider body enters the record. */ }
 return outcome
}
