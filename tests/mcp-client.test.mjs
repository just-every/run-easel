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
  const call = async (name, args) => {
   const response = await fetch(h.origin + '/mcp', { method: 'POST', headers: { origin: h.origin, cookie: sponsor, 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': name },
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
 }
})
