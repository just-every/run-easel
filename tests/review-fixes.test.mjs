import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { restoreFlow } from './restore-flow.mjs'

async function plan(t) {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Review fixes', currency: 'AUD', fiscalYearStart: 7, planStart: '2026-07' })
 const sales = await h.command('department', { name: 'Sales' }), engineering = await h.command('department', { name: 'Engineering' })
 const salary = await h.command('line', { name: 'Salary', type: 'operating-expense', payroll: true })
 const cloud = await h.command('line', { name: 'Cloud', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '500000', paymentLag: 1 })
 const position = await h.command('position', { scenario: budget.id, department: sales.id, line: salary.id, title: 'Sales lead', holder: 'Private salary', annualSalary: '180000', onCostPercent: '12', start: '2026-07' })
 await h.command('account-map', { account: '100', target: cloud.id })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 const body = { filename: 'actuals.csv', csv: 'Date,Account,Department,Amount\n2026-07-01,100,Sales,123.45\n2026-07-02,100,Sales,234.56\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD' }
 const approve = async () => h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 return { ...h, sales, engineering, salary, cloud, budget, position, body, approve }
}
const ledger = async h => {
 const rows = await h.db.batch(['e_records', 'e_actuals', 'ik_jobs'].map(table => h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)))
 return rows.map(r => r.results)
}

test('removed, demoted and rescoped authors cannot submit with their existing native session', async t => {
 const h = await plan(t), { forecast } = await h.approve()
 const email = 'sales@example.test', cookie = await h.person(email, 'contributor', [h.sales.id])
 const p = await h.command('proposal-create', { from: forecast.id, name: 'Delay hiring', request: 'Move the Sales hire' }, cookie)
 const position = (await h.get(`/api/easel/scenario/${p.id}`, cookie)).inputs.position[0]
 await h.command('position', { ...position, start: '2026-08', annualSalary: '180000', onCostPercent: '12' }, cookie)
 for (const grant of [{ role: 'contributor', departments: [h.sales.id], active: false }, { role: 'viewer' }, { role: 'contributor', departments: [h.engineering.id] }]) {
  await h.command('member', { email, name: 'Sales', ...grant })
  const before = await ledger(h)
  const denied = await h.command('proposal-submit', { id: p.id }, cookie, 403)
  assert.equal(denied.cash, undefined)
  assert.deepEqual(await ledger(h), before)
  const state = await h.get('/api/easel/state', cookie)
  if (grant.active === false || grant.role === 'viewer') {
   assert.ok(!state.scenarios?.some(s => s.id === p.id))
   await h.get(`/api/easel/scenario/${p.id}`, cookie, grant.active === false ? 403 : 404)
  }
 }
 await h.command('member', { email, name: 'Sales', role: 'contributor', departments: [h.sales.id] })
 assert.equal((await h.command('proposal-submit', { id: p.id }, cookie)).proposalStatus, 'submitted')
})

test('approved budget and comparison retain saved arithmetic and metadata under live role filtering', async t => {
 const h = await plan(t), approved = await h.approve()
 const before = await h.get(`/api/easel/scenario/${h.budget.id}`)
 const forecast = await h.get(`/api/easel/scenario/${approved.forecast.id}`)
 await h.command('position', { ...forecast.inputs.position[0], annualSalary: '192000', onCostPercent: '12' })
 const checkComparison = async (working, currencyComparable) => {
  for (const [left, right] of [[before, working], [working, before]]) {
   const cmp = await h.get(`/api/easel/compare?a=${left.scenario.id}&b=${right.scenario.id}`)
   assert.equal(cmp.currencyComparable, currencyComparable)
   for (const [side, view] of [[cmp.left, left], [cmp.right, right]]) {
    assert.deepEqual(side, { scenario: view.scenario, workspace: view.workspace, lines: view.lines, departments: view.departments, profit: view.calculation.profit, cash: view.calculation.cash })
   }
   assert.ok(cmp.changedCells.length > 0)
   for (const cell of cmp.changedCells) {
    const amount = view => view.calculation.cells.find(c => c.line === cell.line && c.department === cell.department && c.month === cell.month)?.amount ?? 0
    assert.equal(cell.before, amount(left))
    assert.equal(cell.after, amount(right))
    assert.equal(cell.difference, currencyComparable ? amount(right) - amount(left) : null)
   }
  }
 }
 const revised = await h.get(`/api/easel/scenario/${approved.forecast.id}`)
 await checkComparison(revised, true)
 await h.command('line', { ...h.salary, name: 'Renamed payroll', payroll: false })
 await h.command('department', { ...h.sales, name: 'Renamed Sales' })
 await h.command('workspace', { name: 'Renamed company', currency: 'USD', fiscalYearStart: 7, planStart: '2026-07' })
 const after = await h.get(`/api/easel/scenario/${h.budget.id}`)
 assert.deepEqual(after, before)
 const working = await h.get(`/api/easel/scenario/${approved.forecast.id}`)
 assert.notDeepEqual(working.calculation.cash, before.calculation.cash)
 assert.notDeepEqual(working.calculation.cash, revised.calculation.cash)
 await checkComparison(working, false)
 const email = 'reader@example.test', cookie = await h.person(email, 'contributor', [h.sales.id])
 assert.equal((await h.get(`/api/easel/scenario/${h.budget.id}`, cookie)).inputs.position.length, 1)
 await h.command('member', { email, name: 'Reader', role: 'viewer' })
 const filtered = await h.get(`/api/easel/scenario/${h.budget.id}`, cookie)
 assert.deepEqual(filtered.inputs.position, [])
 assert.ok(!JSON.stringify(filtered).includes('Private salary'))
 assert.deepEqual(filtered.calculation.cash, before.calculation.cash)
 assert.deepEqual((await h.get(`/api/easel/snapshot/${approved.snapshot}`, cookie)).body.inputs.position, [])
})

