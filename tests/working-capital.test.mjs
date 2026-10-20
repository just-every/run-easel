import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

const reconcile = calculation => {
 let retained = 0
 for (const [i, b] of calculation.balanceSheet.entries()) {
  const f = calculation.cashFlow[i], p = calculation.profit[i]
  retained += p.profit
  assert.equal(b.assets, b.cash + b.receivables + b.unbilledRevenue + b.inventory + b.prepaid + b.capitalPrepayments + b.fixedAssets, b.month)
  assert.equal(b.liabilities, b.payables + b.capitalPayables + b.deferredRevenue + b.accruedLiabilities + b.nonCashReserve + b.debt, b.month)
  assert.equal(b.equity, b.openingEquity + retained + b.contributedEquity)
  assert.equal(b.assets, b.liabilities + b.equity, b.month)
  assert.equal(f.operating, f.netIncome + f.nonCashExpense + f.receivablesChange + f.payablesChange + f.inventoryChange + f.deferredRevenueChange + f.unbilledRevenueChange + f.prepaidChange + f.accruedLiabilitiesChange)
  assert.equal(f.closing, f.opening + f.operating + f.investing + f.financing)
  assert.equal(f.closing, calculation.cash[i].closing)
  assert.equal(b.balanceDifference, 0); assert.equal(b.cashDifference, 0); assert.equal(f.difference, 0)
  assert.deepEqual(b.causes, [])
 }
}

