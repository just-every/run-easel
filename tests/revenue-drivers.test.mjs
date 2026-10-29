import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'
import { nativeFormulaFlow } from './native-formula-flow.mjs'

test('Native formula drivers: regional support, exact arithmetic, revenue proposals, grid refusal and immutable definitions', async t => {
 const h = await harness(); t.after(() => h.close())
 await nativeFormulaFlow(h)
})

test('REV-003 fixed revenue forms trace exact cells, cash timing, proposals and frozen versions under live department authority', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Revenue Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Billable services' })
 const otherDepartment = await h.command('department', { name: 'Operations' })
 const payroll = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const planner = await h.person('services@example.test', 'contributor', [department.id])
 const outsider = await h.person('operations@example.test', 'contributor', [otherDepartment.id])
 const viewer = await h.person('board@example.test', 'viewer')
 for (const [title, start, end] of [['Consultant one', '2026-01', '2026-02'], ['Consultant two', '2026-02', '']]) {
  await h.command('position', { scenario: budget.id, department: department.id, line: payroll.id, title, holder: `Private ${title}`, annualSalary: '120000', start, end })
 }
 const definitions = [
  ['volume', { startVolume: '1.25', rate: '2.22', growthPercent: '0' }],
  ['customers', { startCustomers: '10', newPerMonth: '2', churnPercent: '10', arpa: '50' }],
  ['seats', { startSeats: '10', expansionPercent: '10', price: '25' }],
  ['usage', { startUsage: '100.25', growthPercent: '-10', unitPrice: '0.03' }],
  ['services', { monthlyHours: '120.25', utilizationPercent: '66.67', hourlyRate: '40.03' }],
  ['milestones', { milestones: [{ name: 'Discovery', month: '2026-01', amount: '1200.01' }, { name: 'Design', month: '2026-01', amount: '799.99' }, { name: 'Delivery', month: '2026-02', amount: '3000' }] }],
  ['backlog', { openingBacklog: '1000.01', monthlyAdditions: '100.01', burnPercent: '33.33' }],
 ]
 const inputs = {}, lines = {}, bodies = {}
 for (const [kind, fields] of definitions) {
  lines[kind] = await h.command('line', { name: `${kind} revenue`, type: 'revenue' })
  bodies[kind] = { scenario: budget.id, name: `${kind} model`, kind, line: lines[kind].id, department: department.id, start: '2026-01', collectionLag: 1, ...fields }
  inputs[kind] = await h.command('revenue', bodies[kind])
 }
 const view = () => h.get(`/api/easel/scenario/${budget.id}`)
 let current = await view()
 const cell = (v, kind, month) => v.calculation.cells.find(c => c.line === lines[kind].id && c.month === month)
 const expected = { volume: [278, 278], customers: [55000, 59500], seats: [25000, 27500], usage: [301, 271], services: [320923, 641846], milestones: [200000, 300000], backlog: [36664, 27777] }
 for (const [kind, amounts] of Object.entries(expected)) {
  for (const [index, month] of ['2026-01', '2026-02'].entries()) {
   const value = cell(current, kind, month)
   assert.equal(value.amount, amounts[index], `${kind} ${month} hand-calculated cents`)
   assert.equal(value.sources.reduce((sum, source) => sum + source.amount, 0), value.amount)
   assert.ok(value.sources.every(source => source.id === inputs[kind].originId && source.trace.includes(month === '2026-01' ? 'Jan 2026' : 'Feb 2026')))
  }
 }
 assert.equal(cell(current, 'services', '2026-03').amount, 320923, 'position end/start months determine active billable headcount')
 assert.match(cell(current, 'services', '2026-02').sources[0].trace, /2 active positions.*120\.25.*66\.67%.*40\.03.*one division/)
 assert.match(cell(current, 'seats', '2026-02').sources[0].trace, /11\.00.*prior 10\.00.*10\.00%/)
 assert.match(cell(current, 'usage', '2026-02').sources[0].trace, /90\.23.*-10\.00%/)
 assert.match(cell(current, 'backlog', '2026-01').sources[0].trace, /closing backlog \$733\.38/)
 assert.match(cell(current, 'backlog', '2026-02').sources[0].trace, /opening backlog \$733\.38.*closing backlog \$555\.62/)
 assert.deepEqual(cell(current, 'milestones', '2026-01').sources.map(s => s.amount), [120001, 79999])
 const januaryRevenue = Object.values(expected).reduce((sum, amounts) => sum + amounts[0], 0)
 assert.equal(current.calculation.cash[0].collections, 0)
 assert.equal(current.calculation.cash[1].collections, januaryRevenue, 'all seven forms use the same explicit one-month collection lag')
 for (const row of current.calculation.balanceSheet) { assert.equal(row.balanceDifference, 0); assert.equal(row.cashDifference, 0) }

 // Invalid assumptions are refused through the same public save door, atomically.
 for (const [kind, invalid] of [
  ['usage', { growthPercent: '-100.01' }], ['seats', { startSeats: '-1' }],
  ['services', { utilizationPercent: '100.01' }], ['services', { monthlyHours: '1.001' }],
  ['backlog', { burnPercent: '100.01' }], ['backlog', { openingBacklog: '-1' }],
  ['milestones', { milestones: [{ name: 'Too early', month: '2025-12', amount: '1' }] }],
  ['milestones', { milestones: [{ name: 'Repeated', month: '2026-01', amount: '1' }, { name: 'repeated', month: '2026-02', amount: '2' }] }],
 ]) await h.command('revenue', { ...bodies[kind], ...invalid, id: inputs[kind].id }, h.owner, 400)
 assert.deepEqual(await view(), current)
 await h.command('revenue', { ...bodies.seats, id: inputs.seats.id }, planner, 409)
 await h.command('request-submissions', { scenario: budget.id, departments: [department.id] })
 await h.command('revenue', { ...bodies.seats, id: inputs.seats.id }, planner)
 await h.command('revenue', { ...bodies.services, id: inputs.services.id }, outsider, 403)
 await h.command('revenue', bodies.services, viewer, 403)
 const outside = await h.get(`/api/easel/scenario/${budget.id}`, outsider)
 const board = await h.get(`/api/easel/scenario/${budget.id}`, viewer)
 for (const restricted of [outside, board]) {
  assert.equal(cell(restricted, 'services', '2026-02').amount, 641846)
  assert.equal(restricted.inputs.revenue.length, 0)
  assert.doesNotMatch(JSON.stringify(restricted), /Private Consultant|Discovery|120\.25|40\.03/)
 }
 await h.command('submit', { scenario: budget.id, department: department.id }, planner)
 current = await view()
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: current.scenario.revision })
 const forecast = approved.forecast
 const frozenBudget = await view()
 const reforecast = await h.command('reforecast-save', { from: forecast.id, revision: forecast.revision, name: 'Initial driver outlook' })
 await h.command('account-map', { account: '400', target: lines.seats.id })
 await h.command('department-map', { source: 'Services', department: department.id })
 const actuals = { filename: 'january.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Services,-240\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', actuals)
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: preview.fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await h.command('pack-create', { forecast: forecast.id, month: '2026-01', title: 'January driver review' })
 await h.command('pack-publish', { pack: pack.id })
 const snapshots = await Promise.all((await h.get('/api/easel/state')).snapshots.map(s => h.get(`/api/easel/snapshot/${s.id}`)))
 const working = await h.get(`/api/easel/scenario/${forecast.id}`)
 assert.equal(cell(working, 'seats', '2026-01').amount, 24000, 'closed actual replaces driver revenue')
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Seat expansion', request: 'Raise monthly seat price' }, planner)
 const proposalInputs = (await h.get(`/api/easel/scenario/${proposal.id}`, planner)).inputs.revenue
 const proposalMilestones = proposalInputs.find(r => r.kind === 'milestones')
 const mcp = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'revenue', arguments: { ...bodies.milestones, collectionLag: '1', scenario: proposal.id, id: proposalMilestones.id } } }, planner)
 assert.equal(mcp.status, 200); assert.equal(mcp.value.result.isError, false, 'MCP accepts the typed milestone array in an owned proposal')
 const proposalSeats = proposalInputs.find(r => r.kind === 'seats')
 await h.command('revenue', { ...bodies.seats, scenario: proposal.id, id: proposalSeats.id, price: '30' }, planner)
 const comparison = await h.get(`/api/easel/compare?a=${forecast.id}&b=${proposal.id}`, planner)
 assert.equal(comparison.changedInputs[0].after.priceCents, 3000)
 assert.equal(comparison.changedCells.find(c => c.line === lines.seats.id && c.month === '2026-02').difference, 5500)
 assert.ok(!comparison.changedCells.some(c => c.month === '2026-01'))
 await h.command('proposal-submit', { id: proposal.id }, planner)
 const submitted = await h.get(`/api/easel/scenario/${proposal.id}`, planner)
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.scenario.revision - 1 }, h.owner, 409)
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.scenario.revision })
 assert.equal(cell(await h.get(`/api/easel/scenario/${forecast.id}`), 'seats', '2026-02').amount, 33000)
 assert.deepEqual(await view(), frozenBudget)
 assert.equal(cell(await h.get(`/api/easel/scenario/${reforecast.id}`), 'seats', '2026-02').amount, 27500)
 for (const snapshot of snapshots) assert.deepEqual(await h.get(`/api/easel/snapshot/${snapshot.id}`), snapshot)
 const versions = await h.get(`/api/easel/activity?action=structure-version&scenario=${proposal.id}`)
 assert.ok(versions.some(v => v.detail.changes.some(c => c.fields.some(f => f.field === 'priceCents' && f.after === 3000))))

 const workbookResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${forecast.id}/document.xlsx`, { headers: { cookie: h.owner } })
 assert.equal(workbookResponse.status, 200)
 const book = await readWorkbook(await workbookResponse.arrayBuffer()); proveFormulas(book)
 assert.ok(JSON.stringify(book.getWorksheet('Inputs').getSheetValues()).includes('openingBacklogCents'))
 const boardResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${forecast.id}/document.xlsx`, { headers: { cookie: viewer } })
 const boardBook = await readWorkbook(await boardResponse.arrayBuffer())
 assert.doesNotMatch(JSON.stringify(boardBook.worksheets.map(sheet => sheet.getSheetValues())), /Private Consultant|Discovery|hourlyRateCents/)

 // A new 100% burn driver consumes all available backlog and never goes negative.
 const fullBurn = await h.command('branch', { from: forecast.id, name: 'Full backlog consumption' })
 const backlog = (await h.get(`/api/easel/scenario/${fullBurn.id}`)).inputs.revenue.find(r => r.kind === 'backlog')
 await h.command('revenue', { ...bodies.backlog, scenario: fullBurn.id, id: backlog.id, openingBacklog: '0.01', monthlyAdditions: '0', burnPercent: '100' })
 const consumed = await h.get(`/api/easel/scenario/${fullBurn.id}`)
 assert.equal(cell(consumed, 'backlog', '2026-02').amount, 0, 'January consumed the cent before the closed-month replacement')
 assert.match(cell(consumed, 'backlog', '2026-02').sources[0].trace, /closing backlog \$0\.00/)
 await h.command('member', { email: 'services@example.test', name: 'Services', role: 'contributor', departments: [department.id], active: false })
 await h.command('revenue', { ...bodies.services, scenario: fullBurn.id }, planner, 403)
})
