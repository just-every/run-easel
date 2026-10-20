import type { Bindings } from './auth.server'
import type { Context } from './easel/context'
import { access } from './easel/access'
import { actualsCommand } from './easel/actuals'
import { cycle } from './easel/cycle'
import { calculate } from './easel/engine'
import { model } from './easel/model'
import { review } from './easel/review'
import { load, save } from './easel/store'
import { all, get, type Actor, type Data } from './easel/types'
import { addMonths } from './easel/months'
import { DEMO_CLOSED_THROUGH, DEMO_OWNER, DEMO_START, DEMO_TIMES, demoActuals, demoBudget, demoForecast, demoReforecast, demoResponses, demoSlip } from './demo-plan'

/** Real domain commands, native session fences, import journal and snapshots, each step at its moment in the story. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const db = env.DB
 const owner = await db.prepare(`SELECT o.id,o.email,o.display_name AS name,o.version,o.role AS baseRole,se.id AS session
  FROM oa_operators o JOIN oa_sessions se ON se.operator_id=o.id AND se.operator_version=o.version
  WHERE o.email=? AND o.role='owner' AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>?
  ORDER BY se.created_at DESC LIMIT 1`).bind(ownerEmail, now.getTime()).first<Actor>()
 if (!owner) throw new Error('Demo seeding requires the native owner session')
 // The owner claim names the owner "Owner"; the sample workspace is Rachel Kim's.
 if (owner.name === 'Owner') {
  await db.prepare(`UPDATE oa_operators SET display_name=? WHERE id=? AND display_name='Owner'`).bind(DEMO_OWNER, owner.id).run()
  owner.name = DEMO_OWNER
 }
 const open = async (at: string) => {
  const { state, revision } = await load(db)
  const c: Context = { s: state, x: access(state, owner), db, activity: [], snapshots: [], now: at }
  return { c, before: new Map(state), revision }
 }
 const persist = async ({ c, before, revision }: Awaited<ReturnType<typeof open>>) => save(db, owner, before, c.s, revision, c.activity, c.snapshots, true, [], c.now)
 const step = async (at: string, run: (c: Context) => Promise<unknown>) => { const current = await open(at); await run(current.c); await persist(current) }
 const forecastOf = (c: Context) => all(c.s, 'scenario').find(s => s.kind === 'forecast')!

 let current = await open(DEMO_TIMES.budget)
 if (!all(current.c.s, 'workspace').length) {
  await demoBudget(current.c)
  await persist(current)
 }
 // Actuals equal to the approved plan through August, then September as the ledger has it.
 for (const [at, months] of [[DEMO_TIMES.history, Array.from({ length: 8 }, (_, i) => addMonths(DEMO_START, i))], [DEMO_TIMES.september, [DEMO_CLOSED_THROUGH]]] as const) {
  current = await open(at)
  const forecast = forecastOf(current.c)
  const names = { line: Object.fromEntries(all(current.c.s, 'line').map(l => [l.id, l.name])), department: Object.fromEntries(all(current.c.s, 'department').map(d => [d.id, d.name])) }
  const body = demoActuals(calculate(model(current.c.s, get(current.c.s, 'scenario', forecast.parent).id)), [...months], names)
  // The import kit applies a file over as many calls as it needs: continue it until it is accepted, as Actuals does.
  for (let batch = all(current.c.s, 'batch').find(b => b.file === body.filename); batch?.status !== 'accepted'; batch = all(current.c.s, 'batch').find(b => b.file === body.filename)) {
   if (batch && batch.status !== 'importing') throw new Error(`Demo actuals ${body.filename} stopped as ${batch.status}`)
   const preview = !batch ? (await actualsCommand(current.c, 'preview', body))!.result : null
   const kit = (await actualsCommand(current.c, batch ? 'resume' : 'commit', batch ? { id: batch.id } : { ...body, fingerprint: preview!.fingerprint }))!
   await persist(current)
   const outcome = await kit.kit!()
   current = await open(at)
   kit.record!(current.c, outcome)
   await persist(current)
   current = await open(at)
  }
  for (const month of months) {
   current = await open(at)
   const working = forecastOf(current.c)
   if (working.actualsThrough && working.actualsThrough >= month) continue
   await cycle(current.c, 'close-month', { scenario: working.id, month })
   await persist(current)
  }
 }
 current = await open(DEMO_TIMES.plan2027)
 if (!all(current.c.s, 'revenue').some(r => r.kind === 'contract')) {
  await demoForecast(current.c, forecastOf(current.c).id)
  await persist(current)
 }
 current = await open(DEMO_TIMES.reforecast)
 if (!all(current.c.s, 'scenario').some(s => s.kind === 'reforecast')) await step(DEMO_TIMES.reforecast, c => demoReforecast(c, forecastOf(c).id))
 current = await open(DEMO_TIMES.pack)
 if (!all(current.c.s, 'pack').length) await step(DEMO_TIMES.pack, async c => {
  const line = all(c.s, 'line').find(l => l.name === 'Software and cloud hosting')!
  const department = all(c.s, 'department').find(d => d.name === 'Engineering')!
  const explanation: Data = { month: DEMO_CLOSED_THROUGH, line: line.id, department: department.id, text: 'AWS usage ran $420 over plan while the scheduling engine rewrite ran both stacks; Datadog and Sentry are on plan. The overlap ends in November.' }
  await review(c, 'explanation', explanation)
  await review(c, 'explanation-confirm', explanation)
  const pack = (await review(c, 'pack-create', { month: DEMO_CLOSED_THROUGH }))!
  await review(c, 'pack-decision', { pack: pack.id, text: 'Retire the old scheduling stack before the November close', owner: 'Priya Raman', due: '2026-11-20' })
  await review(c, 'pack-publish', { pack: pack.id })
 })
 current = await open(DEMO_TIMES.slip)
 if (get(current.c.s, 'revenue', all(current.c.s, 'revenue').find(r => r.kind === 'contract' && r.scenario === forecastOf(current.c).id)!.id).startDate !== '2027-03-19') await step(DEMO_TIMES.slip, c => demoSlip(c, forecastOf(c).id))
 current = await open(DEMO_TIMES.responses)
 if (!all(current.c.s, 'scenario').some(s => s.kind === 'proposal')) await step(DEMO_TIMES.responses, c => demoResponses(c, forecastOf(c).id))
 await db.prepare('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime()).run()
}
