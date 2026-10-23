import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

test('AGENT-001 AGENT-002 a promoted change that breaks the cash floor opens one decision item that cites its causes, and the agent offers three recalculated responses from adjustable levers only', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Constraint Co', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const revenue = await h.command('line', { name: 'Consulting', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const software = await h.command('line', { name: 'Software', type: 'operating-expense' })
 const marketing = await h.command('line', { name: 'Marketing', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '200000', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: sales.id, line: revenue.id, start: '2026-01', startVolume: '10', rate: '5000', growthPercent: '0', collectionLag: 0 })
 const recurring = (name, line, amount) => h.command('expense', { scenario: budget.id, name, kind: 'recurring', department: sales.id, line: line.id, start: '2026-01', amount })
 const sw = await recurring('Software', software, '10000'), mk = await recurring('Marketing', marketing, '10000')
 const conference = await h.command('expense', { scenario: budget.id, name: 'Conference', kind: 'one-off', department: sales.id, line: marketing.id, start: '2026-06', amount: '30000' })
 const hire = (title, start) => h.command('position', { scenario: budget.id, title, holder: `Private ${title}`, department: sales.id, line: payroll.id, start, annualSalary: '240000', onCostPercent: '0' })
 const [a, b, c] = [await hire('Account executive A', '2026-05'), await hire('Account executive B', '2026-06'), await hire('Account executive C', '2026-07')]
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 await h.command('cash-constraints', { floor: '100000', runwayMinimum: '0' })
 const items = () => h.get('/api/easel/constraints')
 assert.deepEqual((await items()).items, [], 'the approved plan keeps cash above the agreed floor')
 const planner = await h.person('sales@example.test', 'contributor', [sales.id]), board = await h.person('board@example.test', 'viewer')
 for (const cookie of [planner, board]) { await h.get('/api/easel/constraints', cookie, 403); await h.command('lever-save', { kind: 'spend-cut', scenario: forecast.id, origin: sw.originId, max: 50 }, cookie, 403) }

 // A promoted proposal brings all three hires two months earlier: the floor breaks in September.
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Hire earlier', request: 'Start the three account executives in March, April and May' })
 for (const [row, start] of (await h.get(`/api/easel/scenario/${proposal.id}`)).inputs.position.map((p, i) => [p, ['2026-03', '2026-04', '2026-05'][['Account executive A', 'Account executive B', 'Account executive C'].indexOf(p.title)]])) await h.command('position', { scenario: proposal.id, id: row.id, title: row.title, holder: row.holder, department: sales.id, line: payroll.id, start, annualSalary: '240000', onCostPercent: '0' })
 const submitted = await h.command('proposal-submit', { id: proposal.id })
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.revision })
 const opened = (await items()).items
 assert.deepEqual(opened.map(i => i.constraint).sort(), ['cash-floor', 'runway'], 'cash exhausted in December also breaks the zero-month runway minimum')
 const item = opened.find(i => i.constraint === 'cash-floor')
 assert.deepEqual([item.constraint, item.status, item.month, item.breach.gapCents, item.forecastRevision], ['cash-floor', 'open', '2026-09', 11000000, (await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision])
 assert.equal(item.causes.reference, 'the approved budget')
 assert.deepEqual(item.causes.changes.map(x => [x.name, x.fields.find(f => f.field === 'start').from, x.fields.find(f => f.field === 'start').to]).sort(), [['Account executive A', '2026-05', '2026-03'], ['Account executive B', '2026-06', '2026-04'], ['Account executive C', '2026-07', '2026-05']])
 assert.ok(h.messages.some(m => /Decision needed/.test(m.subject)), 'the owner who agreed the floor is told')
 const revision = (await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision
 await h.command('constraint-check', {})
 assert.equal((await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision, revision, 'the agent changes nothing in the plan')
 assert.equal((await items()).items.length, 2, 'one item per breached constraint, however often it is checked')

 // Responses come only from levers finance marked adjustable.
 await h.command('constraint-respond', { item: item.id, revision }, h.owner, 409)
 await h.command('lever-save', { kind: 'spend-cut', scenario: forecast.id, origin: sw.originId, max: 50 })
 await h.command('lever-save', { kind: 'spend-cut', scenario: forecast.id, origin: mk.originId, max: 50 })
 for (const row of [a, b]) await h.command('lever-save', { kind: 'hire-start', scenario: forecast.id, origin: row.originId, max: 8 })
 await h.command('lever-save', { kind: 'hire-start', scenario: forecast.id, origin: sw.originId, max: 3 }, h.owner, 404)
 await h.command('constraint-respond', { item: item.id, revision: revision - 1 }, h.owner, 409)
 const before = await h.get(`/api/easel/scenario/${forecast.id}`)
 const answered = await h.command('constraint-respond', { item: item.id, revision })
 assert.ok(answered.responses.length >= 3 && answered.responses.length <= 5, `${answered.responses.length} responses`)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), before, 'responses are draft proposals; the forecast is untouched')
 const startOf = (view, origin) => view.inputs.position.find(p => p.originId === origin).start
 for (const r of answered.responses) {
  const view = await h.get(`/api/easel/scenario/${r.proposal}`)
  assert.equal(view.scenario.kind, 'proposal'); assert.equal(view.scenario.proposalStatus, 'draft'); assert.equal(view.scenario.branchedFrom.revision, revision)
  assert.ok(view.calculation.cash.every(m => m.closing >= 10000000), `every month stays at or above the $100,000 floor: ${r.name}`)
  assert.equal(r.restores, true); assert.ok(r.newLowestCash.closingCents >= 10000000)
  assert.equal(startOf(view, c.originId), '2026-05', 'a lever that is not adjustable is never touched')
  assert.equal(view.inputs.expense.find(e => e.originId === conference.originId).amountCents, 3000000)
  assert.ok(r.changes.length >= 1 && r.cost.revenueForgoneCents !== undefined)
 }
 assert.ok(answered.responses.some(r => r.changes.length === 1), 'the least change is a single lever')
 assert.ok(answered.responses.some(r => r.changes.length === 2), 'and combinations appear when no single lever is enough')
 await h.command('constraint-respond', { item: item.id, revision }, h.owner, 409)

 // The owner picks one; finance promotes that exact revision through the ordinary doors.
 const chosen = answered.responses[0], pick = await h.get(`/api/easel/scenario/${chosen.proposal}`)
 const ready = await h.command('proposal-submit', { id: chosen.proposal })
 await h.command('proposal-promote', { id: chosen.proposal, revision: ready.revision })
 assert.deepEqual((await items()).items.map(i => i.status), ['cleared', 'cleared'])
 const after = await h.get(`/api/easel/scenario/${forecast.id}`)
 assert.ok(after.calculation.cash.every(m => m.closing >= 10000000))
 const other = answered.responses[1]; await h.command('proposal-submit', { id: other.proposal }); await h.command('proposal-promote', { id: other.proposal, revision: 2 }, h.owner, 409)
 void pick

 // Rejecting every response needs a reason and closes the drafts.
 await h.command('cash-constraints', { floor: '300000', runwayMinimum: '0' })
 const second = (await items()).items.find(i => i.status === 'open' && i.constraint === 'cash-floor')
 assert.ok(second, 'a stricter floor opens a new item')
 const revision2 = (await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision
 const levers = (await items()).levers
 assert.ok(levers.length >= 3)
 await h.command('constraint-reject', { item: second.id, reason: '' }, h.owner, 400)
 await h.command('constraint-respond', { item: second.id, revision: revision2 }, h.owner, 409).catch(() => {})
 const rejected = await h.command('constraint-reject', { item: second.id, reason: 'The board will raise money instead.' })
 assert.equal(rejected.status, 'rejected')
})


