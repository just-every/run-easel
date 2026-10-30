import { runtimeBindings, type Bindings } from '../auth.server'
import { webhookGateway, sendWebhook } from './webhook-transport'
import { webhookDestination } from './webhook-destination'
import { access, requireCapability, requireFinance } from './access'
import { hasFullScope } from './access-grants'
import { AUTOMATION_EVENTS } from './automation-events'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { authority, load, readFence, save } from './store'
import { currentTime } from './time'
import { choice, Fault, integer, requireThat, text, type Actor, type Data } from './types'

const purpose = (id: string) => `easel:webhook:v1:${id}`
export function automationAccess(c: Context) {
 requireFinance(c.x)
 requireThat(hasFullScope(c.s, c.x), 'Automation events require company-wide access', 403)
}
function native(c: Context) {
 automationAccess(c)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Manage webhook receivers in a native signed-in finance session', 403)
 requireCapability(c.x, 'connections', c.s)
}
function endpoint(value: unknown, env: Bindings) {
 let url: URL
 try { url = webhookDestination(text(value, 'Receiver URL', 2000)) } catch { throw new Fault(400, 'Use a public HTTPS receiver hostname without credentials, query, fragment or a custom port') }
 const hosts = (env.EASEL_WEBHOOK_HOSTS ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
 requireThat(hosts.includes(url.hostname), 'The installation owner must add this exact public hostname to EASEL_WEBHOOK_HOSTS', 403)
 return url
}

export async function webhookAdmin(c: Context, env: Bindings, op: string, b: Data) {
 native(c)
 const revision = (c as Context & { revision: number }).revision
 if (op === 'list') {
  const { results: subscriptions } = await c.db.prepare('SELECT id,label,host,events,created_at AS createdAt,revoked_at AS revokedAt FROM e_webhook_subscriptions ORDER BY created_at,id').all<Data>()
  const { results: deliveries } = await c.db.prepare('SELECT subscription,event,status,attempts,next_at AS nextAt,started_at AS startedAt,completed_at AS completedAt,http_status AS httpStatus FROM e_webhook_deliveries ORDER BY next_at DESC LIMIT 100').all<Data>()
  await readFence(c.db, c.x.actor, revision)
  return { subscriptions: subscriptions.map(s => ({ ...s, events: JSON.parse(s.events) })), deliveries }
 }
 const id = op === 'register' ? crypto.randomUUID() : text(b.id, 'Webhook ID', 100)
 let result: Data
 if (op === 'register') {
  requireThat(c.x.actor.baseRole === 'owner', 'Only the signed-in owner registers a receiver destination', 403)
  webhookGateway(env)
  const url = endpoint(b.url, env), label = text(b.label, 'Receiver label', 100)
  requireThat(Array.isArray(b.events) && b.events.length > 0 && b.events.length <= AUTOMATION_EVENTS.length, 'Choose at least one event type')
  const events = [...new Set(b.events.map((v: unknown) => choice(v, AUTOMATION_EVENTS, 'event type')))]
  requireThat(Number(await c.db.prepare('SELECT count(*) AS n FROM e_webhook_subscriptions WHERE revoked_at IS NULL').first('n')) < 20, 'At most 20 active receivers are supported', 409)
  if (b.secret !== undefined) requireThat(typeof b.secret === 'string' && /^[A-Za-z0-9_-]{32,200}$/.test(b.secret), 'Receiver secret must contain 32 to 200 letters, digits, underscores or hyphens')
  const secret = b.secret ?? [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('')
  const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify({ url: url.href, secret }), purpose(id))
  c.extra = [c.db.prepare('INSERT INTO e_webhook_subscriptions(id,label,host,sealed,events,operator_id,operator_version,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, label, url.hostname, sealed, JSON.stringify(events), c.x.actor.id, c.x.actor.version, c.now)]
  result = { id, label, host: url.hostname, events, secret }
 } else {
  requireThat(op === 'revoke', 'Unknown webhook action', 404)
  requireThat(await c.db.prepare('SELECT id FROM e_webhook_subscriptions WHERE id=? AND revoked_at IS NULL').bind(id).first(), 'Active receiver not found', 404)
  c.extra = [c.db.prepare('UPDATE e_webhook_subscriptions SET revoked_at=?,sealed=NULL WHERE id=?').bind(c.now, id), c.db.prepare("UPDATE e_webhook_deliveries SET status='blocked',completed_at=? WHERE subscription=? AND status='pending'").bind(c.now, id)]
  result = { id, revoked: true }
 }
 c.activity.push({ action: `webhook-${op}`, record: id })
 // The secret and receiver path never enter activity or model records.
 await save(c.db, c.x.actor, c.s, c.s, revision, c.activity, [], true, c.extra, c.now)
 return result
}

export async function automationEvents(c: Context, query: Record<string, string>) {
 automationAccess(c)
 const after = integer(query.after ?? 0, 'Event cursor', 0, Number.MAX_SAFE_INTEGER)
 const type = query.type ? choice(query.type, AUTOMATION_EVENTS, 'event type') : ''
 const recent = query.recent === 'true'
 const { results } = await c.db.prepare(`SELECT seq,body FROM e_automation_events WHERE seq>? AND (?='' OR type=?) ORDER BY seq ${recent ? 'DESC' : 'ASC'} LIMIT 100`).bind(after, type, type).all<{ seq: number; body: string }>()
 return { events: results.map(r => ({ ...JSON.parse(r.body), cursor: r.seq })), cursor: results.at(-1)?.seq ?? after, next: !recent && results.length === 100 ? results.at(-1)!.seq : null }
}
export async function webhookSignature(secret: string, timestamp: string, body: string) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
 const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
 return [...new Uint8Array(signature)].map(v => v.toString(16).padStart(2, '0')).join('')
}

/** One atomic claimant per delivery. Crashes/unknown responses are never retried;
 * explicit 429/5xx responses get bounded, same-ID retries for receiver dedup. */
export async function runWebhooks(original: Bindings) {
 const env = runtimeBindings(original), db = env.DB, now = await currentTime(env)
 await db.prepare("UPDATE e_webhook_deliveries SET status='uncertain',completed_at=? WHERE status='sending' AND started_at<?").bind(now, new Date(Date.parse(now) - 60000).toISOString()).run()
 const { results } = await db.prepare(`SELECT d.subscription,d.event,s.sealed,s.operator_id,s.operator_version FROM e_webhook_deliveries d JOIN e_webhook_subscriptions s ON s.id=d.subscription WHERE d.status='pending' AND d.next_at<=? ORDER BY d.next_at,d.event LIMIT 20`).bind(now).all<Data>()
 for (const row of results) {
  const operator = await db.prepare("SELECT id,email,display_name,version,role FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')").bind(row.operator_id, row.operator_version).first<Data>()
  const { state, revision } = await load(db)
  const a: Actor | null = operator ? { id: operator.id, email: operator.email, name: operator.display_name, version: operator.version, baseRole: operator.role, session: '', scheduler: { operator: operator.id, email: operator.email } } : null
  let permitted = false
  if (a) { try { automationAccess({ s: state, x: access(state, a) } as Context); permitted = true } catch {} }
  if (!permitted || !row.sealed) { await db.prepare("UPDATE e_webhook_deliveries SET status='blocked',completed_at=? WHERE subscription=? AND event=? AND status='pending'").bind(now, row.subscription, row.event).run(); continue }
  let receiver: { url: string; secret: string }
  try { receiver = JSON.parse(await openConnection(env.SESSION_SECRET, row.sealed, purpose(row.subscription), 'Webhook')); endpoint(receiver.url, env) }
  catch { await db.prepare("UPDATE e_webhook_deliveries SET status='blocked',completed_at=? WHERE subscription=? AND event=? AND status='pending'").bind(now, row.subscription, row.event).run(); continue }
  const auth = authority(a!, true)
  const claimed = await db.prepare(`UPDATE e_webhook_deliveries SET status='sending',attempts=attempts+1,started_at=? WHERE subscription=? AND event=? AND status='pending' AND next_at<=? AND (${auth.sql}) AND (SELECT revision FROM e_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM e_webhook_subscriptions s WHERE s.id=subscription AND s.revoked_at IS NULL AND s.sealed=? AND s.operator_version=(SELECT version FROM oa_operators WHERE id=s.operator_id)) RETURNING attempts`).bind(now, row.subscription, row.event, now, ...auth.params, revision, row.sealed).first<{ attempts: number }>()
  if (!claimed) continue
  const event = await db.prepare('SELECT body FROM e_automation_events WHERE id=?').bind(row.event).first<{ body: string }>()
  const timestamp = String(Math.floor(Date.parse(now) / 1000))
  let status = 'uncertain', httpStatus: number | null = null, nextAt = now
  try {
   const response = await sendWebhook(env, { url: receiver.url, headers: { 'content-type': 'application/json', 'x-easel-event-id': row.event, 'x-easel-timestamp': timestamp, 'x-easel-signature': `v1=${await webhookSignature(receiver.secret, timestamp, event!.body)}` }, body: event!.body })
   if (!response) throw new Error('Webhook gateway outcome unknown')
   httpStatus = response.status
   status = response.status >= 200 && response.status < 300 ? 'delivered' : 'failed'
   if ((response.status === 429 || response.status >= 500) && claimed.attempts < 5) {
    const retry = response.retryAfter
    const wait = /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.parse(now)) || 0
    status = 'pending'; nextAt = new Date(Date.parse(now) + Math.max(30000 * 2 ** (claimed.attempts - 1), Math.min(wait, 86400000))).toISOString()
   }
  } catch { /* Unknown receiver outcome: preserve the ID, do not retry. */ }
  await db.batch([
   db.prepare("UPDATE e_webhook_deliveries SET status=?,http_status=?,next_at=?,completed_at=? WHERE subscription=? AND event=? AND status='sending'").bind(status, httpStatus, nextAt, status === 'pending' ? null : now, row.subscription, row.event),
   db.prepare("INSERT INTO e_activity(at,actor,action,record,detail) VALUES(?,'scheduler:webhooks','webhook-delivery',?,?)").bind(now, row.subscription, JSON.stringify({ event: row.event, status, httpStatus, attempts: claimed.attempts })),
  ])
 }
}
