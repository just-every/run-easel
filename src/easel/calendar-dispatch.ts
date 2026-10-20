// Scheduled reminders and escalations. The cron run acts as scheduler:calendar
// for the still-active owner/admin who turned reminders on, fenced on the exact
// model revision; it only appends delivery intents and their outcomes and can
// never change plans or roles. Durable intent precedes every network call;
// accepted sends are never repeated and uncertain ones are never retried.
import { operatorMail } from '../mail.server.mjs'
import { runtimeBindings, type Bindings } from '../auth.server'
import { access } from './access'
import { ACCEPTED_LABEL, CHAT_TEXT, chatReady, sendChat, type ChatChannel } from './calendar-channels'
import { calendarTasks, eligibleOwner, financeEmails, type CalendarTask } from './calendar'
import { escalationAt, reminderAt } from './calendar-time'
import type { Context } from './context'
import { departments, workspace } from './model'
import { load, save } from './store'
import { currentTime } from './time'
import { find, get, put, requireThat, type Actor, type Data } from './types'

type Saved = Context & { revision: number; before: Context['s'] }
type Open = () => Promise<Saved>
type Commit = (c: Saved) => Promise<void>

function intent(c: Context, task: CalendarTask, kind: 'reminder' | 'escalation', channel: string, recipient: string, scheduledAt: string, zone: string, status = 'pending', reason = '') {
 const id = `${task.id}|${task.due}|${kind}|${channel}|${recipient}`
 if (find(c.s, 'calendar-delivery', id)) return null
 put(c.s, 'calendar-delivery', id, { task: task.id, taskName: task.name, department: task.department, due: task.due, kind, channel, recipient, scheduledAt, zone, status, reason, attempts: 0, key: crypto.randomUUID(), createdAt: c.now, dispatchedAt: null, completedAt: status === 'canceled' ? c.now : null, history: [{ status, at: c.now, reason }] })
 c.activity.push({ action: `calendar-${kind}-${status === 'canceled' ? 'canceled' : 'queued'}`, record: id, detail: { task: task.id, channel, recipient, scheduledAt, zone, reason } })
 return status === 'pending' ? id : null
}

/** Records every reminder/escalation due at `c.now` exactly once per occurrence. */
export async function planCalendar(c: Context, env: Bindings) {
 const schedule = find(c.s, 'calendar-schedule', 'main'), zone = workspace(c.s).timeZone ?? 'America/New_York', now = c.now, ids: string[] = []
 if (!schedule?.enabled) return ids
 const channels: ChatChannel[] = []
 for (const ch of schedule.channels as ChatChannel[]) if (await chatReady(c, env, ch)) channels.push(ch)
 const finance = await financeEmails(c.db)
 for (const task of calendarTasks(c)) {
  const remind = reminderAt(task.due, zone), escalate = escalationAt(task.due, zone)
  if (now >= remind && now < escalate) {
   if (!task.open) intent(c, task, 'reminder', 'none', '', remind, zone, 'canceled', `${task.doneLabel} before the reminder`)
   else for (const [channel, recipient] of [...task.owners.map(o => ['email', o]), ...channels.map(ch => [ch, ch])]) { const id = intent(c, task, 'reminder', channel, recipient, remind, zone); if (id) ids.push(id) }
  }
  if (now >= escalate && task.open) for (const [channel, recipient] of [...finance.map(f => ['email', f]), ...channels.map(ch => [ch, ch])]) { const id = intent(c, task, 'escalation', channel, recipient, escalate, zone); if (id) ids.push(id) }
 }
 return ids
}

function emailFor(c: Context, d: Data, link: string) {
 const department = d.department ? departments(c.s).find(x => x.id === d.department)?.name ?? d.department : 'Company-wide'
 const lines = [`Task: ${d.taskName}`, `Department: ${department}`, `Due: ${d.due} (${d.zone})`]
 if (d.kind === 'reminder') return { subject: `Reminder: ${d.taskName} is due ${d.due}`, text: ['This planning task is due tomorrow.', '', ...lines, '', `Open the planning calendar: ${link}`, '', 'Reminders stop when the task is complete.'].join('\n') }
 return { subject: `Overdue: ${d.taskName} (due ${d.due})`, text: ['A planning task is overdue and is escalated to finance.', '', ...lines, `Owner: ${calendarTasks(c).find(t => t.id === d.task)?.owners.join(', ') || 'No active owner'}`, '', `Open the planning calendar: ${link}`].join('\n') }
}

