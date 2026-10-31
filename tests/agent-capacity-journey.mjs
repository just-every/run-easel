// Real production capacity and elapsed recovery; only Business signing is synthetic.
import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../src/modules/agent-door/conformance/crypto.mjs'
import { rawAgentRequest } from './browser-runtime.mjs'

export async function capacitySigning() {
 const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 const kid = 'synthetic-easel-capacity', issuer = 'https://synthetic-easel-business.invalid', installationId = randomUUID()
 const publicKeys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid, alg: 'ES256', use: 'sig' } }
 return {
  signer: { issuer, kid, installationId, privateKey: keys.privateKey },
  bindings: origin => ({ RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId,
   RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
   RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: origin, subject: installationId, keys: publicKeys }) }),
 }
}

export async function agentCapacityJourney({ origin, cookie, signing, approve, inspect = async () => {}, proof = () => {} }) {
 let id = 0
 const native = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(origin + path, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
   headers: { origin, cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal(response.status, 200, `${method} ${path}: ${await response.clone().text()}`)
  return response.json()
 }
 const command = (name, body) => native(`/api/easel/command/${name}`, body)
 await command('workspace', { name: 'Synthetic capacity company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Sales' })
 const payroll = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await native('/api/easel/state')).scenarios.find(row => row.kind === 'budget')
 await command('position', { scenario: budget.id, department: department.id, line: payroll.id, title: 'Synthetic planner', holder: 'Synthetic Person', annualSalary: '60000', start: '2026-01' })
 const { forecast } = await command('approve-budget', { scenario: budget.id, revision: (await native(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const frozen = await native(`/api/easel/scenario/${budget.id}`)
 assert.equal(frozen.scenario.status, 'frozen')
 assert.ok(frozen.inputs.position.length > 0)
 const snapshot = async () => {
  const state = await native('/api/easel/state')
  return { state, scenarios: await Promise.all(state.scenarios.map(row => native(`/api/easel/scenario/${row.id}`))),
   activity: await native('/api/easel/activity'), approvals: await native('/agents/api/approvals') }
 }
 const context = { signer: signing.signer, origin, business: 'synthetic-easel-capacity', revision: 0, seq: 0,
  person: { sub: randomUUID(), email: ['owner', 'example.test'].join('@') },
  surface: { specialist: 'finance planner', tools: [{ scope: 'planning:read' }, { scope: 'planning:write' }] } }
 const now = Math.floor(Date.now() / 1000)
 const settings = await signJws(context.signer.privateKey, context.signer.kid, 'rer-business-settings+jwt', {
  v: 1, iss: context.signer.issuer, aud: origin, sub: context.signer.installationId, business: context.business,
  email: context.person.email, owner_id: context.person.sub, jti: randomUUID(), iat: now, exp: now + 300,
  rev: 1, values: {}, logo: null, team: [],
 })
 await native('/api/rer/business-settings', { settings })
 const receipts = []
 for (const policy of ['autonomous', 'held']) {
  const envelope = await policyEnvelope(context, policy === 'held' ? heldPolicy() : autonomousPolicy())
  await native('/api/rer/agent-policy', { policy: envelope.policy })
  context.revision = envelope.payload.revision; context.seq = envelope.payload.seq
  const token = await accessToken({ ...context, agentId: `synthetic-easel-capacity-${policy}`, consent: randomUUID() })
  const independent = await accessToken({ ...context, agentId: `synthetic-easel-independent-${policy}`, consent: randomUUID() })
  const rpc = (path, credential, method, params) => rawAgentRequest(origin, path, credential, ++id, method, params)
  const result = answer => {
   assert.equal(answer.status, 200, JSON.stringify(answer.body))
   assert.equal(answer.body.error, undefined, JSON.stringify(answer.body))
   return answer.body.result
  }
  const discovery = result(await rpc('/mcp', token, 'server/discover'))
  const capacity = discovery._meta['com.runeditrun/limits'].requestsPerMinute
  assert.ok(Number.isSafeInteger(capacity) && capacity > 0)
  // Start early in a real minute so the bounded burst cannot straddle its reset.
  // This waits for production time; it never changes the clock or stored counters.
  const offset = Date.now() % 60000
  if (offset > 10000) await wait(60000 - offset + 50)
  const before = await snapshot(), started = performance.now()
  const accepted = { '/mcp': 0, '/api/easel/mcp': 0 }
  for (let sent = 0; sent < capacity;) {
   const count = Math.min(6, capacity - sent)
   const answers = await Promise.all(Array.from({ length: count }, (_, n) => {
    const path = (sent + n) % 2 ? '/api/easel/mcp' : '/mcp'
    return rpc(path, token, 'tools/list').then(answer => ({ path, answer }))
   }))
   for (const { path, answer } of answers) {
    assert.ok(result(answer).tools.some(tool => tool.name === 'easel.proposals.create'))
    accepted[path]++
   }
   sent += count
  }
  assert.ok(Object.values(accepted).every(count => count > 0))
  const args = { from: forecast.id, name: `Synthetic ${policy} capacity proposal`, request: 'Prepare a private payroll alternative', idempotency_key: `synthetic-easel-capacity-${policy}` }
  const params = { name: 'easel.proposals.create', arguments: args }
  let retryAfter, retryAt, refusedAt
  for (const path of ['/mcp', '/api/easel/mcp']) {
   for (const [method, arguments_] of [['tools/list', {}], ['tools/call', params]]) {
    const refused = await rpc(path, token, method, arguments_)
    assert.equal(refused.status, 429, JSON.stringify(refused.body))
    assert.equal(refused.body.error.code, -32000)
    assert.equal(refused.body.error.data.code, 'rate_limited')
    assert.equal(refused.body.result, undefined)
    assert.equal(refused.headers.get('cache-control'), 'no-store')
    assert.match(refused.headers.get('retry-after') ?? '', /^[1-9]\d*$/)
    retryAfter = Number(refused.headers.get('retry-after'))
    assert.ok(retryAfter <= 60, 'Retry-After is a positive interval of at most one minute')
    refusedAt = performance.now(); retryAt = refusedAt + retryAfter * 1000
   }
  }
  assert.deepEqual(await snapshot(), before, 'Capacity refusals change no planning state, activity, approved capture or pending approval')
  proof(`BASE-AGENT-011 shared-capacity ${policy}: ${capacity} successful raw calls (${accepted['/mcp']} canonical, ${accepted['/api/easel/mcp']} alias) in ${Math.ceil(performance.now() - started)}ms -> both reads and mutations return 429 rate_limited; Retry-After=${retryAfter}s; native state and approvals unchanged`)

  for (const path of ['/mcp', '/api/easel/mcp']) {
   const listed = result(await rpc(path, independent, 'tools/call', { name: 'easel.scenarios.list', arguments: {} }))
   assert.equal(listed.isError, false, JSON.stringify(listed))
   assert.ok(JSON.stringify(listed.structuredContent).includes(forecast.id), 'An independent agent still reads the real forecast')
  }
  const comment = await command('comment', { scenario: forecast.id, department: department.id, text: `Synthetic ${policy} native session remains usable` })
  const personState = await snapshot()
  assert.ok(personState.activity.some(row => row.action === 'comment' && row.record === comment.id), 'The native person can still save a comment while the agent is exhausted')
  assert.deepEqual(await native(`/api/easel/scenario/${budget.id}`), frozen)
  await inspect({ phase: 'refused', policy, args, native, forecast })
  proof(`BASE-AGENT-011 isolation ${policy}: independent agent reads both endpoints and native person saves a comment -> usable; approved plan unchanged`)

  await wait(Math.max(0, retryAt - performance.now()) + 100)
  const elapsed = performance.now() - refusedAt
  assert.ok(elapsed >= retryAfter * 1000, 'Recovery waits the real advertised interval')
  result(await rpc('/mcp', token, 'tools/list'))
  let answer = result(await rpc('/api/easel/mcp', token, 'tools/call', params))
  if (policy === 'held') {
   assert.equal(answer.resultType, 'input_required')
   const approval = answer._meta['com.runeditrun/approval']
   assert.ok(approval.id)
   assert.ok(!(await native('/api/easel/state')).scenarios.some(row => row.name === args.name))
   const pending = await native('/agents/api/approvals')
   assert.equal(pending.approvals.filter(row => row.state === 'pending').length, 1, 'Only the recovered call creates a pending approval')
   await approve({ approval, native, policy })
   answer = result(await rpc('/mcp', token, 'tools/call', { ...params, requestState: answer.requestState }))
  }
  assert.equal(answer.isError, false, JSON.stringify(answer))
  const proposal = answer.structuredContent
  assert.equal(proposal.name, args.name)
  assert.equal((await native('/api/easel/state')).scenarios.filter(row => row.name === args.name).length, 1)
  assert.equal((await native(`/api/easel/scenario/${proposal.id}`)).scenario.name, args.name)
  assert.deepEqual(await native(`/api/easel/scenario/${budget.id}`), frozen)
  const completed = await snapshot()
  assert.deepEqual(result(await rpc('/api/easel/mcp', token, 'tools/call', params)).structuredContent, proposal)
  assert.deepEqual(await snapshot(), completed, 'The original refused key becomes one completed effect, with no duplicate on replay')
  await inspect({ phase: 'recovered', policy, args, native, forecast, proposal })
  const receipt = { policy, capacity, accepted, retryAfter, elapsedMs: Math.floor(elapsed), proposal: proposal.id }
  receipts.push(receipt)
  proof(`BASE-AGENT-011 recovery ${policy}: same credential and refused mutation key after ${receipt.elapsedMs}ms (advertised ${retryAfter}s) -> both endpoints usable and one proposal${policy === 'held' ? ' only after native person approval' : ''}; approved plan unchanged`)
 }
 return receipts
}
