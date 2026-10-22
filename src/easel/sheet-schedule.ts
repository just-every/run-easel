// Saved schedules confer a narrow standing action: read a source and submit a
// native proposal. Every job reloads authority and saves through the normal fence.
import { runtimeBindings, type Bindings } from '../auth.server'
import { access } from './access'
import { zonedInstant } from './calendar-time'
import type { Context } from './context'
import { workspace } from './model'
import { sheetAuthority } from './sheet-connection'
import { pullSheetLink, sheetLinkFailure } from './sheet-links'
import { versionStructure } from './structure-versions'
import { load, save } from './store'
import { currentTime } from './time'
import { all, Fault, find, type Actor, type Data, type State } from './types'

/** Daily runs use company wall time; hourly runs use elapsed UTC hours. No catch-up storm. */
export function sheetScheduleDue(s: State, link: Data, now: string) {
 if (!link.enabled) return null
 let key: string, scheduledAt: string
 if (link.cadence === 'hourly') {
  scheduledAt = `${now.slice(0, 13)}:00:00.000Z`
  key = `hourly|${scheduledAt}`
 } else {
  const zone = workspace(s).timeZone ?? 'America/New_York'
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]))
  const date = `${p.year}-${p.month}-${p.day}`
  scheduledAt = zonedInstant(date, link.hour, zone)
  key = `daily|${date}`
 }
 if (now < scheduledAt || link.updatedAt > scheduledAt || link.lastRun === key) return null
 return { key, scheduledAt }
}

async function nativeOperator(db: D1Database, id: string) {
 return db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(id).first<any>()
}

function schedulerActor(native: any): Actor {
 return { id: native.id, email: native.email, name: native.display_name, baseRole: native.role, version: native.version, session: '', scheduler: { operator: native.id, email: native.email } }
}

export async function runSheetSchedules(original: Bindings) {
 const env = runtimeBindings(original)
 const initial = await load(env.DB), ids = all(initial.state, 'sheet-link').filter(link => link.enabled).map(link => link.id)
 let pulled = 0, blocked = 0
 for (const id of ids) {
  const { state, revision } = await load(env.DB), link = find(state, 'sheet-link', id), now = await currentTime(env)
  if (!link) continue
  const run = sheetScheduleDue(state, link, now)
  if (!run) continue
  let native = await nativeOperator(env.DB, link.ownerId)
  let ownerError: Fault | null = null
  if (!native || native.email !== link.owner) {
   ownerError = new Fault(403, 'The schedule owner no longer has an active native finance account; finance must review and save the link again.')
   // A surviving finance account may record the failure, never read the source
   // or create a proposal on behalf of the former owner.
   native = await env.DB.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY id LIMIT 1").first<any>()
   if (!native) { blocked++; continue }
  }
  const actor = schedulerActor(native), before = new Map(state)
  const c: Context = { db: env.DB, s: state, x: access(state, actor), now, activity: [], snapshots: [] }
  try { if (!ownerError) sheetAuthority(c) }
  catch { ownerError = new Fault(403, 'The schedule owner no longer has current finance, connections and Pay permissions; finance must review and save the link again.') }
  if (ownerError) { sheetLinkFailure(c, link, ownerError, run); blocked++ }
  else { const result = await pullSheetLink(c, env, id, run); if (result.error) blocked++; else pulled++ }
  // store.authority checks native scheduler existence. Bind its exact account
  // version/email too, so a changed operator cannot complete an in-flight job.
  const guard = env.DB.prepare("INSERT INTO e_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND version=? AND role=? AND status='active') THEN 1 ELSE 0 END")
   .bind(actor.id, actor.email, actor.version, actor.baseRole)
  await versionStructure(c, before, revision)
  await save(env.DB, actor, before, c.s, revision, c.activity, c.snapshots, true, [guard, ...(c.extra ?? [])], c.now)
 }
 return { pulled, blocked }
}
