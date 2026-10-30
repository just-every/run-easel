import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { automationEdge } from './automation-edge.mjs'
import { harness } from './harness.mjs'

// Two public-door journeys. Fakes are confined to HTTPS provider/receiver edges.
test('API-002 signed durable events cover the planning loop, delivery recovery and live authority without exposing private data', async t => {
 let now = '2026-03-02T15:00:00.000Z', receiverStatus = 200
 const received = []
 const edge = await automationEdge(async wire => {
  received.push({ body: wire.body, headers: wire.headers })
  if (receiverStatus === 0) throw new Error('Receiver transport outcome unknown')
  return { status: receiverStatus, headers: { 'retry-after': '60' }, body: '' }
 }); t.after(() => edge.close())
 await edge.assertRefused(assert)
 const h = await harness({ now: () => now, bindings: { ...edge.bindings, EASEL_WEBHOOK_HOSTS: 'receiver.example.com', GAUGE_ORIGIN: 'https://gauge.example.test' }, outbound: edge.outbound }); t.after(() => h.close())
 const register = async (body, status = 200, cookie = h.owner) => { const r = await h.send('/api/easel/webhooks/register', body, cookie); assert.equal(r.status, status, JSON.stringify(r.value)); return r.value }
 const hook = { label: 'Planning automation', url: 'https://receiver.example.com/events', events: ['approval', 'close', 'publish', 'refresh-failure', 'alert', 'task'] }
 await h.command('workspace', { name: 'Harbour', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Operations' })
 const line = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
 const viewer = await h.person('board@example.test', 'viewer')
 await register(hook, 403, viewer)
 for (const url of ['http://receiver.example.com/events','https://127.0.0.1/events','https://receiver.example.com/events?token=secret','https://elsewhere.example.test/events','https://user:password@receiver.example.com/events','broken']) await register({ ...hook, url }, url.includes('elsewhere') ? 403 : 400)
 const subscription = await register(hook)
 assert.equal(received.length, 0, 'Registration does not invent an event')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '1000', collectionLag: 0, paymentLag: 0 })
 await h.command('expense', { scenario: budget.id, department: department.id, line: line.id, name: 'Private supplier narrative', kind: 'recurring', start: '2026-01', amount: '100' })
 const revision = (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision
 await h.command('approve-budget', { scenario: budget.id, revision: revision - 1 }, h.owner, 409)
 assert.equal(received.length, 0, 'Refused approval has no event')
 const forecast = (await h.command('approve-budget', { scenario: budget.id, revision })).forecast
 assert.equal(received.length, 1, 'The approval has one delivery')
 const first = received[0], event = JSON.parse(first.body)
 assert.equal(event.type, 'approval'); assert.equal(event.data.revision, revision)
 assert.equal(first.headers['x-easel-event-id'], event.id)
 const expected = createHmac('sha256', subscription.secret).update(`${first.headers['x-easel-timestamp']}.${first.body}`).digest('hex')
 assert.ok(timingSafeEqual(Buffer.from(first.headers['x-easel-signature'].slice(3)), Buffer.from(expected)))
 const seen = new Set([event.id]); assert.ok(seen.has(JSON.parse(first.body).id), 'A replay is detectable by the signed stable ID')
 assert.notEqual(createHmac('sha256', subscription.secret).update(`${first.headers['x-easel-timestamp']}.${first.body} `).digest('hex'), expected, 'Modified bytes do not verify')
 await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 assert.equal(received.length, 1, 'Scheduler does not resend a successful event')
 await h.command('account-map', { account: '500', target: line.id }); await h.command('department-map', { source: 'Operations', department: department.id })
 const file = { filename: 'january.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,500,Operations,120\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 await h.kit('actuals', 'commit', { ...file, fingerprint: (await h.kit('actuals', 'preview', file)).fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await h.command('pack-create', { month: '2026-01' })
 await h.command('pack-publish', { pack: pack.id })
 await h.command('cash-constraints', { floor: '900', runwayMinimum: '0' })
 await h.command('cash-alert-rule-save', { name: 'Cash floor', kind: 'floor', enabled: true })
 const task = await h.command('calendar-task-save', { name: 'Review close', kind: 'other', department: '', owner: 'owner@example.test', due: '2026-03-10' })
 await h.command('calendar-task-complete', { id: task.id, revision: task.revision })
 assert.equal((await h.send('/api/easel/connections/gauge/connect', { key: 'gauge_util_' + 'a'.repeat(43) }, h.owner)).status, 200)
 assert.equal((await h.send('/api/easel/connections/gauge/check', { month: '2026-01' }, h.owner)).status, 200)
 const types = new Set(received.map(r => JSON.parse(r.body).type))
 for (const type of hook.events) assert.ok(types.has(type), `Real ${type} operation fires its event`)
 assert.ok(!JSON.stringify(received).includes('Private supplier narrative'))
 assert.ok(!JSON.stringify(received).includes(subscription.secret))
 await h.get('/api/easel/automation/events', viewer, 403)
 const feed = await h.get('/api/easel/automation/events')
 assert.deepEqual(new Set(feed.events.map(e => e.id)), new Set(received.map(r => JSON.parse(r.body).id)))
 assert.deepEqual((await h.get(`/api/easel/automation/events?after=${feed.cursor}`)).events, [])
 assert.equal((await h.get('/api/easel/automation/events?type=approval&recent=true')).events.length, 1)

 // Bounded retry of a known refusal uses the same event ID and signed bytes.
 receiverStatus = 503
 const retryTask = await h.command('calendar-task-save', { name: 'Retry delivery', kind: 'other', owner: 'owner@example.test', due: '2026-03-11' })
 const retry = received.at(-1)
 receiverStatus = 200; now = '2026-03-02T15:02:00.000Z'
 await Promise.all([h.send('/api/easel/automation/dispatch', {}, h.owner), h.send('/api/easel/automation/dispatch', {}, h.owner)])
 assert.equal(received.filter(r => r.body === retry.body).length, 2, 'One initial refusal and one claimed retry')
 assert.equal((await h.get('/api/easel/webhooks')).deliveries.find(d => d.event === JSON.parse(retry.body).id).status, 'delivered')
 receiverStatus = 302
 await h.command('calendar-task-complete', { id: retryTask.id, revision: retryTask.revision })
 assert.equal((await h.get('/api/easel/webhooks')).deliveries.find(d => d.event === JSON.parse(received.at(-1).body).id).status, 'failed', 'Redirects are not followed')
 receiverStatus = 0
 await h.command('calendar-task-save', { name: 'Unknown delivery', kind: 'other', owner: 'owner@example.test', due: '2026-03-12' })
 const unknown = received.at(-1), beforeUnknownRetry = received.length
 assert.equal((await h.get('/api/easel/webhooks')).deliveries.find(d => d.event === JSON.parse(unknown.body).id).status, 'uncertain')
 await h.send('/api/easel/automation/dispatch', {}, h.owner)
 assert.equal(received.length, beforeUnknownRetry, 'Unknown outcomes are not retried')
 receiverStatus = 200
 await h.send('/api/easel/webhooks/revoke', { id: subscription.id }, h.owner)
 const total = received.length
 await h.command('calendar-task-save', { name: 'No delivery', kind: 'other', owner: 'owner@example.test', due: '2026-03-12' })
 assert.equal(received.length, total)
 const listed = await h.get('/api/easel/webhooks')
 assert.ok(!JSON.stringify(listed).includes(subscription.secret)); assert.ok(!JSON.stringify(await h.get('/api/easel/activity')).includes(subscription.secret))
 // A finance admin can read results and stop receivers, but only a native
 // owner may enter a new outbound destination under the inherited egress rule.
 const finance = await h.person('automation-finance@example.test', 'finance')
 await register({ ...hook, events: ['task'] }, 403, finance)
 const backup = await createPortability({ db: h.db, policy: easelPolicy }), exportId = await backup.exports.create()
 try {
  while ((await backup.exports.advance(exportId, { maxParts: 16 })).phase === 'building') {}
  const records = (await new Response(await backup.exports.download(exportId)).text()).trim().split('\n').map(JSON.parse)
  for (const table of ['e_webhook_subscriptions','e_webhook_deliveries','e_automation_events']) assert.ok(records[0].tables.every(r => r.name !== table))
  assert.ok(!JSON.stringify(records).includes(subscription.secret))
 } finally { await backup.exports.abort(exportId) }
})
