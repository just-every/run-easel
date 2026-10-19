import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

test('FIN-005 finance agrees constraints; every scenario, proposal, comparison and Excel projection checks hand-computed burn and runway without changing saved cash', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Services', type: 'revenue' })
 const expense = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
 const sales = await h.person('ops@example.test', 'contributor', [dept.id])
 const viewer = await h.person('board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '1000000', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario: budget.id, name: 'Retainers', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-01', startVolume: '1', rate: '10000' })
 await h.command('expense', { scenario: budget.id, name: 'Operations', kind: 'recurring', department: dept.id, line: expense.id, start: '2026-01', amount: '50000' })
 assert.equal((await h.get(`/api/easel/scenario/${budget.id}`)).cashHealth.agreementStatus, 'not-agreed')
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const snapshot = await h.get(`/api/easel/snapshot/${approved.snapshot}`)
 const frozen = (await h.get(`/api/easel/scenario/${budget.id}`)).calculation
 const agreement = { floor: '500000', runwayMinimum: '3.25' }
 await h.command('cash-constraints', agreement, sales, 403)
 await h.command('cash-constraints', agreement, viewer, 403)
 await h.command('cash-constraints', { ...agreement, floor: '-1' }, h.owner, 400)
 await h.command('cash-constraints', { ...agreement, runwayMinimum: 'NaN' }, h.owner, 400)
 await h.command('cash-constraints', agreement)
 const downside = await h.command('branch', { from: approved.forecast.id, name: 'Downside: expansion investment' })
 await h.command('expense', { scenario: downside.id, name: 'Expansion team', kind: 'recurring', department: dept.id, line: expense.id, start: '2026-01', amount: '100000' })
 await h.command('expense', { scenario: downside.id, name: 'Launch', kind: 'one-off', department: dept.id, line: expense.id, start: '2026-02', amount: '100000' })
 const view = await h.get(`/api/easel/scenario/${downside.id}`)
 const health = view.cashHealth
 const expectedClosing = [86000000, 62000000, 48000000, 34000000, 20000000, 6000000, -8000000, -22000000, -36000000, -50000000, -64000000, -78000000]
 for (let i = 0; i < 12; i++) {
  const payments = i === 1 ? 25000000 : 15000000
  const net = payments - 1000000
  const burns = Array.from({ length: i + 1 }, (_, n) => n === 1 ? 24000000 : 14000000).slice(-3)
  const total = burns.reduce((a, b) => a + b, 0)
  const rawRunway = expectedClosing[i] * burns.length * 100 / total
  const runway = Math.sign(rawRunway) * Math.round(Math.abs(rawRunway))
  assert.equal(health.months[i].closing, expectedClosing[i])
  assert.equal(health.months[i].grossBurnCents, payments)
  assert.equal(health.months[i].netBurnCents, net)
  assert.equal(health.months[i].trailingNetBurnCents, total)
  assert.equal(health.months[i].trailingMonths, burns.length)
  assert.equal(health.months[i].runwayHundredths, runway)
  assert.equal(health.months[i].floorBreached, expectedClosing[i] < 50000000)
  assert.equal(health.months[i].runwayBreached, expectedClosing[i] * burns.length * 100 < 325 * total)
 }
 assert.equal(health.firstFloorBreach, '2026-03')
 assert.equal(health.firstRunwayBreach, '2026-03')
 assert.equal(health.cashZeroMonth, '2026-07')
 assert.deepEqual(health.lowestCash, { month: '2026-12', closing: -78000000 })
 const proposal = await h.command('proposal-create', { from: downside.id, name: 'Expansion proposal', request: 'Review expansion cash floor' }, sales)
 assert.deepEqual((await h.get(`/api/easel/scenario/${proposal.id}`, sales)).cashHealth, health)
 const comparison = await h.get(`/api/easel/compare?a=${approved.forecast.id}&b=${downside.id}`, viewer)
 assert.equal(comparison.left.cashHealth.firstFloorBreach, null)
 assert.deepEqual(comparison.right.cashHealth, health)
 const bookResponse = await h.mf.dispatchFetch(h.origin + `/api/easel/compare.xlsx?a=${approved.forecast.id}&b=${downside.id}`, { headers: { cookie: viewer } })
 assert.equal(bookResponse.status, 200)
 const book = await readWorkbook(await bookResponse.arrayBuffer()); proveFormulas(book)
 assert.equal(book.getWorksheet('To Cash health').getCell('I5').value, 277)
 assert.equal(book.getWorksheet('To Cash health').getCell('F4').result, 24000000)
 const steady = await h.command('branch', { from: approved.forecast.id, name: 'Cash-generating' })
 await h.command('revenue', { scenario: steady.id, name: 'New contract', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-01', startVolume: '1', rate: '50000' })
 const generating = (await h.get(`/api/easel/scenario/${steady.id}`)).cashHealth
 assert.equal(generating.months[0].runwayHundredths, null)
 assert.equal(generating.months[0].runwayBasis, 'not-burning')
 assert.equal(generating.months[0].runwayBreached, false)
 assert.equal(generating.cashZeroMonth, null)
 await h.command('cash-constraints', { floor: '860000', runwayMinimum: '6.142857142857' }, h.owner, 400)
 await h.command('cash-constraints', { floor: '860000', runwayMinimum: '6.14' })
 const equalFloor = (await h.get(`/api/easel/scenario/${downside.id}`)).cashHealth
 assert.equal(equalFloor.months[0].floorBreached, false, 'Equality meets the cash floor')
 assert.equal(equalFloor.months[0].runwayBreached, false, 'Threshold check uses the unrounded ratio')
 assert.deepEqual((await h.get(`/api/easel/scenario/${budget.id}`)).calculation, frozen)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approved.snapshot}`), snapshot)
 assert.equal((await h.get(`/api/easel/scenario/${budget.id}`)).cashHealth.agreement.floorCents, 86000000)
 await h.command('scenario-cash', { scenario: downside.id, basis: 'estimate', opening: '999599.99', collectionLag: 0, paymentLag: 0 })
 const boundary = (await h.get(`/api/easel/scenario/${downside.id}`)).cashHealth.months[0]
 assert.equal(boundary.runwayHundredths, 614)
 assert.equal(boundary.runwayBreached, true, 'An exact ratio below 6.14 breaches even when displayed as 6.14')
 const activity = await h.get('/api/easel/activity')
 assert.match(JSON.stringify(activity), /cash-constraints/)
 // A late closed actual cash deficit is excluded from the forecast cash-zero date.
 await h.command('account-map', { account: '500', target: expense.id })
 await h.command('department-map', { source: 'Operations', department: dept.id })
 const body = { filename: 'close.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,500,Operations,1200000\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', body)
 await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
 await h.command('close-month', { scenario: approved.forecast.id, month: '2026-01' })
 assert.equal((await h.get(`/api/easel/scenario/${approved.forecast.id}`)).cashHealth.cashZeroMonth, '2026-02')
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'AUD', fiscalYearStart: 1, planStart: '2026-01' })
 await h.command('cash-constraints', { floor: '1', runwayMinimum: '1' })
 const mismatched = (await h.get(`/api/easel/scenario/${budget.id}`)).cashHealth
 assert.equal(mismatched.agreementStatus, 'different-currency')
 assert.ok(mismatched.months.every(m => m.floorBreached === null && m.runwayBreached === null))
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approved.snapshot}`), snapshot)
})
