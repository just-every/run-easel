const assert = require('node:assert/strict')
const { createAppTester } = require('zapier-platform-core')
const App = require('../index.cjs')
const appTester = createAppTester(App)

describe('Easel automation app public-door journey', function () {
 this.timeout(120000)
 it('receives an approval, creates a revision-bound draft and comment, and refuses stale or revoked writes', async () => {
  const { resolve } = require('node:path')
  const original = process.cwd(); process.chdir(resolve(__dirname, '../../..'))
  const { harness } = await import('../../../tests/harness.mjs')
  let crank
  const { automationEdge } = await import('../../../tests/automation-edge.mjs')
  const edge = await automationEdge(async wire => {
   if (!crank) throw new Error('Receiver not running')
   const response = await crank.receive(new Request(wire.url, { method: 'POST', headers: wire.headers, body: wire.body }))
   return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
  })
  const h = await harness({ bindings: { ...edge.bindings, EASEL_WEBHOOK_HOSTS: 'crank.example.com' }, outbound: edge.outbound })
  try {
   await h.command('workspace', { name: 'Zapier CLI proof', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
   const department = await h.command('department', { name: 'Operations' })
   const budget = (await h.get('/api/easel/state')).scenarios[0]
   await h.stepUp()
   const issued = await h.send('/api/easel/tokens/issue', { label: 'Zapier CLI', kind: 'service', scope: 'write', expiresInSeconds: 3600 }, h.owner)
   assert.equal(issued.status, 200)
   const forecast = (await h.command('approve-budget', { scenario: budget.id, revision: budget.revision })).forecast
   const bundle = { authData: { origin: h.origin, token: issued.value.token }, inputData: {} }
   await appTester(App.authentication.test, bundle)
   const events = await appTester(App.triggers.approval.operation.perform, bundle)
   assert.equal(events.length, 1); assert.equal(events[0].data.record, budget.id)
   bundle.inputData = { from: forecast.id, revision: forecast.revision, name: 'Zapier reviewed proposal', request: 'Review the cost plan' }
   const proposal = await appTester(App.creates.create_proposal.operation.perform, bundle)
   assert.equal(proposal.proposalStatus, 'draft'); assert.equal(proposal.branchedFrom.revision, forecast.revision)
   bundle.inputData = { scenario: proposal.id, department: department.id, text: 'Prepared by Zapier for human review' }
   const comment = await appTester(App.creates.create_comment.operation.perform, bundle)
   assert.equal(comment.text, bundle.inputData.text)
   bundle.inputData = { from: forecast.id, revision: forecast.revision + 1, name: 'Stale proposal', request: 'Refuse this stale request' }
   await assert.rejects(appTester(App.creates.create_proposal.operation.perform, bundle))
   // The Make account boundary is unavailable locally. Exercise the actual
   // shipped request declarations against Easel without claiming Make IML execution.
   const { readFile } = require('node:fs/promises')
   const makeRequest = async (file, parameters) => {
    const spec = JSON.parse(await readFile(require('node:path').resolve(__dirname, '../../make/' + file)))
    const body = Object.fromEntries(Object.keys(spec.communication.body).map(key => [key, parameters[key]]))
    const response = await h.mf.dispatchFetch(h.origin + '/api/easel' + spec.communication.url, { method: spec.communication.method, headers: { authorization: 'Bearer ' + issued.value.token, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(response.status, 200)
    return response.json()
   }
   const watch = JSON.parse(await readFile(require('node:path').resolve(__dirname, '../../make/watchEvents.iml.json')))
   const makeEventsResponse = await h.mf.dispatchFetch(h.origin + '/api/easel' + watch.communication.url + '?type=approval&recent=true', { headers: { authorization: 'Bearer ' + issued.value.token } })
   assert.equal((await makeEventsResponse.json()).events[0].type, 'approval')
   const makeProposal = await makeRequest('createProposal.iml.json', { from: forecast.id, revision: forecast.revision, name: 'Make reviewed proposal', request: 'Review the forecast' })
   assert.equal(makeProposal.branchedFrom.revision, forecast.revision)
   assert.equal((await makeRequest('createComment.iml.json', { scenario: makeProposal.id, department: department.id, text: 'Prepared by Make for review' })).text, 'Prepared by Make for review')
   if (process.env.EASEL_CRANK_SOURCE) {
    const { proveCrank } = await import('../../crank/prove.mjs')
    crank = await proveCrank(h, { source: process.env.EASEL_CRANK_SOURCE, token: issued.value.token, forecast, department })
    const alternate = await h.command('branch', { from: budget.id, name: 'Crank approval trigger', budget: true })
    await h.command('approve-budget', { scenario: alternate.id, revision: alternate.revision })
    await crank.verify()
   }
   assert.equal((await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision, forecast.revision)
   await h.send('/api/easel/tokens/revoke', { id: issued.value.id }, h.owner)
   await assert.rejects(appTester(App.triggers.approval.operation.perform, bundle))
  } finally { await crank?.close(); await h.close(); await edge.close(); process.chdir(original) }
 })
})
