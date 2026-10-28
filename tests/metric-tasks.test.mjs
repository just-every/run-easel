import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { seedParallelMonth } from './parallel-month-fixture.mjs'

const list = '/api/easel/metric-tasks'
test('CYCLE-002, CYCLE-008 closed-month overspend and runway create cited assigned tasks on refresh/close, deduplicate open work and enforce live authority', async t => {
 const h = await harness(); t.after(() => h.close())
 let planner, other, viewer, rule, body, elsewhere
 const f = await seedParallelMonth(h.command, p => h.get(`/api/easel/${p}`), (op, b) => h.kit('actuals', op, b), {
  beforeActuals: async ({ department }) => {
   planner = await h.person('planner@example.test', 'contributor', [department.id])
   elsewhere = await h.command('department', { name: 'Elsewhere' })
   other = await h.person('other@example.test', 'contributor', [elsewhere.id])
   viewer = await h.person('viewer@example.test', 'viewer')
   body = { name: 'Investigate delivery overspend', kind: 'overspend', department: department.id, owner: 'planner@example.test', dueDays: 3, enabled: true, percent: '10', amount: '5' }
   for (const cookie of [planner, other, viewer]) {
    await h.command('metric-rule-save', body, cookie, 403)
    await h.command('metric-refresh', {}, cookie, 403)
   }
   await h.command('metric-rule-save', { ...body, owner: 'other@example.test' }, h.owner, 400)
   await h.command('metric-rule-save', { ...body, owner: 'viewer@example.test' }, h.owner, 400)
   rule = await h.command('metric-rule-save', body)
   assert.deepEqual((await h.get(list)).tasks, [])
  },
  beforeClose: async () => assert.deepEqual((await h.get(list)).tasks, [], 'open months do not trigger closed-month rules'),
 })
 let v = await h.get(list)
 assert.equal(v.tasks.length, 1)
 const task = v.tasks[0]
 assert.equal(task.owner, body.owner); assert.equal(task.rule, rule.id); assert.equal(task.month, '2026-01'); assert.equal(task.status, 'open')
 const due = new Date(task.createdAt); due.setUTCDate(due.getUTCDate() + 3)
 assert.equal(task.due, due.toISOString().slice(0, 10))
 assert.deepEqual([task.evidence.actual, task.evidence.budget, task.evidence.variance, task.evidence.percentBps, task.evidence.minimumCents], [45000, 40000, 5000, 1000, 500])
 assert.match(task.evidence.summary, /450.00.*400.00.*50.00/)
 assert.ok(task.evidence.sources.some(s => s.includes('closed-january.csv') && s.includes('SHA-256')))
 assert.ok(task.evidence.budgetSnapshot); assert.ok(task.evidence.budgetSha256)
 assert.deepEqual((await h.get(list, planner)).tasks, [task]); assert.deepEqual((await h.get(list, planner)).rules, [])
 assert.deepEqual(await h.get(list, other), { rules: [], tasks: [] })
 assert.deepEqual(await h.get(list, viewer), { rules: [], tasks: [] })
 for (let i = 0; i < 2; i++) assert.deepEqual((await h.command('metric-refresh', {})).created, [])
 assert.equal((await h.get(list)).tasks.length, 1)
 await h.command('metric-task-complete', { id: task.id, revision: task.revision }, other, 404)
 await h.command('metric-task-complete', { id: task.id, revision: task.revision }, viewer, 404)
 await h.command('metric-task-complete', { id: task.id, revision: 999 }, planner, 409)
 await h.command('metric-rule-save', { ...body, id: rule.id, revision: 999 }, h.owner, 409)
 // Equality meets the threshold: it must exceed BOTH, not either.
 for (const patch of [{ percent: '12.5' }, { amount: '50' }]) {
  const r = await h.command('metric-rule-save', { ...body, ...patch, name: 'Boundary rule' })
  assert.equal((await h.get(list)).tasks.filter(t => t.rule === r.id).length, 0)
  await h.command('metric-rule-save', { ...body, ...patch, id: r.id, revision: r.revision, enabled: false })
 }
 // A later accepted correcting file automatically evaluates the closed month,
 // but the existing open task keeps its original evidence and owner/due date.
 const correction = { filename: 'late-adjustment.csv', csv: 'Date,Account,Department,Amount\n2026-01-02,500,Consulting,10\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const cp = await h.kit('actuals', 'preview', correction)
 await h.kit('actuals', 'commit', { ...correction, fingerprint: cp.fingerprint })
 assert.deepEqual((await h.get(list)).tasks, [task])
 await h.command('member', { email: body.owner, name: 'Planner', role: 'contributor', departments: [f.department.id], active: false })
 await h.get(list, planner, 403)
 const blocked = await h.command('metric-refresh', {})
 assert.ok(blocked.blocked.some(b => b.rule === rule.id && /owner/.test(b.reason)))
 await h.command('member', { email: body.owner, name: 'Planner', role: 'contributor', departments: [f.department.id], active: true })
 await h.command('member', { email: body.owner, name: 'Planner', role: 'contributor', departments: [elsewhere.id], active: true })
 assert.deepEqual(await h.get(list, planner), { rules: [], tasks: [] })
 await h.command('metric-task-complete', { id: task.id, revision: task.revision }, planner, 404)
 await h.command('member', { email: body.owner, name: 'Planner', role: 'contributor', departments: [f.department.id], active: true })
 const done = await h.command('metric-task-complete', { id: task.id, revision: task.revision }, planner)
 assert.equal(done.status, 'done'); assert.equal(done.completedBy, body.owner); assert.ok(Date.parse(done.completedAt))
 await h.command('metric-task-complete', { id: task.id, revision: done.revision }, planner, 409)
 const recheck = await h.command('metric-refresh', {})
 assert.equal(recheck.created.length, 1, 'completed work may trigger a new task on a later check')
 assert.equal((await h.get(list)).tasks.find(t => t.id === recheck.created[0]).evidence.actual, 46000)
 // Runway uses the same exact unrounded ratio as cash-health; non-burning
 // positive cash does not trigger, then a lower-revenue downside does.
 const forecast = (await h.get('/api/easel/state')).scenarios.find(s => s.kind === 'forecast')
 await h.command('scenario-cash', { scenario: forecast.id, basis: 'estimate', opening: '100', collectionLag: 0, paymentLag: 0 })
 const rv = { name: 'Review runway', kind: 'runway', owner: 'owner@example.test', runway: '12', dueDays: 0, enabled: true }
 let rr = await h.command('metric-rule-save', rv)
 assert.equal((await h.get(list)).tasks.filter(t => t.rule === rr.id).length, 0)
 await h.command('revenue', { ...f.driver, id: f.input.id, scenario: forecast.id, rate: '0' })
 const run = await h.command('metric-refresh', {})
 assert.equal(run.created.length, 1)
 v = await h.get(list)
 const runwayTask = v.tasks.find(t => t.rule === rr.id)
 assert.ok(runwayTask); assert.equal(runwayTask.owner, 'owner@example.test'); assert.equal(runwayTask.due, runwayTask.createdAt.slice(0, 10))
 assert.equal(runwayTask.month, '2026-03', 'February has nonpositive trailing burn; March is the first future breach')
 const e = runwayTask.evidence
 assert.deepEqual([e.closing, e.trailingNetBurnCents, e.trailingMonths, e.runwayHundredths], [-26000, 36000, 3, -217])
 assert.ok(BigInt(e.closing) * BigInt(e.trailingMonths * 100) < BigInt(e.thresholdHundredths) * BigInt(e.trailingNetBurnCents))
 assert.match(e.summary, /closing cash.*net burn.*below/)
 assert.deepEqual((await h.command('metric-refresh', {})).created, [])
 assert.equal((await h.get(list, planner)).tasks.some(t => t.rule === rr.id), false)
 rr = await h.command('metric-rule-save', { ...rv, id: rr.id, revision: rr.revision, enabled: false })
 assert.equal(rr.enabled, false)
 await h.command('department-map', { source: 'Elsewhere', department: elsewhere.id })
 const zr = await h.command('metric-rule-save', { ...body, department: elsewhere.id, owner: 'other@example.test', name: 'Unbudgeted spend', amount: '0' })
 assert.equal((await h.get(list)).tasks.filter(t => t.rule === zr.id).length, 0)
 const zeroBudget = { ...correction, filename: 'unbudgeted.csv', csv: 'Date,Account,Department,Amount\n2026-01-03,500,Elsewhere,100\n' }
 const zp = await h.kit('actuals', 'preview', zeroBudget)
 await h.kit('actuals', 'commit', { ...zeroBudget, fingerprint: zp.fingerprint })
 const zt = (await h.get(list)).tasks.find(t => t.rule === zr.id)
 assert.deepEqual([zt.evidence.actual, zt.evidence.budget, zt.evidence.variance], [10000, 0, 10000])
 // Source problems remain blocked; no zero-valued conclusion or new task.
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'EUR', fiscalYearStart: 1, planStart: '2026-01' })
 assert.ok((await h.command('metric-refresh', {})).blocked.some(b => b.rule === rule.id && /currency/.test(b.reason)))
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const mapped = await h.command('account-rule', { match: 'prefix', from: '599', target: f.costs.id })
 const mappedFile = { ...correction, filename: 'ruled-account.csv', csv: 'Date,Account,Department,Amount\n2026-01-04,599,Consulting,0\n' }
 let mp = await h.kit('actuals', 'preview', mappedFile)
 await h.kit('actuals', 'commit', { ...mappedFile, fingerprint: mp.fingerprint })
 await h.command('account-rule-delete', { id: mapped.id })
 const unresolved = await h.command('metric-refresh', {})
 assert.deepEqual(unresolved.created, [])
 assert.ok(unresolved.blocked.some(b => /reconciliation blocked.*599/.test(b.reason)))
 await h.command('account-rule', { match: 'prefix', from: '599', target: f.costs.id })
 const many = { ...correction, filename: 'multi-batch.csv', csv: 'Date,Account,Department,Amount,Reference\n' + Array.from({ length: 201 }, (_, i) => `2026-01-05,500,Consulting,0,row-${i}\n`).join(''), columns: { ...correction.columns, reference: 'Reference' } }
 mp = await h.kit('actuals', 'preview', many)
 const pending = await h.kit('actuals', 'commit', { ...many, fingerprint: mp.fingerprint })
 assert.equal(pending.batch.status, 'importing')
 assert.ok((await h.command('metric-refresh', {})).blocked.some(b => /in-progress/.test(b.reason)))
 let continued = pending
 for (let i = 0; i < 5 && continued.batch.status === 'importing'; i++) continued = await h.kit('actuals', 'resume', { id: pending.batch.id })
 assert.equal(continued.batch.status, 'accepted')
 const recovered = await h.command('metric-refresh', {})
 assert.equal(recovered.blocked.length, 0, JSON.stringify(recovered))
 const rest = { ...correction, filename: 'later-months.csv', csv: 'Date,Account,Department,Amount\n' + Array.from({ length: 12 }, (_, i) => `${i === 11 ? '2027-01' : `2026-${String(i + 2).padStart(2, '0')}`}-01,500,Consulting,0\n`).join('') }
 mp = await h.kit('actuals', 'preview', rest)
 await h.kit('actuals', 'commit', { ...rest, fingerprint: mp.fingerprint })
 await h.command('forecast-window', { scenario: forecast.id, revision: (await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision, months: 18 })
 for (let i = 0; i < 12; i++) await h.command('close-month', { scenario: forecast.id, month: i === 11 ? '2027-01' : `2026-${String(i + 2).padStart(2, '0')}` })
 assert.ok((await h.command('metric-refresh', {})).blocked.some(b => /no approved budget period/.test(b.reason)))
 const events = await h.get(`/api/easel/activity?record=${task.id}`)
 assert.ok(events.some(e => e.action === 'metric-task-created'))
 assert.ok(events.some(e => e.action === 'metric-task-complete' && e.actor === body.owner))
})
