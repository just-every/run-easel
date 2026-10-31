// Real native membership, invitation and confirmation; synthetic Business signs
// only at the external trust boundary. No native identity or grant is inserted.
import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { signJws, accessToken, policyEnvelope } from '../src/modules/agent-door/conformance/crypto.mjs'

export async function authoritySigner() {
 const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 const signer = { issuer: 'https://synthetic-easel-business.invalid', kid: randomUUID(), installationId: randomUUID(), privateKey: keys.privateKey }
 const publicKeys = { [signer.kid]: { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid: signer.kid, alg: 'ES256', use: 'sig' } }
 const ownerEmail = ['owner', 'example.test'].join('@')
 return { signer, ownerEmail, bindings: {
  RER_OWNER_CLAIM_ISSUER: signer.issuer, RER_OWNER_CLAIM_INSTALLATION_ID: signer.installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
  RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer: signer.issuer, audience: 'self-host', subject: signer.installationId, email: ownerEmail, keys: publicKeys }),
 } }
}

export async function authorityJourney({ origin, request, owner, signing, messages, policy, approve, inspect = async () => {}, proof = () => {} }) {
 let seq = 0
 const native = async (path, body, cookie = owner, status = 200, method = body === undefined ? 'GET' : 'POST') => {
  const response = await request(origin + path, { method, redirect: 'manual', headers: { origin, cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  assert.equal(response.status, status, `${method} ${path}: ${text}`)
  return { value: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] }
 }
 const get = async (path, cookie = owner) => (await native(path, undefined, cookie)).value
 const command = async (name, args, cookie = owner) => (await native(`/api/easel/command/${name}`, args, cookie)).value
 const personEmail = [`synthetic-easel-${policy}`, 'example.test'].join('@'), personName = `Synthetic ${policy} planner`
 await command('workspace', { name: 'Synthetic authority company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await command('department', { name: 'Sales' }), engineering = await command('department', { name: 'Engineering' })
 const cost = await command('line', { name: 'Operating cost', type: 'operating-expense' })
 const budget = (await get('/api/easel/state')).scenarios.find(row => row.kind === 'budget')
 for (const [department, name, amount] of [[sales.id, 'Visible sales cost', '123'], [engineering.id, 'Restricted engineering cost', '456']]) {
  await command('expense', { scenario: budget.id, department, line: cost.id, name, kind: 'recurring', amount, start: '2026-01' })
 }
 const forecast = (await command('approve-budget', { scenario: budget.id, revision: (await get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 const captures = (await get('/api/easel/state')).snapshots
 assert.ok(captures.length, 'The journey protects a real approved capture')
 const frozen = await Promise.all(captures.map(row => get(`/api/easel/snapshot/${row.id}`)))

 const ownerSub = randomUUID(), sponsorSub = randomUUID(), business = 'synthetic-easel-business', iat = Math.floor(Date.now() / 1000)
 const settings = await signJws(signing.signer.privateKey, signing.signer.kid, 'rer-business-settings+jwt', {
  v: 1, iss: signing.signer.issuer, aud: 'self-host', sub: signing.signer.installationId, business, email: signing.ownerEmail, owner_id: ownerSub,
  jti: randomUUID(), iat, exp: iat + 300, rev: 1, values: {}, logo: null, team: [{ id: sponsorSub, email: personEmail, name: personName, role: 'member', invite: 1 }],
 })
 await native('/api/rer/business-settings', { settings })
 const member = departments => command('member', { email: personEmail, name: personName, role: 'contributor', departments })
 await member([sales.id, engineering.id])
 await native('/api/easel/invite', { email: personEmail })
 const invitation = messages.filter(message => message.to.includes(personEmail)).at(-1)
 assert.ok(invitation, 'Native invitation is delivered at the mail edge')
 const confirmation = new URL(invitation.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
 const person = (await native('/auth/confirm', { token: confirmation.searchParams.get('token') }, '', 303)).cookie
 assert.ok(person && person !== owner, 'The sponsor confirms into an independent native session')
 const operator = (await get('/auth/operators')).find(row => row.email === personEmail)
 assert.equal(operator.status, 'active')

 const context = { signer: signing.signer, origin, business, revision: 0, seq: 0, person: { sub: sponsorSub, email: personEmail }, agentId: `synthetic-easel-${policy}-agent`, consent: randomUUID(), surface: { specialist: 'finance planner', tools: [{ scope: 'planning:read' }, { scope: 'planning:write' }] } }
 const document = { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', spend: { none: true }, rules: [{ id: policy, class: '*', do: policy === 'held' ? 'approval' : 'autonomous', ...(policy === 'held' ? { approver: ['role:owner'], wait: 'P1D' } : {}) }] }
 const envelope = await policyEnvelope(context, document)
 await native('/api/rer/agent-policy', { policy: envelope.policy })
 // This exact token is retained for every call, including after suspension.
 const token = await accessToken(context)
 const readStates = new Map()
 const rpc = async (name, args, path = '/mcp', status = 200) => {
  const version = '2026-07-28', requestState = readStates.get(args.idempotency_key)
  const response = await request(origin + path, { method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'mcp-protocol-version': version, 'mcp-method': 'tools/call', 'mcp-name': name }, body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args, ...(requestState ? { requestState } : {}), _meta: { 'io.modelcontextprotocol/protocolVersion': version } } }) })
  const body = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  if (name === 'easel.scenarios.read' && body.result?.requestState) readStates.set(args.idempotency_key, body.result.requestState)
  return status === 200 ? body.result : body
 }
 const complete = async (name, args) => {
  let result = await rpc(name, args)
  if (policy === 'held') {
   const approval = result._meta['com.runeditrun/approval']
   assert.ok(approval?.id, JSON.stringify(result))
   assert.equal((await get(`/agents/api/approvals/${approval.id}`)).approval.state, 'pending')
   if (name === 'easel.proposals.create') assert.ok(!(await get('/api/easel/state')).scenarios.some(row => row.name === args.name), 'Held creation has no native proposal before the owner approves')
   if (name === 'easel.expenses.update') assert.ok(!(await get(`/api/easel/scenario/${args.scenario}`)).inputs.expense.some(row => row.name === args.name), 'Held edit has no native effect before the owner approves')
   await approve({ approval, get, native, owner, person, personName })
   result = await rpc(name, args)
  }
  assert.equal(result.isError, false, JSON.stringify(result))
  return result.structuredContent
 }
 const creation = { from: forecast.id, name: `Synthetic ${policy} proposal`, request: 'Prepare an alternative without changing the approved plan', idempotency_key: `synthetic-easel-${policy}-create` }
 const proposal = await complete('easel.proposals.create', creation)
 const write = { scenario: proposal.id, department: engineering.id, line: cost.id, name: 'Restricted agent cost', kind: 'recurring', amount: '789', start: '2026-01', idempotency_key: `synthetic-easel-${policy}-write` }
 const effect = await complete('easel.expenses.update', write)
 assert.equal(effect.amountCents, 78900)
 const readArgs = { scenario: proposal.id, idempotency_key: `synthetic-easel-${policy}-read` }
 const initial = await complete('easel.scenarios.read', readArgs)
 assert.ok(initial.inputs.expense.some(row => row.name === 'Restricted agent cost'))
 assert.ok(initial.inputs.expense.some(row => row.name === 'Visible sales cost'))
 const model = async () => {
  const state = await get('/api/easel/state')
  return { state, scenarios: await Promise.all(state.scenarios.map(row => get(`/api/easel/scenario/${row.id}`))), activity: await get('/api/easel/activity'), approvals: await get('/agents/api/approvals') }
 }
 const refused = (result, code = 'forbidden') => {
  assert.equal(result.isError, true, JSON.stringify(result))
  assert.equal(result._meta['com.runeditrun/error'].code, code)
  assert.equal(result.structuredContent, undefined)
  assert.ok(!JSON.stringify(result).includes('Restricted agent cost'))
  assert.ok(!JSON.stringify(result).includes('Restricted engineering cost'))
  assert.ok(!result.content?.some(item => item.type === 'resource_link'))
 }

 const completed = await model()
 for (const path of ['/mcp', '/api/easel/mcp']) {
  assert.deepEqual((await rpc('easel.proposals.create', creation, path)).structuredContent, proposal)
  assert.deepEqual((await rpc('easel.expenses.update', write, path)).structuredContent, effect)
 }
 assert.deepEqual(await model(), completed, 'Allowed completed-key retries have one native effect before authority changes')

 await member([sales.id])
 const narrowed = await model()
 // The very next call retries a completed read under its original key.
 const currentRead = await rpc('easel.scenarios.read', readArgs)
 assert.equal(currentRead.isError, false, JSON.stringify(currentRead))
 assert.deepEqual(currentRead.structuredContent, await get(`/api/easel/scenario/${proposal.id}`, person))
 assert.deepEqual(currentRead.structuredContent.inputs.expense.map(row => row.name), ['Visible sales cost'])
 assert.ok(!JSON.stringify(currentRead).includes('Restricted agent cost'))
 assert.ok(!JSON.stringify(currentRead).includes('Restricted engineering cost'))
 for (const path of ['/mcp', '/api/easel/mcp']) {
  refused(await rpc('easel.expenses.update', write, path))
  refused(await rpc('easel.expenses.update', { ...write, idempotency_key: `synthetic-easel-${policy}-denied-${path === '/mcp' ? 'canonical' : 'alias'}` }, path))
 }
 await native('/api/easel/command/expense', { ...write, idempotency_key: undefined }, person, 403)
 assert.deepEqual(await model(), narrowed, 'Narrowed reads and refused writes add no effect or pending approval')
 proof(`BASE-AGENT-005 point3 departments ${policy}: native member narrows to Sales -> next completed read filters Engineering; fresh writes and completed-key retries refused on both MCP paths; native model and approvals unchanged`)
 await inspect({ stage: 'departments', owner, person, personName, proposal, policy, sales, engineering })

 await command('member', { email: personEmail, name: personName, role: 'viewer', departments: [] })
 const downgraded = await model()
 refused(await rpc('easel.scenarios.read', readArgs), 'resource_unavailable')
 assert.deepEqual(await model(), downgraded, 'The first MCP call after viewer downgrade cannot resume the former private read')
 const viewer = await rpc('easel.scenarios.read', { scenario: forecast.id, idempotency_key: `synthetic-easel-${policy}-viewer` })
 if (policy === 'held') {
  const approval = viewer._meta['com.runeditrun/approval']
  assert.ok(approval?.id)
  await approve({ approval, get, native, owner, person, personName })
 }
 const viewerRead = policy === 'held' ? await rpc('easel.scenarios.read', { scenario: forecast.id, idempotency_key: `synthetic-easel-${policy}-viewer` }) : viewer
 assert.equal(viewerRead.isError, false, JSON.stringify(viewerRead))
 assert.deepEqual(viewerRead.structuredContent, await get(`/api/easel/scenario/${forecast.id}`, person))
 assert.deepEqual(viewerRead.structuredContent.inputs.expense, [])
 const viewerBeforeRefusals = await model()
 for (const path of ['/mcp', '/api/easel/mcp']) {
  refused(await rpc('easel.scenarios.read', readArgs, path), 'resource_unavailable')
  refused(await rpc('easel.proposals.create', creation, path))
  refused(await rpc('easel.proposals.create', { ...creation, idempotency_key: `synthetic-easel-${policy}-viewer-new-${path === '/mcp' ? 'canonical' : 'alias'}` }, path))
  refused(await rpc('easel.expenses.update', write, path), 'resource_unavailable')
 }
 await native('/api/easel/command/proposal-create', creation, person, 403)
 assert.deepEqual(await model(), viewerBeforeRefusals, 'Viewer refusals expose no private proposal and create no additional effect')
 assert.deepEqual((await model()).scenarios, downgraded.scenarios)
 proof(`BASE-AGENT-005 point3 viewer ${policy}: native member changes contributor to viewer -> current public forecast equals native viewer projection; private read, new proposal and completed-key retries refused without effects`)
 await inspect({ stage: 'viewer', owner, person, personName, proposal, policy })

 await native('/auth/operator/status', { operatorId: operator.id, status: 'inactive' })
 const suspended = await model()
 for (const path of ['/mcp', '/api/easel/mcp']) {
  for (const [name, args] of [['easel.scenarios.read', readArgs], ['easel.proposals.create', creation], ['easel.expenses.update', write]]) await rpc(name, args, path, 401)
 }
 await native('/api/easel/state', undefined, person, 401)
 assert.deepEqual(await model(), suspended, 'Suspended agent and person credentials cannot change or recover native data')
 assert.deepEqual(await Promise.all(captures.map(row => get(`/api/easel/snapshot/${row.id}`))), frozen, 'Approved captures remain byte-for-byte unchanged through authority changes')
 proof(`BASE-AGENT-005 point3 suspension ${policy}: native operator status inactive -> same unexpired credential returns 401 for reads, writes and completed-key retries on both MCP paths; person session refused, model and approved captures unchanged`)
 return { proposal }
}
