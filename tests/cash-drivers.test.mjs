import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

test('Home cash tree: every month of cash splits into collections, payroll, spend and financing that add up to its closing, and readers see only the detail they may', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Prairie Labs', currency: 'USD', fiscalYearStart: 1, planStart: '2027-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const engineering = await h.command('department', { name: 'Engineering' })
 const revenue = await h.command('line', { name: 'Subscriptions', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const hosting = await h.command('line', { name: 'Hosting', type: 'operating-expense' })
 const interest = await h.command('line', { name: 'Interest', type: 'operating-expense' })
 const seller = await h.person('seller@example.test', 'contributor', [sales.id])
 const board = await h.person('board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '400000', receivables: '20000', payables: '5000', collectionLag: 1, paymentLag: 1 })
 const subscriptions = await h.command('revenue', { scenario: budget.id, name: 'Annual plans', kind: 'volume', department: sales.id, line: revenue.id, start: '2027-01', startVolume: '100', growthPercent: '2', rate: '900' })
 await h.command('position', { scenario: budget.id, title: 'Engineer', holder: 'Private Person', department: engineering.id, line: payroll.id, start: '2027-01', annualSalary: '150000', onCostPercent: '25' })
 const cloud = await h.command('expense', { scenario: budget.id, name: 'Cloud', kind: 'recurring', department: engineering.id, line: hosting.id, start: '2027-01', amount: '7000' })
 const credit = await h.command('debt', { scenario: budget.id, name: 'Credit line', debtKind: 'credit', line: interest.id, department: engineering.id, start: '2027-01', maturity: '2028-12', limit: '500000', rateKind: 'fixed', annualRate: '9.5', draws: { '2027-03': '100000' }, repayments: {} })

 const owner = await h.get(`/api/easel/drivers/${budget.id}`)
 const reconcile = view => {
  let running = view.opening
  for (const month of view.cash) {
   running += view.drivers.filter(d => d.month === month.month).reduce((n, d) => n + d.amount, 0)
   assert.equal(running, month.closing, `${month.month}: drivers add up to closing cash`)
  }
 }
 reconcile(owner)
 const march = owner.drivers.filter(d => d.month === '2027-03')
 assert.deepEqual([...new Set(march.map(d => d.driver))].sort(), ['collections', 'financing', 'payroll', 'spend'])
 // $150,000 × 1.25 ÷ 12, paid in the month it is earned, reported per department and never per position.
 assert.deepEqual(march.filter(d => d.driver === 'payroll').map(d => [d.department, d.source, d.amount]), [[engineering.id, '', -1562500]])
 assert.ok(march.some(d => d.driver === 'collections' && d.source === subscriptions.originId))
 assert.ok(march.some(d => d.driver === 'spend' && d.source === cloud.originId && d.amount === -700000))
 // The draw and its interest are financing: $100,000 in, then 9.5% ÷ 12 of it paid the same month.
 const financing = march.filter(d => d.driver === 'financing').sort((a, b) => b.amount - a.amount)
 assert.deepEqual(financing.map(d => d.source), [credit.originId, credit.originId])
 assert.equal(financing[0].amount, 10000000)
 assert.ok(financing[1].amount < 0 && financing[1].amount > -80000, 'interest on the draw is paid as financing')
 assert.equal(owner.health.lowestCash.month, owner.cash.reduce((low, m) => m.closing < low.closing ? m : low).month)

 const contributor = await h.get(`/api/easel/drivers/${budget.id}`, seller)
 reconcile(contributor)
 assert.ok(contributor.drivers.some(d => d.source === subscriptions.originId), 'a contributor sees the inputs behind their own department')
 assert.ok(contributor.drivers.filter(d => d.department === engineering.id || d.driver === 'financing').every(d => d.source === ''), 'and only totals for other departments and financing')

 const viewer = await h.get(`/api/easel/drivers/${budget.id}`, board)
 reconcile(viewer)
 assert.ok(viewer.drivers.every(d => d.source === ''), 'a viewer sees totals, never the inputs behind them')
 assert.ok(!JSON.stringify(viewer).includes('Private Person'))
 assert.deepEqual(viewer.inputs.filter(i => i.kind === 'position'), [])
})
