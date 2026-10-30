import test from 'node:test'
import ExcelJS from 'exceljs'
import { webcrypto } from 'node:crypto'
import { signJws, policyEnvelope, accessToken, autonomousPolicy } from '../src/modules/agent-door/conformance/crypto.mjs'
import assert from 'node:assert/strict'
import { harness, agentMessage, agentName } from './harness.mjs'

test('API-003 BASE-AGENT-003 native MCP resources and proposals preserve role, policy and erasure fences', async t => {
 let afterReadFence
 const h = await harness({ afterReadFence: async () => { const action = afterReadFence; afterReadFence = undefined; await action?.() } })
 t.after(() => h.close())
 const cmd = h.command
 const address = name => [name, 'example.test'].join('@')
 await cmd('workspace', { name: 'MCP fixture', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const engineering = await cmd('department', { name: 'Engineering' })
 const revenue = await cmd('line', { name: 'Revenue', type: 'revenue' })
 const salary = await cmd('line', { name: 'Salary', type: 'operating-expense', payroll: true })
 const contributor = await h.person(address('planner'), 'contributor', [sales.id])
 const other = await h.person(address('other'), 'contributor', [engineering.id])
 const viewer = await h.person(address('viewer'), 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios.find(s => s.kind === 'budget')
 await cmd('expense', { scenario: budget.id, department: sales.id, line: salary.id, name: 'Sales cost', kind: 'recurring', amount: '100', start: '2026-01' })
 await cmd('position', { scenario: budget.id, department: engineering.id, line: salary.id, title: 'Engineer', holder: 'Private Employee', annualSalary: '120000', start: '2026-01' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast
 await cmd('account-map', { account: '4000', target: revenue.id })
 await cmd('department-map', { source: 'Sales', department: sales.id })
 const source = { csv: 'Date,Account,Department,Amount\n2026-01-01,4000,Sales,-1000.00\n', filename: 'mcp-actuals.csv', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD' }
 const preview = await h.kit('actuals', 'preview', source)
 await h.kit('actuals', 'commit', { ...source, fingerprint: preview.fingerprint })
 await cmd('close-month', { scenario: forecast.id, month: '2026-01' })

 await h.agentPolicy()
 let nextId = 1
 const rpc = async (method, params, cookie = contributor, headers = {}, notification = false) => {
  const r = await h.mf.dispatchFetch(`${h.origin}/mcp`, { method: 'POST', headers: { origin: h.origin, cookie, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(agentMessage({ jsonrpc: '2.0', ...(notification ? {} : { id: nextId++ }), method, params })) })
  return { status: r.status, headers: r.headers, body: r.status === 202 ? null : await r.json() }
 }
 const call = async (name, args = {}, cookie = contributor) => {
  const r = await rpc('tools/call', { name, arguments: args }, cookie)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.result
 }
 const read = async (uri, cookie = contributor, headers = {}) => rpc('resources/read', { uri }, cookie, headers)
 const contents = response => {
  assert.equal(response.status, 200)
  assert.ok(!response.body.error, JSON.stringify(response.body))
  const content = response.body.result.contents[0]
  assert.equal(content._meta['com.runeditrun/untrusted'], true)
  return JSON.parse(content.text)
 }
 const modelState = async () => ({
  records: (await h.db.prepare('SELECT * FROM e_records ORDER BY kind,id').all()).results,
  captures: (await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results,
  revision: await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(),
  activity: await h.db.prepare('SELECT count(*) AS n FROM e_activity').first(),
 })
 const ok = result => { assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent }
 const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'public-door-client', version: '1' } })
 assert.equal(init.status, 200)
 assert.equal(init.body.result.protocolVersion, '2025-11-25')
 assert.deepEqual(init.body.result.capabilities.resources, { subscribe: false, listChanged: false })
 const templates = (await rpc('resources/templates/list')).body.result.resourceTemplates
 assert.deepEqual(templates.map(item => item.uriTemplate).sort(), ['easel://proposals/{id}', 'easel://scenarios/{id}'])
 const workbook = new ExcelJS.Workbook()
 const sheet = workbook.addWorksheet('Synthetic plan')
 sheet.addRow(['Line', 'Department', '2026-02'])
 sheet.addRow(['Revenue', 'Sales', 123])
 sheet.addRow(['Total', '', { formula: 'SUM(C2:C2)', result: 123 }])
 const importedSource = { filename: 'Synthetic imported narrative.xlsx', base64: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64') }
 const workbookPreview = await h.kit('workbook', 'preview', importedSource)
 const workbookImport = await h.kit('workbook', 'commit', { ...importedSource, fingerprint: workbookPreview.fingerprint })
 const beforeImportedRead = await modelState()
 const importedView = contents(await read(`easel://scenarios/${workbookImport.import.scenario}`, h.owner))
 assert.equal(importedView.scenario.imported.file, importedSource.filename)
 assert.deepEqual(await modelState(), beforeImportedRead)
 console.log('PROBE BASE-AGENT-003 untrusted: workbook import then /mcp resource read -> native and imported narratives marked untrusted; model unchanged')
 const beforeReads = await modelState()
 for (const cookie of [h.owner, contributor, viewer]) {
  for (const id of [forecast.id, budget.id]) {
   const resource = await read(`easel://scenarios/${id}`, cookie)
   assert.deepEqual(contents(resource), await h.get(`/api/easel/scenario/${id}`, cookie))
   const sensitive = resource.body.result._meta['com.runeditrun/decision'].classes.some(item => item.class === 'sensitive')
   assert.equal(sensitive, cookie !== viewer)
   const tool = await call('scenario', { scenario: id }, cookie)
   assert.deepEqual(ok(tool), contents(resource))
   assert.equal(tool._meta['com.runeditrun/decision'].classes.some(item => item.class === 'sensitive'), sensitive, 'Tool and resource classify the same filtered payroll view')
  }
 }
 assert.deepEqual(await modelState(), beforeReads, 'Resource reads cannot change planning records, captures, revisions or native activity')
 console.log('PROBE BASE-AGENT-003 parity: /mcp scenario resources for finance, contributor and viewer -> native fields match; model unchanged')
 assert.equal((await rpc('notifications/initialized', {}, contributor, {}, true)).status, 202)
 assert.equal((await rpc('server/discover')).body.result._meta['io.modelcontextprotocol/serverInfo'].name, 'Easel')
 assert.equal((await rpc('tools/list', {}, contributor, { 'MCP-Protocol-Version': 'unsupported' })).status, 400)
 assert.equal((await rpc('tools/list', {}, '')).status, 401)
 assert.equal((await rpc('tools/list', {}, contributor, { origin: 'https://other.example' })).status, 403)
 assert.equal((await rpc('tools/call', { name: 'scenario', arguments: { scenario: 123 } })).body.result._meta['com.runeditrun/error'].code, 'invalid_arguments')
 const listed = (await rpc('tools/list')).body.result.tools
 assert.ok(listed.some(tool => tool.name === agentName('variance')))
 assert.ok(listed.some(tool => tool.name === agentName('proposal-create')))
 const variance = ok(await call('variance', { month: '2026-01' }))
 assert.equal(variance.month, '2026-01')
 assert.ok(variance.rows.some(row => row.line === revenue.id && row.actual === 100000))
 const scenarioRead = await call('scenario', { scenario: forecast.id })
 const scenarioLink = scenarioRead.content.find(item => item.type === 'resource_link')
 assert.equal(scenarioLink.uri, `easel://scenarios/${forecast.id}`)
 const sc = ok(scenarioRead)
 assert.deepEqual(contents(await read(scenarioLink.uri)), sc)
 assert.equal(sc.inputs.position.length, 0)
 assert.ok(!JSON.stringify(sc).includes('Private Employee'))
 const metrics = ok(await call('metrics', { scenario: forecast.id }))
 assert.deepEqual(metrics.profit, sc.calculation.profit)
 const scenarios = ok(await call('scenarios'))
 assert.ok(scenarios.scenarios.some(s => s.id === forecast.id))
 const created = await call('proposal-create', { from: forecast.id, name: 'Lower sales costs', request: 'Reduce sales cost to fifty dollars' })
 const proposal = ok(created)
 const proposalLink = created.content.find(item => item.type === 'resource_link')
 assert.equal(proposalLink.uri, `easel://proposals/${proposal.id}`)
 const draft = contents(await read(proposalLink.uri))
 assert.equal(draft.scenario.proposalStatus, 'draft')
 assert.equal(draft.scenario.request, 'Reduce sales cost to fifty dollars')
 for (const cookie of [other, viewer]) {
  const absent = await read('easel://proposals/synthetic-easel-missing', cookie)
  const hidden = await read(proposalLink.uri, cookie)
  assert.deepEqual(hidden.body.error, absent.body.error)
  assert.equal(hidden.body.result, undefined)
  assert.equal(hidden.body.error.data.code, 'resource_unavailable')
 }
 assert.deepEqual((await read(`easel://proposals/${forecast.id}`)).body.error, (await read('easel://proposals/synthetic-easel-missing')).body.error)
 console.log('PROBE BASE-AGENT-003 refusals: /mcp missing and private proposal URIs -> identical resource_unavailable; no content')
 const expense = ok(await call('expense', { scenario: proposal.id, department: sales.id, line: salary.id, name: 'New sales cost', kind: 'recurring', amount: '50', start: '2026-02' }))
 assert.equal((await call('expense', { scenario: proposal.id, department: engineering.id, line: salary.id, name: 'Other department', kind: 'recurring', amount: '1', start: '2026-02' })).isError, true)
 assert.equal((await call('scenario', { scenario: proposal.id }, other)).isError, true)
 assert.equal((await call('scenario', { scenario: proposal.id }, viewer)).isError, true)
 const comparison = ok(await call('compare', { a: forecast.id, b: proposal.id }))
 assert.ok(comparison.changedCells.some(cell => cell.department === sales.id && cell.difference === 5000))
 ok(await call('input-delete', { kind: 'expense', id: expense.id }))
 const comment = ok(await call('comment', { scenario: forecast.id, department: sales.id, text: 'Please review the timing.' }))
 assert.equal(comment.author, address('planner'))
 const explanation = ok(await call('explanation', { month: '2026-01', line: revenue.id, department: sales.id, text: 'Accepted actuals show January revenue.' }))
 assert.equal(explanation.status, 'draft')
 const submitted = await call('proposal-submit', { id: proposal.id, summary: 'Ready for finance review' })
 ok(submitted)
 assert.equal(submitted.content.find(item => item.type === 'resource_link').uri, proposalLink.uri)
 assert.equal(contents(await read(proposalLink.uri)).scenario.proposalStatus, 'submitted')
 console.log('PROBE BASE-AGENT-003 links: /mcp scenario read, proposal create and submit -> links read back native draft and submitted state')
 assert.equal((await call('expense', { scenario: proposal.id, department: sales.id, line: salary.id, name: 'Late edit', kind: 'recurring', amount: '1', start: '2026-02' })).isError, true)
 assert.equal((await call('proposal-create', { from: forecast.id, name: 'Viewer proposal', request: 'Change costs' }, viewer)).isError, true)

 const before = await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first()
 for (const cookie of [contributor, h.owner]) {
  for (const name of ['approve-budget', 'proposal-promote', 'close-month', 'pack-publish', 'explanation-confirm']) {
   assert.ok(!listed.some(tool => tool.name === name))
   assert.equal((await rpc('tools/call', { name, arguments: { scenario: forecast.id, id: proposal.id } }, cookie)).body.error.code, -32602)
  }
  assert.equal((await call('expense', { scenario: forecast.id, department: sales.id, line: salary.id, name: 'Direct edit', kind: 'recurring', amount: '1', start: '2026-02' }, cookie)).isError, true)
 }
 assert.deepEqual(await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(), before)
 assert.equal((await h.get(`/api/easel/scenario/${proposal.id}`)).scenario.proposalStatus, 'submitted')
 const audit = await h.db.prepare("SELECT actor FROM e_activity WHERE action='proposal-create' AND record=?").bind(proposal.id).first()
 assert.equal(audit.actor, address('planner'))

 // Native dimension filtering and scenario shares also apply to resource URIs.
 const region = await cmd('dimension', { name: 'Synthetic region' })
 const east = await cmd('dimension-member', { dimension: region.id, name: 'Synthetic east' })
 const west = await cmd('dimension-member', { dimension: region.id, name: 'Synthetic west' })
 const sandbox = await cmd('sandbox-create', { from: forecast.id, name: 'Synthetic private scenario' })
 for (const [member, name, rate] of [[east, 'Synthetic visible driver', '100'], [west, 'Synthetic private driver', '700']]) {
  await cmd('revenue', { scenario: sandbox.id, name, department: sales.id, line: revenue.id, kind: 'volume', start: '2026-02', startVolume: '1', rate, dimensions: { [region.id]: member.id } })
 }
 const sandboxUri = `easel://scenarios/${sandbox.id}`
 assert.deepEqual((await read(sandboxUri)).body.error, (await read('easel://scenarios/synthetic-easel-missing')).body.error)
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id], dimensionMembers: { [region.id]: [east.id] } })
 await cmd('scenario-share', { scenario: sandbox.id, revision: (await h.get(`/api/easel/scenario/${sandbox.id}`)).scenario.revision, email: address('planner'), mode: 'read' })
 const beforeScopedRead = await modelState()
 const scoped = contents(await read(sandboxUri))
 assert.deepEqual(scoped, await h.get(`/api/easel/scenario/${sandbox.id}`, contributor))
 assert.ok(scoped.inputs.revenue.some(row => row.name === 'Synthetic visible driver'))
 assert.doesNotMatch(JSON.stringify(scoped), /Synthetic private driver|Private Employee/)
 assert.deepEqual(await modelState(), beforeScopedRead)
 afterReadFence = () => cmd('scenario-share', { scenario: sandbox.id, revision: scoped.scenario.revision, email: address('planner'), mode: 'remove' })
 const unshared = await read(sandboxUri)
 assert.equal(unshared.body.result, undefined)
 assert.equal(unshared.body.error.data.code, 'resource_unavailable')
 assert.deepEqual((await read(sandboxUri)).body.error, (await read('easel://scenarios/synthetic-easel-missing')).body.error)
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id], dimensionMembers: {} })
 console.log('PROBE BASE-AGENT-003 grants: native dimension-limited share then /mcp resource read -> native filtered driver; revocation during read refuses all content')

 // Reclassify the current filtered projection after Pay detail changes.
 afterReadFence = () => cmd('pay-detail', { email: address('other'), granted: false })
 const payChanged = await read(`easel://scenarios/${forecast.id}`, other)
 assert.equal(payChanged.body.error.data.code, 'resource_changed')
 assert.equal(payChanged.body.result, undefined)
 const payFree = await read(`easel://scenarios/${forecast.id}`, other)
 assert.deepEqual(contents(payFree), await h.get(`/api/easel/scenario/${forecast.id}`, other))
 assert.ok(!JSON.stringify(payFree.body.result).includes('Private Employee'))
 assert.deepEqual(payFree.body.result._meta['com.runeditrun/decision'].classes.map(item => item.class), ['standard'])

 // A scoped credential never grows with its issuer's later department grants.
 await h.stepUp(contributor)
 const issued = await h.send('/api/easel/tokens/issue', { label: 'Synthetic resource reader', kind: 'personal', scope: 'read', expiresInSeconds: 86400 }, contributor)
 assert.equal(issued.status, 200)
 const bearer = { authorization: `Bearer ${issued.value.token}` }
 const tokenView = contents(await read(`easel://scenarios/${forecast.id}`, '', bearer))
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id, engineering.id] })
 assert.deepEqual(contents(await read(`easel://scenarios/${forecast.id}`, '', bearer)), tokenView)
 assert.ok(contents(await read(`easel://scenarios/${forecast.id}`, contributor)).inputs.position.some(row => row.holder === 'Private Employee'))
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id] })
 await h.send('/api/easel/tokens/revoke', { id: issued.value.id }, contributor).then(r => assert.equal(r.status, 200))
 assert.equal((await read(`easel://scenarios/${forecast.id}`, '', bearer)).status, 401)

 // Interleave an ordinary native write between the two awaited resource reads.
 afterReadFence = () => cmd('comment', { scenario: forecast.id, department: sales.id, text: 'Synthetic resource boundary note' })
 // Comments are outside scenario contents; an unrelated write still serves only
 // today's consistent native projection without saving the model again.
 contents(await read(`easel://scenarios/${forecast.id}`))
 const current = await h.get(`/api/easel/scenario/${forecast.id}`)
 afterReadFence = () => cmd('forecast-window', { scenario: forecast.id, revision: current.scenario.revision, months: '18' })
 const changed = await read(`easel://scenarios/${forecast.id}`)
 assert.equal(changed.body.error.data.code, 'resource_changed', JSON.stringify(changed.body))
 assert.equal(changed.body.result, undefined)
 console.log('PROBE BASE-AGENT-003 changed-read: native forecast update between /mcp read stages -> resource_changed; no content')

 const policy = rules => h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules, spend: { none: true } } }, h.owner, 'PUT').then(r => assert.equal(r.status, 200, JSON.stringify(r.value)))
 await policy([{ id: 'all', class: '*', do: 'autonomous' }, { id: 'payroll', class: 'sensitive', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }])
 const beforeHeldRead = await modelState()
 const heldTool = await call('scenario', { scenario: forecast.id })
 assert.equal(heldTool.isError, true)
 assert.equal(heldTool._meta['com.runeditrun/error'].code, 'approval_required')
 assert.equal(heldTool.structuredContent, undefined)
 assert.deepEqual(await modelState(), beforeHeldRead)
 const held = await read(`easel://scenarios/${forecast.id}`, h.owner)
 assert.equal(held.body.error.data.code, 'approval_required')
 assert.equal(held.body.result, undefined)
 const approval = held.body.error.data.approval
 const details = (await h.get(`/agents/api/approvals/${approval.id}`)).approval
 const decision = await h.send(`/agents/api/approvals/${approval.id}/approve`, { revision: details.revision, summary_sha256: details.summary_sha256 }, h.owner)
 assert.equal(decision.status, 200)
 const resumed = await rpc('resources/read', { uri: `easel://scenarios/${forecast.id}`, requestState: held.body.error.data.requestState }, h.owner)
 assert.deepEqual(contents(resumed), await h.get(`/api/easel/scenario/${forecast.id}`))
 contents(await read(`easel://scenarios/${forecast.id}`, viewer))
 await policy([{ id: 'all', class: '*', do: 'autonomous' }])
 await h.send('/agents/api/pause', { paused: true }, h.owner).then(r => assert.equal(r.status, 200))
 assert.equal((await read(`easel://scenarios/${forecast.id}`)).body.error.data.code, 'agents_paused')
 await h.send('/agents/api/pause', { paused: false }, h.owner)
 console.log('PROBE BASE-AGENT-003 authority: /mcp current Pay grants, credential ceiling, revoke, policy approval and pause -> filtered or refused without leaked content')

 // The awaited native fence also refuses authority lost during the read.
 const beforeRevokedRead = await modelState()
 const nativeSession = await h.db.prepare('SELECT id FROM oa_sessions WHERE operator_id=(SELECT id FROM oa_operators WHERE email=?) AND revoked_at IS NULL').bind(address('other')).first()
 afterReadFence = () => h.send('/auth/signout', {}, other).then(r => assert.ok([200, 303].includes(r.status)))
 const signedOut = await read(`easel://scenarios/${forecast.id}`, other)
 assert.equal(signedOut.body.result, undefined)
 assert.equal((await read(`easel://scenarios/${forecast.id}`, other)).status, 401)
 assert.ok((await h.db.prepare('SELECT revoked_at FROM oa_sessions WHERE id=?').bind(nativeSession.id).first()).revoked_at)
 assert.deepEqual(await modelState(), beforeRevokedRead)

 // Membership deactivation alone must refuse MCP before erasure revokes sessions.
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id], active: false })
 assert.equal((await rpc('tools/list')).status, 401)
 assert.equal((await read(proposalLink.uri)).status, 401)
 console.log('PROBE BASE-AGENT-003 membership-deactivation: native member active=false then /mcp tool list and proposal read -> 401 before person erasure')

 // Frozen model bytes retain their capture; current erasure transforms all reads.
 const capturesBeforeErasure = (await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results
 await cmd('person-erase', { email: address('planner') })
 const erasedProposal = contents(await read(proposalLink.uri, h.owner))
 assert.ok(!JSON.stringify(erasedProposal).includes(address('planner')))
 assert.match(erasedProposal.scenario.createdBy, /Erased person/)
 assert.deepEqual((await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results, capturesBeforeErasure)
 console.log('PROBE BASE-AGENT-003 erasure: native person erasure then /mcp proposal read -> erased attribution; captures unchanged; former session refused')
 assert.equal((await rpc('tools/list')).status, 401)
 assert.equal((await read(proposalLink.uri)).status, 401)

 const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 const kid = 'synthetic-easel-1'
 const publicKeys = { [kid]: await webcrypto.subtle.exportKey('jwk', keys.publicKey) }
 const signer = { issuer: 'https://business.example', installationId: 'synthetic-easel-2', kid, privateKey: keys.privateKey }
 let duringPairedRead
 const paired = await harness({ bindings: origin => ({
  RER_OWNER_CLAIM_ISSUER: signer.issuer, RER_OWNER_CLAIM_INSTALLATION_ID: signer.installationId,
  RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
  RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer: signer.issuer, audience: origin, subject: signer.installationId, keys: publicKeys }),
 }), afterReadFence: async () => { const action = duringPairedRead; duringPairedRead = undefined; await action?.() } })
 t.after(() => paired.close())
 await paired.command('workspace', { name: 'Synthetic consent fixture', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const pairedBudget = (await paired.get('/api/easel/state')).scenarios[0]
 const now = Math.floor(Date.now() / 1000), subject = 'synthetic-easel-3', business = 'synthetic-easel-4'
 const settings = await signJws(signer.privateKey, kid, 'rer-business-settings+jwt', {
  v: 1, iss: signer.issuer, aud: paired.origin, sub: signer.installationId, business,
  email: address('owner'), owner_id: subject, jti: crypto.randomUUID(), iat: now, exp: now + 300,
  rev: 1, values: {}, logo: null, team: [],
 })
 assert.equal((await paired.send('/api/rer/business-settings', { settings })).status, 200)
 const context = { signer, origin: paired.origin, business, revision: 0, seq: 0, surface: { specialist: 'finance planner', tools: [{ scope: 'planning:read' }] }, person: { sub: subject, email: address('owner') }, agentId: 'synthetic-easel-5', consent: 'synthetic-easel-6' }
 const adopt = async revoked => {
  const envelope = await policyEnvelope(context, autonomousPolicy(), { revoked })
  assert.equal((await paired.send('/api/rer/agent-policy', { policy: envelope.policy })).status, 200)
  context.revision = envelope.payload.revision; context.seq = envelope.payload.seq
 }
 await adopt({ agents: [], consents: [] })
 const token = await accessToken(context)
 const pairedRead = async () => {
  const response = await paired.mf.dispatchFetch(`${paired.origin}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: `easel://scenarios/${pairedBudget.id}` } }) })
  return { status: response.status, body: await response.json() }
 }
 assert.deepEqual(contents(await pairedRead()), await paired.get(`/api/easel/scenario/${pairedBudget.id}`))
 const beforeConsentRead = await paired.db.prepare('SELECT revision FROM e_meta WHERE id=1').first()
 duringPairedRead = () => adopt({ agents: [], consents: [context.consent] })
 const revokedDuringRead = await pairedRead()
 assert.equal(revokedDuringRead.body.error.data.code, 'consent_revoked')
 assert.equal(revokedDuringRead.body.result, undefined)
 assert.equal((await pairedRead()).status, 401)
 assert.deepEqual(await paired.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(), beforeConsentRead)
 console.log('PROBE BASE-AGENT-003 consent: signed Business consent revoked during /mcp read -> consent_revoked without content; next read 401')

})
