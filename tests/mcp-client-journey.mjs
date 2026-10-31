// Independent wire client: no shared-door protocol or name-rewriting helpers.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const modern = '2026-07-28', legacy = '2025-11-25'

// Forward the real HTTP request completely, then lose its successful response.
// The Worker and D1 never see a fake completion or a cancelled upstream request.
export async function droppedResponseProxy(origin) {
 let armed = false, dropped
 const server = createServer(async (request, response) => {
  try {
   assert.equal(request.method, 'POST')
   assert.ok(['/mcp', '/api/easel/mcp'].includes(request.url))
   const chunks = []
   for await (const chunk of request) chunks.push(chunk)
   const payload = JSON.parse(Buffer.concat(chunks).toString())
   const headers = { ...request.headers }; delete headers.host; delete headers['content-length']
   const upstream = await fetch(origin + request.url, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'manual' })
   const bytes = Buffer.from(await upstream.arrayBuffer())
   if (armed) {
    armed = false
    dropped = { path: request.url, request: payload, status: upstream.status, body: JSON.parse(bytes.toString()) }
    response.destroy()
   } else {
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
    response.end(bytes)
   }
  } catch (error) { response.destroy(error) }
 })
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
 return {
  origin: `http://127.0.0.1:${server.address().port}`,
  arm() { assert.equal(armed, false); armed = true; dropped = undefined },
  get dropped() { return dropped },
  async close() { await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() }) },
 }
}

