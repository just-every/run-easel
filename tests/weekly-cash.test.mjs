import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

test('FIN-007 dated plan collections, payroll, spend and funding reconcile to monthly cash; noted overrides carry forward without changing frozen versions', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbor services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Service revenue', type: 'revenue' })
 const salary = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const spend = await h.command('line', { name: 'Software', type: 'operating-expense' })
 const interest = await h.command('line', { name: 'Interest', type: 'operating-expense' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0].id
 await h.command('scenario-cash', { scenario, basis: 'estimate', opening: '10000', receivables: '100', payables: '50', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario, name: 'Customer agreement', kind: 'contract', department: dept.id, line: revenue.id, start: '2026-01', startDate: '2026-01-15', termMonths: '12', contractValue: '12000', billingCadence: 'monthly', dsoDays: '10' })
 const positionBody = { scenario, title: 'Private payroll sentinel', holder: 'Private person sentinel', department: dept.id, line: salary.id, start: '2026-01', annualSalary: '12000.12', onCostPercent: '0', payDay: '15', secondPayDay: '31', payMonthOffset: '0' }
 const position = await h.command('position', positionBody)
 await h.command('expense', { scenario, name: 'Annual software', kind: 'one-off', department: dept.id, line: spend.id, start: '2026-01', amount: '120' })
 await h.command('debt', { scenario, name: 'Equipment loan', debtKind: 'term', line: interest.id, department: dept.id, start: '2026-01', maturity: '2026-12', opening: '1200', rateKind: 'fixed', annualRate: '0', amortization: 'equal-principal', amortizationStart: '2026-01', termMonths: '12', draws: {}, repayments: {} })
 const path = (start = '2026-01-01', id = scenario) => `/api/easel/weekly-cash/${id}?start=${start}`
 const plan = await h.get(`/api/easel/scenario/${scenario}`)
 const daily = plan.calculation.dailyCash
 assert.deepEqual(daily.find(r => r.date === '2026-01-15'), { date: '2026-01-15', collections: 0, payments: 50001, assumed: false }, 'first semimonthly run receives the odd cent')
 assert.equal(daily.find(r => r.date === '2026-01-25').collections, 100000, 'contract invoice date plus exact DSO')
 assert.equal(daily.find(r => r.date === '2026-02-15').payments, 50001)
 assert.equal(daily.find(r => r.date === '2026-02-28').payments, 50000 + 10000, 'second run clamps to February end and preserves the monthly payroll total')
 for (const invalid of [{ secondPayDay: '15' }, { secondPayDay: '14' }, { secondPayDay: '32' }, { payDay: '', secondPayDay: '31' }]) {
  await h.command('position', { ...positionBody, ...invalid, id: position.id }, h.owner, 400)
 }
 assert.deepEqual((await h.get(`/api/easel/scenario/${scenario}`)).calculation, plan.calculation, 'invalid schedule edits do not change any output')
 const view = await h.get(path())
 assert.equal(view.weeks.length, 13)
 assert.equal(view.weeks.find(w => w.start <= '2026-01-15' && w.end >= '2026-01-15').payments, 50001)
 assert.equal(view.weeks.find(w => w.start <= '2026-01-25' && w.end >= '2026-01-25').collections, 100000)
 assert.equal(view.weeks.find(w => w.start <= '2026-01-31' && w.end >= '2026-01-31').payments, 50000 + 12000 + 10000 + 5000, 'second payroll run, one-off, principal and opening payables retain monthly sums')
 assert.ok(view.weeks.find(w => w.start <= '2026-01-31' && w.end >= '2026-01-31').assumedDates)
 for (const r of view.reconciliation) assert.equal(r.difference, 0, `${r.month}: dated cash equals monthly closing to the cent`)
 for (const [i, w] of view.weeks.entries()) {
  assert.equal(w.closing, w.opening + w.collections - w.payments + w.adjustment)
  if (i) assert.equal(w.opening, view.weeks[i - 1].closing)
 }
 const override = { scenario, start: '2026-01-22', adjustment: '-25.01', note: 'Customer timing reviewed with finance' }
 await h.command('weekly-cash-override', override)
 const changed = await h.get(path())
 assert.equal(changed.weeks[3].adjustment, -2501); assert.equal(changed.weeks[3].note, override.note)
 assert.equal(changed.weeks[4].opening, view.weeks[4].opening - 2501)
 for (const r of changed.reconciliation) assert.equal(r.difference, -2501)
 assert.deepEqual((await h.get(`/api/easel/scenario/${scenario}`)).calculation.cash, plan.calculation.cash, 'weekly override never silently changes monthly assumptions')
 assert.equal((await h.get(path('2026-02-01'))).weeks[0].opening, changed.reconciliation[0].weekly, 'later windows retain earlier noted adjustments')
 // Moving the window keeps adjustments on their original week-end dates.
 const shifted = await h.get(path('2026-01-20'))
 assert.equal(shifted.weeks.find(w => w.start <= '2026-01-28' && w.end >= '2026-01-28').adjustment, -2501)
 await h.command('weekly-cash-override', { ...override, adjustment: '0', note: 'Cancelled timing adjustment' })
 assert.equal((await h.get(path())).reconciliation[0].difference, 0)
 await h.command('weekly-cash-override', { ...override, note: '' }, h.owner, 400)
 await h.command('weekly-cash-override', { ...override, start: '2026-02-30' }, h.owner, 400)
 await h.command('weekly-cash-override', { ...override, start: '2026-12-30' }, h.owner, 409)
 await h.get(path('2025-12-01'), h.owner, 400)
 const last = await h.get(path('2026-12-01'))
 assert.ok(last.weeks.some(w => !w.available)); assert.ok(last.weeks.filter(w => !w.available).every(w => w.closing === undefined), 'outside horizon is unavailable, never a zero forecast')
 const board = await h.person('board@example.test', 'viewer')
 assert.deepEqual(await h.get(path(), board), await h.get(path()))
 const download = await h.mf.dispatchFetch(`${h.origin}/api/easel/weekly-cash/${scenario}/document.xlsx?start=2026-01-01`, { headers: { cookie: board } })
 assert.equal(download.status, 200)
 const book = await readWorkbook(await download.arrayBuffer()); proveFormulas(book)
 assert.equal(book.getWorksheet('Weekly cash').getCell('G4').result, (await h.get(path())).weeks[0].closing)
 assert.equal(book.getWorksheet('Reconciliation').getCell('F3').result, 0)
 assert.doesNotMatch(JSON.stringify(book.worksheets.map(s => s.getSheetValues())), /Private payroll sentinel|Private person sentinel/)
 assert.doesNotMatch(JSON.stringify(await h.get(path(), board)), /Private payroll sentinel|Private person sentinel/)
 await h.command('weekly-cash-override', override, board, 403)
 const token = await h.command('branch', { from: scenario, name: 'Private cash plan' })
 // Prior earned payroll remains accrued until both runs; a position bonus is paid
 // once on the first bonus-period pay day, without shifting it by the regular offset.
 const branch = await h.get(`/api/easel/scenario/${token.id}`)
 await h.command('position', { ...positionBody, scenario: token.id, id: branch.inputs.position[0].id, start: '2025-12', payMonthOffset: '1', bonusPercent: '10', bonusMonth: '2026-02' })
 const offset = (await h.get(`/api/easel/scenario/${token.id}`)).calculation
 assert.equal(offset.workingCapital.opening.accruedLiabilities, 100001)
 assert.equal(offset.dailyCash.find(r => r.date === '2026-01-15').payments, 50001)
 assert.equal(offset.dailyCash.find(r => r.date === '2026-02-15').payments, 50001 + 120001, 'bonus paid once on first pay day, not offset or split')
 assert.equal(offset.dailyCash.find(r => r.date === '2026-02-28').payments, 50000 + 10000)
 for (const r of (await h.get(path('2026-01-01', token.id))).reconciliation) assert.equal(r.difference, 0)
 await h.command('position', { ...positionBody, scenario: token.id, id: branch.inputs.position[0].id, payDay: '30', secondPayDay: '31' })
 const coalesced = (await h.get(`/api/easel/scenario/${token.id}`)).calculation
 assert.equal(coalesced.dailyCash.find(r => r.date === '2026-02-28').payments, 100001 + 10000, 'two dates clamped to the same day combine exactly without dropping either run')
 // Approval captures the dated schedule and overrides; later edits cannot recompute it.
 const approval = await h.command('approve-budget', { scenario, revision: (await h.get(`/api/easel/scenario/${scenario}`)).scenario.revision })
 const frozen = await h.get(path())
 await h.command('weekly-cash-override', override, h.owner, 409)
 await h.command('weekly-cash-override', { ...override, scenario: approval.forecast.id, adjustment: '100' })
 assert.deepEqual(await h.get(path()), frozen)
 await h.command('scenario-cash', { scenario: token.id, basis: 'estimate', opening: '50000', collectionLag: 0, paymentLag: 0 })
 assert.deepEqual(await h.get(path()), frozen)
})
