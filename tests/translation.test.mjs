import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { acceptHistory, historyFile } from './history-fixture.mjs'

test('ENTITY-002 a CAD plan reads USD statements, a translation adjustment and a constant-currency variance from finance-kept rates', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Maple Planning', currency: 'CAD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const revenue = await h.command('line', { name: 'Services', type: 'revenue' }), software = await h.command('line', { name: 'Software', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '10000', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: sales.id, line: revenue.id, start: '2026-01', startVolume: '10', rate: '100', growthPercent: '0', collectionLag: 0 })
 await h.command('expense', { scenario: budget.id, name: 'Licences', line: software.id, department: sales.id, start: '2026-01', kind: 'recurring', amount: '400' })
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast
 const contributor = await h.person('sales@example.test', 'contributor', [sales.id]), viewer = await h.person('board@example.test', 'viewer')
 const view = (path, cookie) => h.get(`/api/easel/${path}`, cookie)

 let translated = await view(`translation/${forecast.id}`)
 assert.equal(translated.status, 'not-set')
 assert.ok(translated.months.every(m => m.profit === null && m.balanceSheet === null), 'no rates, no translated amounts')

 for (const cookie of [contributor, viewer]) await h.command('fx-rate', { month: '2026-01', average: '0.80' }, cookie, 403)
 await h.command('fx-rate', { month: '2026-01', average: '0.80', reporting: 'CAD' }, h.owner, 400)
 await h.command('fx-rate', { month: '2026-01', average: '0' }, h.owner, 400)
 await h.command('fx-rate', { month: '2026-01', average: '0.1234567' }, h.owner, 400)
 await h.command('fx-rate', { month: '2026-01' }, h.owner, 400)
 await h.command('fx-rate', { month: '2025-12', monthEnd: '0.70' })
 await h.command('fx-rate', { month: '2026-01', budget: '0.75', average: '0.80', monthEnd: '0.82' })
 await h.command('fx-rate', { month: '2026-02', budget: '0.75', average: '0.78', monthEnd: '0.76' })
 await h.command('fx-rate', { month: '2026-04', average: '0.9' })

 // Actual January: revenue $1,200 and software $500 against a $1,000 / $400 budget.
 await h.command('account-map', { account: '400', target: revenue.id })
 await h.command('account-map', { account: '500', target: software.id })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 await acceptHistory(h.kit, historyFile('jan.csv', ['2026-01-15,400,Sales,-1200.00,Revenue', '2026-01-15,500,Sales,500.00,Software']))
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })

 translated = await view(`translation/${forecast.id}`)
 assert.deepEqual([translated.status, translated.planCurrency, translated.reportingCurrency], ['applied', 'CAD', 'USD'])
 const local = (await view(`scenario/${forecast.id}`)).calculation
 const [jan, feb, mar, apr] = translated.months
 // Profit and loss at each month's average rate: January actual 1,200 − 500 at 0.80; February plan 1,000 − 400 at 0.78.
 assert.deepEqual(jan.profit, { revenue: 96000, costOfSales: 0, operatingExpenses: 40000, grossMargin: 96000, profit: 56000 })
 assert.deepEqual(feb.profit, { revenue: 78000, costOfSales: 0, operatingExpenses: 31200, grossMargin: 78000, profit: 46800 })
 // A month with no rate row, or only a month-end rate, is unavailable rather than zero.
 assert.equal(mar.profit, null); assert.deepEqual(mar.unavailable.slice(0, 2), ['average rate for 2026-03', 'month-end rate for 2026-03'])
 assert.equal(apr.profit.revenue, 90000); assert.equal(apr.balanceSheet, null)
 // Balance sheet at month-end rates; the adjustment is what hand arithmetic on the plan's own equity gives.
 for (const [i, month] of [[0, jan], [1, feb]]) {
  const bs = local.balanceSheet[i], rate = { 0: 0.82, 1: 0.76 }[i]
  assert.equal(bs.balanceDifference, 0)
  assert.equal(month.balanceSheet.cash, Math.round(bs.cash * rate)); assert.equal(month.balanceSheet.assets, Math.round(bs.assets * rate)); assert.equal(month.balanceSheet.liabilities, Math.round(bs.liabilities * rate))
 }
 const openingEquity = local.balanceSheet[0].openingEquity
 const expectJan = Math.round(local.balanceSheet[0].equity * 0.82) - (Math.round(openingEquity * 0.70) + 56000)
 const expectFeb = Math.round(local.balanceSheet[1].equity * 0.76) - (Math.round(openingEquity * 0.70) + 56000 + 46800)
 assert.equal(jan.balanceSheet.translationAdjustment, expectJan); assert.equal(feb.balanceSheet.translationAdjustment, expectFeb)
 assert.equal(feb.balanceSheet.translationAdjustmentMovement, expectFeb - expectJan)
 assert.equal(feb.balanceSheet.assets, feb.balanceSheet.liabilities + feb.balanceSheet.equity + feb.balanceSheet.translationAdjustment)
 assert.notEqual(expectFeb, 0, 'the fixture really moves rates')

 // Constant currency: budget at 0.75; actual at 0.80 average and again at 0.75.
 const cc = await view('translation-variance/2026-01')
 assert.deepEqual(cc.totals, { budget: 45000, actual: 56000, actualAtBudgetRate: 52500, variance: 11000, constantCurrencyVariance: 7500, currencyEffect: 3500 })
 const rev = cc.rows.find(r => r.line === revenue.id)
 assert.deepEqual([rev.budget, rev.actual, rev.actualAtBudgetRate], [75000, 96000, 90000])
 assert.equal(cc.totals.variance, cc.totals.constantCurrencyVariance + cc.totals.currencyEffect)
 await h.command('fx-rate', { month: '2026-01', budget: '' })
 const gap = await view('translation-variance/2026-01')
 assert.match(gap.unavailable, /budget rate for 2026-01/); assert.equal(gap.totals, null)
 await h.command('fx-rate', { month: '2026-01', budget: '0.75' })

 // Rates are read at view time: a frozen budget's stored body does not change when finance revises a rate.
 const stored = JSON.stringify((await view(`snapshot/${approved.budgetSnapshot ?? (await view('state')).snapshots.find(s => s.kind === 'approval').id}`)).body)
 await h.command('fx-rate', { month: '2026-01', average: '0.90' })
 assert.equal((await view(`translation/${forecast.id}`)).months[0].profit.profit, 63000)
 assert.equal(JSON.stringify((await view(`snapshot/${approved.budgetSnapshot ?? (await view('state')).snapshots.find(s => s.kind === 'approval').id}`)).body), stored)
 const frozen = await view(`translation/${budget.id}`)
 assert.equal(frozen.months[0].profit.revenue, 90000)

 // Each reader translates exactly the statements their own scenario view carries.
 for (const cookie of [contributor, viewer]) {
  const mine = await view(`translation/${forecast.id}`, cookie), own = (await view(`scenario/${forecast.id}`, cookie)).calculation
  assert.equal(mine.months[1].profit.revenue, Math.round(own.profit[1].revenue * 0.78))
 }
 assert.equal((await view('state')).fxTable.rates['2026-01'].average, 900000)
 assert.equal((await view('state', contributor)).fxTable, null, 'the rate table form is finance-only')
 const log = await view('activity')
 assert.ok(log.some(e => e.action === 'fx-rate'))
})
