// Delivers recorded notifications by each person's preference, with the
// CYCLE-001 delivery rules: durable intent first, live authority rechecked,
// acceptance labeled honestly, refused sends pending for finance retry and
// uncertain sends never retried. Digests go at 08:00 in the company zone.
import { operatorMail } from '../mail.server.mjs'
import { runtimeBindings, type Bindings } from '../auth.server'
import { ACCEPTED_LABEL, chatReady, sendChat, type ChatChannel } from './calendar-channels'
import { zonedInstant } from './calendar-time'
import type { Context } from './context'
import { workspace } from './model'
import { EVENT_LABEL, canRead, preference } from './notify'
import { all, find, get, put, type Data } from './types'

type Saved = Context & { revision: number; before: Context['s'] }
type Open = () => Promise<Saved>
type Commit = (c: Saved) => Promise<void>
export const NOTICE = 'You have an Easel notification'
export const DIGEST_HOUR = 8

const escape = (t: string) => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const link = (origin: string, n: Data) => `${origin}/app?tab=${encodeURIComponent(n.tab)}&record=${encodeURIComponent(n.record)}`
const statusOf = (outcome: Data) => outcome.status === 'accepted' ? 'accepted' : outcome.status === 'development' ? 'suppressed' : outcome.status === 'uncertain' ? 'uncertain' : 'pending'

async function mail(env: Bindings, key: string, to: string, message: Data) {
 try {
  const sender = operatorMail(env)
  return sender ? await sender.send({ deliveryId: key, from: env.MAIL_FROM ?? '', to: [to], subject: message.subject, text: message.text, html: `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(message.text)}</div>`, headers: {} }) : { status: 'rejected', code: 'mail_not_configured' }
 } catch (error) { return error instanceof Error && error.name === 'MailValidationError' ? { status: 'rejected', code: 'mail_configuration_or_message_invalid' } : { status: 'uncertain', code: 'mail_outcome_unknown' } }
}
const labelFor = (status: string, channel: string, code = '') => status === 'accepted' ? ACCEPTED_LABEL[channel] : status === 'suppressed' ? 'Local development: email suppressed, not sent' : status === 'uncertain' ? 'Outcome unknown; never retried automatically' : `Refused or not configured (${code}); finance can retry`

/** Immediate delivery of new or retried notifications; digest-preference ones wait for the digest. */
export async function deliverNotifications(ids: string[], original: Bindings, open: Open, commit: Commit) {
 const env = runtimeBindings(original)
 for (const id of ids) {
  let c = await open()
  let n = get(c.s, 'notification', id)
  const record = (status: string, extra: Data = {}) => { n = { ...n, ...extra, status, history: [...n.history, { status, at: c.now, reason: extra.reason ?? '' }] }; put(c.s, 'notification', id, n); c.activity.push({ action: 'notification-result', record: id, detail: { status, channel: n.channel, reason: extra.reason ?? '' } }) }
  if (!['new', 'pending'].includes(n.status)) continue
  const pref = n.status === 'new' ? preference(c, n.recipient) : { mode: n.channel === 'email' ? 'email' : 'chat', channel: n.channel }
  if (pref.mode === 'digest') { record('digest-queued', { channel: 'digest' }); await commit(c); continue }
  const channel = pref.mode === 'email' ? 'email' : pref.channel
  if (!(await canRead(c, n.recipient, n.department))) { record('blocked', { channel, reason: 'The recipient can no longer read this record', completedAt: c.now }); await commit(c); continue }
  if (channel !== 'email' && !(await chatReady(c, env, channel))) { record('blocked', { channel, reason: 'That chat channel is no longer connected', completedAt: c.now }); await commit(c); continue }
  const message = n.message ?? (channel === 'email' ? { subject: `${EVENT_LABEL[n.event]}: ${n.title}`, text: [`${EVENT_LABEL[n.event]}.`, '', n.title, '', ...(n.body ? [n.body, ''] : []), `Open it in Easel: ${link(env.AUTH_ORIGIN, n)}`].join('\n') } : { subject: NOTICE, text: NOTICE })
  record('sending', { channel, message, attempts: n.attempts + 1, dispatchedAt: c.now })
  await commit(c)
  const outcome: Data = channel === 'email' ? await mail(env, n.key, n.recipient, message) : await sendChat(c, env, channel as ChatChannel, n.key, NOTICE)
  c = await open(); n = get(c.s, 'notification', id)
  const status = statusOf(outcome)
  record(status, { reason: outcome.code ?? '', label: labelFor(status, channel, outcome.code), completedAt: c.now, ...(status === 'suppressed' ? { message: null } : {}) })
  await commit(c)
 }
}

/** At or after 08:00 company time, one digest per digest-preference person per day. */
export function planDigests(c: Context) {
 const zone = workspace(c.s).timeZone ?? 'America/New_York', ids: string[] = []
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(c.now))
 const scheduledAt = zonedInstant(today, DIGEST_HOUR, zone)
 if (c.now < scheduledAt) return ids
 const waiting = all(c.s, 'notification').filter(n => n.status === 'digest-queued' && n.createdAt < scheduledAt)
 for (const recipient of [...new Set(waiting.map(n => n.recipient))]) {
  const id = `${recipient}|${today}`
  if (find(c.s, 'notification-digest', id)) continue
  const items = waiting.filter(n => n.recipient === recipient)
  put(c.s, 'notification-digest', id, { recipient, date: today, zone, scheduledAt, notifications: items.map(n => n.id), status: 'pending', attempts: 0, key: crypto.randomUUID(), createdAt: c.now, history: [{ status: 'pending', at: c.now }] })
  for (const n of items) put(c.s, 'notification', n.id, { ...n, status: 'digested', digest: id, history: [...n.history, { status: 'digested', at: c.now }] })
  c.activity.push({ action: 'notification-digest-queued', record: id, detail: { recipient, count: items.length, scheduledAt, zone } })
  ids.push(id)
 }
 return ids
}

export async function deliverDigests(ids: string[], original: Bindings, open: Open, commit: Commit) {
 const env = runtimeBindings(original)
 for (const id of ids) {
  let c = await open()
  let d = get(c.s, 'notification-digest', id)
  if (d.status !== 'pending') continue
  const items = d.notifications.map((n: string) => get(c.s, 'notification', n))
  const readable: Data[] = []
  for (const n of items) if (await canRead(c, d.recipient, n.department)) readable.push(n)
  const message = d.message ?? { subject: `Easel daily digest: ${readable.length} notification${readable.length === 1 ? '' : 's'}`, text: ['Your Easel notifications since the last digest:', '', ...readable.map(n => `- ${EVENT_LABEL[n.event]}: ${n.title}\n  ${link(env.AUTH_ORIGIN, n)}`)].join('\n') }
  const save = (status: string, extra: Data = {}) => { d = { ...d, ...extra, status, history: [...d.history, { status, at: c.now }] }; put(c.s, 'notification-digest', id, d); c.activity.push({ action: 'notification-digest-result', record: id, detail: { status } }) }
  if (!readable.length) { save('blocked', { reason: 'Nothing the recipient can still read', completedAt: c.now }); await commit(c); continue }
  save('sending', { message, attempts: d.attempts + 1, dispatchedAt: c.now })
  await commit(c)
  const outcome: Data = await mail(env, d.key, d.recipient, message)
  c = await open(); d = get(c.s, 'notification-digest', id)
  const status = statusOf(outcome)
  save(status, { reason: outcome.code ?? '', label: labelFor(status, 'email', outcome.code), completedAt: c.now })
  await commit(c)
 }
}
