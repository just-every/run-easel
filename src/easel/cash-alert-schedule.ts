// The daily scheduled cash alert check (REPORT-006) at 08:00 in the saved
// company zone, daylight saving included. The cron run acts as
// scheduler:cash-alerts for the still-active owner/admin who most recently
// saved an enabled rule; it records the check with its scheduled and actual
// times and may only change rules' check state, alerts and notifications.
import type { Bindings } from '../auth.server'
import { access } from './access'
import { evaluateCashAlerts, zoneDate } from './cash-alert-check'
import { zonedInstant, zonedLabel } from './calendar-time'
import type { Context } from './context'
import { workspace } from './model'
import { deliverNotifications } from './notify-dispatch'
import { load, save } from './store'
import { currentTime } from './time'
import { all, find, put, requireThat, type Actor } from './types'

export const CHECK_HOUR = 8
type Saved = Context & { revision: number; before: Context['s'] }

export async function runCashAlertSchedule(env: Bindings) {
 const db = env.DB, { state } = await load(db)
 const rules = all(state, 'cash-alert-rule').filter(r => r.enabled).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
 let operator: any = null
 for (const rule of rules) {
  operator = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(rule.updatedBy).first<any>()
  if (operator) break
 }
 if (!operator) return { checked: false }
 const actor: Actor = { id: operator.id, email: 'scheduler:cash-alerts', name: operator.display_name, session: '', version: operator.version, baseRole: operator.role, scheduler: { operator: operator.id, email: operator.email } }
 const open = async (): Promise<Saved> => { const { state, revision } = await load(db); return { s: state, before: new Map(state), revision, x: access(state, actor), db, activity: [], snapshots: [], now: await currentTime(env) } }
 const commit = async (ctx: Saved) => {
  const changed = [...ctx.s].filter(([k, r]) => ctx.before.get(k)?.revision !== r.revision).map(([, r]) => r.kind)
  requireThat(changed.every(k => ['cash-alert-rule', 'cash-alert', 'cash-alert-check', 'notification'].includes(k)) && [...ctx.before.keys()].every(k => ctx.s.has(k)), 'The scheduler only records cash alert checks and their notifications', 500)
  if (changed.length || ctx.activity.length) await save(db, actor, ctx.before, ctx.s, ctx.revision, ctx.activity)
 }
 const c = await open(), zone = workspace(c.s).timeZone ?? 'America/New_York'
 const today = zoneDate(c.now, zone), scheduledAt = zonedInstant(today, CHECK_HOUR, zone)
 if (c.now < scheduledAt || find(c.s, 'cash-alert-check', today)) return { checked: false }
 const result = await evaluateCashAlerts(c, { cause: `scheduled check for ${zonedLabel(scheduledAt, zone)}` })
 put(c.s, 'cash-alert-check', today, { date: today, zone, scheduledAt, ranAt: c.now, sent: result.sent, blocked: result.blocked })
 c.activity.push({ action: 'cash-alert-scheduled-check', record: today, detail: { zone, scheduledAt, ranAt: c.now, sent: result.sent.length } })
 await commit(c)
 await deliverNotifications(result.notifications, env, open, commit)
 return { checked: true, sent: result.sent.length }
}
