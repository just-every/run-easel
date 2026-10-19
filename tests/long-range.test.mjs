import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

test('CYCLE-006 three-to-five-year strategy links the operating budget and reconciles every annual driver and target through API and Excel', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 10, planStart: '2026-10' })
 const dept = await h.command('department', { name: 'Consulting' })
 const revenue = await h.command('line', { name: 'Services', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Delivery payroll', type: 'operating-expense', payroll: true })
 const costs = await h.command('line', { name: 'Operations', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const viewer = await h.person('board@example.test', 'viewer')
 const contributor = await h.person('planner@example.test', 'contributor', [dept.id])
 const outsider = await h.person('outside@example.test', 'viewer')
 await h.command('member', { email: 'outside@example.test', name: 'Outside', role: 'viewer', active: false })
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '500000', collectionLag: 0, paymentLag: 0 })
 const driver = { scenario: budget.id, name: 'Service contracts', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-10', startVolume: '100', rate: '1000', collectionLag: 0 }
 const input = await h.command('revenue', driver)
 await h.command('position', { scenario: budget.id, title: 'Consultant', holder: 'Private salary person', department: dept.id, line: payroll.id, start: '2026-10', annualSalary: '120000' })
 await h.command('expense', { scenario: budget.id, name: 'Operating costs', kind: 'recurring', department: dept.id, line: costs.id, start: '2026-10', amount: '40000' })
 const readBudget = () => h.get(`/api/easel/scenario/${budget.id}`)
 let bv = await readBudget()
 const body = { name: 'Five-year strategy', budget: budget.id, budgetRevision: bv.scenario.revision, years: 5, priorYearRevenue: '1000000',
  targets: { growthPercent: '40', marginPercent: '25', headcount: 8, cash: '1500000' },
  drivers: [{ growthPercent: '20', marginPercent: '30', headcountChange: 2, cashChange: '200000' }, { growthPercent: '10', marginPercent: '35', headcountChange: 1, cashChange: '-50000' }, { growthPercent: '0', marginPercent: '20', headcountChange: -1, cashChange: '30000' }, { growthPercent: '-10', marginPercent: '-5', headcountChange: 0, cashChange: '-100000' }],
 }
 await h.command('long-range-save', body, viewer, 403)
 await h.command('long-range-save', body, contributor, 403)
 await h.command('long-range-save', { ...body, budgetRevision: 1 }, h.owner, 409)
 for (const invalid of [{ years: 2 }, { years: 6 }, { drivers: [] }, { drivers: [{ ...body.drivers[0], headcountChange: -2 }, ...body.drivers.slice(1)] }, { targets: { ...body.targets, growthPercent: '-100.01' } }, { targets: { ...body.targets, marginPercent: '100.01' } }]) await h.command('long-range-save', { ...body, ...invalid }, h.owner, 400)
 assert.deepEqual(await h.get('/api/easel/long-range'), [])
 const saved = await h.command('long-range-save', body)
 const url = `/api/easel/long-range/${saved.id}`
 let v = await h.get(url)
 assert.equal(v.rows.length, 5)
 assert.equal(v.rows[0].start, '2026-10'); assert.equal(v.rows[0].end, '2027-09')
 const expected = [
  [120000000, 60000000, 60000000, 1, 50000000, 60000000, 110000000],
  [144000000, 100800000, 43200000, 3, 110000000, 20000000, 130000000],
  [158400000, 102960000, 55440000, 4, 130000000, -5000000, 125000000],
  [158400000, 126720000, 31680000, 3, 125000000, 3000000, 128000000],
  [142560000, 149688000, -7128000, 3, 128000000, -10000000, 118000000],
 ]
 const targetRevenues = [140000000, 196000000, 274400000, 384160000, 537824000]
 for (const [i, row] of v.rows.entries()) {
  assert.deepEqual(['revenue', 'costs', 'profit', 'headcount', 'openingCash', 'cashChange', 'closingCash'].map(k => row[k]), expected[i])
  assert.equal(row.targetRevenue, targetRevenues[i]); assert.equal(row.targetProfit, targetRevenues[i] / 4)
  assert.equal(row.targetHeadcount, 8); assert.equal(row.targetCash, 150000000)
  assert.equal(row.revenueGap, row.revenue - row.targetRevenue)
  assert.equal(row.profitGap, row.profit - row.targetProfit)
  assert.equal(row.headcountGap, row.headcount - 8)
  assert.equal(row.cashGap, row.closingCash - 150000000)
  assert.ok(row.trace.length > 0)
 }
 assert.equal(v.rows[0].revenue, bv.calculation.profit.reduce((sum, p) => sum + p.revenue, 0))
 assert.equal(v.rows[0].profit, bv.calculation.profit.reduce((sum, p) => sum + p.profit, 0))
 assert.equal(v.rows[0].closingCash, bv.calculation.cash.at(-1).closing)
 assert.deepEqual(await h.get(url, viewer), v)
 assert.doesNotMatch(JSON.stringify(v), /Private salary person|annualSalary|Service contracts/)
 await h.get(url, outsider, 403)
 await h.get('/api/easel/long-range', outsider, 403)
 await h.get(`${url}/document.xlsx`, outsider, 403)
 const bookResponse = await h.mf.dispatchFetch(h.origin + `${url}/document.xlsx`, { headers: { cookie: viewer } })
 assert.equal(bookResponse.status, 200)
 const book = await readWorkbook(await bookResponse.arrayBuffer()); proveFormulas(book)
 assert.ok(book.getWorksheet('Annual plan')); assert.ok(book.getWorksheet('Assumptions'))
 const values = book.getWorksheet('Annual plan').getSheetValues().flatMap(row => row ?? []).map(cell => typeof cell === 'object' ? cell?.result : cell)
 for (const row of v.rows) for (const key of ['revenue', 'profit', 'closingCash', 'revenueGap', 'profitGap', 'headcountGap', 'cashGap']) assert.ok(values.includes(row[key]), `${key} ${row.year} exported`)
 // Live working-budget edits flow through; a stale annual save writes nothing.
 await h.command('revenue', { ...driver, id: input.id, rate: '1100' })
 v = await h.get(url)
 assert.equal(v.rows[0].revenue, 132000000)
 assert.equal(v.rows[0].revenueGap, -8000000)
 await h.command('long-range-save', { ...body, id: saved.id, revision: saved.revision }, h.owner, 409)
 assert.equal((await h.get(url)).plan.revision, 1)
 // Approving pins year one to the saved arithmetic even after live metadata changes.
 bv = await readBudget()
 const approval = await h.command('approve-budget', { scenario: budget.id, revision: bv.scenario.revision })
 const sn = await h.get(`/api/easel/snapshot/${approval.snapshot}`)
 const frozen = await h.get(url)
 assert.equal(frozen.source.sha256, sn.sha256)
 await h.command('revenue', { ...driver, scenario: approval.forecast.id, rate: '9999' })
 assert.deepEqual(await h.get(url), frozen)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approval.snapshot}`), sn)
 const edited = await h.command('long-range-save', { ...body, id: saved.id, revision: saved.revision, budgetRevision: bv.scenario.revision, years: 3, drivers: body.drivers.slice(0, 2) })
 assert.equal((await h.get(url)).rows.length, 3)
 await h.command('long-range-save', { ...body, id: saved.id, revision: 1, budgetRevision: bv.scenario.revision }, h.owner, 409)
 assert.equal((await h.get(url)).plan.revision, edited.revision)
 // Fractional cents round half away from zero once, including negative profit.
 await h.command('long-range-save', { ...body, budgetRevision: bv.scenario.revision, name: 'Rounding', priorYearRevenue: '0.01', targets: { ...body.targets, growthPercent: '50', marginPercent: '-25' } })
 const rounded = (await h.get('/api/easel/long-range')).find(p => p.name === 'Rounding')
 const roundedRows = (await h.get(`/api/easel/long-range/${rounded.id}`)).rows
 assert.equal(roundedRows[0].targetRevenue, 2); assert.equal(roundedRows[0].targetProfit, -1)
})
