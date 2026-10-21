// Durable intent precedes network I/O. Provider acceptance is not delivery.
import { operatorMail } from '../mail.server.mjs'
import { runtimeBindings, type Bindings } from '../auth.server'
import { access, seesPayDetail } from './access'
import type { Context } from './context'
import { captureDepartmentStatement, statementOwner, statementWork } from './department-statements'
import { statementEmail } from './department-statement-documents'
import { get, put, Fault, type Data } from './types'

type SavedContext = Context & { revision: number; before: Context['s'] }
type Open = () => Promise<SavedContext>
type Commit = (c: SavedContext) => Promise<void>
const retryable = new Set(['pending', 'suppressed', 'blocked'])

export async function dispatchDepartmentStatement(id: string, original: Bindings, open: Open, commit: Commit) {
 const env = runtimeBindings(original)
 let c = await open()
 await captureDepartmentStatement(c, id)
 await commit(c)
 const recipients = get(c.s, 'department-statement', id).deliveries.map((d: Data) => d.recipient)
 for (const recipient of recipients) {
  c = await open()
  let s = get(c.s, 'department-statement', id)
  let delivery = s.deliveries.find((d: Data) => d.recipient === recipient)
  if (!retryable.has(delivery.status)) continue
  const native = await c.db.prepare("SELECT id,email,display_name AS name,role,version FROM oa_operators WHERE email=? AND status='active'").bind(recipient).first<{ id: string; email: string; name: string; role: 'owner' | 'admin' | 'member'; version: number }>()
  if (!native || !statementOwner(c.s, recipient, s.department)) {
   delivery = { ...delivery, status: 'blocked', reason: 'Recipient no longer has an active account and contributor membership for this department.' }
   put(c.s, 'department-statement', id, { ...s, deliveries: s.deliveries.map((d: Data) => d.recipient === recipient ? delivery : d) })
   c.activity.push({ action: 'department-statement-blocked', record: id, detail: { recipient, department: s.department } })
   await commit(c)
   continue
  }
  const recipientAccess = access(c.s, { id: native.id, email: native.email, name: native.name, baseRole: native.role, version: native.version, session: '' })
  const messagePayDetail = seesPayDetail(recipientAccess, s.department)
  const messageAudience = JSON.stringify(Object.fromEntries(Object.entries(recipientAccess.dimensionRead ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([dimension, ids]) => [dimension, [...ids].sort()])))
  if (delivery.message && (delivery.messagePayDetail !== messagePayDetail || (delivery.messageAudience ?? '{}') !== messageAudience)) {
   delivery = { ...delivery, status: 'blocked', reason: 'The stored email has an unknown or changed permission audience. Its body and delivery key cannot be safely reused; open the statement for current access.' }
   put(c.s, 'department-statement', id, { ...s, deliveries: s.deliveries.map((d: Data) => d.recipient === recipient ? delivery : d) })
   c.activity.push({ action: 'department-statement-blocked', record: id, detail: { recipient, department: s.department, reason: 'permission-audience-changed' } })
   await commit(c)
   continue
  }
  // Keep exactly the same body/key for any explicit retry. Local suppression
  // is not a send, so it does not capture a production body prematurely.
  let message: Data
  try { message = delivery.message ?? statementEmail(statementWork({ ...c, x: recipientAccess }, s), `${env.AUTH_ORIGIN}/app?departmentStatement=${encodeURIComponent(id)}`) }
  catch (error) {
   if (!(error instanceof Fault)) throw error
   delivery = { ...delivery, status: 'blocked', reason: error.message }
   put(c.s, 'department-statement', id, { ...s, deliveries: s.deliveries.map((d: Data) => d.recipient === recipient ? delivery : d) })
   c.activity.push({ action: 'department-statement-blocked', record: id, detail: { recipient, reason: 'dimension-source-unavailable' } })
   await commit(c); continue
  }
  delivery = { ...delivery, status: 'sending', attempts: delivery.attempts + 1, lastAttemptAt: c.now, message, messagePayDetail, messageAudience }
  put(c.s, 'department-statement', id, { ...s, deliveries: s.deliveries.map((d: Data) => d.recipient === recipient ? delivery : d) })
  c.activity.push({ action: 'department-statement-dispatch', record: id, detail: { recipient, deliveryId: delivery.deliveryId } })
  await commit(c)
  let outcome: Data
  try {
   const sender = operatorMail(env)
   outcome = sender ? await sender.send({ deliveryId: delivery.deliveryId, from: env.MAIL_FROM ?? '', to: [recipient], subject: message.subject, text: message.text, html: `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${message.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>`, headers: {} }) : { status: 'rejected', code: 'mail_not_configured' }
  } catch (error) { outcome = error instanceof Error && error.name === 'MailValidationError' ? { status: 'rejected', code: 'mail_configuration_or_message_invalid' } : { status: 'uncertain', code: 'mail_outcome_unknown' } }
  c = await open()
  s = get(c.s, 'department-statement', id)
  const current = s.deliveries.find((d: Data) => d.recipient === recipient)
  // A sending record is a claim. A concurrent retry cannot dispatch it.
  const status = outcome.status === 'accepted' ? 'accepted' : outcome.status === 'development' ? 'suppressed' : outcome.status === 'uncertain' ? 'uncertain' : 'pending'
  const after = { ...current, status, providerStatus: outcome.status, providerMessageId: outcome.providerMessageId ?? null, reason: outcome.code ?? '', completedAt: c.now,
   ...(status === 'suppressed' ? { message: null, messagePayDetail: null, messageAudience: null } : {}) }
  put(c.s, 'department-statement', id, { ...s, deliveries: s.deliveries.map((d: Data) => d.recipient === recipient ? after : d) })
  c.activity.push({ action: 'department-statement-mail-result', record: id, detail: { recipient, status, providerStatus: outcome.status } })
  await commit(c)
 }
}
