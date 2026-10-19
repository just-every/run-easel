import type { Bindings } from '../auth.server'
import { requireFinance } from './access'
import type { Context } from './context'
import { sealConnection, openConnection } from './connection-seal'
import { find, put, requireThat, text, type Data } from './types'

export function gaugeOrigin(env: Bindings) {
 requireThat(env.GAUGE_ORIGIN, 'Configure GAUGE_ORIGIN on this installation before connecting Gauge', 503)
 let url: URL
 try { url = new URL(env.GAUGE_ORIGIN) } catch { throw new Error('Invalid installation GAUGE_ORIGIN') }
 requireThat(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (url.protocol === 'https:' || (env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))), 'GAUGE_ORIGIN must be an HTTPS origin (HTTP loopback is allowed only locally)', 503)
 return url.origin
}
export function connectionAuthority(c: Context) {
 requireFinance(c.x)
 requireThat(!c.x.actor.token, 'Use a signed-in finance session for Gauge connections and imports', 403)
}
export async function gaugeStatus(c: Context, env: Bindings) {
 connectionAuthority(c)
 const row = find(c.s, 'connection', 'gauge'), origin = env.GAUGE_ORIGIN ? gaugeOrigin(env) : null
 const secret = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('gauge').first()
 return { ...(row ?? {}), configured: Boolean(env.GAUGE_ORIGIN), connected: Boolean(secret && row?.connected && row.origin === origin), origin, scope: 'utilization:read', schedule: 'Manual', error: row?.error ?? null, rateLimit: row?.rateLimit ?? null, ...(row?.connected && !secret ? { error: 'Reconnect Gauge after restore; provider keys are excluded from archives' } : {}) }
}
export async function gaugeConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 connectionAuthority(c)
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown connection action', 404)
 const prior = find(c.s, 'connection', 'gauge')
 if (op === 'disconnect') {
  put(c.s, 'connection', 'gauge', { ...prior, connected: false, disconnectedAt: c.now })
  c.activity.push({ action: 'gauge-disconnected', record: 'gauge', detail: { providerRevocation: 'Revoke the key in Gauge Access; this scoped key cannot administer provider credentials' } })
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
 connectionAuthority(c)
 const origin = gaugeOrigin(env), status = await gaugeStatus(c, env)
 requireThat(status.connected, 'Connect Gauge in Settings → Connections before importing', 409)
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gauge').first<{ sealed: string }>()
 requireThat(row, 'Reconnect Gauge; no provider key is stored', 409)
 return { origin, key: await openConnection(env.SESSION_SECRET, row.sealed) }
}
