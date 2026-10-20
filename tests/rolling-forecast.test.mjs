import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

test('MODEL-002 rolling forecast extends from drivers after two closes while budgets and kept forecasts stay fixed', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Sales' })
 const line = await h.command('line', { name: 'Services', type: 'revenue' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: department.id, line: line.id, start: '2026-01', startVolume: '10', rate: '100', growthPercent: '0', collectionLag: 0 })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const budgetBefore = await h.get(`/api/easel/scenario/${budget.id}`)
 const contributor = await h.person('sales@example.test', 'contributor', [department.id])
 await h.command('forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 18 }, contributor, 403)
 await h.command('forecast-window', { scenario: budget.id, revision: budgetBefore.scenario.revision, months: 18 }, h.owner, 409)
 await h.command('forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 18 })
 await h.command('forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 24 }, h.owner, 409)
 let current = await h.get(`/api/easel/scenario/${forecast.id}`)
 assert.equal(current.calculation.months.at(-1), '2027-06')
 assert.equal(current.calculation.months.length, 18)
 await h.command('account-map', { account: '400', target: line.id })
 await h.command('department-map', { source: 'Sales', department: department.id })
 const body = { filename: 'two-months.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Sales,-900\n2026-02-28,400,Sales,-950\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', body)
 await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
 const kept = []
 for (const [month, end] of [['2026-01', '2027-07'], ['2026-02', '2027-08']]) {
  const before = await h.get(`/api/easel/scenario/${forecast.id}`)
  const closed = await h.command('close-month', { scenario: forecast.id, month })
  const sn = await h.get(`/api/easel/snapshot/${closed.priorForecasts.at(-1).snapshot}`)
  assert.deepEqual(sn.body.calculation, before.calculation)
  kept.push(sn)
  current = await h.get(`/api/easel/scenario/${forecast.id}`)
  assert.equal(current.calculation.months.at(-1), end)
  const cell = current.calculation.cells.find(c => c.month === end && c.line === line.id)
  assert.equal(cell.amount, 100000)
  assert.match(cell.sources[0].trace, /volume 10.*rate \$100\.00/)
  assert.equal(current.calculation.cells.find(c => c.month === month).basis, 'actual')
 }
 assert.equal(current.calculation.months.length, 20)
 const branch = await h.command('branch', { from: forecast.id, name: 'Downside' })
 assert.equal((await h.get(`/api/easel/scenario/${branch.id}`)).calculation.months.at(-1), '2027-08')
 // Newly exposed months accept normal inputs through the same public command.
 await h.command('revenue', { scenario: forecast.id, name: 'New service', kind: 'volume', department: department.id, line: line.id, start: '2027-08', startVolume: '1', rate: '25' })
 assert.equal((await h.get(`/api/easel/scenario/${forecast.id}`)).calculation.lineTotals[line.id]['2027-08'], 102500)
 assert.deepEqual(await h.get(`/api/easel/scenario/${budget.id}`), budgetBefore)
 for (const sn of kept) assert.deepEqual(await h.get(`/api/easel/snapshot/${sn.id}`), sn)
})
