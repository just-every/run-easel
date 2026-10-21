import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

test('PEOPLE-004 REV-004 linked commission planning estimates round once, follow payroll cash/taxes, preserve captures and enforce PEOPLE-005', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Commission planning', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' }), other = await h.command('department', { name: 'Other' })
 const revenue = await h.command('line', { name: 'Bookings', type: 'revenue' })
 // Deliberately use a non-payroll-marked line: the position source must still protect pay.
 const salary = await h.command('line', { name: 'Sales cost', type: 'operating-expense' })
 const income = await h.command('line', { name: 'Income tax planning estimate', type: 'operating-expense' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0].id
 const positionBody = { scenario, department: sales.id, line: salary.id, title: 'Account executive', holder: 'Private commission sentinel', annualSalary: '1200', onCostPercent: '25', start: '2026-01', employmentType: 'W-2', commissionPercent: '10', payDay: '15', payMonthOffset: '1' }
 const position = await h.command('position', positionBody)
 const body = { scenario, name: 'Annual agreement', kind: 'contract', department: sales.id, line: revenue.id, start: '2026-01', startDate: '2026-01-01', termMonths: '12', contractValue: '1000.05', billingCadence: 'annual', dsoDays: '0', commissionPosition: position.originId }
 const contract = await h.command('revenue', body)
 const view = (id = scenario, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
 const cost = (v, month = '2026-01') => v.calculation.cells.find(c => c.line === salary.id && c.department === sales.id && c.month === month)
 let current = await view()
 assert.equal(position.commissionRateBps, 1000)
 assert.equal(current.inputs.revenue[0].commissionPosition, position.originId)
 assert.equal(cost(current).amount, 22501, '12500 salary/on-cost cents plus 10001 commission cents; half cent rounds away once')
 assert.equal(cost(current, '2026-02').amount, 12500, 'commission is expensed only in the booking start period')
 assert.match(cost(current).sources[0].trace, /Commission planning estimate.*1,000.05.*10.00%.*100.01.*once half-away.*no on-costs.*ASC 340-40/)
 assert.equal(current.calculation.cash[0].payments, 0)
 assert.equal(current.calculation.cash[1].payments, 22501, 'commission follows the position pay date, without an extra immediate payment')
 const policy = { scenario, line: income.id, department: sales.id, socialSecurityPercent: '10', socialSecurityBase: '150', medicarePercent: '10', futaPercent: '10', futaBase: '50', sutaPercent: '10', sutaBase: '75', federalIncomePercent: '0', stateIncomePercent: '0' }
 await h.command('tax-policy', policy)
 current = await view()
 const janTax = current.calculation.taxes.payrollRows[0]
 assert.deepEqual([janTax.wagesCents, janTax.ytdWagesCents, janTax.socialSecurityCents, janTax.medicareCents, janTax.futaCents, janTax.sutaCents, janTax.totalCents], [20001, 20001, 1500, 2000, 500, 750, 4750])
 assert.equal(cost(current).amount, 27251)
 assert.equal(current.calculation.cash[1].payments, 27251)
 assert.deepEqual(current.calculation.taxes.payrollRows.slice(1).map(r => r.totalCents), Array(11).fill(1000), 'annual wage bases are not taxed twice')
 for (const [i, row] of current.calculation.balanceSheet.entries()) {
  assert.equal(row.balanceDifference, 0); assert.equal(current.calculation.cashFlow[i].difference, 0)
 }
 const original = current
 for (const changes of [{ commissionPosition: 'missing' }, { start: '2025-12', startDate: '2025-12-01' }]) await h.command('revenue', { ...body, id: contract.id, ...changes }, h.owner, 409)
 for (const changes of [{ start: '2026-02' }, { end: '2025-12', start: '2025-11' }]) await h.command('position', { ...positionBody, id: position.id, ...changes }, h.owner, 409)
 await h.command('input-delete', { kind: 'position', id: position.id }, h.owner, 409)
 await h.command('line', { id: salary.id, name: salary.name, type: salary.type, nonCash: true }, h.owner, 409)
 for (const commissionPercent of ['-1', '100.01', '0.001']) await h.command('position', { ...positionBody, id: position.id, commissionPercent }, h.owner, 400)
 assert.deepEqual(await view(), original, 'all refused writes preserve both inputs and the exact scenario revision')
 // A prior-period booking still settles inside the horizon under its entered payroll date.
 const prior = await h.command('branch', { from: scenario, name: 'Prior booking settlement' })
 const priorView = await view(prior.id)
 const priorPosition = priorView.inputs.position[0], priorContract = priorView.inputs.revenue[0]
 await h.command('position', { ...positionBody, id: priorPosition.id, scenario: prior.id, start: '2025-12', annualSalary: '0', employmentType: '1099' })
 await h.command('revenue', { ...body, id: priorContract.id, scenario: prior.id, start: '2025-12', startDate: '2025-12-01' })
 const settlement = (await view(prior.id)).calculation
 assert.equal(settlement.cash[0].payments, 10001)
 assert.equal(settlement.workingCapital.opening.accruedLiabilities, 10001)
 assert.equal(settlement.profit[0].operatingExpenses, 0, 'a prior booking is not expensed again inside the horizon')
 const branch = await h.command('branch', { from: scenario, name: 'Other scenario' })
 const foreign = await h.command('position', { ...positionBody, scenario: branch.id, title: 'Foreign origin' })
 await h.command('revenue', { ...body, id: contract.id, commissionPosition: foreign.originId }, h.owner, 409)
 const late = await h.command('position', { ...positionBody, title: 'Starts later', start: '2026-02' })
 await h.command('revenue', { ...body, commissionPosition: late.originId }, h.owner, 409)
 // Multiple explicit contracts add after each contract's single rounding; a 1099 has no employer taxes.
 const contractor = await h.command('position', { ...positionBody, title: 'Contractor', holder: 'Private contractor commission', annualSalary: '0', onCostPercent: '99', employmentType: '1099', commissionPercent: '33.33' })
 await h.command('revenue', { ...body, name: 'Small booking A', contractValue: '0.05', commissionPosition: contractor.originId })
 await h.command('revenue', { ...body, name: 'Small booking B', contractValue: '0.05', commissionPosition: contractor.originId })
 current = await view()
 assert.equal(current.calculation.taxes.payrollRows.find(r => r.originId === contractor.originId).wagesCents, 4)
 assert.equal(current.calculation.taxes.payrollRows.find(r => r.originId === contractor.originId).totalCents, 0)
 assert.equal(cost(current).amount, 27255, 'two 2-cent commissions; 99% on-costs add nothing to commission')
 const analyst = await h.person('analyst@example.test', 'finance', [], false)
 const head = await h.person('head@example.test', 'contributor', [sales.id], false)
 const outsider = await h.person('outsider@example.test', 'contributor', [other.id])
 const board = await h.person('board@example.test', 'viewer')
 await h.command('request-submissions', { scenario, departments: [sales.id] })
 const restricted = /Private commission sentinel|Private contractor commission|commissionPosition|commissionRateBps|Commission planning estimate: contract/
 for (const cookie of [analyst, head, outsider, board]) {
  const safe = await view(scenario, cookie)
  assert.equal(cost(safe).amount, 27255)
  assert.doesNotMatch(JSON.stringify(safe), restricted)
  assert.doesNotMatch(JSON.stringify(await h.get(`/api/easel/compare?a=${scenario}&b=${branch.id}`, cookie)), restricted)
  await h.command('revenue', { ...body, id: contract.id, contractValue: '999' }, cookie, 403)
  await h.command('input-delete', { kind: 'revenue', id: contract.id }, cookie, 403)
 }
 // Live grant revocation also applies to an already issued API token and the MCP door.
 await h.command('pay-detail', { email: 'head@example.test', granted: true })
 await h.stepUp(head)
 const minted = await h.send('/api/easel/tokens/issue', { label: 'Commission reader', kind: 'personal', scope: 'read' }, head)
 assert.equal(minted.status, 200)
 await h.command('pay-detail', { email: 'head@example.test', granted: false })
 const tokenRead = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}`, { headers: { authorization: `Bearer ${minted.value.token}` } })
 assert.equal(tokenRead.status, 200); assert.doesNotMatch(await tokenRead.text(), restricted)
 const rpc = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'scenario', arguments: { scenario } } }, head)
 assert.equal(rpc.status, 200); assert.equal(rpc.value.result.isError, undefined); assert.doesNotMatch(JSON.stringify(rpc.value), restricted)
 for (const cookie of [h.owner, analyst, board]) {
  const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}/document.xlsx`, { headers: { cookie } })
  assert.equal(response.status, 200)
  const book = await readWorkbook(await response.arrayBuffer()); proveFormulas(book)
  if (cookie !== h.owner) assert.doesNotMatch(JSON.stringify(book.worksheets.map(s => s.getSheetValues())), restricted)
  else assert.match(JSON.stringify(book.worksheets.map(s => s.getSheetValues())), /Commission planning estimate/)
 }
 await h.command('submit', { scenario, department: sales.id }, head)
 const approved = await h.command('approve-budget', { scenario, revision: (await view()).scenario.revision })
 const frozen = await view(), forecast = approved.forecast.id
 const kept = await h.command('reforecast-save', { from: forecast, revision: (await view(forecast)).scenario.revision, name: 'Commission baseline' })
 const snapshots = (await h.get('/api/easel/state')).snapshots
 for (const sn of snapshots) {
  const safe = await h.get(`/api/easel/snapshot/${sn.id}`, analyst)
  assert.doesNotMatch(JSON.stringify(safe), restricted)
 }
 const proposal = await h.command('proposal-create', { from: forecast, name: 'Commission assumption', request: 'Review a different commission planning rate' })
 const copied = (await view(proposal.id)).inputs.position.find(p => p.originId === position.originId)
 const mcp = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'position', arguments: { ...positionBody, scenario: proposal.id, id: copied.id, commissionPercent: '20' } } }, h.owner)
 assert.equal(mcp.status, 200); assert.equal(mcp.value.result.isError, undefined)
 assert.equal(cost(await view(proposal.id)).amount, 38255)
 await h.command('proposal-submit', { id: proposal.id })
 const revision = (await view(proposal.id)).scenario.revision
 await h.command('proposal-promote', { id: proposal.id, revision: revision - 1 }, h.owner, 409)
 await h.command('proposal-promote', { id: proposal.id, revision })
 assert.equal(cost(await view(forecast)).amount, 38255)
 assert.deepEqual(await view(), frozen)
 assert.deepEqual((await view(kept.id)).calculation, frozen.calculation)
 assert.deepEqual((await h.get('/api/easel/state')).snapshots, snapshots, 'immutable captures and hashes do not change after promotion')
})


