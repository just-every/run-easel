// The planning calendar: finance sets dated tasks with owners; department
// submissions (EASEL-009) are one kind of task. Only assignees and finance
// read or complete a task. Reminders and escalations are scheduled in the
// saved company zone by calendar-dispatch.ts.
import type { Bindings } from '../auth.server'
import { requireDepartment, requireFinance, requireMember } from './access'
import { CHAT_CHANNELS, channelStatus } from './calendar-channels'
import { escalationAt, reminderAt, zonedLabel } from './calendar-time'
import type { Context } from './context'
import { departments, workspace } from './model'
import { all, choice, find, get, put, requireThat, text, uid, type Data } from './types'

export const TASK_KINDS = { 'review-headcount': 'Review headcount', 'confirm-variances': 'Confirm variance explanations', other: 'Other planning task' } as const
const DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (v: unknown) => typeof v === 'string' && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

export type CalendarTask = { id: string; source: 'calendar' | 'submission'; name: string; kind: string; department: string; owners: string[]; due: string; open: boolean; doneLabel: string; revision?: number; record: Data }

/** Every dated task: finance-set calendar tasks and requested department submissions. */
export function calendarTasks(c: Context): CalendarTask[] {
 const names = Object.fromEntries(departments(c.s).map(d => [d.id, d.name]))
 const contributors = (department: string) => all(c.s, 'member').filter(m => m.active && m.role === 'contributor' && m.departments?.includes(department)).map(m => m.email)
 const tasks: CalendarTask[] = all(c.s, 'calendar-task').map(t => ({ id: t.id, source: 'calendar', name: t.name, kind: t.kind, department: t.department, owners: [t.owner], due: t.due, open: t.status === 'open', doneLabel: 'Completed', revision: t.revision, record: t }))
 for (const sub of all(c.s, 'submission').filter(s => s.due && validDate(s.due))) {
  const scenario = find(c.s, 'scenario', sub.scenario)
  if (!scenario) continue
  tasks.push({ id: `submission:${sub.id}`, source: 'submission', name: `Submit department budget · ${names[sub.department] ?? sub.department} · ${scenario.name}`, kind: 'submission', department: sub.department, owners: contributors(sub.department), due: sub.due, open: ['requested', 'returned'].includes(sub.status) && scenario.status === 'working', doneLabel: sub.status === 'submitted' ? 'Submitted' : 'Budget approved', record: sub })
 }
 return tasks.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name))
}

/** Active native finance (Base owner/admin). */
export async function financeEmails(db: D1Database) {
 const { results } = await db.prepare("SELECT email FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY email").all<{ email: string }>()
 return results.map(r => r.email.toLowerCase())
}

/** Whether `email` may still own this task right now (rechecked before every send). */
export async function eligibleOwner(c: Context, task: { department: string; source: string }, email: string) {
 const native = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{ role: string }>()
 if (!native) return false
 if (!task.department) return ['owner', 'admin'].includes(native.role)
 const m = find(c.s, 'member', email)
 return !!m?.active && m.role === 'contributor' && m.departments?.includes(task.department)
}

const sees = (c: Context, task: CalendarTask) => c.x.role === 'finance' || (c.x.role === 'contributor' && task.owners.includes(c.x.actor.email) && (!task.department || c.x.departments.includes(task.department)))

export async function calendarView(c: Context, env: Bindings) {
 requireMember(c.x)
 const finance = c.x.role === 'finance', zone = workspace(c.s).timeZone ?? 'America/New_York'
 const schedule = find(c.s, 'calendar-schedule', 'main') ?? null
 const operator = schedule?.configuredBy ? await c.db.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(schedule.configuredBy.id).first() : null
 const tasks = calendarTasks(c).filter(t => sees(c, t)).map(t => ({ ...t, record: undefined, reminderAt: reminderAt(t.due, zone), reminderLabel: zonedLabel(reminderAt(t.due, zone), zone), escalationAt: escalationAt(t.due, zone), escalationLabel: zonedLabel(escalationAt(t.due, zone), zone), completedBy: t.record.completedBy ?? t.record.submittedBy ?? null, completedAt: t.record.completedAt ?? t.record.submittedAt ?? null }))
 const visible = new Set(tasks.map(t => t.id))
 const deliveries = all(c.s, 'calendar-delivery').filter(d => finance || (visible.has(d.task) && d.channel === 'email' && d.recipient === c.x.actor.email))
  .map((d): Data => ({ ...d, message: undefined, scheduledLabel: zonedLabel(d.scheduledAt, d.zone), dispatchedLabel: d.dispatchedAt ? zonedLabel(d.dispatchedAt, d.zone) : null }))
  .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || a.id.localeCompare(b.id))
 return {
  zone, tasks, deliveries, kinds: TASK_KINDS,
  schedule: schedule ? { enabled: schedule.enabled, channels: schedule.channels, revision: schedule.revision, ...(finance ? { configuredBy: schedule.configuredBy, configuredAt: schedule.configuredAt, paused: schedule.enabled && !operator ? 'The person who turned reminders on is no longer an active owner or admin; turn reminders on again.' : null } : {}) } : null,
  channels: finance ? await channelStatus(c, env) : null,
  canConnectNook: c.x.actor.baseRole === 'owner' && !c.x.actor.token,
 }
}

