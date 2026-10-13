import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

function assertCalculation(calculation, lines) {
 for (const cell of calculation.cells) {
  assert.equal(cell.sources.reduce((sum, source) => sum + source.amount, 0), cell.amount, `${cell.line}/${cell.department}/${cell.month} sources`)
  for (const source of cell.sources.filter(source => source.kind === 'position')) assert.ok(source.amount >= 0, `${cell.line}/${cell.department}/${cell.month} salary`)
 }
 for (const month of calculation.months) {
  for (const line of lines) {
   const fromCells = calculation.cells.filter(cell => cell.line === line.id && cell.month === month).reduce((sum, cell) => sum + cell.amount, 0)
   assert.equal(calculation.lineTotals[line.id]?.[month] ?? 0, fromCells, `${line.name} line total in ${month}`)
  }
  const total = type => lines.filter(line => line.type === type).reduce((sum, line) => sum + (calculation.lineTotals[line.id]?.[month] ?? 0), 0)
  const profit = calculation.profit.find(row => row.month === month)
  assert.equal(profit.revenue, total('revenue'), `revenue in ${month}`)
  assert.equal(profit.costOfSales, total('cost-of-sales'), `cost of sales in ${month}`)
  assert.equal(profit.operatingExpenses, total('operating-expense'), `operating expenses in ${month}`)
  assert.equal(profit.grossMargin, profit.revenue - profit.costOfSales, `gross margin in ${month}`)
  assert.equal(profit.profit, profit.revenue - profit.costOfSales - profit.operatingExpenses, `profit in ${month}`)
  const cash = calculation.cash.find(row => row.month === month)
  assert.equal(cash.closing, cash.opening + cash.collections - cash.payments, `cash in ${month}`)
 }
}

