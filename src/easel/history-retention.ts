// The model is read whole by every request and scheduled run, so records that
// only log finished deliveries and checks must not pile up for ever. Once a day
// the cron removes the ones that no longer decide anything: delivered or
// finally failed, older than RETENTION_DAYS, and not needed to stop a repeat
// (a delivery for a still-open calendar task stays, because it is what keeps
// an escalation from being sent again). Each removal is a normal audited save,
// so the removed values stay in the activity log.
import type { Bindings } from '../auth.server'
import { calendarTasks } from './calendar'
import type { Context } from './context'
import { load, save, type Reader } from './store'
import { currentTime } from './time'
import { all, type Actor, type Data, type State } from './types'

export const RETENTION_DAYS = 60
/** The cash alert page lists the newest 14 daily checks; older ones are never read. */
export const CASH_CHECKS_KEPT = 14
const DONE = {
 notification: ['accepted', 'suppressed', 'uncertain', 'blocked', 'digested', 'native-only'],
 'notification-digest': ['accepted', 'suppressed', 'uncertain', 'blocked'],
 'calendar-delivery': ['accepted', 'suppressed', 'uncertain', 'blocked', 'canceled'],
 'report-delivery': ['accepted', 'uncertain'],
 'bi-drop-run': ['saved'],
 'mission-run': ['completed', 'stale', 'blocked'],
} as const
/** Which field dates each kind of record. */
const DATED = { notification: 'createdAt', 'notification-digest': 'scheduledAt', 'calendar-delivery': 'scheduledAt', 'report-delivery': 'scheduledAt', 'mobile-push-delivery': 'createdAt', 'bi-drop-run': 'scheduledAt', 'mission-run': 'createdAt' } as const

/** The `[kind, id]` of every record that history retention removes at `now`. */
export function expiredHistory(s: State, now: string): [string, string][] {
 const cutoff = new Date(Date.parse(now) - RETENTION_DAYS * 86400000).toISOString()
 const expired: [string, string][] = []
 let openTasks: Set<string> | null = null
 for (const [kind, field] of Object.entries(DATED)) for (const r of all(s, kind)) {
  const done = kind === 'mobile-push-delivery' ? !['pending', 'sending'].includes(r.status) : (DONE[kind as keyof typeof DONE] as readonly string[]).includes(r.status) || (kind === 'bi-drop-run' && r.attempts >= 3)
  if (!done || typeof r[field] !== 'string' || r[field] >= cutoff) continue
  if (kind === 'calendar-delivery') openTasks ??= new Set(calendarTasks({ s } as Context).filter(t => t.open).map(t => t.id))
  if (kind === 'calendar-delivery' && openTasks!.has(r.task)) continue
  expired.push([kind, r.id])
 }
 for (const r of all(s, 'cash-alert-check').sort((a: Data, b: Data) => b.date.localeCompare(a.date)).slice(CASH_CHECKS_KEPT)) expired.push(['cash-alert-check', r.id])
 return expired
}

const marker = "SELECT at FROM e_activity WHERE action='history-pruned' AND json_extract(detail,'$.kind')='history-prune' ORDER BY seq DESC LIMIT 1"

/** Once per UTC day, acting as the first active owner/admin, like the other schedulers. */
export async function runHistoryRetention(env: Bindings, read: Reader = () => load(env.DB)) {
 const db = env.DB, now = await currentTime(env)
 const last = await db.prepare(marker).first<{ at: string }>()
 if (last && last.at.slice(0, 10) === now.slice(0, 10)) return { removed: 0 }
 const operator = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY id LIMIT 1").first<any>()
 if (!operator) return { removed: 0 }
 const actor: Actor = { id: operator.id, email: 'scheduler:retention', name: operator.display_name, session: '', version: operator.version, baseRole: operator.role, scheduler: { operator: operator.id, email: operator.email } }
 const { state, revision } = await read(), after = new Map(state), removed: Record<string, number> = {}
 for (const [kind, id] of expiredHistory(state, now)) { after.delete(`${kind}:${id}`); removed[kind] = (removed[kind] ?? 0) + 1 }
 await save(db, actor, state, after, revision, [{ action: 'history-pruned', record: 'history', detail: { kind: 'history-prune', retentionDays: RETENTION_DAYS, removed } }], [], false, [], now)
 return { removed: Object.values(removed).reduce((n, v) => n + v, 0) }
}
