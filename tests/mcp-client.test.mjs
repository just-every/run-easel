import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { standaloneClientJourney } from './mcp-client-journey.mjs'

test('Standalone MCP clients negotiate both versions and preserve native state across transport refusals under both policies', async t => {
 const h = await harness()
 t.after(() => h.close())
 await standaloneClientJourney({ origin: h.origin, cookie: h.owner,
  approve: async ({ approval, native }) => {
   const view = (await native(`/agents/api/approvals/${approval.id}`)).approval
   assert.equal(view.state, 'pending')
   const decided = await native(`/agents/api/approvals/${approval.id}/approve`, { revision: view.revision, summary_sha256: view.summary_sha256 })
   assert.equal(decided.approval.state, 'executed')
   assert.ok(decided.approval.approvals.length > 0)
  },
 })
})