export async function standaloneClientJourney({ origin, cookie, edge, approve, inspect = async () => {}, proof = () => {} }) {
 let id = 0
 const native = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(origin + path, { method, redirect: 'manual', headers: { origin, cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal(response.status, 200, `${method} ${path}: ${await response.clone().text()}`)
  return response.json()
 }
 const command = (name, args) => native(`/api/easel/command/${name}`, args)
 await command('workspace', { name: 'Synthetic client company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Sales' })
 const payroll = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await native('/api/easel/state')).scenarios.find(row => row.kind === 'budget')
 await command('position', { scenario: budget.id, department: department.id, line: payroll.id, title: 'Synthetic planner', holder: 'Synthetic Person', annualSalary: '60000', start: '2026-01' })
 const approved = await command('approve-budget', { scenario: budget.id, revision: (await native(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast
 const frozen = await native(`/api/easel/snapshot/${approved.budget.approval.snapshot}`)
 const unchangedCapture = async () => assert.deepEqual(await native(`/api/easel/snapshot/${frozen.id}`), frozen, 'Approved snapshot contents and hash remain unchanged')
 const snapshot = async () => {
  const state = await native('/api/easel/state')
  return { state, scenarios: await Promise.all(state.scenarios.map(row => native(`/api/easel/scenario/${row.id}`))), activity: await native('/api/easel/activity'), approvals: await native('/agents/api/approvals') }
 }
 let catalogue
 for (const policy of ['autonomous', 'held']) {
  await native('/agents/api/policy', { document: {
   schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', spend: { none: true }, reviewers: ['role:owner'],
   rules: policy === 'autonomous' ? [{ id: 'all', class: '*', do: 'autonomous' }] : [
    { id: 'sensitive-approval', class: '*', do: 'approval', approver: ['role:owner'], wait: 'P1D' },
    { id: 'ordinary-review', class: 'standard', do: 'review' },
   ],
  } }, 'PUT')
  for (const path of ['/mcp', '/api/easel/mcp']) {
   const rpc = async (method, params = {}, { version = modern, headers = {}, notification = false, handshake = false, stream = false, throughEdge = false } = {}) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++id }), method,
     params: { ...params, ...(version === legacy ? {} : { _meta: { 'io.modelcontextprotocol/protocolVersion': version } }) } })
    const response = await fetch((throughEdge ? edge.origin : origin) + path, { method: 'POST', redirect: 'manual', headers: {
     // Refused oversized uploads may close early: keep their sockets out of the native-read pool.
     origin, cookie, connection: 'close', accept: 'application/json, text/event-stream', 'content-type': 'application/json',
     ...(!handshake ? { 'mcp-protocol-version': version } : {}),
     ...(version === legacy ? {} : { 'mcp-method': method, ...(method === 'tools/call' ? { 'mcp-name': params.name } : {}) }), ...headers,
    }, body: stream ? new ReadableStream({ start(controller) { const bytes = new TextEncoder().encode(payload); for (let offset = 0; offset < bytes.length; offset += 65536) controller.enqueue(bytes.slice(offset, offset + 65536)); controller.close() } }) : payload,
    ...(stream ? { duplex: 'half' } : {}) })
    const text = await response.text()
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null }
   }
   const result = async (method, params, options) => {
    const answer = await rpc(method, params, options)
    assert.equal(answer.status, 200, JSON.stringify(answer.body))
    assert.ok(!answer.body.error, JSON.stringify(answer.body))
    return answer.body.result
   }
   // The first modern request lists authenticated tools, with no initialize.
   const first = await result('tools/list')
   assert.ok(first.tools.some(tool => tool.name === 'easel.proposals.create'))
   assert.ok(first.tools.some(tool => tool.name === 'easel.scenarios.read'))
   assert.equal(new Set(first.tools.map(tool => tool.name)).size, first.tools.length)
   assert.deepEqual(first.tools.map(tool => tool.name), first.tools.map(tool => tool.name).sort((a, b) => a.localeCompare(b)))
   assert.equal(first.cacheScope, 'private')
   assert.ok(Number.isSafeInteger(first.ttlMs) && first.ttlMs >= 0)
   assert.deepEqual(await result('tools/list'), first)
   if (catalogue) assert.deepEqual(first, catalogue, 'Both paths and company policies expose the identical catalogue')
   catalogue = first

   const discovered = await result('server/discover')
   assert.deepEqual(discovered.supportedVersions, [modern, legacy])
   assert.equal(discovered._meta['io.modelcontextprotocol/serverInfo'].name, 'Easel')
   assert.ok(discovered._meta['io.modelcontextprotocol/serverInfo'].version)
   assert.equal(typeof discovered.instructions, 'string')
   assert.ok(discovered.instructions.length > 0)
   assert.ok(discovered.capabilities.tools)
   for (const unsupported of ['roots', 'sampling', 'logging']) assert.equal(discovered.capabilities[unsupported], undefined)
   assert.equal(discovered.cacheScope, 'private')
   for (const metadataPath of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const metadata = await (await fetch(origin + metadataPath)).json()
    assert.equal(metadata.resource, origin + '/mcp')
    assert.deepEqual(metadata.authorization_servers, [])
    assert.deepEqual(metadata.bearer_methods_supported, ['header'])
    assert.ok(metadata.scopes_supported.includes('planning:read'))
    assert.ok(metadata.scopes_supported.includes('planning:write'))
   }
   const initialized = await result('initialize', { protocolVersion: legacy, capabilities: {}, clientInfo: { name: 'synthetic-easel-client', version: '1' } }, { version: legacy, handshake: true })
   assert.equal(initialized.protocolVersion, legacy)
   assert.deepEqual(initialized.capabilities, discovered.capabilities)
   assert.deepEqual(initialized.serverInfo, discovered._meta['io.modelcontextprotocol/serverInfo'])
   assert.equal(initialized.instructions, discovered.instructions)
   assert.equal((await rpc('notifications/initialized', {}, { version: legacy, notification: true })).status, 202)
   assert.deepEqual(await result('tools/list', {}, { version: legacy }), first)
   proof(`BASE-AGENT-001 1,2,4: ${path} ${policy} raw discovery, handshake-free modern list and legacy initialize -> identical nonempty sorted private catalogue`)

   const route = path === '/mcp' ? 'canonical' : 'alias'
   const key = `synthetic-easel-${policy}-${route}`
   const args = { from: forecast.id, name: `Synthetic ${policy} ${route} client proposal ${modern}`, request: 'Prepare a private planning alternative', idempotency_key: `${key}-${modern}` }
   const before = await snapshot()
   const refusals = [
    [{ version: '2099-01-01' }, args, 400, -32022, 'UnsupportedProtocolVersion'],
    [{ headers: { origin: 'https://foreign.invalid' } }, args, 403, -32600, 'Origin refused'],
    [{ headers: { 'mcp-method': 'tools/list' } }, args, 400, -32020, 'HeaderMismatch'],
    [{ headers: { 'mcp-name': 'easel.scenarios.list' } }, args, 400, -32020, 'HeaderMismatch'],
    [{}, { ...args, request: 'x'.repeat(discovered._meta['com.runeditrun/limits'].maxBodyBytes + 1) }, 413, -32600, 'Body too large'],
    [{ stream: true }, { ...args, request: 'x'.repeat(discovered._meta['com.runeditrun/limits'].maxBodyBytes + 1) }, 413, -32600, 'Body too large'],
   ]
   for (const [options, arguments_, status, code, message] of refusals) {
    const refused = await rpc('tools/call', { name: 'easel.proposals.create', arguments: arguments_ }, options)
    assert.equal(refused.status, status, message)
    assert.equal(refused.body.error.code, code)
    assert.equal(refused.body.error.message, message)
    assert.equal(refused.headers.get('cache-control'), 'no-store')
    if (message === 'UnsupportedProtocolVersion') assert.deepEqual(refused.body.error.data, { supported: [modern, legacy], requested: '2099-01-01' })
    assert.deepEqual(await snapshot(), before, `${message} changes no native model, activity or pending approval`)
   }
   proof(`BASE-AGENT-001 3,5,6: ${path} ${policy} unsupported version, foreign Origin, mismatched method and name, fixed and streamed oversized writes -> exact refusals; native state, activity and approvals unchanged`)

   // Use the very same caller key after the refused transport attempts.
   for (const version of [modern, legacy]) {
    const arguments_ = { ...args, name: `Synthetic ${policy} ${route} client proposal ${version}`, idempotency_key: `${key}-${version}` }
    const params = { name: 'easel.proposals.create', arguments: arguments_ }
    let answer = await result('tools/call', params, { version })
    if (policy === 'held') {
     const approval = version === modern ? answer._meta['com.runeditrun/approval'] : answer._meta['com.runeditrun/error'].approval
     assert.equal(version === modern ? answer.resultType : answer._meta['com.runeditrun/error'].code, version === modern ? 'input_required' : 'approval_required')
     assert.equal(new URL(approval.url).origin, origin)
     assert.ok(!(await native('/api/easel/state')).scenarios.some(row => row.name === arguments_.name), 'Held work has no proposal before a person approves')
     await approve({ approval, native, policy, path, version })
     answer = await result('tools/call', { ...params, ...(answer.requestState ? { requestState: answer.requestState } : {}) }, { version })
    }
    assert.equal(answer.isError, false, JSON.stringify(answer))
    const proposal = answer.structuredContent
    assert.equal(proposal.name, arguments_.name)
    assert.equal((await native(`/api/easel/scenario/${proposal.id}`)).scenario.name, arguments_.name)
    const completed = await snapshot()
    const replay = await result('tools/call', params, { version })
    assert.deepEqual(replay.structuredContent, proposal)
    assert.deepEqual(await snapshot(), completed, 'A caller-key retry returns the original record without another native effect')
   }
   proof(`BASE-AGENT-001 client flow: ${path} ${policy} raw modern and legacy proposal calls with caller keys -> native records and exactly-once replay${policy === 'held' ? ' after native person approval' : ''}`)

   const lostArgs = { ...args, name: `Synthetic ${policy} ${route} lost-response proposal`, idempotency_key: `${key}-lost-response` }
   const lostParams = { name: 'easel.proposals.create', arguments: lostArgs }
   const beforeLoss = await snapshot()
   let resume = lostParams
   if (policy === 'held') {
    const held = await result('tools/call', lostParams, { throughEdge: true })
    assert.equal(held.resultType, 'input_required')
    const approval = held._meta['com.runeditrun/approval']
    assert.equal(new URL(approval.url).origin, origin)
    assert.ok(!(await native('/api/easel/state')).scenarios.some(row => row.name === lostArgs.name))
    await unchangedCapture()
    await approve({ approval, native, policy, path, version: modern })
    resume = { ...lostParams, ...(held.requestState ? { requestState: held.requestState } : {}) }
   }
   edge.arm()
   await assert.rejects(rpc('tools/call', resume, { throughEdge: true }), error => error instanceof TypeError && error.message === 'fetch failed', 'The client loses the response after the upstream completes')
   const lost = edge.dropped
   assert.ok(lost, 'The network edge observed and discarded the real response')
   assert.equal(lost.path, path)
   assert.equal(lost.status, 200)
   assert.ok(!lost.body.error, JSON.stringify(lost.body))
   assert.equal(lost.body.result.isError, false, JSON.stringify(lost.body))
   const recorded = lost.body.result.structuredContent
   assert.equal(recorded.name, lostArgs.name)
   const afterLoss = await snapshot()
   const proposals = afterLoss.state.scenarios.filter(row => row.name === lostArgs.name)
   assert.deepEqual(proposals.map(row => row.id), [recorded.id], 'The lost response has already produced exactly one native proposal')
   assert.equal(afterLoss.state.scenarios.length, beforeLoss.state.scenarios.length + 1)
   const effects = afterLoss.activity.filter(row => row.action === 'proposal-create' && row.record === recorded.id)
   assert.equal(effects.length, 1, 'Exactly one creation is visible in native Activity')
   assert.equal(effects[0].detail.authority.idempotencyKey, lostArgs.idempotency_key)
   assert.equal(effects[0].detail.authority.label, `MCP client for ${afterLoss.state.me.name}`)
   if (policy === 'held') assert.ok(effects[0].detail.authority.approvers.some(person => person.name === afterLoss.state.me.name))
   else assert.deepEqual(effects[0].detail.authority.approvers, [])
   assert.equal((await native(`/api/easel/scenario/${recorded.id}`)).scenario.name, lostArgs.name)
   await unchangedCapture()

   const retry = await rpc('tools/call', lostParams, { throughEdge: true })
   assert.equal(retry.status, 200)
   assert.ok(!retry.body.error, JSON.stringify(retry.body))
   assert.notEqual(retry.body.id, lost.request.id, 'The retry has a new JSON-RPC id')
   assert.deepEqual(lost.request.params.arguments, lostArgs, 'Original caller arguments and key reached the mutation')
   assert.deepEqual(retry.body.result.structuredContent, recorded, 'Retry returns the complete recorded outcome')
   assert.equal(retry.body.result.isError, false)
   assert.deepEqual(await snapshot(), afterLoss, 'Recovery changes no native state, Activity or approval')
   await unchangedCapture()
   await inspect({ native, proposal: recorded, activity: effects[0], policy, path })
   proof(`BASE-AGENT-012 point2: ${path} ${policy} real response dropped after completion; new JSON-RPC id with original arguments and key -> recorded outcome, one proposal and Activity effect, approved snapshot unchanged${policy === 'held' ? ', named-person approval retained' : ''}`)
  }
 }
 return { native, catalogue }
}
