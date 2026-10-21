// Schedule definitions contain named recipients; only finance may configure or inspect them.
import { access, requireFinance } from './access'
import { zonedInstant } from './calendar-time'
import type { Context } from './context'
import { workspace } from './model'
import { savedReport } from './saved-reports'
import { all, choice, find, get, integer, put, remove, requireThat, uid, type Data } from './types'

export async function reportRecipientContext(c: Context, email: string): Promise<Context | null> {
 const native = await c.db.prepare("SELECT id,email,display_name AS name,role,version FROM oa_operators WHERE email=? AND status='active'").bind(email).first<any>()
 if (!native) return null
 const x = access(c.s, { id: native.id, email: native.email, name: native.name, baseRole: native.role, version: native.version, session: '' })
 return x.role ? { ...c, x } : null
}

export function reportScheduleList(c: Context) {
 requireFinance(c.x)
 return { schedules: all(c.s, 'report-schedule'), deliveries: all(c.s, 'report-delivery').map(({ message, audience, ...d }) => d) }
}

export async function savedReportScheduleCommands(c: Context, op: string, b: Data) {
 if (!['report-schedule-save', 'report-schedule-delete', 'report-schedule-retry'].includes(op)) return undefined
 requireFinance(c.x)
 if (op === 'report-schedule-retry') {
  const delivery = get(c.s, 'report-delivery', b.id)
  requireThat(['pending', 'blocked', 'suppressed'].includes(delivery.status), 'Accepted, sending and uncertain emails cannot be retried', 409)
  c.activity.push({ action: op, record: delivery.id, detail: { status: delivery.status } })
  return { deliveryIds: [delivery.id] }
 }
 const prior = b.id ? get(c.s, 'report-schedule', b.id) : null
 requireThat(!prior || Number(b.revision) === prior.revision, 'The report schedule changed; reload', 409)
 if (op === 'report-schedule-delete') {
  requireThat(prior, 'Choose a report schedule')
  remove(c.s, 'report-schedule', prior.id)
  c.activity.push({ action: op, record: prior.id, detail: {} })
  return { removed: prior.id }
 }
 const dashboard = get(c.s, 'dashboard', b.dashboard)
 await savedReport(c, dashboard.id)
 requireThat(Array.isArray(b.recipients) && b.recipients.length > 0 && b.recipients.length <= 100, 'Choose one to 100 named recipients')
 const recipients = [...new Set<string>(b.recipients.map((r: unknown) => typeof r === 'string' ? r.trim().toLowerCase() : ''))]
 for (const email of recipients) {
  const recipient = await reportRecipientContext(c, email)
  requireThat(recipient, 'Every recipient must have an active account and current workspace membership')
  await savedReport(recipient, dashboard.id)
 }
 const id = prior?.id ?? uid()
 put(c.s, 'report-schedule', id, { dashboard: dashboard.id, recipients,
  cadence: choice(b.cadence, ['daily', 'weekly', 'monthly'] as const, 'a report frequency'),
  hour: integer(b.hour ?? 8, 'Local dispatch hour', 0, 23), weekday: integer(b.weekday ?? 1, 'Day of week', 0, 6), day: integer(b.day ?? 1, 'Day of month', 1, 28),
  enabled: b.enabled !== false, revision: (prior?.revision ?? 0) + 1, updatedBy: c.x.actor.email, updatedAt: c.now, createdAt: prior?.createdAt ?? c.now })
 c.activity.push({ action: op, record: id, detail: { dashboard: dashboard.id } })
 return get(c.s, 'report-schedule', id)
}

export function planSavedReportSchedules(c: Context) {
 const zone = workspace(c.s).timeZone ?? 'America/New_York'
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(c.now)).map(p => [p.type, p.value]))
 const date = `${parts.year}-${parts.month}-${parts.day}`, weekday = new Date(`${date}T00:00:00Z`).getUTCDay(), ids: string[] = []
 for (const schedule of all(c.s, 'report-schedule').filter(s => s.enabled)) {
  if (schedule.cadence === 'weekly' && weekday !== schedule.weekday || schedule.cadence === 'monthly' && Number(parts.day) !== schedule.day) continue
  const scheduledAt = zonedInstant(date, schedule.hour, zone)
  if (c.now < scheduledAt || schedule.createdAt > scheduledAt) continue
  for (const recipient of schedule.recipients) {
   // Editing a definition on the due day must never create a second delivery.
   const id = `${schedule.id}|${date}|${recipient}`
   if (find(c.s, 'report-delivery', id)) continue
   put(c.s, 'report-delivery', id, { schedule: schedule.id, scheduleRevision: schedule.revision, dashboard: schedule.dashboard, recipient,
    zone, scheduledAt, createdAt: c.now, status: 'pending', attempts: 0, deliveryId: uid(), message: null })
   ids.push(id)
  }
 }
 return ids
}
