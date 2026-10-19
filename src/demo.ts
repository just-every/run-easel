import type { Bindings } from './auth.server'
import type { Context } from './easel/context'
import { access } from './easel/access'
import { actualsCommand } from './easel/actuals'
import { cycle } from './easel/cycle'
import { review } from './easel/review'
import { load, save } from './easel/store'
import { all, get, type Actor, type Data } from './easel/types'
import { addMonths } from './easel/months'
import { demoActuals, demoPlan } from './demo-plan'

/** Real domain commands, native session fences, import journal and snapshots. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const db = env.DB
 const owner = await db.prepare(`SELECT o.id,o.email,o.display_name AS name,o.version,o.role AS baseRole,se.id AS session
  FROM oa_operators o JOIN oa_sessions se ON se.operator_id=o.id AND se.operator_version=o.version
  WHERE o.email=? AND o.role='owner' AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>?
  ORDER BY se.created_at DESC LIMIT 1`).bind(ownerEmail, now.getTime()).first<Actor>()
 if (!owner) throw new Error('Demo seeding requires the native owner session')
 // The owner claim names the owner "Owner"; the sample workspace is Jordan Ellis's.
 if (owner.name === 'Owner') {
  await db.prepare(`UPDATE oa_operators SET display_name='Jordan Ellis' WHERE id=? AND display_name='Owner'`).bind(owner.id).run()
  owner.name = 'Jordan Ellis'
 }
 const open = async () => {
  const { state, revision } = await load(db)
  const c: Context = { s: state, x: access(state, owner), db, activity: [], snapshots: [], now: now.toISOString() }
  return { c, before: new Map(state), revision }
 }
 const persist = async ({ c, before, revision }: Awaited<ReturnType<typeof open>>) => save(db, owner, before, c.s, revision, c.activity, c.snapshots, true)
 let current = await open()
 if (!all(current.c.s, 'workspace').length) {
  await demoPlan(current.c, addMonths(now.toISOString().slice(0, 7), -1))
  await persist(current)
 }
 current = await open()
 const start = get(current.c.s, 'workspace', 'main').planStart
 let batch = all(current.c.s, 'batch').find(b => b.file === `harbour-gl-${start}.csv`)
 if (!batch || batch.status !== 'accepted') {
  const body = demoActuals(start)
  const preview = !batch ? (await actualsCommand(current.c, 'preview', body))!.result : null
  const step = (await actualsCommand(current.c, batch ? 'resume' : 'commit', batch ? { id: batch.id } : { ...body, fingerprint: preview!.fingerprint }))!
  await persist(current)
  const outcome = await step.kit!()
  current = await open()
  step.record!(current.c, outcome)
  await persist(current)
 }
 current = await open()
 const forecast = all(current.c.s, 'scenario').find(s => s.kind === 'forecast')!
 if (!forecast.actualsThrough) {
  await cycle(current.c, 'close-month', { scenario: forecast.id, month: start })
  await persist(current)
 }
 current = await open()
 if (!all(current.c.s, 'pack').length) {
  const line = all(current.c.s, 'line').find(l => l.name === 'Cloud hosting')!
  const department = all(current.c.s, 'department').find(d => d.name === 'Engineering')!
  const explanation: Data = { month: start, line: line.id, department: department.id, text: 'Production usage was above plan during the platform launch. Keep the capacity reserve and revisit after next month’s usage report.' }
  await review(current.c, 'explanation', explanation)
  await review(current.c, 'explanation-confirm', explanation)
  const pack = (await review(current.c, 'pack-create', { month: start }))!
  await review(current.c, 'pack-decision', { pack: pack.id, text: 'Review hosting usage before the next capacity commitment', owner: 'Eli Morgan', due: addMonths(start, 2) + '-15' })
  await review(current.c, 'pack-publish', { pack: pack.id })
  await persist(current)
 }
 await db.prepare('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime()).run()
}
