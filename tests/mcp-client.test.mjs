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
})
