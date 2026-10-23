import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

async function setup(t, options = {}) {
 const calls = [], state = { invalid: false, entered: null, hold: null }
 const h = await harness({ ...options, outbound: async request => {
  if (request.url.startsWith('https://sandbox.plaid.com/')) {
   const path = new URL(request.url).pathname
   return path === '/accounts/balance/get' ? Response.json({ accounts: [{ account_id: 'synthetic-easel-4', type: 'depository', balances: { current: 100, iso_currency_code: 'USD' } }] }) : Response.json({ transactions: [], total_transactions: 0 })
  }
  assert.equal(request.url, 'https://api.openai.com/v1/responses')
  const body = await request.json(), source = JSON.parse(body.input)
  calls.push(body)
  assert.ok(!JSON.stringify(body).includes('Private salary sentinel'))
  assert.ok(!JSON.stringify(body).includes('12000000'))
  assert.ok(!JSON.stringify(body).includes('6000000'))
  assert.equal(body.tools, undefined)
  if (state.entered) { state.entered(); await state.hold }
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ claims: [{ text: 'Private salary sentinel 12000000', label: 'evidence', citationIds: [state.invalid ? 'synthetic-easel-unknown' : (source.question.includes('cash') ? source.acceptedRows.find(row => row.id.startsWith('cash:')) : source.acceptedRows[0]).id] }] }) }] }] })
 } })
 t.after(() => h.close())
 const post = async (path, body = {}, cookie = h.owner, status = 200) => { const r = await h.send(`/api/easel/${path}`, body, cookie); assert.equal(r.status, status, r.text); return r.value }
 await h.command('workspace', { name: 'Agent studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', timeZone: ['America', 'New_York'].join('/') })
 const department = await h.command('department', { name: 'Engineering' }), line = await h.command('line', { name: 'Payroll', payroll: true, type: 'operating-expense' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0]
 for (const [title, annualSalary] of [['Private salary sentinel', '120000'], ['Second person', '60000']]) await h.command('position', { scenario: scenario.id, title, department: department.id, line: line.id, start: '2026-01', annualSalary, onCostPercent: '0' })
 const input = { scenario: scenario.id, month: '2026-01', question: 'What is payroll by department?' }
 await post('./commentary/settings/configure', { model: 'synthetic-easel-model', inputUsdPerMillion: '1', outputUsdPerMillion: '2', monthlyUsd: '1', enabled: true, consent: true })
 await post('./commentary/connection/connect', { key: 'synthetic-easel-1', consent: true })
 await post('./agents/settings/configure', { agents: { analyst: true, missions: true }, monthlyUsd: '1', consent: true })
 const ask = async (cookie = h.owner, question = input.question) => { const body = { ...input, question }; const preview = await post('./analyst/preview', body, cookie); return post('./analyst/generate', { ...body, fingerprint: preview.fingerprint, consent: true }, cookie) }
 return { h, calls, state, post, input, scenario, department, ask }
}

