import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { agentClassesJourney } from './agent-classes-journey.mjs'

test('Native payroll classes ignore proposal, name and comment claims while held and refused calls retain exact audit facts', async t => {
 const h = await harness()
 t.after(() => h.close())
 await agentClassesJourney({ origin: h.origin, cookie: h.owner, ownerName: 'Fran Finance',
  captures: async () => (await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results,
  approve: async ({ approval, saved, native }) => {
   const decided = await native(`/agents/api/approvals/${approval.id}/approve`, { revision: saved.revision, summary_sha256: saved.summary_sha256 })
   assert.equal(decided.approval.state, 'executed')
   assert.equal(decided.approval.approvals[0].name, 'Fran Finance')
  }, proof: line => console.log(`PROBE ${line}`),
 })
})
