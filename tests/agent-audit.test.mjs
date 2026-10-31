import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { allAgentAudit, seedAgentAudit } from './agent-audit-fixture.mjs'

test('Agent audit person door filters interleaved public calls across cursors and retains approval attribution', async t => {
 const h = await harness(); t.after(() => h.close())
 let id = 0
 const rpc = async (name, args, who) => {
  const response = await h.mf.dispatchFetch(h.origin + '/mcp', { method: 'POST', headers: { origin: h.origin, cookie: who, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25', traceparent: 'synthetic-easel-audit-trace' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args, _meta: { traceparent: 'synthetic-easel-audit-trace' } } }) })
  assert.equal(response.status, 200)
  const result = await response.json(); assert.ok(!result.error, JSON.stringify(result)); return result.result
 }
 const policy = async disposition => {
  const r = await h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: disposition, class: '*', do: disposition, ...(disposition === 'approval' ? { approver: ['role:owner'], wait: 'P1D' } : {}) }], spend: { none: true } } }, h.owner, 'PUT')
  assert.equal(r.status, 200, r.text)
 }
 const fixture = await seedAgentAudit({ ...h, rpc, policy, approve: async (path, evidence, who, status) => assert.equal((await h.send(path + '/approve', evidence, who)).status, status) })
 const expected = fixture.rows.filter(row => row.agent.id === fixture.agent && row.classes.some(item => item.class === 'sensitive'))
 assert.ok(expected.length > 4)
 const first = await h.get(`/agents/api/audit?agent=${encodeURIComponent(fixture.agent)}&class=sensitive`)
 assert.deepEqual(first.rows, []); assert.ok(first.cursor)
 assert.deepEqual(await allAgentAudit(h.get, { agent: fixture.agent, class: 'sensitive' }), expected)
 assert.deepEqual(await allAgentAudit(h.get, { agent: fixture.agent }), fixture.rows.filter(row => row.agent.id === fixture.agent))
 assert.deepEqual(await allAgentAudit(h.get, { class: 'sensitive' }), fixture.rows.filter(row => row.classes.some(item => item.class === 'sensitive')))
 assert.deepEqual(await allAgentAudit(h.get, { agent: 'synthetic-easel-missing' }), [])
 const executed = expected.find(row => row.approval?.id === fixture.approval && row.outcome === 'done')
 assert.ok(executed); assert.ok(executed.resource); assert.ok(executed.rules.length); assert.ok(executed.scopes.length)
 assert.ok(fixture.rows.some(row => row.trace === 'synthetic-easel-audit-trace'))
 assert.equal((await h.send('/agents/audit', undefined, h.owner)).status, 200)
 assert.equal((await h.send('/agents/audit', {}, h.owner)).status, 405)
 for (const path of ['/agents/audit', '/agents/api/audit']) {
  await h.get(path, '', 401); await h.get(path, fixture.planner, 403)
  const response = await h.mf.dispatchFetch(h.origin + path, { headers: { cookie: h.owner, authorization: 'Bearer synthetic-easel-agent' } })
  assert.equal(response.status, 403, 'Agent credentials never inherit the accompanying person session')
  assert.ok(!(await response.text()).includes(fixture.agent))
 }
 const editor = await h.person(['synthetic-easel-editor', 'example.test'].join('@'), 'finance')
 for (const path of ['/agents/audit', '/agents/api/audit']) assert.equal((await h.send(path, undefined, editor)).status, 200, 'Native editors retain audit authority')
 console.log('PROBE BASE-AGENT-009 point5 API: /mcp autonomous and held calls, named native approval and /agents/api/audit -> exact agent and class rows beyond empty cursor page, full fields, separate preparer and approver; unauthorized and agent credentials refused')
})