/** Sends recorded intents one at a time with live authority rechecked first. */
export async function deliverCalendar(ids: string[], original: Bindings, open: Open, commit: Commit) {
 const env = runtimeBindings(original)
 for (const id of ids) {
  let c = await open()
  let d = get(c.s, 'calendar-delivery', id)
  if (d.status !== 'pending') continue
  const task = calendarTasks(c).find(t => t.id === d.task)
  const record = (status: string, reason: string, extra: Data = {}) => { put(c.s, 'calendar-delivery', id, { ...d, ...extra, status, reason, history: [...d.history, { status, at: c.now, reason }] }); c.activity.push({ action: 'calendar-delivery-result', record: id, detail: { status, reason, channel: d.channel } }) }
  let blocked = ''
  if (!task?.open) blocked = 'The task was completed before sending'
  else if (d.channel === 'email') blocked = d.kind === 'reminder' ? (task.owners.includes(d.recipient) && await eligibleOwner(c, task, d.recipient) ? '' : 'The recipient is no longer an active owner of this task')
   : ((await financeEmails(c.db)).includes(d.recipient) ? '' : 'The recipient is no longer active finance')
  else if (!(find(c.s, 'calendar-schedule', 'main')?.channels ?? []).includes(d.channel) || !(await chatReady(c, env, d.channel))) blocked = 'This chat channel is no longer turned on and configured'
  if (blocked) { record(task?.open ? 'blocked' : 'canceled', blocked, { completedAt: c.now }); await commit(c); continue }
  const message = d.message ?? (d.channel === 'email' ? emailFor(c, d, `${env.AUTH_ORIGIN}/app?calendar=1`) : { subject: CHAT_TEXT, text: `${CHAT_TEXT}\n${env.AUTH_ORIGIN}/app` })
  d = { ...d, message, attempts: d.attempts + 1, dispatchedAt: c.now }
  record('sending', '')
  await commit(c)
  let outcome: { status: string; code?: string; providerMessageId?: string | null }
  if (d.channel === 'email') {
   try {
    const sender = operatorMail(env)
    outcome = sender ? await sender.send({ deliveryId: d.key, from: env.MAIL_FROM ?? '', to: [d.recipient], subject: message.subject, text: message.text, html: `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${message.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>`, headers: {} }) : { status: 'rejected', code: 'mail_not_configured' }
   } catch (error) { outcome = error instanceof Error && error.name === 'MailValidationError' ? { status: 'rejected', code: 'mail_configuration_or_message_invalid' } : { status: 'uncertain', code: 'mail_outcome_unknown' } }
  } else outcome = await sendChat(c, env, d.channel as ChatChannel, d.key)
  c = await open()
  d = get(c.s, 'calendar-delivery', id)
  const status = outcome.status === 'accepted' ? 'accepted' : outcome.status === 'development' ? 'suppressed' : outcome.status === 'uncertain' ? 'uncertain' : 'pending'
  const label = status === 'accepted' ? ACCEPTED_LABEL[d.channel] : status === 'suppressed' ? 'Local development: email suppressed, not sent' : status === 'uncertain' ? 'Outcome unknown; never retried automatically' : `Refused or not configured (${outcome.code}); finance can retry`
  record(status, outcome.code ?? '', { label, providerMessageId: outcome.providerMessageId ?? null, completedAt: c.now, ...(status === 'suppressed' ? { message: null } : {}) })
  await commit(c)
 }
}

/** The cron entry point. */
export async function runCalendarSchedule(env: Bindings) {
 const db = env.DB, { state } = await load(db)
 const schedule = find(state, 'calendar-schedule', 'main')
 if (!schedule?.enabled) return { queued: 0 }
 const operator = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(schedule.configuredBy.id).first<any>()
 if (!operator) return { queued: 0, paused: true }
 const actor: Actor = { id: operator.id, email: 'scheduler:calendar', name: operator.display_name, session: '', version: operator.version, baseRole: operator.role, scheduler: { operator: operator.id, email: operator.email } }
 const open: Open = async () => { const { state, revision } = await load(db); return { s: state, before: new Map(state), revision, x: access(state, actor), db, activity: [], snapshots: [], now: await currentTime(env) } }
 const commit: Commit = async ctx => {
  const changed = [...ctx.s].filter(([k, r]) => ctx.before.get(k)?.revision !== r.revision).map(([, r]) => r.kind)
  requireThat(changed.every(k => k === 'calendar-delivery') && [...ctx.before.keys()].every(k => ctx.s.has(k)), 'The scheduler only records reminder deliveries', 500)
  if (changed.length || ctx.activity.length) await save(db, actor, ctx.before, ctx.s, ctx.revision, ctx.activity)
 }
 const c = await open(), ids = await planCalendar(c, env)
 await commit(c)
 await deliverCalendar(ids, env, open, commit)
 return { queued: ids.length }
}

