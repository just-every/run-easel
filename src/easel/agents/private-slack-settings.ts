import type { Bindings } from '../../auth.server'
import { requireCapability, requireFinance, requireMember } from '../access'
import { openConnection, sealConnection } from '../connection-seal'
import type { Context } from '../context'
import { all, find, put, requireThat, text, uid, type Data } from '../types'
import { slackCall, slackIdentity } from './private-slack-provider'

export const PRIVATE_SLACK_CONNECTION = 'slack:private-delivery'
const PURPOSE = 'easel:slack:private-delivery:v1'
export const privateSlackConfig = (c: Context) => find(c.s, 'connection', PRIVATE_SLACK_CONNECTION)
export function privateSlackNative(c: Context, finance = false) {
 requireMember(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use your native signed-in account for private Slack settings', 403)
 if (finance) { requireFinance(c.x); requireCapability(c.x, 'connections'); requireThat(['owner', 'admin'].includes(c.x.actor.baseRole), 'A native finance owner or admin is required', 403) }
}
export async function privateSlackKey(c: Context, env: Bindings) {
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(PRIVATE_SLACK_CONNECTION).first<{ sealed: string }>()
 requireThat(row, 'Private Slack key is missing; reconnect after restore', 409)
 return openConnection(env.SESSION_SECRET, row.sealed, PURPOSE, 'Slack')
}
export async function privateSlackMember(c: Context, email: string) {
 const native = await c.db.prepare("SELECT id,email,role,version FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{ id: string; email: string; role: string; version: number }>()
 const member = find(c.s, 'member', email)
 requireThat(native && (['owner', 'admin'].includes(native.role) || member?.active && ['contributor', 'viewer'].includes(member.role)), 'Choose an active native plan member', 409)
 return native
}
export async function privateSlackStatus(c: Context, _env?: Bindings) {
 privateSlackNative(c)
 const config = privateSlackConfig(c), finance = c.x.role === 'finance' && !!c.x.capabilities?.includes('connections')
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(PRIVATE_SLACK_CONNECTION).first()
 const bindings: Data[] = []
 for (const b of all(c.s, 'slack-private-binding').filter(b => finance || b.email === c.x.actor.email)) {
  let nativeCurrent = false
  try { const n = await privateSlackMember(c, b.email); nativeCurrent = n.id === b.nativeId && (!b.consent || n.version === b.consent.nativeVersion) } catch { /* Removed accounts stay visible to finance as stopped mappings. */ }
  const consented = b.consent?.revision === b.revision && b.consent?.connectionRevision === config?.revision
  bindings.push({ ...b, enabled: !!(config?.connected && stored && b.active && consented && nativeCurrent), status: !b.active ? 'Unbound; private routing stopped' : !nativeCurrent ? 'Native account or authority changed; private routing blocked' : !config?.connected || !stored ? 'Connection unavailable; private routing blocked' : !consented ? 'Awaiting this person’s consent' : 'Consented; identity and authority checked on every send' })
 }
 const members: Data[] = []
 if (finance) {
  const { results } = await c.db.prepare("SELECT email,display_name AS name,role FROM oa_operators WHERE status='active' ORDER BY email").all<Data>()
  for (const n of results) { const m = find(c.s, 'member', n.email); if (['owner', 'admin'].includes(n.role) || m?.active && ['contributor', 'viewer'].includes(m.role)) members.push({ email: n.email, name: n.name }) }
 }
 return { finance, connection: { connected: !!(config?.connected && stored), revision: config?.revision ?? '', team: config?.team ?? '', bot: config?.bot ?? '', revocation: config?.revocation ?? '', ...(config?.connected && !stored ? { error: 'Reconnect after restore; keys are excluded from archives' } : {}) }, bindings, members }
}
export async function privateSlackConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 privateSlackNative(c, true)
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown private Slack connection action', 404)
 requireThat(b.consent === true, 'Confirm this private Slack connection action')
 const prior = privateSlackConfig(c)
 requireThat(b.revision === (prior?.revision ?? ''), 'Private Slack connection changed; reload', 409)
 let config: Data = { connected: false, revision: uid(), by: c.x.actor.email, at: c.now }, sealed = ''
 if (op === 'connect') {
  const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(PRIVATE_SLACK_CONNECTION).first()
  requireThat(!prior?.connected || !stored, 'Disconnect the current bot before replacing it', 409)
  const token = text(b.key, 'Slack bot key', 2048)
  requireThat(!/\s/.test(token), 'Slack bot key must not contain whitespace')
  let identity
  try { identity = await slackIdentity(token) } catch { requireThat(false, 'Slack could not validate this workspace bot; no key stored', 409) }
  sealed = await sealConnection(env.SESSION_SECRET, token, PURPOSE)
  config = { ...config, ...identity, connected: true }
 } else {
  let revoked = false
  try { const token = await privateSlackKey(c, env); revoked = (await slackCall('auth.revoke', token)).revoked === true } catch { /* Local custody is removed even when remote revocation is unconfirmed. */ }
  config = { ...config, team: prior?.team ?? '', bot: prior?.bot ?? '', revocation: revoked ? 'Slack confirmed this key was revoked' : 'Local key removed; Slack revocation unconfirmed' }
 }
 put(c.s, 'connection', PRIVATE_SLACK_CONNECTION, config)
 c.activity.push({ action: `slack-private-${op}`, record: PRIVATE_SLACK_CONNECTION, detail: { provider: 'Slack', team: config.team, bot: config.bot, revocation: config.revocation ?? '' } })
 return [op === 'connect' ? c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(PRIVATE_SLACK_CONNECTION, sealed) : c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(PRIVATE_SLACK_CONNECTION)]
}
