import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { acceptHistory, historyFile, historyFixture } from './history-fixture.mjs'
import { proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

const offsetMonth = (month, offset) => {
 const date = new Date(`${month}-01T00:00:00Z`)
 date.setUTCMonth(date.getUTCMonth() + offset)
 return date.toISOString().slice(0, 7)
}
const round = (numerator, denominator) => Math.sign(numerator) * Math.floor((Math.abs(numerator) * 2 + denominator) / (denominator * 2))
const cell = (view, line, department, month) => view.calculation.cells.find(c => c.line === line && c.department === department && c.month === month)
const actual = (view, line, department, month) => view.actualsHistory.cells.find(c => c.line === line && c.department === department && c.month === month)

test('MODEL-009 actual references, editable seeded budgets and overlays preserve exact history, authority and frozen arithmetic through HTTP and Excel', async t => {
 const h = await harness(); t.after(() => h.close())
 const f = await historyFixture(h.command, path => h.get(`/api/easel/${path}`), h.kit)
 const { budget, sales, delivery, revenue, cost, projected, smoothed, amounts } = f
 const planner = await h.person('sales@example.test', 'contributor', [sales.id])
 const outsider = await h.person('delivery@example.test', 'contributor', [delivery.id])
 const viewer = await h.person('board@example.test', 'viewer')
 const read = id => h.get(`/api/easel/scenario/${id}`)
 const body = { scenario: budget.id, name: 'Prior-year growth', line: projected.id, department: sales.id,
  history: { sourceLine: revenue.id, sourceDepartment: sales.id, offset: 12, window: 1, growthPercent: '5' } }
 const growth = await h.command('schedule', body)
 const averageBody = { scenario: budget.id, name: 'Trailing actual costs', line: smoothed.id, department: sales.id,
  history: { sourceLine: cost.id, sourceDepartment: sales.id, offset: 1, window: 3, growthPercent: '0' } }
 await h.command('schedule', averageBody)
 let original = await read(budget.id)
 assert.equal(original.inputs.schedule.find(s => s.id === growth.id).history.growthBps, 500)
 assert.equal(cell(original, projected.id, sales.id, '2025-01').amount, 105011, 'a half cent rounds upward once')
 assert.equal(cell(original, smoothed.id, sales.id, '2025-01').amount, 37013, 'three prior months average rounds once')
 for (const month of original.calculation.months) {
  const prior = offsetMonth(month, -12)
  const derived = cell(original, projected.id, sales.id, month)
  assert.equal(derived.amount, round(amounts[prior].revenue * 105, 100))
  const growthTrace = derived.sources.map(s => s.trace).join('\n')
  for (const evidence of [prior, revenue.id, sales.id, f.imported.batch.destination]) assert.ok(growthTrace.includes(evidence), `growth trace cites ${evidence}`)
  const priorThree = [3, 2, 1].map(offset => offsetMonth(month, -offset))
  const smoothedCell = cell(original, smoothed.id, sales.id, month)
  assert.equal(smoothedCell.amount, round(priorThree.reduce((sum, m) => sum + amounts[m].cost, 0), 3))
  const trace = smoothedCell.sources.map(s => s.trace).join('\n')
  for (const evidence of [...priorThree, cost.id, sales.id, f.imported.batch.destination]) assert.ok(trace.includes(evidence), `average trace cites ${evidence}`)
 }
 assert.equal(cell(original, projected.id, sales.id, '2025-08').amount, 0, 'accepted zero remains a calculable actual')
 const reconciliation = await h.get('/api/easel/actuals')
 for (const month of f.months) {
  assert.equal(actual(original, revenue.id, sales.id, month).amount, amounts[month].revenue)
  assert.equal(actual(original, cost.id, sales.id, month).amount, amounts[month].cost)
  const summary = reconciliation.months.find(row => row.period === month)
  assert.equal(summary.revenue, amounts[month].revenue)
  assert.equal(summary.costs, amounts[month].cost)
 }
 assert.deepEqual(original.actualsHistory.missingMonths, [])
 assert.deepEqual(original.actualsHistory.blockedMonths, [])

 const seeded = await h.command('budget-from-actuals', { name: 'Budget from history', growth: { [revenue.id]: '5' } })
 assert.equal(seeded.kind, 'budget')
 assert.notEqual(seeded.id, budget.id)
 const seedView = await read(seeded.id)
 assert.deepEqual(await read(budget.id), original, 'seeding leaves the source budget unchanged')
 for (const [line, key, factor] of [[revenue, 'revenue', 105], [cost, 'cost', 100]]) {
  const input = seedView.inputs.schedule.find(s => s.line === line.id && s.department === sales.id)
  assert.ok(input); assert.equal(input.history, undefined, 'seeded schedules are editable entered values')
  for (const month of seedView.calculation.months) {
   const expected = round(amounts[offsetMonth(month, -12)][key] * factor, 100)
   assert.equal(input.values[month], expected)
   assert.equal(cell(seedView, line.id, sales.id, month).amount, expected)
  }
 }
 const seededInput = seedView.inputs.schedule.find(s => s.line === revenue.id)
 const edit = { scenario: seeded.id, id: seededInput.id, scenarioRevision: seedView.scenario.revision,
  name: seededInput.name, line: revenue.id, department: sales.id,
  values: Object.fromEntries(Object.entries(seededInput.values).map(([month, cents]) => [month, (cents / 100).toFixed(2)])) }
 edit.values['2025-01'] = '1234.56'
 await h.command('schedule', edit)
 const edited = await read(seeded.id)
 assert.equal(cell(edited, revenue.id, sales.id, '2025-01').amount, 123456)
 await h.command('schedule', { ...edit, values: { ...edit.values, '2025-01': '9999' } }, h.owner, 409)
 assert.deepEqual(await read(seeded.id), edited, 'stale grid edit changes nothing')

 const workbookResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${seeded.id}/document.xlsx`, { headers: { cookie: h.owner } })
 assert.equal(workbookResponse.status, 200)
 const book = await readWorkbook(await workbookResponse.arrayBuffer()); proveFormulas(book)
 const sheet = book.getWorksheet('Actuals history')
 assert.ok(sheet, 'export includes actuals beside the saved plan')
 let checked = 0
 sheet.eachRow(row => {
  const month = row.getCell(1).value
  if (!edited.calculation.months.includes(month) || row.getCell(2).value !== revenue.name || row.getCell(3).value !== sales.name) return
  assert.equal(row.getCell(4).value, cell(edited, revenue.id, sales.id, month).amount)
  assert.equal(row.getCell(5).value, amounts[month].revenue)
  assert.equal(row.getCell(6).value, amounts[offsetMonth(month, -12)].revenue)
  assert.ok(row.getCell(7).formula, 'difference remains live Excel arithmetic')
  checked++
 })
 assert.equal(checked, 12)

 // Approving/closing an alternative first never makes it the operating pair.
 const alternative = await h.command('approve-budget', { scenario: seeded.id, revision: edited.scenario.revision })
 assert.equal(alternative.forecast.alternativeBudget, true)
 await h.command('close-month', { scenario: alternative.forecast.id, month: '2025-01' })
 await h.get('/api/easel/variance/2025-01', h.owner, 409)
 assert.equal((await h.get('/api/easel/department-statements')).length, 0)
 await h.command('metric-rule-save', { name: 'Operating runway', kind: 'runway', runway: '100', owner: 'owner@example.test', dueDays: 3 })
 const rules = await h.get('/api/easel/metric-tasks')
 assert.equal(rules.tasks.length, 0)
 assert.ok(rules.rules[0].blocked, 'Alternative forecast cannot supply operating rule metrics')

 let before = await read(budget.id)
 const missing = await h.command('schedule', { ...body, name: 'Unavailable history', history: { ...body.history, offset: 60 } }, h.owner, 409)
 assert.match(missing.error, /2020-01/)
 assert.deepEqual(await read(budget.id), before)
 await h.command('schedule', body, viewer, 403)
 await h.command('request-submissions', { scenario: budget.id, departments: [sales.id] })
 await h.command('schedule', { ...body, id: growth.id }, planner)
 before = await read(budget.id)
 await h.command('schedule', { ...body, history: { ...body.history, sourceDepartment: delivery.id } }, planner, 403)
 await h.command('schedule', body, outsider, 403)
 assert.deepEqual(await read(budget.id), before)
 const restricted = await h.get(`/api/easel/scenario/${budget.id}`, viewer)
 assert.equal(restricted.inputs.schedule.length, 0)
 assert.equal(cell(restricted, projected.id, sales.id, '2025-01').amount, 105011)
 assert.ok(cell(restricted, projected.id, sales.id, '2025-01').sources.every(source => source.id === undefined))

 await h.command('department-map', { source: 'Sales', department: '' })
 const unmapped = await h.get(`/api/easel/scenario/${budget.id}`, h.owner, 409)
 assert.match(unmapped.error, /2024-01/)
 await h.command('department-map', { source: 'Sales', department: sales.id })
 assert.deepEqual((await read(budget.id)).calculation, before.calculation)
 const pendingBody = historyFile('many-source-rows.csv', Array.from({ length: 205 }, (_, index) => `2024-01-20,400,Sales,0,Extra zero source ${index}`))
 const preview = await h.kit('actuals', 'preview', pendingBody)
 let pending = await h.kit('actuals', 'commit', { ...pendingBody, fingerprint: preview.fingerprint })
 assert.equal(pending.batch.status, 'importing')
 const blocked = await h.get(`/api/easel/scenario/${budget.id}`, h.owner, 409)
 assert.match(blocked.error, /2024-01/)
 while (pending.batch.status === 'importing') pending = await h.kit('actuals', 'resume', { id: pending.batch.id })
 original = await read(budget.id)
 assert.equal(cell(original, projected.id, sales.id, '2025-01').amount, 105011)

 await h.command('submit', { scenario: budget.id, department: sales.id }, planner)
 original = await read(budget.id)
 const approval = await h.command('approve-budget', { scenario: budget.id, revision: original.scenario.revision })
 const frozen = await read(budget.id)
 const snapshot = await h.get(`/api/easel/snapshot/${approval.snapshot}`)
 const workingBefore = await read(approval.forecast.id)
 await acceptHistory(h.kit, historyFile('historic-correction.csv', ['2024-01-25,400,Sales,-10,Historical correcting revenue']))
 assert.deepEqual(await read(budget.id), frozen, 'frozen budget retains its captured actual overlay and arithmetic')
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approval.snapshot}`), snapshot)
 const workingAfter = await read(approval.forecast.id)
 assert.equal(cell(workingAfter, projected.id, sales.id, '2025-01').amount, 106061)
 assert.notDeepEqual(workingAfter.calculation, workingBefore.calculation)
 assert.equal(actual(workingAfter, revenue.id, sales.id, '2024-01').amount, amounts['2024-01'].revenue + 1000)
})