test('a different current finance operator undoes the importer journal and preserves edited rows', async t => {
 const h = await plan(t), finance = await h.person('finance@example.test', 'finance')
 const contributor = await h.person('sales@example.test', 'contributor', [h.sales.id])
 const p = await h.kit('actuals', 'preview', h.body), done = await h.kit('actuals', 'commit', { ...h.body, fingerprint: p.fingerprint })
 const job = await h.db.prepare('SELECT principal_id FROM ik_jobs WHERE id=?').bind(done.job.id).first()
 // Represent a subsequent native edit at the network edge; undo must retain it.
 const edited = await h.db.prepare('SELECT * FROM e_actuals ORDER BY row_no LIMIT 1').first()
 const value = { ...JSON.parse(edited.value), amount: 999 }
 await h.db.prepare('UPDATE e_actuals SET revision=?,value=?,amount=? WHERE id=?').bind(crypto.randomUUID(), JSON.stringify(value), value.amount, edited.id).run()
 const before = await ledger(h)
 await h.kit('actuals', 'undo', { id: done.batch.id }, contributor, 403)
 assert.deepEqual(await ledger(h), before)
 const undone = await h.kit('actuals', 'undo', { id: done.batch.id }, finance)
 assert.equal(undone.batch.status, 'undone')
 assert.equal(undone.batch.createdBy, 'owner@example.test')
 assert.equal(undone.batch.undoneBy, 'finance@example.test')
 assert.deepEqual(await h.db.prepare('SELECT principal_id FROM ik_jobs WHERE id=?').bind(done.job.id).first(), job)
 assert.deepEqual((await h.db.prepare('SELECT id,amount FROM e_actuals').all()).results, [{ id: edited.id, amount: 999 }])
 assert.equal((await h.kit('actuals', 'status', { id: done.batch.id }, finance)).job.state, 'undone')
 const operator = await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('finance@example.test').first()
 assert.equal((await h.send('/auth/operator/role', { operatorId: operator.id, role: 'member' }, h.owner)).status, 200)
 // Native role changes revoke the old native session as well.
 await h.get('/api/easel/state', finance, 401)
 await h.kit('actuals', 'status', { id: done.batch.id }, finance, 401)
 await h.kit('actuals', 'undo', { id: done.batch.id }, finance, 401)
})

test('actuals commit refuses stale account, department and reviewed metadata mappings without writes', async t => {
 const h = await plan(t)
 for (const mutate of [
  () => h.command('account-map', { account: '100', target: h.salary.id }),
  () => h.command('department-map', { source: 'Sales', department: h.engineering.id }),
  () => h.command('line', { ...h.salary, name: 'New reviewed label', payroll: false }),
 ]) {
  const p = await h.kit('actuals', 'preview', h.body)
  await mutate()
  const before = await ledger(h)
  await h.kit('actuals', 'commit', { ...h.body, fingerprint: p.fingerprint }, h.owner, 409)
  assert.deepEqual(await ledger(h), before)
 }
 const p = await h.kit('actuals', 'preview', h.body)
 assert.equal((await h.kit('actuals', 'commit', { ...h.body, fingerprint: p.fingerprint })).batch.status, 'accepted')
})

test('real rer import validates immutable contents and reference revisions before atomic restore', async t => {
 const h = await plan(t), approved = await h.approve()
 const p = await h.kit('actuals', 'preview', h.body)
 await h.kit('actuals', 'commit', { ...h.body, fingerprint: p.fingerprint })
 await h.command('close-month', { scenario: approved.forecast.id, month: '2026-07' })
 await h.command('expense', { scenario: approved.forecast.id, department: h.sales.id, line: h.cloud.id, name: 'Next month', kind: 'one-off', amount: '500', start: '2026-08' })
 const pack = await h.command('pack-create', { month: '2026-07' })
 await h.command('pack-publish', { pack: pack.id })
 await restoreFlow(h)
})
