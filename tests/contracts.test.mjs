import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

test('REV-004 contract bookings, upfront invoices, exact-date DSO and recognition reconcile three statements, scoped Excel and frozen proposals', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Contract studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Contracts' })
 const other = await h.command('department', { name: 'Other' })
 const line = await h.command('line', { name: 'Contract revenue', type: 'revenue' })
 const salary = await h.command('line', { name: 'Private payroll', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const planner = await h.person('contracts@example.test', 'contributor', [department.id])
 const outsider = await h.person('other@example.test', 'contributor', [other.id])
 const board = await h.person('board@example.test', 'viewer')
 await h.command('position', { scenario: budget.id, line: salary.id, department: department.id, title: 'Delivery', holder: 'Private contract employee', annualSalary: '1200', start: '2026-01' })
 const body = { scenario: budget.id, name: 'Confidential annual agreement', kind: 'contract', line: line.id, department: department.id, start: '2026-01', startDate: '2026-01-01', termMonths: '12', contractValue: '120000', billingCadence: 'annual', dsoDays: '45' }
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '0', collectionLag: '0', paymentLag: '0' })
 await h.command('cash-constraints', { floor: '0', runwayMinimum: '12' })
 const contract = await h.command('revenue', body)
 const view = (id = budget.id, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
 const annual = await view(), calc = annual.calculation
 assert.equal(calc.contracts.months[0].bookings, 12000000)
 assert.equal(calc.contracts.months[0].billings, 12000000)
 assert.deepEqual(calc.contracts.months.map(m => m.revenue), Array(12).fill(1000000))
 assert.deepEqual(calc.contracts.months.map(m => m.billings), [12000000, ...Array(11).fill(0)])
 assert.deepEqual(calc.contracts.months.map(m => m.collections), [0, 12000000, ...Array(10).fill(0)])
 assert.equal(calc.contracts.invoices[0].collectionDate, '2026-02-15', '45 calendar days, not a rounded month lag')
 for (let i = 0; i < 12; i++) {
  assert.equal(calc.profit[i].revenue, 1000000)
  assert.equal(calc.balanceSheet[i].deferredRevenue, 11000000 - i * 1000000)
  assert.equal(calc.balanceSheet[i].receivables, i ? 0 : 12000000)
  assert.equal(calc.balanceSheet[i].balanceDifference, 0)
  assert.equal(calc.cashFlow[i].difference, 0)
  assert.equal(calc.cashFlow[i].closing, calc.cash[i].closing)
 }
 assert.equal(calc.cashFlow[0].deferredRevenueChange, 11000000)
 assert.equal(calc.cashFlow[1].deferredRevenueChange, -1000000)
 assert.equal(calc.cash[1].collections, 12000000)
 assert.match(calc.cells.find(c => c.line === line.id).sources[0].trace, /2026-01-01.*12 service months.*annual upfront.*45 exact calendar days/)
 for (const bad of [{ termMonths: '0' }, { termMonths: '1.5' }, { termMonths: '121' }, { dsoDays: '-1' }, { dsoDays: '366' }, { dsoDays: '1.2' }, { startDate: '2026-02-30' }, { startDate: '2026-02-01' }, { billingCadence: 'arrears' }, { contractValue: '-1' }]) await h.command('revenue', { ...body, ...bad, id: contract.id }, h.owner, 400)
 assert.deepEqual(await view(), annual, 'invalid assumptions are atomic')
 await h.command('revenue', { ...body, id: contract.id }, planner, 409)
 await h.command('request-submissions', { scenario: budget.id, departments: [department.id] })
 await h.command('revenue', { ...body, id: contract.id }, planner)
 await h.command('revenue', { ...body, id: contract.id }, outsider, 403)
 await h.command('revenue', body, board, 403)
 for (const cookie of [outsider, board]) {
  const filtered = await view(budget.id, cookie)
  assert.equal(filtered.calculation.contracts.months[0].billings, 12000000)
  assert.equal(filtered.calculation.contracts.rows.length, 0)
  assert.equal(filtered.calculation.contracts.invoices.length, 0)
  assert.doesNotMatch(JSON.stringify(filtered), /Confidential|Private contract employee|contractValueCents|startDate/)
 }
 await h.command('submit', { scenario: budget.id, department: department.id }, planner)
 const current = await view()
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: current.scenario.revision })
 const frozen = await view(), forecast = approved.forecast
 const kept = await h.command('reforecast-save', { from: forecast.id, revision: forecast.revision, name: 'Contract baseline' })
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Quarterly collection', request: 'Change upfront invoice cadence' }, planner)
 const input = (await view(proposal.id, planner)).inputs.revenue[0]
 const mcp = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'revenue', arguments: { ...body, id: input.id, scenario: proposal.id, billingCadence: 'quarterly' } } }, planner)
 assert.equal(mcp.status, 200); assert.equal(mcp.value.result.isError, false)
 const quarterly = await view(proposal.id, planner)
 assert.deepEqual(quarterly.calculation.contracts.months.map(m => m.billings), [3000000, 0, 0, 3000000, 0, 0, 3000000, 0, 0, 3000000, 0, 0])
 assert.deepEqual(quarterly.calculation.contracts.invoices.map(i => i.collectionDate), ['2026-02-15', '2026-05-16', '2026-08-15', '2026-11-15'])
 await h.command('proposal-submit', { id: proposal.id }, planner)
 const submitted = await view(proposal.id, planner)
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.scenario.revision - 1 }, h.owner, 409)
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.scenario.revision })
 assert.equal((await view(forecast.id)).calculation.contracts.months[0].billings, 3000000)
 assert.deepEqual(await view(), frozen)
 assert.deepEqual((await view(kept.id)).calculation, frozen.calculation)
 const versions = await h.get(`/api/easel/activity?action=structure-version&scenario=${proposal.id}`)
 assert.ok(versions.some(v => v.detail.changes.some(c => c.fields.some(f => f.field === 'billingCadence'))))
 const branch = await h.command('branch', { from: forecast.id, name: 'Dated short contract' })
 const short = (await view(branch.id)).inputs.revenue[0]
 const edited = { ...body, scenario: branch.id, id: short.id, contractValue: '100.01', termMonths: '2', startDate: '2026-01-31', billingCadence: 'monthly', dsoDays: '1' }
 await h.command('revenue', edited)
 let dated = (await view(branch.id)).calculation
 assert.deepEqual(dated.contracts.invoices.map(i => [i.date, i.collectionDate, i.amount]), [['2026-01-31', '2026-02-01', 5000], ['2026-02-28', '2026-03-01', 5001]])
 assert.deepEqual(dated.contracts.months.slice(0, 3).map(m => m.revenue), [178, 4983, 4840], 'actual service days split periods; both installment and split remainders conserved')
 assert.equal(dated.contracts.months.reduce((n, m) => n + m.revenue, 0), 10001)
 for (const row of dated.balanceSheet) { assert.equal(row.balanceDifference, 0); assert.equal(row.cashDifference, 0) }
 // A short final quarter bills only its remaining service months.
 await h.command('revenue', { ...edited, startDate: '2026-01-01', termMonths: '5', billingCadence: 'quarterly', contractValue: '0.03', dsoDays: '0' })
 dated = (await view(branch.id)).calculation
 assert.deepEqual(dated.contracts.invoices.map(i => i.amount), [0, 3])
 assert.deepEqual(dated.contracts.months.slice(0, 5).map(m => m.revenue), [0, 0, 0, 0, 3])
 // Prior-horizon invoices seed contract AR/deferred without rebilling or restarting recognition.
 await h.command('revenue', { ...edited, start: '2025-12', startDate: '2025-12-01', contractValue: '120000', termMonths: '12', billingCadence: 'annual', dsoDays: '45' })
 dated = (await view(branch.id)).calculation
 assert.deepEqual(dated.contracts.opening, { receivables: 12000000, deferredRevenue: 11000000, unbilledRevenue: 0 })
 assert.equal(dated.contracts.months[0].bookings, 0); assert.equal(dated.cash[0].collections, 12000000)
 for (const row of dated.balanceSheet) { assert.equal(row.balanceDifference, 0); assert.equal(row.cashDifference, 0) }
 // Annual means each twelve service months; final short annual interval stays exact.
 await h.command('revenue', { ...edited, startDate: '2026-01-01', contractValue: '1300.01', termMonths: '13', billingCadence: 'annual', dsoDays: '365' })
 dated = (await view(branch.id)).calculation
 assert.deepEqual(dated.contracts.invoices.map(i => [i.date, i.amount]), [['2026-01-01', 120000], ['2027-01-01', 10001]])
 assert.equal(dated.cash[0].collections, 0)
 const xlsx = async cookie => { const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${budget.id}/document.xlsx`, { headers: { cookie } }); assert.equal(response.status, 200); return readWorkbook(await response.arrayBuffer()) }
 const book = await xlsx(h.owner); proveFormulas(book)
 assert.equal(evaluate(book.getWorksheet('Contracts'), 'C15'), 12000000)
 assert.equal(book.getWorksheet('Balance sheet').getCell('U3').value, 11000000)
 assert.equal(book.getWorksheet('Indirect cash flow').getCell('R3').value, 11000000)
 const altered = new Map([['U3', 11000001]])
 assert.equal(evaluate(book.getWorksheet('Balance sheet'), 'J3', altered), calc.balanceSheet[0].liabilities + 1)
 // Closing ledger P&L never invents invoice actuals or double-counts receipts.
 const unrelated = await h.command('line', { name: 'Other ledger revenue', type: 'revenue' })
 await h.command('account-map', { account: '400', target: line.id })
 await h.command('account-map', { account: '401', target: unrelated.id })
 await h.command('department-map', { source: 'Contracts', department: department.id })
 const actuals = { filename: 'contract-ledger.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Contracts,-9000\n2026-01-31,401,Contracts,-250\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', actuals)
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: preview.fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const closed = await view(forecast.id)
 assert.equal(closed.calculation.profit[0].revenue, 925000, 'accepted P&L is authoritative')
 assert.equal(closed.calculation.cash[0].collections, 25000, 'only unrelated actual collections; no invented contract cash residual')
 assert.equal(closed.calculation.cash[1].collections, 3000000, 'quarterly invoice cash plan remains separate')
 assert.match(closed.calculation.cash[0].incompleteReasons[0], /accepted revenue \$9,000.00.*\$10,000.00.*not billing actuals/)
 assert.ok(closed.cashHealth.incompleteReasons.length)
 assert.equal(closed.cashHealth.months[0].floorBreached, null)
 assert.equal(closed.cashHealth.months[0].runwayBreached, null)
 const dashboard = await h.command('dashboard-save', { name: 'Contract cash status', scenario: forecast.id, department: '', audience: 'board', widgets: [{ metric: 'closingCash', display: 'table' }, { metric: 'runway', display: 'tile' }] })
 const dashboardView = await h.get(`/api/easel/dashboards/${dashboard.id}`, board)
 assert.equal(dashboardView.rows[0].revenue, 925000)
 assert.equal(dashboardView.rows[0].closingCash, null); assert.equal(dashboardView.rows[0].runway, null); assert.equal(dashboardView.rows[0].burn, null)
 assert.match(dashboardView.rows[0].runwayBasis, /Incomplete contract receipt allocation/)
 const rule = await h.command('metric-rule-save', { name: 'Review contract runway', kind: 'runway', owner: 'owner@example.test', runway: '12', dueDays: '1', enabled: true })
 const tasks = await h.get('/api/easel/metric-tasks')
 assert.equal(tasks.tasks.filter(t => t.rule === rule.id).length, 0)
 assert.match(tasks.rules.find(r => r.id === rule.id).blocked, /Incomplete contract receipt allocation/)
 assert.ok(closed.calculation.cash.slice(1).every(m => m.incompleteReasons.length))
 assert.ok(closed.calculation.balanceSheet[0].causes.some(c => c.includes('Unresolved receipt allocation')))
 assert.match(closed.calculation.cashFlow[0].trace, /INCOMPLETE/)
 assert.equal(closed.calculation.balanceSheet[0].receivables, 3000000, 'retain known invoice AR, without an actual-minus-plan plug')
 assert.equal(closed.calculation.balanceSheet[0].balanceDifference, 100000)
 assert.equal(closed.calculation.cashFlow[0].difference, -100000)
 const pack = await h.command('pack-create', { forecast: forecast.id, month: '2026-01', title: 'Captured contract review' })
 await h.command('pack-publish', { pack: pack.id })
 const snap = (await h.get('/api/easel/state')).snapshots.find(s => s.kind === 'pack')
 const captured = await h.get(`/api/easel/snapshot/${snap.id}`, board)
 assert.deepEqual(captured.body.contracts.months, closed.calculation.contracts.months)
 assert.equal(captured.body.contracts.rows.length, 0); assert.equal(captured.body.contracts.invoices.length, 0)
 assert.ok(captured.body.cash[0].incompleteReasons.length)
 const packResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/pack/${pack.id}/document.xlsx`, { headers: { cookie: board } })
 const packBytes = Buffer.from(await packResponse.arrayBuffer()), packBook = await readWorkbook(packBytes); proveFormulas(packBook)
 assert.match(packBook.getWorksheet('Cash').getCell('E3').value, /incomplete cash/)
 assert.equal(packBook.getWorksheet('Contracts').getCell('C3').value, 3000000)
 for (const format of ['html', 'csv']) {
  const doc = await h.mf.dispatchFetch(`${h.origin}/api/easel/pack/${pack.id}/document.${format}`, { headers: { cookie: board } })
  const text = await doc.text(); assert.match(text, /incomplete cash/); assert.doesNotMatch(text, /Confidential annual|Private contract employee/)
 }
 const forecastContract = (await view(forecast.id)).inputs.revenue[0]
 await h.command('revenue', { ...body, scenario: forecast.id, id: forecastContract.id, dsoDays: '0' })
 assert.deepEqual(await h.get(`/api/easel/snapshot/${snap.id}`, board), captured)
 const samePack = await h.mf.dispatchFetch(`${h.origin}/api/easel/pack/${pack.id}/document.xlsx`, { headers: { cookie: board } })
 assert.deepEqual(Buffer.from(await samePack.arrayBuffer()), packBytes, 'published workbook stays captured after live edits')
 assert.deepEqual(await view(), frozen)
 const boardBook = await xlsx(board); proveFormulas(boardBook)
 assert.doesNotMatch(JSON.stringify(boardBook.worksheets.map(s => s.getSheetValues())), /Confidential|Private contract employee|contractValueCents/)
})
