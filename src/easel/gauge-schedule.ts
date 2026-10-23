import { runtimeBindings, type Bindings } from '../auth.server'
import { access } from './access'
import { zonedInstant, addDays } from './calendar-time'
import type { Context } from './context'
import { connectionAuthority, gaugeObservationAuthority } from './gauge-connection'
import { gaugeCheck } from './gauge-check'
import { workspace } from './model'
import { month } from './months'
import { deliverNotifications } from './notify-dispatch'
import { load, save, readFence } from './store'
import { currentTime } from './time'
import { all, choice, find, get, put, requireThat, type Actor, type Data, type State } from './types'

export function gaugeSchedule(c: Context, b: Data) {
 connectionAuthority(c)
 requireThat(!c.x.actor.scheduler, 'Use native finance to change a refresh schedule', 403)
 const connection = get(c.s, 'connection', 'gauge')
 requireThat(connection.connected, 'Connect Gauge before saving a schedule', 409)
 const cadence = choice(b.cadence, ['manual', 'hourly', 'nightly', 'weekly'] as const, 'refresh schedule')
 requireThat(cadence === 'manual' || b.consent === true, 'Approve scheduled read-only Gauge observations')
 const period = month(b.month, 'Scheduled observation month')
 const schedule = { cadence, month: period, owner: c.x.actor.email, ownerId: c.x.actor.id, savedAt: c.now }
 put(c.s, 'connection', 'gauge', { ...connection, refreshSchedule: schedule })
 c.activity.push({ action: 'gauge-schedule-saved', record: 'gauge', detail: schedule })
}

export function gaugeDue(s: State, schedule: Data, now: string) {
 if (schedule.cadence === 'manual') return null
 const zone = workspace(s).timeZone ?? ['America', 'New_York'].join('/')
 let scheduledAt: string
 if (schedule.cadence === 'hourly') scheduledAt = `${now.slice(0, 13)}:00:00.000Z`
 else {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]))
  let date = `${p.year}-${p.month}-${p.day}`
  if (schedule.cadence === 'weekly') date = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7))
  scheduledAt = zonedInstant(date, 3, zone)
 }
 if (now < scheduledAt || schedule.savedAt > scheduledAt || schedule.lastRun === scheduledAt) return null
 return { scheduledAt, zone }
}

export function gaugeStale(connection: Data, now: string) {
 const cadence = connection.refreshSchedule?.cadence ?? 'manual'
 const maxAge = { hourly: 3600000, nightly: 90000000, weekly: 608400000, manual: 86400000 }[cadence as 'hourly'] ?? 86400000
 const age = Date.parse(now) - Date.parse(connection.lastRefresh ?? '')
 return !!connection.error || !Number.isFinite(age) || age < 0 || age > maxAge
}

/** Reserve each occurrence before reading. Lost or unknown attempts never retry automatically. */
export async function runGaugeSchedule(original: Bindings) {
 const env = runtimeBindings(original), initial = await load(env.DB)
 const connection = find(initial.state, 'connection', 'gauge'), schedule = connection?.refreshSchedule
 if (!connection?.connected || !schedule || schedule.cadence === 'manual') return
 const native = await env.DB.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE id=? AND email=? AND status='active' AND role IN ('owner','admin')").bind(schedule.ownerId, schedule.owner).first<any>()
 if (!native) return
 const actor: Actor = { id: native.id, email: native.email, name: native.display_name, baseRole: native.role, version: native.version, session: '', scheduler: { operator: native.id, email: native.email } }
 const open = async () => { const { state, revision } = await load(env.DB); return { s: state, before: new Map(state), revision, x: access(state, actor), db: env.DB, activity: [], snapshots: [], now: await currentTime(env) } as Context & { before: State; revision: number } }
 const commit = async (c: Awaited<ReturnType<typeof open>>) => {
  const guard = env.DB.prepare("INSERT INTO e_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND version=? AND role=? AND status='active') THEN 1 ELSE 0 END").bind(actor.id, actor.email, actor.version, actor.baseRole)
  await save(env.DB, actor, c.before, c.s, c.revision, c.activity, [], true, [guard], c.now)
 }
 let c = await open()
 try { gaugeObservationAuthority(c) } catch { return }
 let row = get(c.s, 'connection', 'gauge')
 if (!row.refreshSchedule) return
 const run = gaugeDue(c.s, row.refreshSchedule, c.now)
 if (!row.connected || !run || row.refreshSchedule.ownerId !== actor.id || row.refreshSchedule.owner !== actor.email) return
 put(c.s, 'connection', 'gauge', { ...row, refreshSchedule: { ...row.refreshSchedule, lastRun: run.scheduledAt }, scheduledAt: run.scheduledAt, scheduleZone: run.zone, dispatchedAt: c.now, error: 'Scheduled observation pending; outcome not yet confirmed' })
 await commit(c)
 c = await open(); row = get(c.s, 'connection', 'gauge')
 if (!row.connected || row.refreshSchedule?.savedAt !== schedule.savedAt) return
 await readFence(c.db, actor, c.revision)
 await gaugeCheck(c, env, { month: schedule.month })
 const ids = all(c.s, 'notification').filter(n => !find(c.before, 'notification', n.id)).map(n => n.id)
 await commit(c)
 await deliverNotifications(ids, env, open, commit)
}
