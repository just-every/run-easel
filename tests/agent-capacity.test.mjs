import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { agentCapacityJourney, capacitySigning } from './agent-capacity-journey.mjs'

test('Agent capacity is shared across MCP paths, isolates other agents and people, and recovers under both policies', { timeout: 300000 }, async t => {
 const signing = await capacitySigning()
 const h = await harness({ bindings: signing.bindings })
 t.after(() => h.close())
 await agentCapacityJourney({ origin: h.origin, cookie: h.owner, signing,
  proof: line => console.log(`PROBE ${line}`),
  approve: async ({ approval, native }) => {
   const current = (await native(`/agents/api/approvals/${approval.id}`)).approval
   assert.equal(current.state, 'pending')
   const decided = await native(`/agents/api/approvals/${approval.id}/approve`, { revision: current.revision, summary_sha256: current.summary_sha256 })
   assert.equal(decided.approval.state, 'executed')
  },
 })
})
