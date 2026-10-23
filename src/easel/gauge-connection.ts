import type { Bindings } from '../auth.server'
import { workspace } from './model'
import { gaugeStale } from './gauge-schedule'
import { gaugeOrigin } from './gauge-origin'
import { revokeGauge, GAUGE_REVOCATION_WARNING } from './gauge-revoke'
import { requireCapability, requireCapabilityGrant, requireFinance } from './access'
import type { Context } from './context'
import { sealConnection, openConnection } from './connection-seal'
import { find, put, requireThat, text, type Data } from './types'

export function connectionAuthority(c: Context) {
 requireCapability(c.x, 'connections')
 requireFinance(c.x)
 requireThat(!c.x.actor.token, 'Use a signed-in finance session for Gauge connections and imports', 403)
}
/** A saved schedule grants only observation reads, never credential administration. */
export function gaugeObservationAuthority(c: Context) {
 if (!c.x.actor.scheduler) return connectionAuthority(c)
 requireFinance(c.x); requireCapabilityGrant(c.x, 'connections')
 const schedule = find(c.s, 'connection', 'gauge')?.refreshSchedule
 requireThat(!c.x.actor.agent && !c.x.actor.token && schedule && schedule.cadence !== 'manual' && schedule.ownerId === c.x.actor.id && schedule.owner === c.x.actor.email, 'The saved Gauge observation schedule is no longer authorized', 403)
}
export async function gaugeStatus(c: Context, env: Bindings) {
 connectionAuthority(c)
 const row = find(c.s, 'connection', 'gauge'), origin = env.GAUGE_ORIGIN ? gaugeOrigin(env) : null
 const secret = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('gauge').first()
 return { ...(row ?? {}), configured: Boolean(env.GAUGE_ORIGIN), connected: Boolean(secret && row?.connected && row.origin === origin), origin, scope: 'utilization:read', schedule: row?.refreshSchedule?.cadence === 'manual' ? 'Manual' : row?.refreshSchedule?.cadence ?? 'Manual', timeZone: workspace(c.s).timeZone ?? ['America', 'New_York'].join('/'), stale: gaugeStale(row ?? {}, c.now), error: row?.error ?? null, rateLimit: row?.rateLimit ?? null, ...(row?.connected && !secret ? { error: 'Reconnect Gauge after restore; provider keys are excluded from archives' } : {}) }
}
export async function gaugeConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 connectionAuthority(c)
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown connection action', 404)
 const prior = find(c.s, 'connection', 'gauge')
 if (op === 'disconnect') {
  const providerRevocation = await revokeGauge(c, env, prior)
  put(c.s, 'connection', 'gauge', { ...prior, connected: false, disconnectedAt: c.now, providerRevocation, error: providerRevocation.status === 'confirmed' ? null : GAUGE_REVOCATION_WARNING, rateLimit: null })
  c.activity.push({ action: 'gauge-disconnected', record: 'gauge', detail: { providerRevocation } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('gauge')]
 }
 const origin = gaugeOrigin(env), token = text(b.key, 'Gauge scoped utilization key', 200)
 requireThat(/^gauge_util_[A-Za-z0-9_-]{43}$/.test(token), 'Use a Gauge utilization read key from Access, never a session cookie')
 const sealed = await sealConnection(env.SESSION_SECRET, token)
 put(c.s, 'connection', 'gauge', { origin, connected: true, suffix: token.slice(-4), owner: c.x.actor.email, connectedAt: c.now, scope: 'utilization:read', schedule: 'Manual', lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
 c.activity.push({ action: 'gauge-connected', record: 'gauge', detail: { origin, scope: 'utilization:read', suffix: token.slice(-4) } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('gauge', sealed)]
}
export async function gaugeKey(c: Context, env: Bindings) {
 gaugeObservationAuthority(c)
 const origin = gaugeOrigin(env), status = find(c.s, 'connection', 'gauge')
 requireThat(status?.connected && status.origin === origin, 'Connect Gauge in Settings → Connections before importing', 409)
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gauge').first<{ sealed: string }>()
 requireThat(row, 'Reconnect Gauge; no provider key is stored', 409)
 return { origin, key: await openConnection(env.SESSION_SECRET, row.sealed) }
}
