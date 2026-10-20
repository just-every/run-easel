import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

test('AGENT-006 follows a published hiring delay: promoted forecast effect, chase before the due date, owner revision and stop, finance-approved change and the realized payroll saving after July closes', async t => {
 let now = '2026-02-02T15:00:00.000Z'
 const h = await harness({ now: () => now }); t.after(() => h.close())
 const run = async at => { now = at; await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' }) }
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const eng = await h.command('department', { name: 'Engineering' })
 const salaries = await h.command('line', { name: 'Engineering salaries', type: 'operating-expense', payroll: true })
 const office = await h.command('line', { name: 'Office', type: 'operating-expense' })
 const manager = await h.person('manager@example.test', 'contributor', [eng.id])
 const peer = await h.person('peer@example.test', 'contributor', [eng.id])
 const board = await h.person('board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const hires = { 'Platform engineer': '120000', 'Data engineer': '96000' }
 const position = (scenario, title, start, id) => h.command('position', { ...(id ? { id } : {}), scenario, title, department: eng.id, line: salaries.id, start, annualSalary: hires[title], onCostPercent: '0' })
 for (const title of Object.keys(hires)) await position(budget.id, title, '2026-05')
 await h.command('expense', { scenario: budget.id, name: 'Office rent', kind: 'recurring', line: office.id, department: eng.id, start: '2026-01', amount: '500' })
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast.id
 // Accepted actuals: rent every month; a $2,000 contractor in May, nobody in June, both hires from July.
 await h.command('account-map', { account: '6000', target: salaries.id })
 await h.command('account-map', { account: '6100', target: office.id })
 await h.command('department-map', { source: 'Engineering', department: eng.id })
 const rows = ['01', '02', '03', '04', '05', '06', '07'].map(m => `2026-${m}-28,6100,Engineering,500,Rent`)
 rows.push('2026-05-20,6000,Engineering,2000,Contract engineer', '2026-07-31,6000,Engineering,18000,July engineering payroll')
 const body = { filename: 'ledger.csv', csv: `Date,Account,Department,Amount,Description\n${rows.join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 await h.kit('actuals', 'commit', { ...body, fingerprint: (await h.kit('actuals', 'preview', body)).fingerprint })
 await h.command('close-month', { scenario: forecast, month: '2026-01' })

 // The hiring manager proposes the delay; finance promotes it and the forecast effect is captured.
 const proposal = await h.command('proposal-create', { from: forecast, name: 'Delay engineering hires', request: 'Delay the two engineering hires until July' }, manager)
 for (const p of (await h.get(`/api/easel/scenario/${proposal.id}`, manager)).inputs.position) await position(proposal.id, p.title, '2026-07', p.id)
 const submitted = await h.command('proposal-submit', { id: proposal.id }, manager)
 const promoted = (await h.command('proposal-promote', { id: proposal.id, revision: submitted.revision })).proposal
 const effect = promoted.promotedEffect.months
 assert.deepEqual(effect.map(e => e.month), ['2026-05', '2026-06'])
 for (const e of effect) {
  assert.deepEqual([e.before.payroll, e.approved.payroll, e.before.headcount, e.approved.headcount], [1800000, 0, 2, 0])
  assert.equal(e.approved.cash - e.before.cash, e.month === '2026-05' ? 1800000 : 3600000)
 }

 // Finance links the decision to that promotion and publishes it.
 const pack = await h.command('pack-create', { month: '2026-01' })
 await h.command('pack-decision', { pack: pack.id, text: 'Unrelated link', proposal: budget.id }, h.owner, 409)
 await h.command('pack-decision', { pack: pack.id, text: 'Delay the two engineering hires to July', owner: 'manager@example.test', department: eng.id, due: '2026-04-30', proposal: proposal.id })
 await h.command('pack-decision', { pack: pack.id, text: 'Renegotiate the contractor rate', owner: 'manager@example.test', department: eng.id, due: '2026-03-10' })
 const published = await h.command('pack-publish', { pack: pack.id })
 const [delay, contractor] = published.decisions.map(d => d.id)
 await h.command('scenario-delete', { id: proposal.id }, h.owner, 409)

 // Owners stop or revise only their own actions, always with a reason.
 const stop = { pack: pack.id, decision: contractor, reason: 'The contractor left in February' }
 await h.command('action-stop', stop, peer, 403)
 await h.command('action-stop', stop, board, 403)
 await h.command('action-stop', { ...stop, reason: '' }, manager, 400)
 assert.equal((await h.command('action-stop', stop, manager)).status, 'stopped')
 await h.command('action-revise', { ...stop, due: '2026-03-20' }, manager, 409)

 // The scheduled run chases the owner from three company-zone days before the due date, once per due date.
 const chases = () => h.messages.filter(m => m.subject.startsWith('Update due on your action'))
 await run('2026-03-08T15:00:00.000Z')
 await run('2026-04-27T03:00:00.000Z')
 assert.equal(chases().length, 0, 'A stopped action and an action more than three days out are not chased')
 await run('2026-04-27T13:05:00.000Z')
 assert.equal(chases().length, 1)
 assert.deepEqual(chases()[0].to, ['manager@example.test'])
 assert.match(chases()[0].subject, /Delay the two engineering hires to July \(due 2026-04-30\)/)
 await run('2026-04-29T13:05:00.000Z')
 await run('2026-04-30T13:05:00.000Z')
 assert.equal(chases().length, 1, 'One chase per due date, and none on the due date')
 const revise = { pack: pack.id, decision: delay, due: '2026-05-15', reason: 'Offer letters wait for the May hiring review' }
 await h.command('action-revise', revise, peer, 403)
 assert.equal((await h.command('action-revise', revise, manager)).due, '2026-05-15')
 await run('2026-05-12T13:05:00.000Z')
 assert.equal(chases().length, 2, 'A revised due date is chased again')
 let view = (await h.get('/api/easel/decisions', manager)).decisions.find(d => d.decision === delay)
 assert.deepEqual(view.chases.map(ch => [ch.due, ch.recipient, ch.zone]), [['2026-04-30', 'manager@example.test', 'America/New_York'], ['2026-05-15', 'manager@example.test', 'America/New_York']])
 assert.deepEqual(view.history.map(e => [e.kind, e.from, e.to, e.by, e.reason]), [['revised', '2026-04-30', '2026-05-15', 'manager@example.test', revise.reason]])
 const activity = await h.get('/api/easel/activity')
 assert.ok(JSON.stringify(activity).includes('scheduler:actions'), 'Chases are attributed to the action scheduler')

 // Any change to the decision itself waits for finance approval.
 const changed = await h.command('decision-change', { pack: pack.id, decision: delay, text: 'Delay the two engineering hires to July and review in August', reason: 'Add the August checkpoint' }, manager)
 assert.equal(changed.text, 'Delay the two engineering hires to July')
 const change = changed.changes[0]
 await h.command('decision-change-decide', { pack: pack.id, decision: delay, change: change.id, approve: true }, manager, 403)
 const decided = await h.command('decision-change-decide', { pack: pack.id, decision: delay, change: change.id, approve: true, note: 'Agreed' })
 assert.equal(decided.text, 'Delay the two engineering hires to July and review in August')
 await h.command('decision-change-decide', { pack: pack.id, decision: delay, change: change.id, approve: false }, h.owner, 409)
 const frozen = await h.get(`/api/easel/snapshot/${published.snapshot}`, board)
 assert.equal(frozen.body.decisions[0].text, 'Delay the two engineering hires to July', 'The published pack keeps the decision as published')

 // Before the delayed months close, nothing is realized yet.
 for (const month of ['2026-02', '2026-03', '2026-04']) await h.command('close-month', { scenario: forecast, month })
 let outcome = (await h.get('/api/easel/decisions')).decisions.find(d => d.decision === delay).outcome
 assert.deepEqual(outcome.payrollSaving, { months: ['2026-05', '2026-06'], approved: 3600000, approvedThroughClose: 0, realized: null, difference: null, complete: false })

 // After July closes: $36,000 approved saving against $34,000 realized from accepted payroll rows.
 for (const month of ['2026-05', '2026-06', '2026-07']) await h.command('close-month', { scenario: forecast, month })
 outcome = (await h.get('/api/easel/decisions')).decisions.find(d => d.decision === delay).outcome
 assert.deepEqual(outcome.payrollSaving, { months: ['2026-05', '2026-06'], approved: 3600000, approvedThroughClose: 3600000, realized: 3400000, difference: -200000, complete: true })
 assert.deepEqual(outcome.months.map(e => [e.month, e.closed, e.realized.payroll, e.realized.headcount, e.realized.capacityHundredths]), [['2026-05', true, 200000, null, null], ['2026-06', true, 0, null, null]])
 assert.deepEqual(outcome.months.map(e => [e.realized.cash - e.approved.cash, e.realized.revenue - e.approved.revenue]), [[-200000, 0], [-200000, 0]], 'Realized cash differs from the approved assumption by the unplanned contractor')
 assert.equal(outcome.proposal.id, proposal.id); assert.equal(outcome.actualsThrough, '2026-07')

 // A viewer reads the decision and its amounts without positions or salaries.
 const boardView = await h.get('/api/easel/decisions', board)
 assert.equal(boardView.decisions.find(d => d.decision === delay).outcome.payrollSaving.realized, 3400000)
 assert.doesNotMatch(JSON.stringify(boardView), /Platform engineer|Data engineer|annualSalary|12000000/)
 await h.get('/api/easel/decisions', '', 401)
})
