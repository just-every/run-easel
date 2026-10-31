import test from 'node:test'
import { harness } from './harness.mjs'
import { authoritySigner, authorityJourney } from './agent-authority-journey.mjs'

test('Issued agent authority follows native department narrowing, viewer downgrade and sponsor suspension under both policies', async () => {
 for (const policy of ['autonomous', 'held']) {
  const signing = await authoritySigner()
  const h = await harness({ bindings: signing.bindings })
  try {
   await authorityJourney({ origin: h.origin, request: (url, init) => h.mf.dispatchFetch(url, init), owner: h.owner, signing, messages: h.messages, policy,
    proof: line => console.log(`PROBE ${line}`),
    approve: async ({ approval, get, native }) => {
     const saved = (await get(`/agents/api/approvals/${approval.id}`)).approval
     const decided = (await native(`/agents/api/approvals/${approval.id}/approve`, { revision: saved.revision, summary_sha256: saved.summary_sha256 })).value
     if (decided.approval.state !== 'executed') throw new Error('Named native owner approval did not execute')
    },
   })
  } finally { await h.close() }
 }
})
