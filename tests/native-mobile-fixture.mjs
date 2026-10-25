import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { mobilePushProvider } from './mobile-push-provider.mjs'

// A real Easel HTTP runtime. Only mail and the APNS and FCM network edges
// are substituted; native apps use the same routes as installed clients.
export async function nativeMobileFixture() {
 const provider = mobilePushProvider()
 provider.bindings.EASEL_APNS_TOPIC = 'com.runeditrun.easel'
 const h = await harness({ bindings: provider.bindings, outbound: request => provider.fetch(request) })
 try {
  await h.command('workspace', { name: 'Larch Labs', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
  const department = await h.command('department', { name: 'Operations' })
  const revenue = await h.command('line', { name: 'Subscriptions', type: 'revenue' })
  const costs = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
  const budget = (await h.get('/api/easel/state')).scenarios[0]
  await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '200000', collectionLag: 0, paymentLag: 0 })
  await h.command('revenue', { scenario: budget.id, name: 'Subscriptions', kind: 'volume', department: department.id, line: revenue.id, start: '2026-01', startVolume: '100', rate: '100', collectionLag: 0 })
  await h.command('expense', { scenario: budget.id, name: 'Operations', kind: 'recurring', department: department.id, line: costs.id, start: '2026-01', amount: '15000' })
  const forecast = (await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
  await h.command('dashboard-save', { name: 'Board operating outlook', scenario: forecast.id, audience: 'board', widgets: [{ metric: 'closingCash', display: 'tile' }, { metric: 'revenue', display: 'table' }] })
  await h.command('calendar-task-save', { name: 'Review October outlook', kind: 'other', owner: 'owner@example.test', due: '2026-10-30', department: '' })
  await h.command('comment', { scenario: forecast.id, department: department.id, text: 'Please review the hiring plan.' })
  const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Add support capacity', request: 'Add $500 monthly for the support rotation.' })
  await h.command('expense', { scenario: proposal.id, name: 'Support rotation', kind: 'recurring', department: department.id, line: costs.id, start: '2026-01', amount: '500' })
  await h.command('proposal-submit', { id: proposal.id })
  await h.command('cash-constraints', { floor: '200000', runwayMinimum: '0' })
  await h.person('board@example.test', 'viewer')
  const mailLink = async email => {
   const prior = h.messages.length
   assert.equal((await h.send('/auth/magic-link', { email, returnTo: '/app' })).status, 202)
   const link = h.messages.slice(prior).at(-1).text.match(/http:\/\/\S+\/auth\/confirm\?token=\S+/)?.[0]
   assert.ok(link, 'The real mail boundary must supply a one-use sign-in link')
   return { link, token: new URL(link).searchParams.get('token') }
  }
  const owner = await mailLink('owner@example.test'), viewer = await mailLink('board@example.test')
  const signInLink = owner.link, token = owner.token
  return {
   h, provider, department, forecast, proposal, signInLink, token, viewer,
   async cashPush(platform) {
    const prior = provider.requests.length
    await h.command('cash-alert-rule-save', { name: 'Cash floor', kind: 'floor', enabled: true })
    const requests = provider.requests.slice(prior).filter(r => r.platform === platform)
    assert.equal(requests.length, 1, 'One real cash alert reaches the opted-in native session')
    return requests[0].body
   },
   async proveEndState() {
    const state = await h.get('/api/easel/state')
    const promoted = state.scenarios.find(s => s.id === proposal.id)
    assert.equal(promoted.proposalStatus, 'promoted', 'Native approval persists through the public read door')
    assert.equal(promoted.promotedInto.scenario, forecast.id)
    const details = await h.get(`/api/easel/scenario/${forecast.id}`)
    assert.ok(details.inputs.expense.some(e => e.name === 'Support rotation' && e.amountCents === 50000), 'The exact reviewed proposal becomes the working forecast')
    assert.equal(details.calculation.cash[0].closing, 19450000)
    // Native session custody must have been removed by the public sign-out.
    const secrets = await h.db.prepare("SELECT COUNT(*) AS n FROM e_connection_secrets WHERE id LIKE 'mobile-push:%'").first()
    assert.equal(secrets.n, 0, 'Native sign-out removes device custody')
   },
   close: () => h.close(),
  }
 } catch (error) { await h.close(); throw error }
}