test('Native covenant and department breaches cite exact gaps, notify once and clear without editing the forecast', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Covenant studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const d = await h.command('department', { name: 'Operations' })
 const line = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '1000', collectionLag: 0, paymentLag: 0 })
 const spend = await h.command('expense', { scenario: budget.id, name: 'Unplanned vendor', department: d.id, line: line.id, kind: 'recurring', start: '2026-01', amount: '100' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const debt = { scenario: forecast.id, name: 'Credit facility', debtKind: 'credit', department: d.id, line: line.id, start: '2026-01', maturity: '2026-12', limit: '500', draws: { '2026-01': '100' }, annualRate: '0', covenants: { minimumCash: '1100', minimumLiquidity: '1500', maximumLeverage: '3' } }
 const source = await h.command('debt', debt)
 await h.command('department-limit-save', { department: d.id, month: '2026-01', limit: '99' })
 const original = await h.get(`/api/easel/scenario/${forecast.id}`)
 let items = (await h.get('/api/easel/constraints')).items
 assert.equal(items.length, 4)
 const limit = items.find(i => i.constraint.startsWith('department:'))
 assert.equal(limit.breach.gapCents, 100); assert.equal(limit.owner, 'owner@example.test')
 assert.ok(limit.breach.rows.some(row => row.origin === spend.originId))
 for (const kind of ['minimum-cash', 'minimum-liquidity', 'maximum-leverage']) {
  const item = items.find(i => i.constraint === `covenant:${source.originId}:${kind}`)
  assert.equal(item.month, '2026-01'); assert.equal(item.breach.gap, 10000)
  assert.ok(item.causes.changes.some(row => row.origin === source.originId))
 }
 const messages = h.messages.length
 await h.command('constraint-check', {})
 assert.equal(h.messages.length, messages)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), original)
 const viewer = await h.person('viewer@example.test', 'viewer')
 await h.command('department-limit-save', { department: d.id, month: '2026-01', limit: '200' }, viewer, 403)
 await h.command('department-limit-save', { department: d.id, month: '2026-01', limit: '100' })
 assert.equal((await h.get('/api/easel/constraints')).items.find(i => i.id === limit.id).status, 'cleared')
 await h.command('debt', { ...debt, id: source.id, covenants: {} })
 await h.command('constraint-check', {})
 assert.ok((await h.get('/api/easel/constraints')).items.every(i => i.status === 'cleared'))
 await h.command('department-limit-delete', { department: d.id, month: '2026-01' })
})
