import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { droppedResponseProxy, standaloneClientJourney } from './mcp-client-journey.mjs'

test('Standalone MCP clients negotiate both versions and preserve native state across transport refusals under both policies', async t => {
 const h = await harness()
 t.after(() => h.close())
 const edge = await droppedResponseProxy(h.origin)
 t.after(() => edge.close())
 const frozen = async () => (await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
 let captures
 await standaloneClientJourney({ origin: h.origin, cookie: h.owner, edge, proof: line => console.log(`PROBE ${line}`),
  inspect: async ({ proposal, activity }) => {
   const effects = await h.db.prepare("SELECT count(*) AS n FROM e_activity WHERE action='proposal-create' AND record=?").bind(proposal.id).first()
   assert.equal(effects.n, 1)
   assert.equal(activity.record, proposal.id)
   const current = await frozen()
   assert.ok(current.length > 0)
   if (captures) assert.deepEqual(current, captures, 'Stored snapshot bytes and hashes survive every dropped-response recovery')
   captures = current
  },
  inspectMutation: async ({ key, target, action }) => {
   const effects = await h.db.prepare("SELECT count(*) AS n FROM e_activity WHERE json_extract(detail,'$.authority.idempotencyKey')=? AND record=? AND action=?").bind(key, target, action).first()
   assert.equal(effects.n, 1, 'The complete recovery journey persists exactly one native effect per caller key')
   assert.deepEqual(await frozen(), captures, 'Every recovered mutation preserves stored approved and kept snapshot bytes and hashes')
  },
  approve: async ({ approval, native }) => {
   const view = (await native(`/agents/api/approvals/${approval.id}`)).approval
   assert.equal(view.state, 'pending')
   const decided = await native(`/agents/api/approvals/${approval.id}/approve`, { revision: view.revision, summary_sha256: view.summary_sha256 })
   assert.equal(decided.approval.state, 'executed')
   assert.ok(decided.approval.approvals.length > 0)
  },
 })
 // A completed receipt rechecks today's native authority, including every
 // department changed by the submitted proposal. Only mail delivery is faked.
 const state = await h.get('/api/easel/state')
 const department = state.departments[0], payroll = state.lines.find(row => row.payroll)
 const forecast = state.scenarios.find(row => row.kind === 'forecast')
 const email = ['synthetic-easel-replay', 'example.test'].join('@')
 const sponsor = await h.person(email, 'contributor', [department.id])
 const other = await h.command('department', { name: 'Synthetic other department' })
 let requestId = 1000
 for (const policy of ['autonomous', 'held']) {
  await h.command('member', { email, name: 'Synthetic replay sponsor', role: 'contributor', departments: [department.id] })
  const configured = await h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', spend: { none: true }, reviewers: ['role:owner'],
   rules: policy === 'autonomous' ? [{ id: 'all', class: '*', do: 'autonomous' }] : [{ id: 'sensitive', class: '*', do: 'approval', approver: ['role:owner'], wait: 'P1D' }, { id: 'ordinary', class: 'standard', do: 'review' }],
  } }, h.owner, 'PUT')
  assert.equal(configured.status, 200)
  const call = async (name, args, path = '/mcp') => {
   const response = await fetch(h.origin + path, { method: 'POST', headers: { origin: h.origin, cookie: sponsor, 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': name },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'tools/call', params: { name, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }) })
   assert.equal(response.status, 200)
   return (await response.json()).result
  }
  const complete = async (name, args) => {
   let answer = await call(name, args)
   if (answer.resultType === 'input_required') {
    const approval = (await h.get(`/agents/api/approvals/${answer._meta['com.runeditrun/approval'].id}`)).approval
    const decided = await h.send(`/agents/api/approvals/${approval.id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 }, h.owner)
    assert.equal(decided.value.approval.state, 'executed')
    answer = await call(name, args)
   }
   assert.equal(answer.isError, false, JSON.stringify(answer))
   return answer.structuredContent
  }
  const draft = await complete('easel.proposals.create', { from: forecast.id, name: `Synthetic ${policy} authority recovery`, request: 'Synthetic scoped planning alternative', idempotency_key: `synthetic-easel-${policy}-authority-create` })
  const formulaArgs = { scenario: draft.id, revision: String(draft.revision), name: 'Synthetic scoped formula', line: payroll.id, department: department.id, unit: 'money', formula: '100', start: '2026-01', idempotency_key: `synthetic-easel-${policy}-authority-formula` }
  await complete('easel.formulas.update', formulaArgs)
  await h.command('pay-detail', { email, granted: false })
  const beforePayRefusal = await h.get(`/api/easel/scenario/${draft.id}`)
  const refusedFormula = await call('easel.formulas.update', formulaArgs)
  assert.equal(refusedFormula.isError, true)
  assert.equal(refusedFormula._meta['com.runeditrun/error'].code, 'forbidden')
  assert.equal(refusedFormula.structuredContent, undefined)
  assert.deepEqual(await h.get(`/api/easel/scenario/${draft.id}`), beforePayRefusal)
  await h.command('pay-detail', { email, granted: true })
  const args = { id: draft.id, summary: 'Synthetic scoped submission', idempotency_key: `synthetic-easel-${policy}-authority-submit` }
  const submitted = await complete('easel.proposals.submit', args)
  assert.equal(submitted.proposalStatus, 'submitted')
  assert.deepEqual((await call('easel.proposals.submit', args)).structuredContent, submitted)
  await h.command('member', { email, name: 'Synthetic replay sponsor', role: 'contributor', departments: [other.id] })
  const before = await h.get(`/api/easel/scenario/${draft.id}`), history = await h.get('/api/easel/activity')
  const refused = await call('easel.proposals.submit', args)
  assert.equal(refused.isError, true)
  assert.equal(refused._meta['com.runeditrun/error'].code, 'forbidden')
  assert.equal(refused.structuredContent, undefined)
  assert.deepEqual(await h.get(`/api/easel/scenario/${draft.id}`), before)
  assert.deepEqual(await h.get('/api/easel/activity'), history)
  console.log(`PROBE BASE-AGENT-012 authority: ${policy} completed formula and submission keys after native Pay and department revocation -> forbidden, no cached content or native effect`)
  await h.command('member', { email, name: 'Synthetic replay sponsor', role: 'finance', departments: [] })
  const financeDraft = await complete('easel.proposals.create', { from: forecast.id, name: `Synthetic ${policy} finance recovery`, request: 'Synthetic finance assumptions', idempotency_key: `synthetic-easel-${policy}-finance-create` })
  const allocationArgs = { scenario: financeDraft.id, name: 'Synthetic finance allocation', sourceDepartment: state.departments.find(row => row.shared).id,
   basis: 'fixed', targets: [{ department: department.id, percent: '100' }], idempotency_key: `synthetic-easel-${policy}-finance-allocation` }
  const taxArgs = { scenario: financeDraft.id, name: 'Synthetic finance taxes', line: state.lines.find(row => row.name === 'Synthetic income tax').id,
   department: department.id, sutaPercent: '2.7', sutaBase: '9000', stateIncomePercent: '5', idempotency_key: `synthetic-easel-${policy}-finance-tax` }
  const receipts = [['easel.allocations.update', allocationArgs], ['easel.taxes.update', taxArgs]]
  for (const [tool, args] of receipts) {
   const written = await complete(tool, args)
   assert.deepEqual((await call(tool, args)).structuredContent, written, 'Finance recovers the exact recorded singleton input')
  }
  await h.command('member', { email, name: 'Synthetic replay sponsor', role: 'contributor', departments: [department.id] })
  const financeBefore = { view: await h.get(`/api/easel/scenario/${financeDraft.id}`), activity: await h.get('/api/easel/activity') }
  for (const path of ['/mcp', '/api/easel/mcp']) for (const [tool, args] of receipts) {
   const refused = await call(tool, args, path)
   assert.equal(refused.isError, true)
   assert.equal(refused._meta['com.runeditrun/error'].code, 'forbidden')
   assert.equal(refused.structuredContent, undefined, 'A retained singleton outcome cannot bypass current finance authority')
  }
  assert.deepEqual({ view: await h.get(`/api/easel/scenario/${financeDraft.id}`), activity: await h.get('/api/easel/activity') }, financeBefore)
  console.log(`PROBE BASE-AGENT-012 finance authority: ${policy} allocation and tax keys after native finance downgrade at both endpoints -> forbidden, no cached content or effect`)

 }
 // Retained outcomes cannot restore a different person's erased identity.
 for (const policy of ['autonomous', 'held']) {
  const configured = await h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', spend: { none: true }, reviewers: ['role:owner'],
   rules: policy === 'autonomous' ? [{ id: 'all', class: '*', do: 'autonomous' }] : [{ id: 'sensitive', class: '*', do: 'approval', approver: ['role:owner'], wait: 'P1D' }, { id: 'ordinary', class: 'standard', do: 'review' }],
  } }, h.owner, 'PUT')
  assert.equal(configured.status, 200)
  const email = [`synthetic-easel-erasure-${policy}`, 'example.test'].join('@'), name = `Synthetic Subject ${policy}`
  await h.person(email, 'contributor', [department.id])
  await h.command('member', { email, name, role: 'contributor', departments: [department.id] })
  const call = async (path, name, args) => {
   const response = await h.mf.dispatchFetch(h.origin + path, { method: 'POST', headers: { origin: h.origin, cookie: h.owner, 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': name },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'tools/call', params: { name, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }) })
   assert.equal(response.status, 200)
   return (await response.json()).result
  }
  const receipts = []
  const complete = async (tool, args) => {
   let answer = await call('/mcp', tool, args)
   if (answer.resultType === 'input_required') {
    const approval = (await h.get(`/agents/api/approvals/${answer._meta['com.runeditrun/approval'].id}`)).approval
    const approved = await h.send(`/agents/api/approvals/${approval.id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 }, h.owner)
    assert.equal(approved.value.approval.state, 'executed')
    answer = await call('/mcp', tool, args)
   }
   assert.equal(answer.isError, false, JSON.stringify(answer))
   receipts.push({ tool, args, classes: answer._meta['com.runeditrun/decision'].classes })
   return answer.structuredContent
  }
  const draft = await complete('easel.proposals.create', { from: forecast.id, name, request: 'Synthetic subject recovery', idempotency_key: `synthetic-easel-${policy}-subject-create` })
  await complete('easel.formulas.update', { scenario: draft.id, revision: String(draft.revision), name, department: department.id, line: payroll.id, unit: 'money', formula: '100', start: '2026-01', idempotency_key: `synthetic-easel-${policy}-subject-formula` })
  const submitted = await complete('easel.proposals.create', { from: forecast.id, name: `${name} submitted`, request: 'Synthetic subject submission', idempotency_key: `synthetic-easel-${policy}-subject-submitted` })
  await complete('easel.proposals.submit', { id: submitted.id, summary: 'Synthetic reviewed alternative', idempotency_key: `synthetic-easel-${policy}-subject-submit` })
  const captures = await frozen()
  await h.command('member', { email, name, role: 'contributor', departments: [department.id], active: false })
  const erased = await h.command('person-erase', { email })
  const after = { draft: await h.get(`/api/easel/scenario/${draft.id}`), submitted: await h.get(`/api/easel/scenario/${submitted.id}`), activity: await h.get('/api/easel/activity') }
  assert.equal(after.draft.scenario.name, erased.pseudonym)
  for (const path of ['/mcp', '/api/easel/mcp']) for (const receipt of receipts) {
   const replay = await call(path, receipt.tool, receipt.args)
   assert.equal(replay.isError, false, JSON.stringify(replay))
   assert.ok(!JSON.stringify(replay).includes(name), 'Cached structured data, serialized text and resource names cannot restore an erased identity')
   assert.ok(replay.structuredContent.name.includes(erased.pseudonym))
   assert.deepEqual(JSON.parse(replay.content.find(block => block.type === 'text').text), replay.structuredContent)
   assert.deepEqual(replay._meta['com.runeditrun/decision'].classes, receipt.classes, 'Erasure does not rewrite computed class facts')
  }
  assert.deepEqual({ draft: await h.get(`/api/easel/scenario/${draft.id}`), submitted: await h.get(`/api/easel/scenario/${submitted.id}`), activity: await h.get('/api/easel/activity') }, after)
  assert.deepEqual(await frozen(), captures, 'Erasure and retained-key recovery preserve stored approved snapshot bytes and hashes')
  console.log(`PROBE BASE-AGENT-012 erasure: ${policy} both endpoints replay creation, formula and submission after subject erasure -> current pseudonym in structured data, serialized text and resource names; native state and captures unchanged`)
 }
})
