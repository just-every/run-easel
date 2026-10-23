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
 const { h, calls, post, ask } = await setup(t, { now: () => now })
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
 await post('./missions/stop', { id: mission.id })
 now = '2026-01-19T13:00:00.000Z'; await run(); assert.equal(mail().length, 4)
})