test('Analyst sends only viewer-visible department totals, validates cited cells and discards private model prose with live stop and allowance fences', async t => {
 const { h, calls, state, post, input, ask } = await setup(t)
 const viewer = await h.person('viewer@example.test', 'viewer')
 const original = await h.get(`/api/easel/scenario/${input.scenario}`)
 const answer = await ask(viewer)
 assert.equal(answer.status, 'answered'); assert.equal(answer.agent, 'Analyst')
 assert.deepEqual(answer.citations.map(c => [c.department, c.line, c.amount]), [['Engineering', 'Payroll', 1500000]])
 assert.equal(JSON.parse(calls[0].input).acceptedRows[0].amount, 1500000)
 assert.ok(!JSON.stringify(answer).includes('Private salary sentinel')); assert.ok(!JSON.stringify(answer).includes('12000000'))
 await post('./missions/approve', { run: answer.id, name: 'Unapproved mission', recipients: ['viewer@example.test'], consent: true }, viewer, 403)
 state.invalid = true
 const refused = await ask()
 assert.equal(refused.status, 'refused'); assert.deepEqual(refused.citations, [])
 state.invalid = false
 await post('./agents/settings/configure', { agents: {}, monthlyUsd: '0', consent: true })
 const preview = await post('./analyst/preview', input, viewer)
 await post('./analyst/generate', { ...input, fingerprint: preview.fingerprint, consent: true }, viewer, 409)
 assert.equal(calls.length, 2)
 await post('./agents/settings/configure', { agents: {}, monthlyUsd: '1', consent: true })
 let entered, release
 const ready = new Promise(resolve => { entered = resolve })
 state.entered = entered; state.hold = new Promise(resolve => { release = resolve })
 const running = ask(viewer)
 await ready; await post('./agents/settings/stop'); await post('./agents/settings/resume'); release()
 assert.equal((await running).status, 'refused')
 assert.deepEqual(await h.get(`/api/easel/scenario/${input.scenario}`), original)
 await h.stepUp()
 const issued = await h.send('/api/easel/tokens/issue', { label: 'Synthetic governed service', kind: 'service', scope: 'write' }, h.owner)
 assert.equal(issued.status, 200)
 const service = (path, body) => h.mf.dispatchFetch(h.origin + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${issued.value.token}`, 'content-type': ['application', 'json'].join('/') }, ...(body ? { body: JSON.stringify(body) } : {}) })
 for (const op of ['approve-budget', 'proposal-promote', 'close-month', 'pack-publish']) {
  const response = await service(`/api/easel/command/${op}`, {})
  assert.equal(response.status, 403)
 }
 await post('agents' + '/settings/stop')
 assert.equal((await service('/api/easel/state')).status, 409, 'Global stop also fences service-token agent clients')
 await post('agents' + '/settings/resume')
 const events = await h.get('/api/easel/activity')
 assert.ok(events.some(e => e.action === 'analyst-intent' && e.detail.person === 'viewer@example.test' && e.detail.model === 'synthetic-easel-model' && e.detail.reserveMicroUsd > 0))
 assert.ok(!JSON.stringify(events).includes('Private salary sentinel 12000000'))
})

test('Approved Monday missions use named finance authority, deliver once to two current people and replace stale connector analysis with a notice under a fake clock', async t => {
 let now = '2026-01-04T15:00:00.000Z'
 let uncertain = false
 const { h, calls, post, ask } = await setup(t, { now: () => now, mailResponse: message => { if (uncertain && message.subject.startsWith('Easel mission:')) throw new Error('Synthetic unknown mail outcome'); return Response.json({ id: 'synthetic-easel-mail' }) } })
 await h.person('finance@example.test', 'finance')
 const viewer = await h.person('viewer@example.test', 'viewer')
 const answer = await ask(h.owner, 'What is the cash position for this weekly cash brief?')
 assert.ok(answer.citations[0].id.startsWith('cash:'))
 const mission = await post('./missions/approve', { run: answer.id, name: 'Weekly cash brief', recipients: ['owner@example.test', 'finance@example.test'], consent: true })
 await post('./missions/approve', { run: answer.id, name: 'Forbidden audience', recipients: ['viewer@example.test'], consent: true }, h.owner, 403)
 const run = async () => (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 const mail = () => h.messages.filter(m => m.subject === 'Easel mission: Weekly cash brief')
 await run(); assert.equal(mail().length, 0)
 now = '2026-01-05T12:59:00.000Z'; await run(); assert.equal(mail().length, 0)
 now = '2026-01-05T13:00:00.000Z'; await run()
 assert.equal(mail().length, 2); assert.deepEqual(mail().map(m => m.to[0]).sort(), ['finance@example.test', 'owner@example.test'])
 assert.ok(mail().every(m => m.text.includes('citation cash:') && m.text.includes('Closing cash') && !m.text.includes('Private salary sentinel')))
 await run(); assert.equal(mail().length, 2); assert.equal(calls.length, 2)
 await post('./connections/plaid/connect', { environment: 'sandbox', clientId: 'synthetic-easel-1', secret: 'synthetic-easel-2', accessToken: 'synthetic-easel-3', consent: true })
 await post('./connections/plaid/refresh')
 now = '2026-01-12T13:00:00.000Z'; await run()
 assert.equal(mail().length, 4); assert.ok(mail().slice(2).every(m => m.text.includes('Sources stale: plaid') && !m.text.includes('1500000')))
 assert.equal(calls.length, 2, 'Stale source means no model call')
 const view = await h.get('/api/easel/missions')
 assert.deepEqual(view.runs.map(r => r.status), ['completed', 'stale'])
 assert.ok(view.runs.every(r => Object.values(r.deliveries).every(status => status === 'accepted')))
 await h.get('/api/easel/missions', viewer, 403)
 now = '2026-01-19T13:00:00.000Z'
 await post('./connections/plaid/refresh')
 uncertain = true; await run()
 assert.equal(mail().length, 6)
 await run(); assert.equal(mail().length, 6, 'Unknown mail outcomes never retry')
 uncertain = false
 now = '2026-03-09T11:59:00.000Z'; await post('./connections/plaid/refresh'); await run(); assert.equal(mail().length, 6)
 now = '2026-03-09T12:00:00.000Z'; await run(); assert.equal(mail().length, 8, 'Monday 08:00 follows company daylight saving time')
 await post('./missions/stop', { id: mission.id })
 now = '2026-03-16T12:00:00.000Z'; await run(); assert.equal(mail().length, 8)
})


test('Cited reference differences and private expense what-ifs retain live authority and leave the official plan unchanged', async t => {
 const { h, post, input, department } = await setup(t)
 const line = await h.command('line', { name: 'Software', type: 'operating-expense' })
 await h.command('scenario-cash', { scenario: input.scenario, basis: 'estimate', opening: '1000', collectionLag: 0, paymentLag: 0 })
 const expense = await h.command('expense', { scenario: input.scenario, name: 'Software subscription', kind: 'recurring', department: department.id, line: line.id, start: '2026-01', amount: '200' })
 const revenueLine = await h.command('line', { name: 'Customer revenue', type: 'revenue' })
 const customer = await h.command('revenue', { scenario: input.scenario, name: 'Native customer', kind: 'contract', start: '2026-01', department: department.id, line: revenueLine.id, startDate: '2026-01-01', contractValue: '1200', termMonths: 12, billingCadence: 'monthly', dsoDays: 0 })
 const reference = await h.command('branch', { from: input.scenario, name: 'Reference plan' })
 const source = await h.get(`/api/easel/scenario/${input.scenario}`)
 const ask = async cookie => {
  const b = { ...input, compare: reference.id }, preview = await post('./analyst/preview', b, cookie)
  return post('./analyst/generate', { ...b, fingerprint: preview.fingerprint, consent: true }, cookie)
 }
 const viewer = await h.person('viewer@example.test', 'viewer')
 const viewed = await ask(viewer)
 assert.ok(viewed.explanation[0].text.includes('difference 0 cents'))
 assert.equal(viewed.explanation[0].citationIds.length, 2)
 await post('./analyst/what-if', { run: viewed.id, origin: expense.originId, name: 'Viewer attempt', amount: '100' }, viewer, 403)
 const answer = await ask(h.owner)
 const result = await post('./analyst/what-if', { run: answer.id, origin: expense.originId, name: 'Private lower spend', amount: '100' })
 const privateView = await h.get(`/api/easel/scenario/${result.scenario}`)
 await post('./analyst/preview', { ...input, compare: result.scenario }, h.owner, 403)
 assert.deepEqual(privateView.scenario.sandbox.grants, {})
 assert.equal(privateView.inputs.expense[0].amountCents, 10000)
 assert.equal(privateView.calculation.cash[0].closing - source.calculation.cash[0].closing, 10000)
 assert.deepEqual(await h.get(`/api/easel/scenario/${input.scenario}`), source)
 const lostInput = { ...input, question: 'What if we lose our native customer?' }, lostPreview = await post('./analyst/preview', lostInput)
 const lostAnswer = await post('./analyst/generate', { ...lostInput, fingerprint: lostPreview.fingerprint, consent: true })
 const lost = await post('./analyst/what-if', { run: lostAnswer.id, kind: 'remove-revenue', origin: customer.originId, name: 'Lose customer' })
 const lostView = await h.get(`/api/easel/scenario/${lost.scenario}`)
 assert.equal(lostView.inputs.revenue.length, 0)
 assert.ok(lost.cash[1].closing < source.calculation.cash[1].closing)
 assert.deepEqual(await h.get(`/api/easel/scenario/${input.scenario}`), source)
 const other = await h.person('other@example.test', 'finance')
 await h.get(`/api/easel/scenario/${result.scenario}`, other, 404)
 await post('./analyst/what-if', { run: answer.id, origin: expense.originId, name: 'Repeat', amount: '100' }, h.owner, 409)
 const privateInput = { scenario: result.scenario, month: input.month, question: 'Private spend comparison' }
 const p = await post('./analyst/preview', privateInput)
 const privateAnswer = await post('./analyst/generate', { ...privateInput, fingerprint: p.fingerprint, consent: true })
 await post('./missions/approve', { run: privateAnswer.id, name: 'Private mission refused', recipients: ['owner@example.test'], consent: true }, h.owner, 403)
 await h.command('expense', { scenario: input.scenario, id: expense.id, name: expense.name, kind: expense.kind, department: department.id, line: line.id, start: expense.start, amount: '250' })
 const stale = await post('./analyst/preview', input)
 await h.command('expense', { scenario: input.scenario, id: expense.id, name: expense.name, kind: expense.kind, department: department.id, line: line.id, start: expense.start, amount: '260' })
 await post('./analyst/generate', { ...input, fingerprint: stale.fingerprint, consent: true }, h.owner, 409)
})