test('FIN-002 day-based revenue and vendor terms, annual deferrals, prepaid amortization, earned payroll and quarterly bonuses reconcile with traces, proposals and frozen Excel', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Working capital studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Operations' })
 const line = async (name, extra = {}) => h.command('line', { name, type: 'operating-expense', ...extra })
 const sales = await line('Monthly sales', { type: 'revenue' }), annual = await line('Annual subscriptions', { type: 'revenue' })
 const vendor = await line('Supplier'), insurance = await line('Insurance'), payroll = await line('Payroll', { payroll: true }), bonus = await line('Quarterly bonuses', { payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const board = await h.person('board@example.test', 'viewer'), planner = await h.person('planner@example.test', 'contributor', [department.id])
 const common = { scenario: budget.id, department: department.id, start: '2026-01' }
 const revenueBody = { ...common, line: sales.id, name: 'Monthly invoice', kind: 'volume', startVolume: '1', rate: '10000', collectionMethod: 'dso', dsoDays: '45' }
 const revenue = await h.command('revenue', revenueBody)
 const vendorBody = { ...common, line: vendor.id, name: 'Vendor invoice', kind: 'recurring', amount: '3000', paymentMethod: 'terms', paymentTermDays: '30' }
 const vendorInput = await h.command('expense', vendorBody)
 const prepaidBody = { ...common, line: insurance.id, name: 'Private annual insurance', kind: 'prepaid', amount: '24000', amortizationMonths: '12', paymentMonth: '2026-01' }
 const prepaid = await h.command('expense', prepaidBody)
 const salaryBody = { ...common, line: payroll.id, title: 'Operations lead', holder: 'Private payroll holder', annualSalary: '12000', payDay: '5', payMonthOffset: '1' }
 const salary = await h.command('position', salaryBody)
 const bonusBody = { ...common, line: bonus.id, name: 'Quarterly bonus', kind: 'bonus', amount: '9000', payMonth: '2026-04' }
 const bonusInput = await h.command('expense', bonusBody)
 await h.command('revenue', { ...common, line: annual.id, name: 'Annual subscription', kind: 'contract', startDate: '2026-01-01', termMonths: '12', contractValue: '120000', billingCadence: 'annual', dsoDays: '0' })
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '100000' })
 const view = (id = budget.id, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
 const original = await view(), c = original.calculation
 reconcile(c)
 assert.deepEqual(c.balanceSheet.slice(0, 4).map(b => b.receivables), [1000000, 2000000, 2000000, 2000000])
 assert.deepEqual(c.balanceSheet.slice(0, 4).map(b => b.payables), [300000, 600000, 300000, 300000])
 assert.deepEqual(c.balanceSheet.map(b => b.deferredRevenue), Array.from({ length: 12 }, (_, i) => 11000000 - i * 1000000))
 assert.deepEqual(c.balanceSheet.map(b => b.prepaid), Array.from({ length: 12 }, (_, i) => 2200000 - i * 200000))
 assert.deepEqual(c.workingCapital.rows.filter(r => r.originId === prepaid.originId).map(r => r.prepaidExpense), Array(12).fill(200000))
 assert.deepEqual(c.balanceSheet.slice(0, 4).map(b => b.accruedLiabilities), [400000, 700000, 1000000, 400000])
 assert.deepEqual(c.cash.slice(0, 4).map(m => m.closing), [19600000, 19500000, 19800000, 19500000])
 assert.deepEqual(c.cash.slice(0, 4).map(m => m.payments), [2400000, 100000, 700000, 1300000])
 assert.match(c.cells.find(v => v.line === sales.id && v.month === '2026-01').sources[0].trace, /2026-01-31.*45 exact calendar days.*2026-03-17/)
 assert.match(c.cells.find(v => v.line === vendor.id && v.month === '2026-01').sources[0].trace, /vendor terms.*30 exact calendar days.*2026-03-02/)
 assert.match(c.workingCapital.rows.find(r => r.originId === salary.originId && r.month === '2026-02').trace, /2026-02-05/)
 assert.match(c.workingCapital.rows.find(r => r.originId === bonusInput.originId && r.month === '2026-04').trace, /2026-04-30/)
 assert.match(c.balanceSheet[0].trace, /estimate/)
 for (const [command, body, id, bads] of [
  ['revenue', revenueBody, revenue.id, [{ dsoDays: '-1' }, { dsoDays: '1.5' }, { dsoDays: '366' }, { collectionMethod: 'curve', dsoDays: undefined, collectionCurve: [{ days: 0, percent: '90' }] }, { collectionMethod: 'curve', dsoDays: undefined, collectionCurve: [{ days: 0, percent: '50' }, { days: 0, percent: '50' }] }, { collectionMethod: 'curve', collectionCurve: [{ days: 0, percent: '100' }] }]],
  ['expense', vendorBody, vendorInput.id, [{ paymentTermDays: '-1' }, { paymentTermDays: '366' }, { paymentTermDays: '1.5' }, { dpoDays: '30' }]],
  ['expense', prepaidBody, prepaid.id, [{ amount: '-1' }, { amortizationMonths: '0' }, { amortizationMonths: '1.5' }, { paymentMonth: '2026-02' }]],
  ['position', salaryBody, salary.id, [{ payDay: '0' }, { payDay: '32' }, { payMonthOffset: '4' }]],
  ['expense', bonusBody, bonusInput.id, [{ payMonth: '2026-02' }, { amount: '-1' }]],
 ]) for (const bad of bads) await h.command(command, { ...body, id, ...bad }, h.owner, 400)
 assert.deepEqual(await view(), original, 'refused edits are atomic')
 await h.command('expense', { ...prepaidBody, id: prepaid.id }, board, 403)
 await h.command('expense', { ...prepaidBody, id: prepaid.id }, planner, 409)
 const approval = await h.command('approve-budget', { scenario: budget.id, revision: original.scenario.revision })
 const frozen = await view(), forecast = approval.forecast
 await h.command('expense', { ...prepaidBody, id: prepaid.id }, h.owner, 409)
 const kept = await h.command('reforecast-save', { from: forecast.id, revision: forecast.revision, name: 'Working capital baseline' })
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Collection curve', request: 'Collect half now and half after 60 days' }, planner)
 const proposalView = await view(proposal.id, planner), proposalInput = proposalView.inputs.revenue.find(r => r.originId === revenue.originId)
 const agentEdit = await h.send('/api/easel/mcp', {jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'revenue',arguments:{...revenueBody,id:proposalInput.id,scenario:proposal.id,collectionMethod:'curve',dsoDays:undefined,collectionCurve:[{days:'0',percent:'50'},{days:'60',percent:'50'}]}}},planner)
 assert.equal(agentEdit.status,200);assert.ok(!agentEdit.value.error&&!agentEdit.value.result.isError,JSON.stringify(agentEdit.value))
 const curve = await view(proposal.id, planner); reconcile(curve.calculation)
 assert.equal(curve.calculation.balanceSheet[0].receivables, 500000)
 assert.match(curve.calculation.cells.find(v => v.line === sales.id && v.month === '2026-01').sources[0].trace, /collection curve.*2026-01-31.*2026-04-01/)
 await h.command('proposal-submit', { id: proposal.id }, planner)
 await h.command('proposal-promote', { id: proposal.id, revision: curve.scenario.revision - 1 }, h.owner, 409)
 await h.command('proposal-promote', { id: proposal.id, revision: curve.scenario.revision })
 assert.equal((await view(forecast.id)).calculation.balanceSheet[0].receivables, 500000)
 assert.deepEqual(await view(), frozen)
 assert.deepEqual((await view(kept.id)).calculation, frozen.calculation)
 const boardView = await view(kept.id, board)
 assert.deepEqual(boardView.calculation.balanceSheet, frozen.calculation.balanceSheet)
 assert.equal(boardView.calculation.workingCapital.rows.length, 0)
 assert.doesNotMatch(JSON.stringify(boardView), /Private annual insurance|Private payroll holder/)
 const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${kept.id}/document.xlsx`, { headers: { cookie: board } })
 assert.equal(response.status, 200)
 const book = await readWorkbook(await response.arrayBuffer()); proveFormulas(book)
 for (const [sheetName, amounts] of [['Balance sheet', [2200000, 400000]], ['Indirect cash flow', [-2200000, 400000]]]) {
  const sheet = book.getWorksheet(sheetName)
  for (const [index, pattern] of [/prepaid/i, /accrued/i].entries()) {
   const col = sheet.getRow(2).values.findIndex(value => typeof value === 'string' && pattern.test(value))
   assert.ok(col > 0, `${sheetName} exports ${pattern}`)
   assert.equal(evaluate(sheet, sheet.getCell(3, col).address), amounts[index])
  }
 }
 assert.doesNotMatch(JSON.stringify(book.worksheets.map(s => s.getSheetValues())), /Private annual insurance|Private payroll holder/)
})

test('FIN-002 opening estimates, cent conservation, DPO, clamped pay dates and closed recognition discrepancies remain explicit through public scenario commands', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Exact working capital', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Operations' }), budget = (await h.get('/api/easel/state')).scenarios[0]
 const line = async (name, extra = {}) => h.command('line', { name, type: 'operating-expense', ...extra })
 const prepaidLine = await line('Prepaid service'), salaryLine = await line('Payroll', { payroll: true }), bonusLine = await line('Bonus', { payroll: true }), supplierLine = await line('Supplier'), revenueLine = await line('Contract sales', { type: 'revenue' })
 const common = { scenario: budget.id, department: department.id }
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '10000', receivables: '1', payables: '2' })
 const prepay = await h.command('expense', { ...common, line: prepaidLine.id, name: 'Prior prepayment', kind: 'prepaid', amount: '100.01', amortizationMonths: '3', start: '2025-12', paymentMonth: '2025-11' })
 const payroll = await h.command('position', { ...common, line: salaryLine.id, title: 'Continuing payroll', annualSalary: '12000', start: '2025-12', payDay: '31', payMonthOffset: '1' })
 const bonus = await h.command('expense', { ...common, line: bonusLine.id, name: 'Exact quarterly bonus', kind: 'bonus', amount: '0.05', start: '2025-12', payMonth: '2026-03' })
 await h.command('expense', { ...common, line: supplierLine.id, name: 'DPO supplier', kind: 'one-off', amount: '10.01', start: '2026-01', paymentMethod: 'dpo', dpoDays: '30' })
 const contract = await h.command('revenue', { ...common, line: revenueLine.id, name: 'Invoice cent curve', kind: 'contract', start: '2026-01', startDate: '2026-01-31', termMonths: '2', contractValue: '100.01', billingCadence: 'monthly', collectionMethod: 'curve', collectionCurve: [{ days: 1, percent: '33.33' }, { days: 30, percent: '66.67' }] })
 const read = async id => h.get(`/api/easel/scenario/${id}`)
 const view = await read(budget.id), c = view.calculation
 reconcile(c)
 assert.deepEqual(c.workingCapital.opening, { prepaid: 6668, accruedLiabilities: 100001 })
 assert.deepEqual(c.balanceSheet.slice(0, 3).map(b => b.prepaid), [3335, 0, 0])
 assert.deepEqual(c.workingCapital.rows.filter(r => r.originId === prepay.originId).slice(0, 2).map(r => r.prepaidExpense), [3333, 3335])
 assert.deepEqual(c.workingCapital.rows.filter(r => r.originId === bonus.originId).slice(0, 3).map(r => [r.accruedExpense, r.accruedPayments, r.accruedLiabilities]), [[1, 0, 2], [3, 0, 5], [1, 5, 1]])
 assert.match(c.workingCapital.rows.find(r => r.originId === payroll.originId && r.month === '2026-02').trace, /2026-02-28/)
 assert.match(c.workingCapital.rows.find(r => r.originId === prepay.originId && r.month === '2026-01').trace, /opening \$66.68.*estimate/)
 assert.deepEqual(c.balanceSheet.slice(0, 3).map(b => b.payables), [1001, 1001, 0])
 assert.deepEqual(c.contracts.invoices.map(i => [i.collectionDate, i.amount]), [['2026-02-01', 1667], ['2026-03-02', 3333], ['2026-03-01', 1667], ['2026-03-30', 3334]])
 assert.equal(c.contracts.invoices.reduce((n, i) => n + i.amount, 0), 10001)
 assert.deepEqual(c.contracts.months.slice(0, 3).map(m => m.collections), [0, 1667, 8334])
 assert.deepEqual(c.contracts.months.slice(0, 3).map(m => m.revenue), [178, 4983, 4840])
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: view.scenario.revision })
 const forecast = approved.forecast
 for (const [account, target] of [['400', revenueLine.id], ['500', prepaidLine.id], ['600', salaryLine.id], ['610', bonusLine.id], ['700', supplierLine.id]]) await h.command('account-map', { account, target })
 await h.command('department-map', { source: 'Operations', department: department.id })
 const actuals = { filename: 'recognition.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Operations,-1.78\n2026-01-31,500,Operations,34\n2026-01-31,600,Operations,1000\n2026-01-31,610,Operations,0.01\n2026-01-31,700,Operations,10.01\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', actuals)
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: preview.fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const closed = (await read(forecast.id)).calculation
 assert.equal(closed.cells.find(cell => cell.line === prepaidLine.id && cell.month === '2026-01').amount, 3400)
 assert.equal(closed.balanceSheet[0].prepaid, 3335, 'known prepaid schedule remains an estimate, never an actuals plug')
 assert.equal(closed.balanceSheet[0].balanceDifference, 67)
 assert.equal(closed.cashFlow[0].difference, -67)
 assert.ok(closed.balanceSheet[0].causes.some(reason => /accepted expense \$34.00.*\$33.33.*CONNECT-007/.test(reason)))
 assert.equal(closed.balanceSheet[0].payables, 1001)
 assert.deepEqual(closed.contracts.invoices, c.contracts.invoices)
 assert.deepEqual((await read(budget.id)).calculation, c)
 // A prior-horizon annual invoice seeds the labelled contract opening balances.
 const branch = await h.command('branch', { from: budget.id, name: 'Opening deferred estimate' })
 const priorContract = (await read(branch.id)).inputs.revenue.find(r => r.originId === contract.originId)
 await h.command('revenue', { ...common, scenario: branch.id, id: priorContract.id, line: revenueLine.id, name: 'Prior annual invoice', kind: 'contract', start: '2025-12', startDate: '2025-12-01', termMonths: '12', contractValue: '120000', billingCadence: 'annual', dsoDays: '45' })
 const opening = (await read(branch.id)).calculation
 assert.deepEqual(opening.contracts.opening, { receivables: 12000000, deferredRevenue: 11000000, unbilledRevenue: 0 })
 assert.equal(opening.balanceSheet[0].deferredRevenue, 10000000)
 reconcile(opening)
 // An aggregate accepted row cannot silently pick one of conflicting vendor terms.
 await h.command('expense',{...common,scenario:forecast.id,line:supplierLine.id,name:'Second supplier timing',kind:'recurring',amount:'1',start:'2026-01',paymentMethod:'dpo',dpoDays:'60'})
 const ambiguous=await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
 assert.match(ambiguous.error,/different.*cash timing|cash timing.*different/i)
})