test('salary cents and allocated totals stay conserved through the public planning API', async t => {
 const h = await harness()
 t.after(() => h.close())
 const { command: cmd, get, kit } = h

 await cmd('workspace', { name: 'Rounding fixture', currency: 'AUD', fiscalYearStart: 7, planStart: '2026-07' })
 const shared = await cmd('department', { name: 'Shared', shared: true })
 const sales = await cmd('department', { name: 'Sales' })
 const engineering = await cmd('department', { name: 'Engineering' })
 const salary = await cmd('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const credit = await cmd('line', { name: 'Shared credit', type: 'operating-expense' })
 const budget = (await get('/api/easel/state')).scenarios.find(scenario => scenario.kind === 'budget')
 assert.ok(budget)
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '50000', collectionLag: 1, paymentLag: 2 })
 await cmd('position', { scenario: budget.id, title: 'Annual role', holder: 'Alex', department: shared.id, line: salary.id, start: '2026-06', annualSalary: '100000.01', onCostPercent: '12.34' })
 await cmd('position', { scenario: budget.id, title: 'Partial role', department: shared.id, line: salary.id, start: '2026-09', end: '2027-02', annualSalary: '80000.05', onCostPercent: '8.76' })
 await cmd('position', { scenario: budget.id, title: 'Tiny role', department: sales.id, line: salary.id, start: '2026-06', annualSalary: '0.06', onCostPercent: '0' })
 await cmd('position', { scenario: budget.id, title: 'July contract', department: sales.id, line: salary.id, start: '2026-07', end: '2026-07', annualSalary: '0.06', onCostPercent: '0' })
 await cmd('expense', { scenario: budget.id, name: 'One-cent credit', line: credit.id, department: shared.id, kind: 'one-off', amount: '-0.01', start: '2026-09' })
 await cmd('allocation', { scenario: budget.id, name: 'Shared costs', sourceDepartment: shared.id, basis: 'fixed', targets: [{ department: sales.id, percent: '33.33' }, { department: engineering.id, percent: '66.67' }] })

 const beforeApproval = await get(`/api/easel/scenario/${budget.id}`)
 const planned = beforeApproval.calculation
 const salaryByMonth = [936167, 936166, 1661233, 1661233, 1661233, 1661233, 1661233, 1661234, 936166, 936166, 936166, 936181]
 assert.deepEqual(planned.months, ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'])
 assert.deepEqual(planned.months.map(month => planned.lineTotals[salary.id]?.[month] ?? 0), salaryByMonth)
 const expectedPayments = [...salaryByMonth]
 expectedPayments[4] -= 1
 assert.deepEqual(planned.cash.map(row => row.payments), expectedPayments)
 assert.equal(planned.lineTotals[credit.id]['2026-09'], -1)
 assert.equal(planned.cells.find(cell => cell.line === salary.id && cell.department === sales.id && cell.month === '2026-07').amount, 312025)
 assert.equal(planned.cells.find(cell => cell.line === salary.id && cell.department === engineering.id && cell.month === '2026-07').amount, 624142)
 assert.equal(planned.cells.find(cell => cell.line === credit.id && cell.department === engineering.id && cell.month === '2026-09').amount, -1)
 const tinySources = planned.cells.flatMap(cell => cell.sources).filter(source => source.label.startsWith('Tiny role'))
 assert.ok(tinySources.every(source => source.amount >= 0))
 assert.equal(planned.cells.find(cell => cell.line === salary.id && cell.department === sales.id && cell.month === '2026-07').sources.find(source => source.kind === 'position' && source.label === 'Tiny role (to be hired)').amount, 0)
 assert.equal(planned.cells.find(cell => cell.line === salary.id && cell.department === sales.id && cell.month === '2027-06').sources.find(source => source.label === 'Tiny role (to be hired)').amount, 6)
 const positionTotals = planned.cells.flatMap(cell => cell.sources).filter(source => source.kind === 'position').reduce((totals, source) => {
  totals[source.label] = (totals[source.label] ?? 0) + source.amount
  return totals
 }, {})
 assert.deepEqual(positionTotals, {
  'Annual role (Alex)': 11234001,
  'July contract (to be hired)': 1,
  'Partial role (to be hired)': 4350403,
  'Tiny role (to be hired)': 6,
 })
 assert.equal(salaryByMonth.reduce((sum, amount) => sum + amount, 0), 15584411)
 assertCalculation(planned, beforeApproval.lines)

 // Independent arithmetic: $100,000.01 × 11234 × 12 / 120000 rounds to
 // 11,234,001 cents; $80,000.05 × 10876 × 6 / 120000 rounds to 4,350,403.
 // The regular months floor to 936,166 and 725,067 cents, leaving +9 and +1
 // cents in the final active months. A six-cent annual salary over twelve
 // months yields six cents in its final month; over one month it yields a
 // one-cent target. These targets total 15,584,411 cents ($155,844.11).
 const approval = await cmd('approve-budget', { scenario: budget.id, revision: beforeApproval.scenario.revision })
 const snapshotPath = `/api/easel/snapshot/${approval.snapshot}`
 const approvedSnapshot = await get(snapshotPath)
 assert.deepEqual(approvedSnapshot.body.calculation, planned)

 await cmd('account-map', { account: '500', target: salary.id })
 await cmd('department-map', { source: 'Shared', department: shared.id })
 const actuals = {
  filename: 'july-payroll.csv',
  csv: 'Date,Account,Department,Amount\n2026-07-15,500,Shared,10000.00\n',
  columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' },
  amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD',
 }
 const preview = await kit('actuals', 'preview', actuals)
 assert.equal(preview.accepted, 1)
 await kit('actuals', 'commit', { ...actuals, fingerprint: preview.fingerprint })
 await cmd('close-month', { scenario: approval.forecast.id, month: '2026-07' })
 const closedForecast = await get(`/api/easel/scenario/${approval.forecast.id}`)
 const keptSnapshotPath = `/api/easel/snapshot/${closedForecast.scenario.priorForecasts[0].snapshot}`
 const keptSnapshot = await get(keptSnapshotPath)
 assert.deepEqual(keptSnapshot.body.calculation, planned)
 assert.equal(closedForecast.calculation.lineTotals[salary.id]['2026-07'], 1000000)
 assert.equal(closedForecast.calculation.lineTotals[salary.id]['2026-08'], salaryByMonth[1])
 const closedSalaryCells = closedForecast.calculation.cells.filter(cell => cell.line === salary.id && cell.month === '2026-07')
 assert.ok(closedSalaryCells.length > 0 && closedSalaryCells.every(cell => cell.basis === 'actual'))
 assert.ok(closedSalaryCells.every(cell => cell.sources.every(source => source.kind !== 'position')))

 const annualPosition = closedForecast.inputs.position.find(position => position.title === 'Annual role')
 await cmd('position', { ...annualPosition, scenario: approval.forecast.id, annualSalary: '101000.01', onCostPercent: '12.34' })
 const revisedForecast = await get(`/api/easel/scenario/${approval.forecast.id}`)
 const stillApproved = await get(snapshotPath)
 const stillKept = await get(keptSnapshotPath)
 assert.deepEqual(stillApproved, approvedSnapshot)
 assert.deepEqual(stillKept, keptSnapshot)
 assert.equal(revisedForecast.calculation.lineTotals[salary.id]['2026-07'], 1000000)
 assertCalculation(revisedForecast.calculation, revisedForecast.lines)

 const comparison = await get(`/api/easel/compare?a=${budget.id}&b=${approval.forecast.id}`)
 assert.equal(comparison.currencyComparable, true)
 assert.deepEqual(comparison.left.profit, planned.profit)
 assert.deepEqual(comparison.left.cash, planned.cash)
 assert.deepEqual(comparison.right.profit, revisedForecast.calculation.profit)
 assert.deepEqual(comparison.right.cash, revisedForecast.calculation.cash)
 for (const month of planned.months) {
  const changedOperatingExpenses = comparison.changedCells.filter(cell => cell.month === month).reduce((sum, cell) => sum + cell.difference, 0)
  const leftProfit = comparison.left.profit.find(row => row.month === month).profit
  const rightProfit = comparison.right.profit.find(row => row.month === month).profit
  assert.equal(rightProfit - leftProfit, -changedOperatingExpenses, `comparison profit conservation in ${month}`)
  const leftCash = comparison.left.cash.find(row => row.month === month)
  const rightCash = comparison.right.cash.find(row => row.month === month)
  assert.equal(rightCash.payments - leftCash.payments, changedOperatingExpenses, `comparison payment conservation in ${month}`)
  assert.equal(rightCash.closing - leftCash.closing, (rightCash.opening - leftCash.opening) + (rightCash.collections - leftCash.collections) - (rightCash.payments - leftCash.payments), `comparison cash conservation in ${month}`)
 }
})
