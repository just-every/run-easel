// Independent wire client: no shared-door protocol or name-rewriting helpers.
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'

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

export async function standaloneClientJourney({ origin, cookie, edge, approve, inspect = async () => {}, inspectLifecycle = async () => {}, proof = () => {} }) {
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
   const rpc = async (method, params = {}, { version = modern, headers = {}, notification = false, handshake = false, stream = false, raw = false, throughEdge = false } = {}) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++id }), method,
     params: { ...params, ...(version === legacy ? {} : { _meta: { 'io.modelcontextprotocol/protocolVersion': version } }) } })
    const url = (throughEdge ? edge.origin : origin) + path
    const requestHeaders = {
     // Refused oversized uploads may close early: keep their sockets out of the native-read pool.
     origin, cookie, connection: 'close', accept: 'application/json, text/event-stream', 'content-type': 'application/json',
     ...(!handshake ? { 'mcp-protocol-version': version } : {}),
     ...(version === legacy ? {} : { 'mcp-method': method, ...(method === 'tools/call' ? { 'mcp-name': params.name } : {}) }), ...headers,
    }
    // Read early refusals before committing more upload bytes. The fixed-size
    // request advertises its actual length; a streaming request sends every
    // byte with backpressure and carries no size header.
    if (raw) return new Promise((resolve, reject) => {
     let received = false
     const upload = httpRequest(url, { method: 'POST', headers: { ...requestHeaders, ...(!stream ? { 'content-length': Buffer.byteLength(payload) } : {}) } }, response => {
      received = true
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.once('error', reject)
      response.once('end', () => {
       try { resolve({ status: response.statusCode, headers: new Headers(response.headers), body: JSON.parse(Buffer.concat(chunks).toString()) }) } catch (error) { reject(error) }
       upload.destroy()
      })
     })
     upload.once('error', error => { if (!received) reject(new Error(`Raw ${stream ? 'streamed' : 'fixed'} request ${path}: ${error.message}`, { cause: error })) })
     upload.setTimeout(30000, () => upload.destroy(new Error('Raw HTTP refusal timed out')))
     upload.flushHeaders()
     if (stream) {
      const bytes = Buffer.from(payload)
      const send = offset => {
       if (received || upload.destroyed) return
       if (offset === bytes.length) { upload.end(); return }
       const end = Math.min(offset + 65536, bytes.length)
       upload.write(bytes.subarray(offset, end), error => { if (!error) setImmediate(() => send(end)) })
      }
      send(0)
     }
    })
    const response = await fetch(url, { method: 'POST', redirect: 'manual', headers: requestHeaders,
     body: stream ? new ReadableStream({ start(controller) { const bytes = new TextEncoder().encode(payload); for (let offset = 0; offset < bytes.length; offset += 65536) controller.enqueue(bytes.slice(offset, offset + 65536)); controller.close() } }) : payload,
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
    [{ raw: true }, { ...args, request: 'x'.repeat(discovered._meta['com.runeditrun/limits'].maxBodyBytes + 1) }, 413, -32600, 'Body too large'],
    [{ stream: true, raw: true }, { ...args, request: 'x'.repeat(discovered._meta['com.runeditrun/limits'].maxBodyBytes + 1) }, 413, -32600, 'Body too large'],
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

   // Recover an entire native draft lifecycle, including consumed preconditions.
   const recover = async (name, values, check) => {
    const arguments_ = { ...values, idempotency_key: `${key}-lost-${name}` }
    const params = { name: `easel.${name}`, arguments: arguments_ }
    const before = await snapshot()
    let resume = params
    if (policy === 'held' && name === 'positions.update') {
     const pending = await result('tools/call', params, { throughEdge: true })
     assert.equal(pending.resultType, 'input_required')
     assert.deepEqual((await snapshot()).scenarios, before.scenarios, 'Held edits cannot change a draft before native approval')
     await approve({ approval: pending._meta['com.runeditrun/approval'], native, policy, path, version: modern })
     resume = { ...params, ...(pending.requestState ? { requestState: pending.requestState } : {}) }
    }
    edge.arm()
    await assert.rejects(rpc('tools/call', resume, { throughEdge: true }), error => error instanceof TypeError && error.message === 'fetch failed')
    const lost = edge.dropped
    assert.equal(lost.status, 200)
    assert.ok(!lost.body.error, JSON.stringify(lost.body))
    assert.equal(lost.body.result.isError, false, JSON.stringify(lost.body))
    const outcome = lost.body.result.structuredContent
    const completed = await snapshot()
    await check(outcome, before, completed)
    const replay = await rpc('tools/call', params, { throughEdge: true })
    assert.notEqual(replay.body.id, lost.request.id)
    assert.deepEqual(lost.request.params.arguments, arguments_)
    assert.equal(replay.body.result?.isError, false, `${name}: ${JSON.stringify(replay.body)}`)
    assert.deepEqual(replay.body.result.structuredContent, outcome, `${name} returns its recorded outcome after consumed native preconditions`)
    assert.deepEqual(await snapshot(), completed, `${name} recovery has no second effect, Activity entry or approval`)
    const conflict = await result('tools/call', { ...params, arguments: { ...arguments_, expected_revision: -1 } }, { throughEdge: true })
    assert.equal(conflict.isError, true)
    assert.equal(conflict._meta['com.runeditrun/error'].code, 'idempotency_conflict')
    assert.equal(conflict.structuredContent, undefined)
    assert.deepEqual(await snapshot(), completed, 'Changed arguments cannot reuse a completed key or add an effect')
    await unchangedCapture()
    proof(`BASE-AGENT-012 point2 ${name}: ${path} ${policy} lost completed response -> equal recorded result, one native effect, unchanged approved snapshot`)
    return outcome
   }
   const view = () => native(`/api/easel/scenario/${recorded.id}`)
   const copied = (await view()).inputs.position[0]
   const edited = await recover('positions.update', { scenario: recorded.id, id: copied.id, title: copied.title, holder: copied.holder,
    department: department.id, line: payroll.id, start: '2026-01', annualSalary: '72000' }, async (outcome, before, after) => {
     assert.equal(outcome.id, copied.id)
     assert.equal(outcome.annualSalaryCents, 7200000)
     const positions = (await view()).inputs.position
     assert.equal(positions.length, 1)
     assert.equal(positions[0].annualSalaryCents, 7200000)
     assert.equal(after.activity.filter(row => row.action === 'record-changed' && row.record === copied.id).length,
      before.activity.filter(row => row.action === 'record-changed' && row.record === copied.id).length + 1)
    })
   const formula = await recover('formulas.update', { scenario: recorded.id, revision: String((await view()).scenario.revision),
    name: 'Synthetic recovery formula', department: department.id, unit: 'money', line: payroll.id, formula: '100', start: '2026-01' }, async outcome => {
     assert.deepEqual((await view()).inputs.formula.map(row => ({ id: row.id, formula: row.formula })), [{ id: outcome.id, formula: '100' }])
    })
   await recover('inputs.delete', { kind: 'formula', id: formula.id, revision: String((await view()).scenario.revision) }, async () => {
    assert.ok(!(await view()).inputs.formula.some(row => row.id === formula.id))
   })
   const note = `Synthetic ${policy} ${route} recovered comment`
   const commented = await recover('comments.create', { scenario: recorded.id, department: department.id, text: note }, async (_outcome, before, after) => {
    assert.equal(after.state.comments.filter(row => row.text === note).length, 1)
    assert.equal(after.activity.filter(row => row.action === 'comment' && row.scenario === recorded.id).length,
     before.activity.filter(row => row.action === 'comment' && row.scenario === recorded.id).length + 1)
   })
   const beforeStale = await snapshot()
   const stale = await result('tools/call', { name: 'easel.comments.create', arguments: { scenario: recorded.id, department: department.id,
    text: 'Synthetic stale request', idempotency_key: `${key}-stale`, expected_revision: -1 } })
   assert.equal(stale.isError, true)
   assert.equal(stale._meta['com.runeditrun/error'].code, 'revision_conflict')
   assert.ok(Number.isSafeInteger(stale._meta['com.runeditrun/error'].current_revision))
   assert.deepEqual(await snapshot(), beforeStale, 'Stale requests are refused before any native effect')
   const submitted = await recover('proposals.submit', { id: recorded.id, summary: 'Synthetic recovered planning alternative' }, async (outcome, before, after) => {
    assert.equal(outcome.proposalStatus, 'submitted')
    assert.equal((await view()).scenario.proposalStatus, 'submitted')
    assert.equal(after.activity.filter(row => row.action === 'proposal-submit' && row.record === recorded.id).length, 1)
    assert.equal(after.state.scenarios.length, before.state.scenarios.length)
   })
   const afterSubmit = await snapshot()
   const resubmit = await result('tools/call', { name: 'easel.proposals.submit', arguments: { id: recorded.id,
    summary: 'Synthetic second submission', idempotency_key: `${key}-new-submit` } })
   assert.equal(resubmit.isError, true, 'A new key cannot bypass the native submitted precondition')
   assert.equal(resubmit.structuredContent, undefined)
   assert.deepEqual(await snapshot(), afterSubmit)
   await inspectLifecycle({ native, proposal: submitted, edited, formula, commented, note, policy, path })
  }
 }
 return { native, catalogue }
}
