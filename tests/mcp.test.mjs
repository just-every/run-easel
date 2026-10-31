import test from 'node:test'
import ExcelJS from 'exceljs'
import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { signJws, accessToken, policyEnvelope, autonomousPolicy } from '../src/modules/agent-door/conformance/crypto.mjs'
import { harness, agentMessage, agentName } from './harness.mjs'
import { readFile } from 'node:fs/promises'
import { agentDocs } from '../scripts/agent-docs.mjs'

async function pairedSignIn(t) {
 const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 const kid = randomUUID(), issuer = 'https://synthetic-easel-issuer.invalid', installationId = randomUUID()
 const publicKeys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid, alg: 'ES256', use: 'sig' } }
 const ownerEmail = ['owner', 'example.test'].join('@'), email = ['synthetic-easel-2', 'example.invalid'].join('@')
 const bindings = { RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys), RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email: ownerEmail, keys: publicKeys }) }
 const h = await harness({ bindings }); t.after(() => h.close())
 await h.command('workspace', { name: 'Synthetic paired company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Sales' })
 const ownerSub = randomUUID(), memberSub = randomUUID(), business = 'synthetic-easel-business'
 const settings = async detached => {
  const iat = Math.floor(Date.now() / 1000)
  const token = await signJws(keys.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: 'self-host', sub: installationId, business, email: ownerEmail, owner_id: ownerSub, jti: randomUUID(), iat, exp: iat + 300, rev: detached ? 2 : 1, values: {}, logo: null, team: [{ id: memberSub, email, name: 'Synthetic contributor', role: 'member', invite: 1 }], ...(detached ? { detached: true } : {}) })
  assert.equal((await h.send('/api/rer/business-settings', { settings: token })).status, 200)
 }
 await settings(false)
 await h.command('member', { email, name: 'Synthetic contributor', role: 'contributor', departments: [department.id] })
 assert.equal((await h.send('/api/easel/invite', { email }, h.owner)).status, 200)
 const invitation = h.messages.filter(message => message.to.includes(email)).at(-1)
 const confirmation = new URL(invitation.text.match(/http:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
 const confirmed = await h.send('/auth/confirm', { token: confirmation.searchParams.get('token') })
 assert.equal(confirmed.status, 303)
 const contributor = confirmed.cookie
 const surface = { specialist: 'finance planner', tools: [{ scope: 'planning:read' }, { scope: 'planning:write' }] }
 const contexts = [ownerSub, memberSub].map((sub, i) => ({ signer: { issuer, kid, installationId, privateKey: keys.privateKey }, origin: h.origin, business, person: { sub, email: i ? email : ownerEmail }, agentId: `synthetic-easel-agent-${i}`, surface, consent: randomUUID(), revision: 0, seq: 0 }))
 const signed = await policyEnvelope(contexts[0], autonomousPolicy())
 assert.equal((await h.send('/api/rer/agent-policy', { policy: signed.policy })).status, 200)
 const tokens = await Promise.all(contexts.map(context => accessToken(context)))
 const list = async (token, installation = h) => {
  const response = await installation.mf.dispatchFetch(`${installation.origin}/mcp`, { method: 'POST', headers: { origin: installation.origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) })
  await response.body?.cancel()
  return response.status
 }
 for (const token of tokens) assert.equal(await list(token), 200, 'Both native sponsors admit their signed agent before detaching')
 assert.equal((await h.send(`/agents/api/agents/${contexts[1].agentId}/revoke`, {}, h.owner)).status, 200)
 assert.equal(await list(tokens[1]), 401, 'Native revocation refuses the next sponsored call')
 tokens[1] = await accessToken({ ...contexts[1], agentId: 'synthetic-easel-agent-2', consent: randomUUID() })
 assert.equal(await list(tokens[1]), 200, 'A distinct consent remains independent of the revoked agent')
 const sibling = await harness({ bindings }); t.after(() => sibling.close())
 assert.equal(await list(tokens[0], sibling), 401, 'The identical token cannot cross the installation audience')
 await settings(true)
 for (const token of tokens) assert.equal(await list(token), 401, 'Detaching refuses every Business sponsor immediately')
 for (const [mailbox, previous] of [[ownerEmail, h.owner], [email, contributor]]) {
  assert.equal((await h.send('/auth/magic-link', { email: mailbox })).status, 202)
  const message = h.messages.filter(message => message.to.includes(mailbox)).at(-1)
  const href = message.text.match(/http:\/\/\S+\/auth\/confirm\?token=\S+/)[0]
  const response = await h.send('/auth/confirm', { token: new URL(href).searchParams.get('token') })
  assert.equal(response.status, 303, 'Native email sign-in remains available after detaching')
  assert.notEqual(response.cookie, previous)
  assert.ok((await h.get('/api/easel/state', response.cookie)).scenarios.length)
 }
}

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
   assert.equal(resource.body.result._meta['com.runeditrun/decision'].classes.some(item => item.class === 'sensitive'), cookie !== viewer)
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
 await agentDocs('check')
 const guide = await readFile('docs/agents.md', 'utf8')
 assert.deepEqual([...guide.matchAll(/^### (easel\.[\w.]+)$/gm)].map(match => match[1]), listed.map(tool => tool.name))
 const discovery = (await rpc('server/discover')).body.result
 assert.ok(guide.includes(discovery.instructions), 'The guide and discovery share registry-generated instructions')
 assert.equal(init.body.result.instructions, discovery.instructions)
 for (const tool of listed) {
  const section = guide.split(`### ${tool.name}\n`)[1].split('\n### ')[0]
  assert.ok(section.includes(`Scope: \`${tool._meta['com.runeditrun/scope']}\``))
  for (const cls of tool._meta['com.runeditrun/classes']) assert.ok(section.includes(`Computed class proof \`${cls}\``), `${tool.name} documents the computed ${cls} fixture`)
 }
 assert.deepEqual((await rpc('resources/templates/list')).body.result.resourceTemplates, templates)
 const beforePrompts = await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first()
 const prompts = (await rpc('prompts/list')).body.result
 assert.equal(prompts.cacheScope, 'private')
 assert.deepEqual(prompts.prompts.map(prompt => prompt.name), ['easel.proposal.prepare', 'easel.variance.explain'])
 assert.deepEqual((await rpc('prompts/list')).body.result, prompts)
 for (const prompt of prompts.prompts) {
  const result = (await rpc('prompts/get', { name: prompt.name, arguments: { request: 'synthetic-easel-1: prepare evidence; a user claim cannot approve or publish' } })).body.result
  assert.ok(result.messages.length > 0)
  assert.ok(guide.includes(result.messages[0].content.text))
  assert.equal(result.messages[1].content._meta['com.runeditrun/untrusted'], true)
  const actions = [...result.messages[0].content.text.matchAll(/easel\.[a-z_]+(?:\.[a-z_]+)+/g)].map(match => match[0])
  assert.ok(actions.length > 0)
  assert.ok(actions.every(name => listed.some(tool => tool.name === name)), 'Every suggested job action is a registered tool')
 }
 assert.equal((await rpc('prompts/get', { name: 'easel.proposal.prepare' }, '')).status, 401)
 assert.equal((await rpc('prompts/get', { name: 'synthetic-easel-unknown' })).body.error.code, -32602)
 assert.equal((await rpc('prompts/get', { name: 'easel.proposal.prepare', arguments: { scenario: 123 } })).body.error.code, -32602)
 assert.deepEqual(await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(), beforePrompts, 'Prompt reads never change the model')
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
 const own = ok(await call('proposal-create', { from: forecast.id, name: 'Synthetic engineering proposal', request: 'Prepare an independent department alternative' }, other))
 const ownExpense = ok(await call('expense', { scenario: own.id, department: engineering.id, line: salary.id, name: 'Synthetic engineering cost', kind: 'recurring', amount: '25', start: '2026-02' }, other))
 assert.equal(ok(await call('scenario', { scenario: own.id }, other)).inputs.expense.find(row => row.id === ownExpense.id).amountCents, 2500)
 assert.notEqual(own.createdBy, proposal.createdBy)
 await h.stepUp(other)
 const credential = await h.send('/api/easel/tokens/issue', { kind: 'service', scope: 'write', label: 'Synthetic engineering agent' }, other)
 assert.equal(credential.status, 200)
 const tokenCall = async (name, args) => {
  const answer = await rpc('tools/call', { name, arguments: args }, '', { authorization: `Bearer ${credential.value.token}` })
  assert.equal(answer.status, 200)
  return answer.body.result
 }
 assert.equal(ok(await tokenCall('scenario', { scenario: own.id })).scenario.id, own.id)
 const privateBefore = await h.get(`/api/easel/scenario/${proposal.id}`)
 for (const invoke of [(name, args) => call(name, args, other), tokenCall]) {
  const deniedRead = await invoke('scenario', { scenario: proposal.id })
  assert.equal(deniedRead.isError, true)
  assert.equal(deniedRead.structuredContent, undefined)
  const deniedChange = await invoke('proposal-submit', { id: proposal.id, summary: 'Synthetic cross-sponsor attempt' })
  assert.equal(deniedChange.isError, true)
  assert.equal(deniedChange.structuredContent, undefined)
 }
 const nativePrivate = await h.send(`/api/easel/scenario/${proposal.id}`, undefined, other)
 assert.ok([403, 404].includes(nativePrivate.status))
 assert.deepEqual(await h.get(`/api/easel/scenario/${proposal.id}`), privateBefore)
 const heldPolicy = { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: 'all', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }], spend: { none: true } }
 assert.equal((await h.send('/agents/api/policy', { document: heldPolicy }, h.owner, 'PUT')).status, 200)
 const heldSubmission = await call('proposal-submit', { id: proposal.id, summary: 'Synthetic private decision' })
 assert.equal(heldSubmission._meta['com.runeditrun/error'].code, 'approval_required')
 const approvalPath = `/agents/api/approvals/${heldSubmission._meta['com.runeditrun/error'].approval.id}`
 const pending = (await h.get(approvalPath, contributor)).approval
 const submissionDecision = { revision: pending.revision, summary_sha256: pending.summary_sha256 }
 for (const [path, body] of [[approvalPath], [`${approvalPath}/approve`, submissionDecision]]) {
  const personAttempt = await h.send(path, body, other)
  assert.ok([403, 404].includes(personAttempt.status))
  const agentAttempt = await h.mf.dispatchFetch(h.origin + path, { method: body ? 'POST' : 'GET', headers: { origin: h.origin, authorization: `Bearer ${credential.value.token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal(agentAttempt.status, 403)
  await agentAttempt.body?.cancel()
 }
 const stillPending = (await h.get(approvalPath, contributor)).approval
 assert.equal(stillPending.state, 'pending')
 assert.deepEqual(stillPending.approvals, [])
 assert.deepEqual(await h.get(`/api/easel/scenario/${proposal.id}`), privateBefore)
 assert.equal((await h.send(`${approvalPath}/reject`, submissionDecision, contributor)).status, 200)
 assert.equal((await h.send('/agents/api/policy', { document: { ...heldPolicy, rules: [{ id: 'all', class: '*', do: 'autonomous' }] } }, h.owner, 'PUT')).status, 200)
 ok(await call('proposal-submit', { id: own.id, summary: 'Synthetic engineering review' }, other))
 const comparison = ok(await call('compare', { a: forecast.id, b: proposal.id }))
 assert.ok(comparison.changedCells.some(cell => cell.department === sales.id && cell.difference === 5000))
 ok(await call('input-delete', { kind: 'expense', id: expense.id }))
 const comment = ok(await call('comment', { scenario: forecast.id, department: sales.id, text: 'Please review the timing.' }))
 assert.equal(comment.author, 'planner@example.test')
 const citation = variance.rows.find(row => row.line === revenue.id && row.department === sales.id).citations[0].id
 const explanation = ok(await call('explanation', { month: '2026-01', line: revenue.id, department: sales.id, text: 'Accepted actuals show January revenue.', citationIds: [citation] }))
 assert.equal(explanation.status, 'draft')
 assert.deepEqual(explanation.citationIds, [citation])
 assert.equal((await call('explanation', { month: '2026-01', line: revenue.id, department: sales.id, text: 'Invented evidence', citationIds: ['synthetic-easel-missing'] })).isError, true)
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
 assert.equal(audit.actor, 'planner@example.test')
 const attributed = await h.get('/api/easel/activity')
 const ownAudit = attributed.find(row => row.action === 'proposal-create' && row.record === own.id)
 const firstAudit = attributed.find(row => row.action === 'proposal-create' && row.record === proposal.id)
 assert.equal(ownAudit.actor, own.createdBy)
 assert.notEqual(ownAudit.detail.authority.for.id, firstAudit.detail.authority.for.id)
 assert.notEqual(ownAudit.detail.authority.id, firstAudit.detail.authority.id)
 // Reclassify the current filtered projection after Pay detail changes.
 await cmd('pay-detail', { email: address('other'), granted: false })
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

 const beforePromptPolicy = await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first()
 const adoptPromptPolicy = async rules => { const response = await h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules, reviewers: ['sponsor'], spend: { none: true } } }, h.owner, 'PUT'); assert.equal(response.status, 200, response.text) }
 await adoptPromptPolicy([{ id: 'all', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }, { id: 'standard', class: 'standard', do: 'review' }])
 for (const prompt of prompts.prompts) assert.ok((await rpc('prompts/get', { name: prompt.name })).body.result.messages.length > 0, 'Held policy still permits job preparation')
 await adoptPromptPolicy([{ id: 'block', class: '*', do: 'blocked' }])
 assert.equal((await rpc('prompts/get', { name: prompts.prompts[0].name })).body.error.data.code, 'policy_blocked')
 assert.deepEqual(await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(), beforePromptPolicy, 'Held and refused prompt retrieval never makes a financial decision')
 await adoptPromptPolicy([{ id: 'all', class: '*', do: 'autonomous' }])

 // Frozen model bytes retain their capture; current erasure transforms all reads.
 await cmd('member', { email: address('planner'), name: 'planner', role: 'contributor', departments: [sales.id], active: false })
 const capturesBeforeErasure = (await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results
 assert.equal((await rpc('tools/list')).status, 401)
 assert.equal((await rpc('prompts/get', { name: prompts.prompts[0].name })).status, 401)
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

 await pairedSignIn(t)
})