export async function calendar(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op === 'calendar-task-save') {
  requireFinance(c.x)
  const prior = b.id ? get(c.s, 'calendar-task', b.id, 'task') : null
  requireThat(!prior || (prior.revision === Number(b.revision) && prior.status === 'open'), prior?.status === 'done' ? 'This task is complete' : 'The task changed; reload before saving', 409)
  const kind = choice(b.kind, Object.keys(TASK_KINDS) as (keyof typeof TASK_KINDS)[], 'task kind')
  const department = b.department ? get(c.s, 'department', b.department).id : ''
  requireThat(validDate(b.due), 'Choose a valid due date')
  const owner = text(b.owner, 'Task owner', 320).toLowerCase()
  requireThat(await eligibleOwner(c, { department, source: 'calendar' }, owner), department ? 'The owner must be an active contributor assigned to this department' : 'A company-wide task is owned by active finance (an owner or admin)')
  const id = prior?.id ?? uid()
  put(c.s, 'calendar-task', id, { name: text(b.name ?? TASK_KINDS[kind], 'Task name'), kind, department, owner, due: b.due, status: 'open', revision: (prior?.revision ?? 0) + 1, createdBy: prior?.createdBy ?? c.x.actor.email, createdAt: prior?.createdAt ?? c.now, updatedBy: c.x.actor.email, updatedAt: c.now })
  c.activity.push({ action: op, record: id, detail: { kind, department, owner, due: b.due } })
  return get(c.s, 'calendar-task', id)
 }
 if (op === 'calendar-task-complete') {
  requireMember(c.x)
  const task = get(c.s, 'calendar-task', b.id, 'task')
  if (c.x.role !== 'finance') {
   requireThat(task.owner === c.x.actor.email, 'Only the task owner or finance completes this task', 403)
   if (task.department) requireDepartment(c.x, task.department)
  }
  requireThat(task.status === 'open', 'This task is already complete', 409)
  requireThat(task.revision === Number(b.revision), 'The task changed; reload before completing it', 409)
  put(c.s, 'calendar-task', task.id, { ...task, status: 'done', revision: task.revision + 1, completedBy: c.x.actor.email, completedAt: c.now })
  c.activity.push({ action: op, record: task.id, detail: { department: task.department } })
  return get(c.s, 'calendar-task', task.id)
 }
 if (op === 'calendar-schedule-save') {
  requireFinance(c.x)
  requireThat(!c.x.actor.token, 'Turn reminders on in a signed-in session; scheduled sends act for you', 403)
  const prior = find(c.s, 'calendar-schedule', 'main')
  requireThat((prior?.revision ?? 0) === Number(b.revision ?? 0), 'Reminder settings changed; reload before saving', 409)
  const channels = (Array.isArray(b.channels) ? b.channels : []).map((ch: unknown) => choice(ch, CHAT_CHANNELS, 'chat channel'))
  put(c.s, 'calendar-schedule', 'main', { enabled: b.enabled === true, channels: [...new Set(channels)], configuredBy: { id: c.x.actor.id, email: c.x.actor.email, name: c.x.actor.name }, configuredAt: c.now, revision: (prior?.revision ?? 0) + 1 })
  c.activity.push({ action: op, record: 'calendar-schedule', detail: { enabled: b.enabled === true, channels } })
  return get(c.s, 'calendar-schedule', 'main')
 }
 if (op === 'calendar-delivery-retry') {
  requireFinance(c.x)
  const d = get(c.s, 'calendar-delivery', b.id, 'delivery')
  requireThat(d.status === 'pending' && d.attempts > 0, d.status === 'uncertain' ? 'The outcome of this send is unknown; it is never retried automatically or blindly' : 'Only a refused or unconfigured send can be retried', 409)
  c.activity.push({ action: op, record: d.id, detail: { channel: d.channel } })
  return d
 }
 return undefined
}
