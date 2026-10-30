// Runs the published app template through a real local Crank Worker/D1 test
// runtime. Obtain Crank separately; this runner never clones or modifies it.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { workflow } from './index.mjs'
export async function proveCrank(h, { source, token, forecast, department }) {
 const original = process.cwd()
 let crank, kit
 try {
  process.chdir(source)
  const { harness } = await import(pathToFileURL(source + '/tests/harness.mjs'))
  kit = await import(pathToFileURL(source + '/tests/kit.mjs'))
  crank = await harness('https://easel.example.test', { edge: async request => {
   if (new URL(request.url).hostname !== 'easel.example.test') return undefined
   const url = new URL(request.url), headers = new Headers(request.headers)
   headers.set('host', new URL(h.origin).host)
   return h.mf.dispatchFetch(h.origin + url.pathname + url.search, { method: request.method, headers, ...(request.method !== 'GET' ? { body: await request.arrayBuffer() } : {}) })
  } })
 } finally { process.chdir(original) }
 try {
  const secret = randomBytes(32).toString('hex')
  const signing = await kit.connection(crank, { app: 'webhook', label: 'Easel signature', auth_kind: 'signing_secret', secret: { secret } })
  const api = await kit.connection(crank, { app: 'http', label: 'Easel planning', auth_kind: 'bearer', domains: ['easel.example.test'], secret: { token } })
  const graph = workflow({ origin: 'https://easel.example.test', signingConnection: signing.id, apiConnection: api.id,
   proposal: { from: forecast.id, revision: forecast.revision, name: 'Crank reviewed proposal', request: 'Review the forecast' },
   comment: { scenario: '{{steps.proposal.body.id}}', department: department.id, text: 'Prepared by Crank for review' } })
  const published = await kit.publish(crank, 'Easel approval to proposal and comment', graph)
  const hook = await kit.hookUrl(crank, published)
  const registered = await h.send('/api/easel/webhooks/register', { label: 'Crank app', url: 'https://crank.example.com' + new URL(hook).pathname, events: ['approval'], secret }, h.owner)
  assert.equal(registered.status, 200)
  // The caller forwards its receiver transport to this live Crank public door.
  let replay
  return { async receive(request) {
   const url = new URL(request.url), headers = new Headers(request.headers)
   headers.set('host', new URL(crank.origin).host)
   replay = { url: crank.origin + url.pathname, method: request.method, headers: Object.fromEntries(headers), body: await request.arrayBuffer() }
   return crank.mf.dispatchFetch(replay.url, { method: replay.method, headers: replay.headers, body: replay.body })
  }, async verify() {
   const run = (await kit.runs(crank, published))[0]
   assert.ok(run, 'Crank admitted the signed approval')
   const completed = await kit.settled(crank, run.id)
   assert.equal(completed.status, 'succeeded', JSON.stringify(completed.error))
   const proposal = kit.stepOf(completed, 'proposal').output.body
   assert.equal(proposal.branchedFrom.revision, forecast.revision)
   assert.equal(proposal.proposalStatus, 'draft')
   assert.equal(kit.stepOf(completed, 'comment').output.body.text, 'Prepared by Crank for review')
   const duplicate = await crank.mf.dispatchFetch(replay.url, { method: replay.method, headers: replay.headers, body: replay.body })
   assert.equal((await duplicate.json()).duplicate, true, 'Replaying the signed ID is explicitly detected')
   assert.equal((await kit.runs(crank, published)).length, 1)
   await h.send('/api/easel/webhooks/revoke', { id: registered.value.id }, h.owner)
   return { run: run.id, workflow: published.id }
  }, async close() { await crank.close() } }
 } catch (error) { await crank.close(); throw error }
}
