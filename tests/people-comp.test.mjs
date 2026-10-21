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
