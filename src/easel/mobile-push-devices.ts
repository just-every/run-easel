import type { Bindings } from '../auth.server'
import { requireMember, access } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { actor, authority, load, save } from './store'
import { all, choice, find, put, requireThat, text, uid, type Data } from './types'

const purpose = (id: string) => `easel:mobile-push:v1:${id}`
export const pushSecretId = (id: string) => `mobile-push:${id}`

async function fingerprint(env: Bindings, value: string) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
 const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`easel:mobile-push:v1:${value}`))
 return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function native(c: Context) {
 requireMember(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && c.x.actor.session, 'Use your signed-in native session to manage push consent', 403)
}
const metadata = (d: Data) => ({ id: d.id, platform: d.platform, status: d.status, createdAt: d.createdAt, updatedAt: d.updatedAt })
export async function mobileDevices(c: Context, env: Bindings) {
 native(c)
 const session = await fingerprint(env, `session:${c.x.actor.session}`)
 const devices = all(c.s, 'mobile-device').filter(d => d.operator === c.x.actor.id && d.sessionFingerprint === session)
 return { devices: devices.map(metadata), deliveries: all(c.s, 'mobile-push-delivery').filter(d => devices.some(device => device.id === d.device)).map(d => ({ id: d.id, device: d.device, status: d.status, reason: d.reason, createdAt: d.createdAt, completedAt: d.completedAt ?? null })) }
}

export function revokeDevice(c: Context, d: Data, reason = 'person-revoked') {
 put(c.s, 'mobile-device', d.id, { ...d, status: 'revoked', updatedAt: c.now })
 ;(c.extra ??= []).push(c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(pushSecretId(d.id)))
 c.activity.push({ action: 'mobile-push-revoked', record: d.id, detail: { platform: d.platform, reason } })
}
export async function mobileDeviceCommand(c: Context, env: Bindings, op: string, b: Data) {
 native(c)
 const sessionFingerprint = await fingerprint(env, `session:${c.x.actor.session}`)
 if (op === 'revoke') {
  const d = find(c.s, 'mobile-device', text(b.id, 'Device', 100))
  requireThat(d && d.operator === c.x.actor.id && d.sessionFingerprint === sessionFingerprint, 'This device does not belong to your current native session', 403)
  revokeDevice(c, d)
  return metadata({ ...d, status: 'revoked', updatedAt: c.now })
 }
 requireThat(op === 'register', 'Unknown device action', 404)
 requireThat(b.consent === true, 'Explicit consent to generic Easel push notifications is required')
 const platform = choice(b.platform, ['ios', 'android'] as const, 'device platform')
 const token = text(b.token, 'Native push token', 4096)
 requireThat(platform === 'ios' ? token.length % 2 === 0 && /^[a-f0-9]{64,512}$/i.test(token) : /^[!-~]{16,4096}$/.test(token), 'Invalid native push token')
 const canonical = platform === 'ios' ? token.toLowerCase() : token
 const tokenFingerprint = await fingerprint(env, `token:${platform}:${canonical}`)
 const previous = all(c.s, 'mobile-device').filter(d => d.tokenFingerprint === tokenFingerprint && d.status === 'active')
 const own = previous.find(d => d.operator === c.x.actor.id && d.sessionFingerprint === sessionFingerprint)
 for (const d of previous) if (d.id !== own?.id) revokeDevice(c, d, 'rebound-to-current-session')
 const id = own?.id ?? uid()
 const device = { id, operator: c.x.actor.id, email: c.x.actor.email, nativeVersion: c.x.actor.version, baseRole: c.x.actor.baseRole, sessionFingerprint, tokenFingerprint, platform, status: 'active', consent: { genericOnly: true, at: c.now, by: c.x.actor.email }, createdAt: own?.createdAt ?? c.now, updatedAt: c.now }
 put(c.s, 'mobile-device', id, device)
 const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify({ token: canonical, session: c.x.actor.session }), purpose(id))
 ;(c.extra ??= []).push(c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(pushSecretId(id), sealed))
 c.activity.push({ action: 'mobile-push-consented', record: id, detail: { platform, genericOnly: true, exactNativeSession: true } })
 return metadata(device)
}

export async function openPushDevice(c: Context, env: Bindings, d: Data, revision: number) {
 if (d.status !== 'active' || !d.consent?.genericOnly) return null
 const secret = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(pushSecretId(d.id)).first<{ sealed: string }>()
 if (!secret) return null
 try {
  const value = JSON.parse(await openConnection(env.SESSION_SECRET, secret.sealed, purpose(d.id), 'Push'))
  if (await fingerprint(env, `session:${value.session}`) !== d.sessionFingerprint) return null
  const auth = authority(c.x.actor)
  const live = await c.db.prepare(`SELECT o.id FROM oa_sessions se JOIN oa_operators o ON o.id=se.operator_id WHERE se.id=? AND o.id=? AND o.email=? AND o.version=? AND o.version=se.operator_version AND o.role=? AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>unixepoch()*1000 AND EXISTS(SELECT 1 FROM e_records WHERE kind='mobile-device' AND id=? AND value=?) AND (SELECT revision FROM e_meta WHERE id=1)=? AND (${auth.sql})`).bind(value.session, d.operator, d.email, d.nativeVersion, d.baseRole, d.id, JSON.stringify(c.s.get(`mobile-device:${d.id}`)!.value), revision, ...auth.params).first()
  return live ? value as { token: string; session: string } : null
 } catch { return null }
}

/** Called before the native sign-out revokes its authority to save. */
export async function revokeMobileSession(request: Request, env: Bindings) {
 const a = await actor(request, env), { state, revision } = await load(env.DB)
 const c: Context = { s: state, x: access(state, a), db: env.DB, activity: [], snapshots: [], now: new Date().toISOString() }
 const before = new Map(state), session = await fingerprint(env, `session:${a.session}`)
 for (const d of all(state, 'mobile-device').filter(d => d.operator === a.id && d.sessionFingerprint === session && d.status === 'active')) revokeDevice(c, d, 'native-signout')
 if (c.activity.length) await save(env.DB, a, before, state, revision, c.activity, [], false, c.extra)
}
