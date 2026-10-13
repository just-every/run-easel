// One flow test per CONTRACT.md clause, through Easel's public HTTP doors on
// a real Worker and real local D1, with real native sign-in for every person.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { harness } from './harness.mjs'

const columns = { date: 'Date', account: 'Account Code', accountName: 'Account Name', department: 'Tracking - Department', debit: 'Debit', credit: 'Credit', description: 'Description', reference: 'Reference' }
const csvBody = async (file, extra = {}) => ({ csv: await readFile(`fixtures/${file}`, 'utf8'), filename: file, columns, amountMode: 'debit-credit', dateFormat: 'DD/MM/YYYY', ...extra })
const count = async (db, sql) => Number((await db.prepare(sql).first()).n)

test('Easel planning flows through native sessions, HTTP and real D1', async t => {
 const h = await harness()
 t.after(() => h.close())
 const { command: cmd, kit, get, send, db } = h
 const ids = {}, people = {}
 let budget, forecast

 const scenario = async (id, cookie) => get(`/api/easel/scenario/${id}`, cookie)
 const cell = (calc, line, dept, month) => calc.cells.find(c => c.line === line && c.department === dept && c.month === month)

 await t.test('EASEL-001 setup claims the calendar, departments, lines and roles', async () => {
  await cmd('workspace', { name: 'Harbour Analytics (fixture)', currency: 'AUD', fiscalYearStart: 7, planStart: '2026-01' }, h.owner, 400)
  const w = await cmd('workspace', { name: 'Harbour Analytics (fixture)', currency: 'AUD', fiscalYearStart: 7, planStart: '2026-07' })
  assert.equal(w.currency, 'AUD')
  for (const [name, shared] of [['Sales', false], ['Engineering', false], ['Marketing', false], ['Operations', true]]) ids[name] = (await cmd('department', { name, shared })).id
  for (const [name, type, payroll] of [['Subscription revenue', 'revenue'], ['Services revenue', 'revenue'], ['Cloud hosting', 'cost-of-sales'], ['Salaries', 'operating-expense', true], ['Software', 'operating-expense'], ['Rent', 'operating-expense'], ['Advertising', 'operating-expense'], ['Travel', 'operating-expense']]) ids[name] = (await cmd('line', { name, type, payroll: !!payroll })).id
  people.sales = await h.person('sales@example.test', 'contributor', [ids.Sales])
  people.eng = await h.person('eng@example.test', 'contributor', [ids.Engineering])
  people.board = await h.person('board@example.test', 'viewer')
  const state = await get('/api/easel/state')
  budget = state.scenarios.find(s => s.kind === 'budget')
  assert.equal(budget.name, 'FY2027 budget')
  assert.equal((await get('/api/easel/state', people.sales)).me.role, 'contributor')
  assert.deepEqual((await get('/api/easel/state', people.board)).me.departments, [])
  await cmd('department', { name: 'Sales' }, people.sales, 403)
  // A signed-in person whose membership finance has switched off sees nothing of the plan.
  await cmd('member', { email: 'board@example.test', name: 'board', role: 'viewer', active: false })
  await get(`/api/easel/scenario/${budget.id}`, people.board, 403)
  await cmd('member', { email: 'board@example.test', name: 'board', role: 'viewer' })
  await get('/api/easel/state', '', 401)
 })

 await t.test('EASEL-002 an actuals preview shows periods, signs, repeats and malformed rows and writes nothing', async () => {
  const p = await kit('actuals', 'preview', await csvBody('gl-detail-2026-07.csv'))
  assert.equal(p.rows, 16)
  assert.equal(p.accepted, 14)
  assert.deepEqual(p.rejected.map(r => r.line), [14, 15])
  assert.match(p.rejected[0].reason, /repeats line 13/)
  assert.deepEqual(p.periods.map(x => [x.period, x.rows]), [['2026-06', 1], ['2026-07', 13]])
  assert.equal(p.unmappedAccounts.length, 11)
  assert.deepEqual(p.unmappedDepartments, ['(blank)', 'Engineering', 'Marketing', 'Operations', 'Sales'])
  assert.equal(await count(db, 'SELECT COUNT(*) AS n FROM e_actuals'), 0)
  assert.equal(await count(db, 'SELECT COUNT(*) AS n FROM ik_jobs'), 0)
  await kit('actuals', 'commit', { ...(await csvBody('gl-detail-2026-07.csv')), fingerprint: p.fingerprint, acknowledgeRejected: 2 }, h.owner, 409)
  await kit('actuals', 'preview', await csvBody('gl-detail-2026-07.csv'), people.sales, 403)
 })

 await t.test('EASEL-003 mapped actuals are accepted through the journal and reconcile month by month', async () => {
  const map = { '200': 'Subscription revenue', '210': 'Services revenue', '310': 'Cloud hosting', '477': 'Salaries', '478': 'Salaries', '461': 'Software', '469': 'Rent', '400': 'Advertising', '493': 'Travel' }
  for (const [account, line] of Object.entries(map)) await cmd('account-map', { account, target: ids[line] })
  await cmd('account-map', { account: '090', target: 'cash' })
  await cmd('account-map', { account: '610', target: 'excluded' })
  for (const d of ['Sales', 'Engineering', 'Marketing', 'Operations']) await cmd('department-map', { source: d, department: ids[d] })
  await cmd('department-map', { source: '', department: '' })
  // A revenue account carrying debits is flagged before acceptance.
  const signed = await kit('actuals', 'preview', { csv: 'Date,Account,Amount\n2026-07-02,200,500.00\n', filename: 'signs.csv', columns: { date: 'Date', account: 'Account', amount: 'Amount' }, amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD' })
  assert.match(signed.accounts[0].sign, /net debit/)
  const p = await kit('actuals', 'preview', await csvBody('gl-detail-2026-07.csv'))
  assert.deepEqual([p.unmappedAccounts, p.unmappedDepartments], [[], []])
  await kit('actuals', 'commit', { ...(await csvBody('gl-detail-2026-07.csv')), fingerprint: p.fingerprint }, h.owner, 409)
  const done = await kit('actuals', 'commit', { ...(await csvBody('gl-detail-2026-07.csv')), fingerprint: p.fingerprint, acknowledgeRejected: 2 })
  assert.equal(done.batch.status, 'accepted')
  assert.equal(done.job.state, 'completed')
  assert.equal(await count(db, 'SELECT COUNT(*) AS n FROM e_actuals'), 14)
  const rec = await get('/api/easel/actuals')
  const july = rec.months.find(m => m.period === '2026-07')
  assert.equal(july.balanced, true)
  assert.equal(july.revenue, 10800000)
  assert.equal(july.costs, 12615050)
  assert.equal(july.excluded, 9600000)
  assert.equal(rec.unmapped.length, 0)
  const again = await kit('actuals', 'preview', await csvBody('gl-detail-2026-07.csv'))
  assert.equal(again.accepted, 0)
  assert.ok(again.rejected.filter(r => /already accepted/.test(r.reason)).length === 14)
  await get('/api/easel/actuals', people.sales, 403)
 })

 await t.test('EASEL-004 undo removes exactly what an accepted import wrote', async () => {
  const body = { csv: 'Date,Account Code,Tracking - Department,Debit,Credit,Description\n28/07/2026,461,Engineering,300.00,,Late invoice\n29/07/2026,493,Sales,120.00,,Taxi\n', filename: 'late-july.csv', columns: { date: 'Date', account: 'Account Code', department: 'Tracking - Department', debit: 'Debit', credit: 'Credit', description: 'Description' }, amountMode: 'debit-credit', dateFormat: 'DD/MM/YYYY' }
  const p = await kit('actuals', 'preview', body)
  const done = await kit('actuals', 'commit', { ...body, fingerprint: p.fingerprint })
  assert.equal(await count(db, 'SELECT COUNT(*) AS n FROM e_actuals'), 16)
  const undone = await kit('actuals', 'undo', { id: done.batch.id })
  assert.equal(undone.batch.status, 'undone')
  assert.equal(undone.job.state, 'undone')
  assert.equal(await count(db, 'SELECT COUNT(*) AS n FROM e_actuals'), 14)
  assert.equal(await count(db, "SELECT COUNT(*) AS n FROM e_actuals WHERE value LIKE '%Late invoice%'"), 0)
  const status = await kit('actuals', 'status', { id: done.batch.id })
  assert.equal(status.job.state, 'undone')
 })

 await t.test('EASEL-005 opening cash is labelled imported or estimate and cash follows explicit timing', async () => {
  await cmd('scenario-cash', { scenario: budget.id, basis: 'imported', receivables: '50000', payables: '20000', collectionLag: 1, paymentLag: 1 })
  let b = (await scenario(budget.id)).scenario
  assert.equal(b.cash.openingCents, 85000000)
  assert.equal(b.cash.importedFrom.rows, 1)
  await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '800000', receivables: '50000', payables: '20000', collectionLag: 1, paymentLag: 1 })
  let calc = (await scenario(budget.id)).calculation
  assert.match(calc.cash[0].trace, /is an estimate/)
  await cmd('scenario-cash', { scenario: budget.id, basis: 'imported', receivables: '50000', payables: '20000', collectionLag: 1, paymentLag: 1 })
  calc = (await scenario(budget.id)).calculation
  assert.match(calc.cash[0].trace, /imported from actuals/)
  assert.equal(calc.cash[0].opening, 85000000)
  assert.equal(calc.cash[0].collections, 5000000)
  assert.equal(calc.cash[0].payments, 2000000)
 })

 await t.test('EASEL-006 revenue drivers produce exact cells with a trace for every value', async () => {
  ids.sam = (await cmd('position', { scenario: budget.id, title: 'Account executive', holder: 'Sam', department: ids.Sales, line: ids.Salaries, start: '2026-07', annualSalary: '120000', onCostPercent: '12' })).id
  ids.ae = (await cmd('position', { scenario: budget.id, title: 'Account executive', department: ids.Sales, line: ids.Salaries, start: '2026-09', annualSalary: '110000', onCostPercent: '12' })).id
  ids.subs = (await cmd('revenue', { scenario: budget.id, name: 'Subscriptions', kind: 'customers', line: ids['Subscription revenue'], department: ids.Sales, start: '2026-07', startCustomers: '80', newPerMonth: '1', newPerRep: '1.5', repDepartment: ids.Sales, rampMonths: 3, churnPercent: '2', arpa: '1200', collectionLag: 1 })).id
  await cmd('revenue', { scenario: budget.id, name: 'Implementation services', kind: 'volume', line: ids['Services revenue'], department: ids.Sales, start: '2026-07', startVolume: '1', growthPercent: '0', rate: '12000', collectionLag: 1 })
  await cmd('revenue', { scenario: budget.id, name: 'Bad', kind: 'customers', line: ids.Rent, department: ids.Sales, start: '2026-07', startCustomers: '1', arpa: '1' }, h.owner, 400)
  const calc = (await scenario(budget.id)).calculation
  const july = cell(calc, ids['Subscription revenue'], ids.Sales, '2026-07')
  assert.equal(july.amount, 9588000)
  assert.match(july.sources[0].trace, /80\.00 − churn 1\.60 .*33\.33%.*= 79\.90 × \$1,200\.00 per customer = \$95,880\.00/)
  assert.equal(cell(calc, ids['Services revenue'], ids.Sales, '2026-12').amount, 1200000)
  const again = (await scenario(budget.id)).calculation
  assert.deepEqual(again.cells, calc.cells)
 })

 await t.test('EASEL-007 positions cost salary plus on-costs and pay detail stays with finance and the department', async () => {
  ids.eli = (await cmd('position', { scenario: budget.id, title: 'Senior engineer', holder: 'Eli', department: ids.Engineering, line: ids.Salaries, start: '2026-07', annualSalary: '180000', onCostPercent: '12' })).id
  ids.tbh = (await cmd('position', { scenario: budget.id, title: 'Engineer', department: ids.Engineering, line: ids.Salaries, start: '2026-10', annualSalary: '150000', onCostPercent: '12' })).id
  const calc = (await scenario(budget.id)).calculation
  assert.equal(cell(calc, ids.Salaries, ids.Engineering, '2026-07').amount, 1680000)
  assert.equal(cell(calc, ids.Salaries, ids.Engineering, '2026-10').amount, 3080000)
  const sales = await scenario(budget.id, people.sales)
  assert.deepEqual(sales.inputs.position.map(p => p.id).sort(), [ids.sam, ids.ae].sort())
  assert.equal(cell(sales.calculation, ids.Salaries, ids.Engineering, '2026-07').sources[0].kind, 'restricted')
  assert.ok(!JSON.stringify(sales).includes('180,000') && !JSON.stringify(sales).includes('18000000'))
  const board = await scenario(budget.id, people.board)
  assert.deepEqual(board.inputs.position, [])
  assert.ok(!JSON.stringify(board).includes('Eli'))
  await cmd('position', { id: ids.eli, scenario: budget.id, title: 'Senior engineer', holder: 'Eli', department: ids.Engineering, line: ids.Salaries, start: '2026-07', annualSalary: '1', onCostPercent: '0' }, people.sales, 403)
  await cmd('input-delete', { kind: 'position', id: ids.eli }, people.board, 403)
  await get('/api/easel/activity', people.sales, 403)
 })

 await t.test('EASEL-008 expenses and visible allocation rules keep totals and refuse bad references', async () => {
  for (const e of [
   { name: 'AWS', line: ids['Cloud hosting'], department: ids.Engineering, kind: 'recurring', amount: '15000', start: '2026-07' },
   { name: 'Tooling', line: ids.Software, department: ids.Engineering, kind: 'recurring', amount: '2400', start: '2026-07' },
   { name: 'Office rent', line: ids.Rent, department: ids.Operations, kind: 'recurring', amount: '9000', start: '2026-07' },
   { name: 'Campaigns', line: ids.Advertising, department: ids.Marketing, kind: 'recurring', amount: '7500', start: '2026-07' },
   { name: 'Conference sponsorship', line: ids.Advertising, department: ids.Marketing, kind: 'one-off', amount: '7500', start: '2026-09' },
   { name: 'Client travel', line: ids.Travel, department: ids.Sales, kind: 'recurring', amount: '1500', start: '2026-07' },
  ]) await cmd('expense', { scenario: budget.id, ...e })
  await cmd('allocation', { scenario: budget.id, name: 'Office by headcount', sourceDepartment: ids.Operations, basis: 'headcount', targets: [{ department: ids.Sales }, { department: ids.Engineering }, { department: ids.Marketing }] })
  const calc = (await scenario(budget.id)).calculation
  assert.equal(cell(calc, ids.Rent, ids.Operations, '2026-07').amount, 0)
  assert.equal(cell(calc, ids.Rent, ids.Sales, '2026-07').amount, 450000)
  assert.equal(cell(calc, ids.Rent, ids.Engineering, '2026-07').amount, 450000)
  assert.equal(calc.lineTotals[ids.Rent]['2026-07'], 900000)
  assert.equal(calc.lineTotals[ids.Advertising]['2026-09'], 1500000)
  // Self, chained, unshared and unbalanced allocations and unknown references are refused.
  await cmd('allocation', { scenario: budget.id, name: 'Self', sourceDepartment: ids.Operations, basis: 'fixed', targets: [{ department: ids.Operations, percent: '100' }] }, h.owner, 400)
  await cmd('allocation', { scenario: budget.id, name: 'Unshared', sourceDepartment: ids.Marketing, basis: 'headcount', targets: [{ department: ids.Sales }] }, h.owner, 400)
  const it = (await cmd('department', { name: 'Shared IT', shared: true })).id
  await cmd('allocation', { scenario: budget.id, name: 'Chain', sourceDepartment: it, basis: 'fixed', targets: [{ department: ids.Operations, percent: '100' }] }, h.owner, 400)
  await cmd('allocation', { scenario: budget.id, name: 'Unbalanced', sourceDepartment: it, basis: 'fixed', targets: [{ department: ids.Sales, percent: '60' }, { department: ids.Engineering, percent: '30' }] }, h.owner, 400)
  await cmd('expense', { scenario: budget.id, name: 'Ghost', line: 'missing-line', department: ids.Sales, kind: 'recurring', amount: '1', start: '2026-07' }, h.owner, 404)
  await cmd('department-delete', { id: ids.Operations }, h.owner, 409)
  await cmd('department-delete', { id: it })
 })

 await t.test('EASEL-009 contributors revise, comment on and submit only their own department', async () => {
  await cmd('expense', { scenario: budget.id, name: 'Early', line: ids.Travel, department: ids.Sales, kind: 'one-off', amount: '1', start: '2026-07' }, people.sales, 409)
  await cmd('request-submissions', { scenario: budget.id, departments: [ids.Sales, ids.Engineering], due: '2026-06-20' })
  const trip = await cmd('expense', { scenario: budget.id, name: 'Customer summit travel', line: ids.Travel, department: ids.Sales, kind: 'one-off', amount: '3000', start: '2026-11' }, people.sales)
  await cmd('expense', { scenario: budget.id, name: 'Not mine', line: ids.Software, department: ids.Engineering, kind: 'recurring', amount: '1', start: '2026-07' }, people.sales, 403)
  await cmd('comment', { scenario: budget.id, department: ids.Sales, text: 'Summit travel assumes two people.' }, people.sales)
  await cmd('comment', { scenario: budget.id, department: ids.Engineering, text: 'Nope' }, people.sales, 403)
  await cmd('submit', { scenario: budget.id, department: ids.Sales }, people.sales)
  await cmd('expense', { ...trip, amount: '3500' }, people.sales, 409)
  await cmd('return-submission', { scenario: budget.id, department: ids.Sales, reason: 'Use the confirmed fare quote' })
  await cmd('expense', { ...trip, amount: '3200.00' }, people.sales)
  await cmd('submit', { scenario: budget.id, department: ids.Sales }, people.sales)
  await cmd('submit', { scenario: budget.id, department: ids.Sales }, people.board, 403)
  const sub = (await get('/api/easel/state')).submissions.find(s => s.department === ids.Sales)
  assert.deepEqual(sub.history.map(x => x.status), ['requested', 'submitted', 'returned', 'submitted'])
 })

 await t.test('EASEL-010 approval freezes exactly what was approved, by whom, and opens the forecast', async () => {
  let current = (await scenario(budget.id)).scenario
  await cmd('approve-budget', { scenario: budget.id, revision: current.revision }, h.owner, 409)
  await cmd('submit', { scenario: budget.id, department: ids.Engineering }, people.eng)
  current = (await scenario(budget.id)).scenario
  await cmd('approve-budget', { scenario: budget.id, revision: current.revision - 1 }, h.owner, 409)
  const before = (await scenario(budget.id)).calculation
  const approved = await cmd('approve-budget', { scenario: budget.id, revision: current.revision })
  forecast = approved.forecast
  assert.equal(approved.budget.status, 'frozen')
  const sn = await get(`/api/easel/snapshot/${approved.snapshot}`)
  assert.equal(sn.body.approvedBy.email, 'owner@example.test')
  assert.equal(sn.body.revision, current.revision)
  assert.deepEqual(sn.body.calculation.profit, before.profit)
  assert.match(sn.sha256, /^[0-9a-f]{64}$/)
  await cmd('expense', { scenario: budget.id, name: 'Late change', line: ids.Travel, department: ids.Sales, kind: 'one-off', amount: '1', start: '2026-07' }, h.owner, 409)
  await assert.rejects(db.prepare("UPDATE e_snapshots SET body='{}' WHERE id=?").bind(approved.snapshot).run(), /immutable/)
  await assert.rejects(db.prepare('DELETE FROM e_snapshots WHERE id=?').bind(approved.snapshot).run(), /immutable/)
  const f = await scenario(forecast.id)
  assert.deepEqual(f.calculation.profit, before.profit)
  const viewerCopy = await get(`/api/easel/snapshot/${approved.snapshot}`, people.board)
  assert.deepEqual(viewerCopy.body.inputs.position, [])
  budget = approved.budget
 })

 await t.test('EASEL-011 a downside branch compares profit, cash, inputs and cells with its source', async () => {
  const down = await cmd('branch', { from: forecast.id, name: 'Downside: slower hiring' })
  const d = await scenario(down.id)
  const tbh = d.inputs.position.find(p => p.title === 'Engineer')
  await cmd('position', { ...tbh, start: '2027-01', annualSalary: '150000', onCostPercent: '12' })
  const subs = d.inputs.revenue.find(r => r.name === 'Subscriptions')
  await cmd('revenue', { ...subs, startCustomers: '80', newPerMonth: '1', newPerRep: '1.5', rampMonths: 3, churnPercent: '4', arpa: '1200' })
  const cmp = await get(`/api/easel/compare?a=${forecast.id}&b=${down.id}`)
  assert.deepEqual(cmp.changedInputs.map(i => `${i.kind}:${i.change}`).sort(), ['position:changed', 'revenue:changed'])
  const oct = cmp.changedCells.find(c => c.line === ids.Salaries && c.department === ids.Engineering && c.month === '2026-10')
  assert.equal(oct.difference, -1400000)
  assert.notDeepEqual(cmp.left.profit, cmp.right.profit)
  assert.notEqual(cmp.left.cash.at(-1).closing, cmp.right.cash.at(-1).closing)
  await cmd('branch', { from: forecast.id, name: 'Viewer branch' }, people.board, 403)
 })

 await t.test('EASEL-012 a proposal changes a plan only at the exact revisions finance reviewed', async () => {
  const p = await cmd('proposal-create', { from: forecast.id, name: 'Delay the new account executive', request: 'Delay the second sales hire until January' }, people.sales)
  const mine = await scenario(p.id, people.sales)
  const ae = mine.inputs.position.find(x => !x.holder)
  await cmd('position', { ...ae, start: '2027-01', annualSalary: '110000', onCostPercent: '12' }, people.sales)
  const eli = (await scenario(p.id)).inputs.position.find(x => x.holder === 'Eli')
  await cmd('position', { ...eli, annualSalary: '1', onCostPercent: '0' }, people.sales, 403)
  await get(`/api/easel/scenario/${p.id}`, people.eng, 404)
  const submitted = await cmd('proposal-submit', { id: p.id, summary: 'Saves cash until the pipeline supports the hire' }, people.sales)
  await cmd('proposal-promote', { id: p.id, revision: submitted.revision - 1 }, h.owner, 409)
  await cmd('proposal-promote', { id: p.id, revision: submitted.revision }, people.sales, 403)
  // Finance changes the forecast meanwhile: the stale proposal cannot overwrite it.
  const travel = (await scenario(forecast.id)).inputs.expense.find(e => e.name === 'Client travel')
  await cmd('expense', { ...travel, amount: '1600' })
  await cmd('proposal-promote', { id: p.id, revision: submitted.revision }, h.owner, 409)
  const fresh = await cmd('proposal-create', { from: forecast.id, name: 'Delay the new account executive (current)', request: 'Delay the second sales hire until January' }, people.sales)
  const ae2 = (await scenario(fresh.id, people.sales)).inputs.position.find(x => !x.holder)
  await cmd('position', { ...ae2, start: '2027-01', annualSalary: '110000', onCostPercent: '12' }, people.sales)
  const ready = await cmd('proposal-submit', { id: fresh.id }, people.sales)
  const before = (await scenario(forecast.id)).scenario.revision
  const promoted = await cmd('proposal-promote', { id: fresh.id, revision: ready.revision })
  assert.equal(promoted.target.revision, before + 1)
  assert.equal(promoted.proposal.proposalStatus, 'promoted')
  const f = await scenario(forecast.id)
  assert.equal(f.inputs.position.find(x => x.title === 'Account executive' && !x.holder).start, '2027-01')
  assert.equal(f.inputs.expense.find(e => e.name === 'Client travel').amountCents, 160000)
  const log = await get('/api/easel/activity')
  const entry = log.find(e => e.action === 'proposal-promoted')
  assert.deepEqual([entry.beforeRevision, entry.afterRevision], [before, before + 1])
  forecast = f.scenario
 })

 await t.test('EASEL-013 closing months keeps the prior forecast and explains variances from evidence', async () => {
  await cmd('close-month', { scenario: forecast.id, month: '2026-08' }, h.owner, 409)
  await cmd('close-month', { scenario: forecast.id, month: '2026-07' })
  const p = await kit('actuals', 'preview', await csvBody('gl-detail-2026-08.csv'))
  await kit('actuals', 'commit', { ...(await csvBody('gl-detail-2026-08.csv')), fingerprint: p.fingerprint })
  const closed = await cmd('close-month', { scenario: forecast.id, month: '2026-08' })
  assert.equal(closed.actualsThrough, '2026-08')
  assert.equal(closed.priorForecasts.length, 2)
  const f = await scenario(forecast.id)
  const subs = cell(f.calculation, ids['Subscription revenue'], ids.Sales, '2026-08')
  assert.deepEqual([subs.basis, subs.amount], ['actual', 9950000])
  const v = await get('/api/easel/variance/2026-08')
  const ads = v.rows.find(r => r.line === ids.Advertising && r.department === ids.Marketing)
  assert.deepEqual([ads.actual, ads.budget, ads.variance, ads.priorForecast, ads.favourable], [1500000, 750000, 750000, 750000, false])
  assert.ok(ads.citations.some(c => c.file === 'gl-detail-2026-08.csv' && c.line === 10))
  assert.match(ads.draft, /gl-detail-2026-08\.csv line 10/)
  assert.match(ads.hypotheses[0], /Conference sponsorship .* Sep 2026.*hypothesis/)
  const forSales = await get('/api/easel/variance/2026-08', people.sales)
  const adsForSales = forSales.rows.find(r => r.line === ids.Advertising && r.department === ids.Marketing)
  assert.deepEqual([adsForSales.citations, adsForSales.hypotheses], [[], []])
  assert.match(adsForSales.draft, /restricted/)
  assert.ok(forSales.rows.find(r => r.line === ids.Travel && r.department === ids.Sales).citations.length > 0)
  await cmd('explanation', { month: '2026-08', line: ids.Advertising, department: ids.Marketing, text: 'Sponsorship deposit paid a month early.' }, people.sales, 403)
  await cmd('explanation', { month: '2026-08', line: ids.Advertising, department: ids.Marketing, text: 'Conference sponsorship deposit paid in August, budgeted in September.' })
  await cmd('explanation-confirm', { month: '2026-08', line: ids.Advertising, department: ids.Marketing })
  await cmd('explanation', { month: '2026-08', line: ids.Travel, department: ids.Sales, text: 'Fewer client visits in August.' }, people.sales)
  await cmd('explanation-confirm', { month: '2026-08', line: ids.Travel, department: ids.Sales }, people.sales)
  const july = (await get('/api/easel/state')).batches.find(b => b.file === 'gl-detail-2026-07.csv')
  await kit('actuals', 'undo', { id: july.id }, h.owner, 409)
 })

 await t.test('EASEL-014 a published review pack binds numbers, sources, explanations and decisions', async () => {
  const pack = await cmd('pack-create', { month: '2026-08' })
  await cmd('pack-decision', { pack: pack.id, text: 'Hold September conference spend pending pipeline review', owner: 'Marketing lead', due: '2026-09-15' })
  await send(`/api/easel/pack/${pack.id}/document.html`, undefined, people.board).then(r => assert.equal(r.status, 409))
  const published = await cmd('pack-publish', { pack: pack.id })
  const html = await send(`/api/easel/pack/${pack.id}/document.html`, undefined, people.board)
  assert.equal(html.status, 200)
  assert.match(html.text, /Hold September conference spend/)
  assert.match(html.text, /gl-detail-2026-08\.csv/)
  assert.match(html.text, /budgeted in September/)
  const csv = await send(`/api/easel/pack/${pack.id}/document.csv`, undefined, people.board)
  assert.match(csv.text, /^section,line,department/)
  const sn = await get(`/api/easel/snapshot/${published.snapshot}`, people.board)
  assert.ok(!JSON.stringify(sn).includes('annualSalaryCents'))
  assert.deepEqual(sn.body.variances.filter(x => x.line === 'Salaries').flatMap(x => x.evidence), [])
  await cmd('pack-decision', { pack: pack.id, text: 'Too late' }, h.owner, 409)
  await cmd('action-status', { pack: pack.id, decision: published.decisions[0].id, status: 'done', note: 'Pipeline reviewed' })
  assert.equal((await get(`/api/easel/snapshot/${published.snapshot}`)).sha256, sn.sha256)
  await get(`/api/easel/snapshot/${budget.approval.snapshot}`, people.board)
 })

 await t.test('EASEL-015 the Excel workbook kit stages a separate scenario with cell provenance and undoes it', async () => {
  const file = await readFile('fixtures/fy27-budget.xlsx')
  const body = { base64: file.toString('base64'), filename: 'fy27-budget.xlsx' }
  const p = await kit('workbook', 'preview', body)
  assert.equal(p.sheet, 'Budget')
  assert.deepEqual(p.rows.map(r => r.line), ['Subscription revenue', 'Hosting', 'Software', 'Rent', 'Advertising', 'Travel'])
  assert.match(p.skipped[0].reason, /total row/)
  assert.deepEqual([p.formulas, p.rounded], [11, 4])
  assert.deepEqual(p.unresolvedLines, ['Hosting'])
  await kit('workbook', 'commit', { ...body, fingerprint: p.fingerprint }, h.owner, 409)
  assert.equal(await count(db, "SELECT COUNT(*) AS n FROM e_records WHERE destination<>'main'"), 0)
  const mapped = await kit('workbook', 'preview', { ...body, lineMap: { Hosting: ids['Cloud hosting'] } })
  assert.deepEqual(mapped.unresolvedLines, [])
  const done = await kit('workbook', 'commit', { ...body, lineMap: { Hosting: ids['Cloud hosting'] }, fingerprint: mapped.fingerprint })
  assert.equal(done.import.status, 'imported')
  const imported = await scenario(done.import.scenario)
  assert.equal(imported.inputs.schedule.length, 6)
  const hosting = imported.inputs.schedule.find(x => x.line === ids['Cloud hosting'])
  assert.deepEqual([hosting.provenance.cells['2026-08'], hosting.provenance.formulas['2026-08'], hosting.values['2026-08']], ['D5', '=C5+250', 1525000])
  assert.equal(imported.calculation.lineTotals[ids['Cloud hosting']]['2026-07'], 1500000)
  // A person edits one imported row; undo keeps that row (and the scenario it needs) and removes the rest.
  const rent = imported.inputs.schedule.find(x => x.line === ids.Rent)
  await cmd('schedule', { ...rent, values: { ...Object.fromEntries(Object.entries(rent.values).map(([m, v]) => [m, (v / 100).toFixed(2)])), '2026-07': '9500.00' } })
  const undone = await kit('workbook', 'undo', { id: done.import.id })
  assert.equal(undone.import.status, 'undone')
  const after = await scenario(done.import.scenario)
  assert.deepEqual(after.inputs.schedule.map(x => x.line), [ids.Rent])
  assert.ok(JSON.stringify(undone.undo).includes('edited'))
 })
})
