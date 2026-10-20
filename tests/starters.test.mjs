import assert from 'node:assert/strict'
import test from 'node:test'
import { harness } from './harness.mjs'
import { acceptHistory, historyFile } from './history-fixture.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

const decimal = n => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const revenueBody = r => r.kind === 'customers' ? { ...r, startCustomers: decimal(r.startCustomers), newPerMonth: decimal(r.newPerMonth), newPerRep: decimal(r.newPerRep), churnPercent: decimal(r.churnBps), arpa: decimal(r.arpaCents) } : { ...r, startVolume: decimal(r.startVolume), growthPercent: decimal(r.growthBps), rate: decimal(r.rateCents) }
const expenseBody = e => ({ ...e, cac: decimal(e.cacCents ?? 0), unitCost: decimal(e.unitCostCents ?? 0) })

test('MODEL-006: four real editable USD starters reconcile statements, dashboards, inventory and acquisition drivers through HTTP and Excel', async () => {
 for (const starter of ['saas', 'services', 'project', 'wholesale']) {
  const h = await harness()
  try {
   const created = await h.command('starter-model', { name: `Ridgeline ${starter}`, starter, planStart: '2025-01' })
   const id = created.scenario.id
   const view = () => h.get(`/api/easel/scenario/${id}`)
   let v = await view()
   assert.equal(v.workspace.currency, 'USD'); assert.equal(v.calculation.months[0], '2025-01')
   assert.ok(v.departments.length); assert.ok(v.lines.length)
   assert.ok(v.inputs.revenue.length); assert.ok(v.inputs.position.length)
   assert.equal(v.calculation.cash.length, 12); assert.equal(v.calculation.balanceSheet.length, 12); assert.equal(v.calculation.cashFlow.length, 12)
   const balanced = calc => {
    for (const row of calc.balanceSheet) { assert.equal(row.balanceDifference, 0); assert.equal(row.cashDifference, 0); assert.equal(row.assets, row.liabilities + row.equity) }
    for (const row of calc.cashFlow) { assert.equal(row.difference, 0); assert.equal(row.closing, calc.cash.find(c => c.month === row.month).closing) }
   }
   balanced(v.calculation)
   const dashboards = await h.get('/api/easel/dashboards')
   assert.equal(dashboards.length, 1)
   const dashboardId = created.dashboard.id
   const dashboard = await h.get(`/api/easel/dashboards/${dashboardId}`)
   assert.ok(JSON.stringify(dashboard).includes('closingCash'))
   assert.equal(created.basis, 'starter assumptions')
   assert.ok(v.scenario.cash.note.includes('not imported actuals'))
   const total = (input, month = '2025-01') => v.calculation.cells.filter(c => c.line === input.line && c.department === input.department && c.month === month).reduce((sum, c) => sum + c.amount, 0)
   if (starter === 'saas') {
    const customers = v.inputs.revenue.find(r => r.kind === 'customers'), seats = v.inputs.revenue.find(r => r.kind === 'seats'), acquisition = v.inputs.expense.find(e => e.kind === 'acquisition')
    assert.equal(total(customers), 2160000); assert.equal(total(seats), 500000); assert.equal(total(acquisition), 500000)
    assert.match(v.calculation.cells.find(c => c.line === acquisition.line && c.month === '2025-01').sources[0].trace, /new customers 10\.00.*CAC \$500\.00/)
    await h.command('revenue', { ...revenueBody(customers), newPerMonth: '20' })
    v = await view(); assert.equal(total(customers), 2360000); assert.equal(total(acquisition), 1000000)
    await h.command('expense', { ...expenseBody(acquisition), cac: '600' })
    v = await view(); assert.equal(total(acquisition), 1200000)
    await h.command('input-delete', { kind: 'revenue', id: customers.id }, h.owner, 409)
   } else if (starter === 'services') {
    const service = v.inputs.revenue.find(r => r.kind === 'services')
    assert.equal(total(service), 5400000)
    assert.match(v.calculation.cells.find(c => c.line === service.line && c.month === '2025-01').sources[0].trace, /3 active positions.*160\.00.*75\.00%.*\$150\.00/)
    await h.command('revenue', { ...service, monthlyHours: '160', utilizationPercent: '80', hourlyRate: '175' })
    v = await view(); assert.equal(total(service), 6720000)
   } else if (starter === 'project') {
    const milestone = v.inputs.revenue.find(r => r.kind === 'milestones'), backlog = v.inputs.revenue.find(r => r.kind === 'backlog')
    assert.equal(total(milestone), 2000000); assert.equal(total(backlog), 5100000)
    assert.match(v.calculation.cells.find(c => c.line === milestone.line && c.month === '2025-01').sources[0].trace, /milestone Kickoff/)
    assert.match(v.calculation.cells.find(c => c.line === backlog.line && c.month === '2025-01').sources[0].trace, /opening backlog.*additions.*20\.00%/)
   } else {
    const units = v.inputs.revenue.find(r => r.kind === 'volume'), inventory = v.inputs.expense.find(e => e.kind === 'inventory')
    assert.equal(total(units), 8000000); assert.equal(total(inventory), 4500000)
    const { trace: inventoryTrace, ...stock } = v.calculation.inventory[0]
    assert.deepEqual(stock, { month: '2025-01', opening: 0, costOfSales: 4500000, purchases: 11032258, closing: 6532258 })
    assert.ok(inventoryTrace)
    assert.equal(v.calculation.balanceSheet[0].inventory, 6532258)
    assert.equal(v.calculation.cash[0].closing, 24410000)
    assert.equal(v.calculation.cash[1].closing, 20187742)
    assert.match(v.calculation.cells.find(c => c.line === inventory.line && c.month === '2025-01').sources[0].trace, /45 inventory days ÷ 31 calendar days/)
    const oldProfit = structuredClone(v.calculation.profit), oldCash = v.calculation.cash[1].closing
    await h.command('expense', { ...expenseBody(inventory), inventoryDays: 0 })
    v = await view(); assert.deepEqual(v.calculation.profit, oldProfit); assert.equal(v.calculation.balanceSheet[0].inventory, 0)
    assert.equal(v.calculation.cash[1].closing - oldCash, 6532258, 'Changing days changes actual stock funding, not COGS')
    await h.command('expense', { ...expenseBody(inventory), inventoryDays: 15, unitCost: '60' })
    v = await view(); assert.equal(total(inventory), 6000000); assert.equal(v.calculation.balanceSheet[0].inventory, 2903226)
    await h.command('revenue', { ...revenueBody(units), startVolume: '2000' })
    v = await view(); assert.equal(total(units), 16000000); assert.equal(total(inventory), 12000000)
   }
   if (['saas', 'wholesale'].includes(starter)) {
    const call = async (name, args) => {
     const response = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, h.owner)
     assert.equal(response.status, 200)
     assert.ok(!response.value.error && !response.value.result.isError, JSON.stringify(response.value))
     return response.value.result.structuredContent
    }
    const proposal = await call('proposal-create', { from: id, name: 'Revised starter assumptions', request: 'Review linked acquisition or inventory cost' })
    const proposed = await h.get(`/api/easel/scenario/${proposal.id}`)
    const linked = proposed.inputs.expense.find(e => ['acquisition', 'inventory'].includes(e.kind))
    const changed = await call('expense', { scenario: proposal.id, id: linked.id, name: linked.name, line: linked.line, department: linked.department, kind: linked.kind, start: linked.start, revenueOrigin: linked.revenueOrigin,
     ...(linked.kind === 'acquisition' ? { cac: '751' } : { unitCost: '61', inventoryDays: '15' }) })
    assert.equal(changed[linked.kind === 'acquisition' ? 'cacCents' : 'unitCostCents'], linked.kind === 'acquisition' ? 75100 : 6100)
    assert.deepEqual((await view()).calculation, v.calculation, 'An agent edits its proposal without changing the budget')
   }
   v = await view(); balanced(v.calculation)
   const viewer = await h.person('board@example.test', 'viewer')
   const read = await h.get(`/api/easel/scenario/${id}`, viewer)
   assert.equal(read.inputs.position.length, 0)
   assert.doesNotMatch(JSON.stringify(read), /annualSalaryCents|unitCostCents|cacCents/)
   await h.command('starter-model', { name: 'Overwrite', starter, planStart: '2026-01' }, h.owner, 409)
   const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${id}/document.xlsx`, { headers: { cookie: h.owner } })
   const book = await readWorkbook(await response.arrayBuffer()); proveFormulas(book)
   await h.command('approve-budget', { scenario: id, revision: v.scenario.revision })
   const frozen = await view()
   const forecast = (await h.get('/api/easel/state')).scenarios.find(s => s.kind === 'forecast')
   const working = await h.get(`/api/easel/scenario/${forecast.id}`)
   const cost = working.inputs.expense.find(e => ['acquisition', 'inventory'].includes(e.kind))
   if (cost) await h.command('expense', { ...expenseBody(cost), scenario: forecast.id, cac: '750', inventoryDays: 90 })
   assert.deepEqual((await view()).calculation, frozen.calculation, 'Starter arithmetic remains frozen after approval')
   if (starter === 'wholesale') {
    const units = working.inputs.revenue.find(r => r.kind === 'volume'), stock = working.inputs.expense.find(e => e.kind === 'inventory')
    await h.command('account-map', { account: '400', target: units.line })
    await h.command('account-map', { account: '500', target: stock.line })
    await h.command('department-map', { source: 'Wholesale', department: units.department })
    await acceptHistory(h.kit, historyFile('closed-sales.csv', ['2025-01-15,400,Wholesale,-160000,Accepted sales']))
    await h.command('close-month', { scenario: forecast.id, month: '2025-01' })
    const unavailable = await h.get(`/api/easel/scenario/${forecast.id}`, h.owner, 409)
    assert.match(unavailable.error, /Missing accepted inventory COGS/)
    await acceptHistory(h.kit, historyFile('zero-cogs.csv', ['2025-01-15,500,Wholesale,0,Accepted zero COGS']))
    const current = await h.get(`/api/easel/scenario/${forecast.id}`)
    assert.equal(current.calculation.inventory[0].costOfSales, 0, 'An accepted zero COGS cell is available')
    balanced(current.calculation)
   }

  } finally { await h.close() }
 }
})