test('PEOPLE-004 hourly pay, benefits and 401(k) estimates reconcile through taxes, payroll timing, proposals, captures and PEOPLE-005', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Base compensation estimates', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Engineering' })
 const salary = await h.command('line', { name: 'Compensation', type: 'operating-expense' })
 const income = await h.command('line', { name: 'Tax estimate', type: 'operating-expense' })
 const revenue = await h.command('line', { name: 'Bookings', type: 'revenue' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0].id
 const body = { scenario, department: dept.id, line: salary.id, title: 'Hourly engineer', holder: 'Private hourly sentinel', start: '2026-01', payBasis: 'hourly', annualSalary: '0', hourlyRate: '40', expectedHours: '120', onCostPercent: '10', benefits: '1200', retirementMatchPercent: '4', commissionPercent: '10', payDay: '15', payMonthOffset: '1' }
 const hourly = await h.command('position', body)
 const view = (id = scenario, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
 const source = (v, origin = hourly.originId, month = '2026-01') => v.calculation.cells.find(c => c.line === salary.id && c.month === month).sources.find(s => s.id === origin)
 let current = await view()
 assert.equal(source(current).amount, 480000 + 48000 + 120000 + 19200)
 assert.match(source(current).trace, /Hourly pay planning estimate:.*40.00.*120.00.*4,800.00/)
 assert.match(source(current).trace, /benefits per person per period.*1,200.00.*401\(k\).*4.00%.*192.00.*excluding commission/)
 assert.equal(current.calculation.cash[0].payments, 0)
 assert.equal(current.calculation.cash[1].payments, 667200)
 const policy = { scenario, line: income.id, department: dept.id, socialSecurityPercent: '10', socialSecurityBase: '1000000', medicarePercent: '10', futaPercent: '10', futaBase: '1000000', sutaPercent: '10', sutaBase: '1000000', federalIncomePercent: '0', stateIncomePercent: '0' }
 await h.command('tax-policy', policy)
 current = await view()
 const tax = current.calculation.taxes.payrollRows.find(r => r.originId === hourly.originId && r.month === '2026-01')
 assert.deepEqual([tax.wagesCents, tax.socialSecurityCents, tax.medicareCents, tax.futaCents, tax.sutaCents], [480000, 48000, 48000, 48000, 48000])
 assert.equal(source(current).amount, 859200, 'hourly wages + on-costs + benefits + match + each employer tax')
 await h.command('revenue', { scenario, name: 'Explicit hourly commission', kind: 'contract', department: dept.id, line: revenue.id, start: '2026-01', startDate: '2026-01-01', termMonths: '12', contractValue: '1000.05', billingCadence: 'annual', dsoDays: '0', commissionPosition: hourly.originId })
 current = await view()
 assert.equal(source(current).amount, 873201, 'commission enters taxable wages but does not increase on-costs or retirement match')
 assert.equal(current.calculation.taxes.payrollRows.find(r => r.originId === hourly.originId).wagesCents, 490001)
 const salariedBody = { ...body, title: 'Salary with benefits', holder: 'Private salary sentinel', payBasis: 'salary', annualSalary: '120000', hourlyRate: '0', expectedHours: '0', onCostPercent: '20', employmentType: '1099', commissionPercent: '0' }
 const salaried = await h.command('position', salariedBody)
 current = await view()
 assert.equal(source(current, salaried.originId).amount, 1000000 + 200000 + 120000 + 40000)
 assert.equal(current.calculation.taxes.payrollRows.find(r => r.originId === salaried.originId).totalCents, 0, '1099 still has zero employer taxes')
 const fractional = await h.command('position', { ...body, title: 'Fractional hourly rounding', holder: '', hourlyRate: '0.05', expectedHours: '0.10', onCostPercent: '50', benefits: '0', retirementMatchPercent: '50', employmentType: '1099', end: '2026-01' })
 current = await view()
 assert.equal(source(current, fractional.originId).amount, 3, 'half-cent wages, on-costs and match each round once half-away')
 assert.equal(current.calculation.headcount[dept.id]['2026-01'], 3)
 const before = current
 for (const changes of [{ payBasis: 'other' }, { annualSalary: '1' }, { hourlyRate: '-1' }, { expectedHours: '1.001' }, { benefits: '-1' }, { retirementMatchPercent: '100.01' }, { payBasis: 'salary', annualSalary: '100' }]) {
  await h.command('position', { ...body, id: hourly.id, ...changes }, h.owner, 400)
 }
 await h.command('position', { ...body, id: hourly.id, hourlyRate: '1000000', expectedHours: '1000000' }, h.owner, 409)
 await h.command('position', { ...body, id: hourly.id, hourlyRate: '100000000000', expectedHours: '100000000000' }, h.owner, 409)
 assert.deepEqual(await view(), before, 'invalid compensation never changes the model or revision')
 for (const [i, row] of current.calculation.balanceSheet.entries()) {
  assert.equal(row.balanceDifference, 0); assert.equal(current.calculation.cashFlow[i].difference, 0)
 }
 const analyst = await h.person('comp-analyst@example.test', 'finance', [], false)
 const board = await h.person('comp-board@example.test', 'viewer')
 const forbidden = /Private hourly sentinel|Private salary sentinel|expectedHours|retirementMatchBps|benefitsCents|Hourly pay planning estimate|match base is salary/
 for (const cookie of [analyst, board]) {
  const safe = await view(scenario, cookie)
  assert.equal(safe.calculation.cells.find(c => c.line === salary.id && c.month === '2026-01').amount, 873201 + 1360000 + 3)
  assert.doesNotMatch(JSON.stringify(safe), forbidden)
  await h.command('position', { ...body, id: hourly.id, benefits: '1' }, cookie, 403)
 }
 for (const cookie of [h.owner, analyst, board]) {
  const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}/document.xlsx`, { headers: { cookie } })
  assert.equal(response.status, 200)
  const book = await readWorkbook(await response.arrayBuffer()); proveFormulas(book)
  const data = JSON.stringify(book.worksheets.map(s => s.getSheetValues()))
  if (cookie === h.owner) assert.match(data, /Hourly pay planning estimate/)
  else assert.doesNotMatch(data, forbidden)
 }
 const approval = await h.command('approve-budget', { scenario, revision: current.scenario.revision })
 const frozen = await view()
 const proposal = await h.command('proposal-create', { from: approval.forecast.id, name: 'Hourly hours change', request: 'Review 100 hours' })
 const copied = (await view(proposal.id)).inputs.position.find(p => p.originId === hourly.originId)
 const rpc = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'position', arguments: { ...body, scenario: proposal.id, id: copied.id, expectedHours: '100' } } }, h.owner)
 assert.equal(rpc.status, 200); assert.equal(rpc.value.result.isError, undefined)
 const proposed = await view(proposal.id)
 assert.equal(source(proposed).amount, 750001)
 const comparison = await h.get(`/api/easel/compare?a=${approval.forecast.id}&b=${proposal.id}`)
 assert.match(JSON.stringify(comparison), /expectedHours/)
 assert.doesNotMatch(JSON.stringify(await h.get(`/api/easel/compare?a=${approval.forecast.id}&b=${proposal.id}`, analyst)), forbidden)
 await h.command('proposal-submit', { id: proposal.id })
 await h.command('proposal-promote', { id: proposal.id, revision: proposed.scenario.revision })
 assert.equal(source(await view(approval.forecast.id)).amount, 750001)
 assert.deepEqual(await view(), frozen, 'approved estimates and their component arithmetic remain immutable')
 // Continuing hourly service uses the same components in estimated opening payroll accruals.
 const prior = await h.command('branch', { from: approval.forecast.id, name: 'Prior hourly accrual' })
 const priorPosition = (await view(prior.id)).inputs.position.find(p => p.originId === hourly.originId)
 await h.command('position', { ...body, scenario: prior.id, id: priorPosition.id, start: '2025-12', employmentType: '1099' })
 const priorView = await view(prior.id)
 assert.equal(priorView.calculation.workingCapital.opening.accruedLiabilities, 667200)
})

test('PEOPLE-004 dated merit, March salary bonus, captured department defaults and marginal quota accelerators reach every compensation component through HTTP', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Complete compensation planning', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Engineering', onCostDefaultPercent: '12' })
 const salary = await h.command('line', { name: 'Compensation planning', type: 'operating-expense', payroll: true })
 const revenue = await h.command('line', { name: 'Contract bookings', type: 'revenue' })
 const income = await h.command('line', { name: 'Tax estimates', type: 'operating-expense' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0].id
 const body = { scenario, title: 'Engineer', holder: 'Private merit sentinel', department: dept.id, line: salary.id, start: '2026-01', annualSalary: '120000', onCostPercent: '', meritPercent: '10', meritDate: '2026-02-15', bonusPercent: '10', bonusMonth: '2026-03', benefits: '1200', retirementMatchPercent: '4', payDay: '15', payMonthOffset: '1' }
 const engineer = await h.command('position', body)
 const view = (id = scenario, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
 const source = (v, month, origin = engineer.originId) => v.calculation.cells.find(c => c.line === salary.id && c.month === month).sources.find(s => s.id === origin)
 let current = await view()
 assert.equal(engineer.onCostBps, 1200); assert.equal(engineer.onCostSource, 'department')
 assert.equal(source(current, '2026-01').amount, 1280000)
 // February 15–28 = 14/28 inclusive days: $500 merit, $60 extra on-costs, $20 extra match.
 assert.equal(source(current, '2026-02').amount, 1338000)
 assert.equal(source(current, '2026-03').amount, 2716000, '$11,000 wages + $1,320 on-cost + $1,200 benefits + $440 match + $13,200 one-off bonus')
 assert.equal(source(current, '2026-04').amount, 1396000, 'bonus is not silently repeated')
 assert.match(source(current, '2026-02').trace, /Merit planning estimate.*2026-02-15.*14\/28.*500.00/)
 assert.match(source(current, '2026-03').trace, /Position bonus planning estimate.*13,200.00.*paid in 2026-03/)
 assert.match(source(current, '2026-03').trace,/regular payroll, excluding position bonus.*bonus period itself, with no month offset/)
 assert.equal(current.calculation.cash[0].payments, 0)
 assert.equal(current.calculation.cash[2].payments, 1338000 + 1320000, 'March bonus cash is paid in March while February regular cost settles')
 await h.command('department', { id: dept.id, name: dept.name, onCostDefaultPercent: '25' })
 assert.equal(source(await view(), '2026-01').amount, 1280000, 'changing default cannot silently change a saved position')
 const override = await h.command('position', { ...body, title: 'Explicit override contractor', holder: '', annualSalary: '1200', onCostPercent: '0', employmentType: '1099', meritPercent: '0', meritDate: '', bonusPercent: '0', bonusMonth: '', benefits: '0', retirementMatchPercent: '0' })
 assert.equal(override.onCostBps,0); assert.equal(override.onCostSource,'position')
 const inherited = await h.command('position', { ...body, title: 'New default contractor', holder: '', annualSalary: '1200', employmentType: '1099', meritPercent: '0', meritDate: '', bonusPercent: '0', bonusMonth: '', benefits: '0', retirementMatchPercent: '0' })
 assert.equal(inherited.onCostBps,2500)
 const defaults=await h.command('tax-policy',{scenario,line:income.id,department:dept.id,sutaPercent:'0',sutaBase:'0',stateIncomePercent:'0'})
 assert.deepEqual([defaults.year,defaults.socialSecurityBps,defaults.socialSecurityBaseCents,defaults.medicareBps,defaults.futaBps,defaults.futaBaseCents],[2026,620,18450000,145,600,700000])
 await h.command('tax-policy', { id: defaults.id, scenario, line: income.id, department: dept.id, socialSecurityPercent: '10', socialSecurityBase: '1000000', medicarePercent: '10', futaPercent: '10', futaBase: '1000000', sutaPercent: '10', sutaBase: '1000000', federalIncomePercent: '0', stateIncomePercent: '0' })
 current = await view()
 const tax = current.calculation.taxes.payrollRows.find(r => r.originId === engineer.originId && r.month === '2026-03')
 assert.deepEqual([tax.wagesCents,tax.socialSecurityCents,tax.medicareCents,tax.futaCents,tax.sutaCents,tax.bonusTaxCents], [2420000,242000,242000,242000,242000,528000])
 assert.equal(source(current,'2026-03').amount,3684000)
 assert.equal(current.calculation.cash[2].payments, 1338000 + 420000 + 1320000 + 528000 + 10000 + 12500, 'regular February costs/taxes plus current March bonus and its incremental taxes')
 assert.equal(current.calculation.taxes.payrollRows.find(r=>r.originId===override.originId).totalCents,0)
 // Separate monthly quota: $1000 at 10%, next $500 at 15%, remaining $500 at 20% = $275.
 const repBody = { ...body, title:'Quota salesperson', holder:'Private quota sentinel', annualSalary:'0', onCostPercent:'0', meritDate:'',meritPercent:'0',bonusPercent:'0',bonusMonth:'',benefits:'0',retirementMatchPercent:'0',commissionPercent:'10',commissionQuota:'1000',commissionTiers:'100:15\n150:20', employmentType:'1099' }
 const rep = await h.command('position',repBody)
 const booking = { scenario, name:'Quota booking',kind:'contract',department:dept.id,line:revenue.id,start:'2026-01',startDate:'2026-01-01',termMonths:'12',contractValue:'2000',billingCadence:'annual',dsoDays:'0',commissionPosition:rep.originId }
 await h.command('revenue',booking)
 await h.command('revenue',{...booking,name:'Next-period quota',start:'2026-02',startDate:'2026-02-01',contractValue:'1000'})
 current = await view()
 assert.equal(source(current,'2026-01',rep.originId).amount,27500)
 assert.equal(source(current,'2026-02',rep.originId).amount,10000,'quota resets in the next accounting period')
 assert.match(source(current,'2026-01',rep.originId).trace,/quota.*1,000.00.*attainment 200.00%.*1,000.00 × 10.00%.*500.00 × 15.00%.*500.00 × 20.00%/)
 // A second same-period booking is above every threshold, regardless of stable origin-ID ordering.
 await h.command('revenue',{...booking,name:'Extra booking',contractValue:'1000'})
 assert.equal(source(await view(),'2026-01',rep.originId).amount,47500)
 const before = await view()
 for(const changes of [{meritDate:'2026-02-30'},{meritDate:''},{meritPercent:'-1'},{bonusMonth:'2026-13'},{bonusMonth:'2025-12'},{bonusPercent:'100.01'},{payBasis:'hourly',annualSalary:'0',hourlyRate:'40',expectedHours:'120'}]) await h.command('position',{...body,id:engineer.id,...changes},h.owner,400)
 for(const changes of [{commissionQuota:'0'},{commissionTiers:'100:15\n100:20'},{commissionTiers:'100:5'},{commissionTiers:'100:15\n90:20'},{commissionTiers:'junk'}]) await h.command('position',{...repBody,id:rep.id,...changes},h.owner,400)
 assert.deepEqual(await view(),before,'all invalid assumptions refuse atomically')
 const analyst = await h.person('synthetic-analyst@example.test','finance',[],false)
 const board = await h.person('synthetic-board@example.test','viewer')
 const restricted = /Private merit sentinel|Private quota sentinel|meritDate|bonusBps|commissionQuotaCents|commissionTiers|Merit planning estimate|Position bonus planning estimate|marginal tiers/
 for(const cookie of [analyst,board]) {
  const safe=await view(scenario,cookie)
  assert.doesNotMatch(JSON.stringify(safe),restricted)
  assert.equal(safe.calculation.profit[2].operatingExpenses,(await view()).calculation.profit[2].operatingExpenses)
  const response=await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}/document.xlsx`,{headers:{cookie}})
  assert.equal(response.status,200)
  const book=await readWorkbook(await response.arrayBuffer());proveFormulas(book)
  assert.doesNotMatch(JSON.stringify(book.worksheets.map(s=>s.getSheetValues())),restricted)
 }
 const response=await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}/document.xlsx`,{headers:{cookie:h.owner}})
 const book=await readWorkbook(await response.arrayBuffer());proveFormulas(book)
 assert.match(JSON.stringify(book.worksheets.map(s=>s.getSheetValues())),/Merit planning estimate/)
 const approved=await h.command('approve-budget',{scenario,revision:(await view()).scenario.revision})
 const frozen=await view()
 const forecast=approved.forecast.id
 const proposal=await h.command('proposal-create',{from:forecast,name:'Review merit',request:'Review a larger dated merit estimate'})
 const copied=(await view(proposal.id)).inputs.position.find(p=>p.originId===engineer.originId)
 const rpc=await h.send('/api/easel/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'position',arguments:{...body,scenario:proposal.id,id:copied.id,meritPercent:'20'}}},h.owner)
 assert.equal(rpc.status,200);assert.equal(rpc.value.result.isError,undefined)
 await h.command('proposal-submit',{id:proposal.id})
 await h.command('proposal-promote',{id:proposal.id,revision:(await view(proposal.id)).scenario.revision})
 assert.notEqual(source(await view(forecast),'2026-02').amount,source(frozen,'2026-02').amount)
 assert.deepEqual(await view(),frozen,'approval retains its captured rates, defaults and calculations')
 for(const [i,row] of (await view(forecast)).calculation.balanceSheet.entries()) {
  assert.equal(row.balanceDifference,0);assert.equal((await view(forecast)).calculation.cashFlow[i].difference,0)
 }
})

test('PEOPLE-004 merit uses inclusive leap/retail days, half-away cents and prior-service cash without rewriting captures', async t => {
 for (const retail of [false,true]) {
  const h=await harness(); t.after(()=>h.close())
  await h.command('workspace',{name:'Dated compensation bounds',currency:'USD',fiscalYearStart:1,planStart:'2028-01',...(retail?{calendar:'4-4-5',retailStartDate:'2028-01-02'}:{})})
  const dept=await h.command('department',{name:'Engineering'})
  const line=await h.command('line',{name:'Salary estimates',type:'operating-expense',payroll:true})
  const scenario=(await h.get('/api/easel/state')).scenarios[0].id
  const body={scenario,title:'Dated raise',department:dept.id,line:line.id,start:'2028-01',annualSalary:'120000',onCostPercent:'0',employmentType:'1099',meritPercent:'10',meritDate:retail?'2028-01-16':'2028-02-15'}
  const p=await h.command('position',body)
  const source=(v,month,origin=p.originId)=>v.calculation.cells.find(c=>c.line===line.id&&c.month===month).sources.find(s=>s.id===origin)
  let view=await h.get(`/api/easel/scenario/${scenario}`)
  assert.equal(source(view,retail?'2028-01':'2028-02').amount,retail?1050000:1051724)
  assert.match(source(view,retail?'2028-01':'2028-02').trace,retail?/14\/28/:/15\/29/)
  const tiny=await h.command('position',{...body,title:'Fractional cents',annualSalary:'0',payBasis:'hourly',hourlyRate:'0.05',expectedHours:'0.10',meritPercent:'100',meritDate:'2027-01-01',end:'2028-01'})
  view=await h.get(`/api/easel/scenario/${scenario}`)
  assert.equal(source(view,'2028-01',tiny.originId).amount,2,'half-cent wages round once to one cent, then a full 100% merit adds one cent')
  if(!retail) {
   const prior=await h.command('position',{...body,title:'Continuing service',start:'2027-11',meritDate:'2027-12-16',payDay:'15',payMonthOffset:'2'})
   view=await h.get(`/api/easel/scenario/${scenario}`)
   assert.match(source(view,'2028-01',prior.originId).trace,/31\/31/)
   assert.equal(view.calculation.cash[1].payments,1051724+1051613,'February pays current untimed leap-period salary plus prior December earned payroll with 16/31 merit days')
  }
 }
})
