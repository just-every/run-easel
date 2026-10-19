import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness } from './harness.mjs'

// Only the external Gauge network edge is faked; Easel uses real auth/D1/Worker.
test('REV-003 CONNECT-010 reviewed Gauge agency utilization, sealed custody, source changes, undo, authority and frozen values', async t => {
 const key = `gauge_util_${'a'.repeat(43)}`
 let billable = 360001, missing = false, status = 200, wrongPeriod = false, reads = 0, revokeStatus = 200, revoked = false, revokes = 0
 let holdReads = false
 const pendingReads = []
 const provider = createServer((req, res) => {
  assert.equal(req.headers.authorization, `Bearer ${key}`)
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/api/gauge/keys/revoke') {
   assert.equal(req.method, 'POST'); revokes++
   if (revokeStatus === 200) revoked = true
   res.writeHead(revokeStatus, { 'content-type': 'application/json', ...(revokeStatus === 302 ? { location: '/must-not-follow' } : {}) })
   res.end(JSON.stringify({ privateProviderBody: key })); return
  }
  assert.equal(url.pathname, '/api/gauge/state')
  assert.equal(req.method, 'GET'); assert.equal(url.searchParams.get('from'), '2026-01-01'); assert.equal(url.searchParams.get('to'), '2026-01-31')
  reads++
  const respond = () => {
   res.writeHead(status, { 'content-type': 'application/json', ...(status === 429 ? { 'retry-after': '120' } : {}) })
   res.end(JSON.stringify({ scope: 'utilization:read', from: wrongPeriod ? '2026-02-01' : '2026-01-01', to: '2026-01-31', participantCount: 3, availableSeconds: missing ? null : 1728000, knownAvailableSeconds: missing ? 10000 : 1728000, missingCalendarDays: missing ? 1 : 0, approvedBillableSeconds: billable, asOf: new Date().toISOString(), personName: 'Provider private sentinel' }))
  }
  if (holdReads) { pendingReads.push(respond); if (pendingReads.length === 2) pendingReads.splice(0).forEach(release => release()) }
  else respond()
 })
 provider.listen(0, '127.0.0.1'); await once(provider, 'listening'); t.after(() => new Promise(r => provider.close(r)))
 const h = await harness({ bindings: { GAUGE_ORIGIN: `HTTP://127.0.0.1:${provider.address().port}/` } }); t.after(() => h.close())
 await h.command('workspace', { name: 'Cardinal Advisory', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Advisory' }), other = await h.command('department', { name: 'Engineering' })
 const line = await h.command('line', { name: 'Services', type: 'revenue' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const b = { scenario: budget.id, kind: 'services', name: 'Agency services', line: line.id, department: dept.id, start: '2026-01', collectionLag: 1, monthlyHours: '160', utilizationPercent: '75', hourlyRate: '150' }
 const driver = await h.command('revenue', b)
 const viewer = await h.person('board@example.test', 'viewer'), outsider = await h.person('engineering@example.test', 'contributor', [other.id])
 const post = async (path, body, code = 200, cookie = h.owner) => { const r = await h.send(`/api/easel/${path}`, body, cookie); assert.equal(r.status, code, r.text); return r.value }
 const view = () => h.get(`/api/easel/scenario/${budget.id}`)
 const args = async () => ({ scenario: budget.id, driver: driver.id, month: '2026-01', scenarioRevision: (await view()).scenario.revision })
 const amount = (v, month) => v.calculation.cells.find(c => c.line === line.id && c.month === month).amount
 await post('connections/gauge/connect', { key }, 403, outsider)
 await h.get('/api/easel/connections/gauge', viewer, 403)
 await post('connections/gauge/connect', { key: 'session-cookie' }, 400)
 const connected = await post('connections/gauge/connect', { key })
 await post('connections/gauge/check', { month: '2026-01' }, 403, outsider)
 assert.equal(connected.suffix, 'aaaa'); assert.equal(connected.schedule, 'Manual'); assert.equal(connected.lastRefresh, null)
 const stored = await h.db.prepare('SELECT * FROM e_connection_secrets').all()
 assert.equal(stored.results.length, 1); assert.ok(!JSON.stringify(stored).includes(key)); assert.ok(stored.results[0].sealed.includes('.'))
 const crossOrigin = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/gauge/disconnect', { method: 'POST', headers: { cookie: h.owner, origin: 'https://unrelated.example', 'content-type': 'application/json' }, body: '{}' })
 assert.equal(crossOrigin.status, 403, 'CONNECT-010 cross-origin administration is refused before provider revocation')
 assert.equal(revokes, 0); assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM e_connection_secrets').first()).n, 1)

 await h.stepUp()
 const issued = await post('tokens/issue', { label: 'Finance integration', kind: 'service', scope: 'write', expiresInSeconds: 3600 })
 for (const [path, body] of [['connections/gauge', undefined], ['connections/gauge/connect', { key }], ['connections/gauge/disconnect', {}], ['connections/gauge/check', { month: '2026-01' }], ['gauge/preview', await args()]]) {
  const r = await h.mf.dispatchFetch(h.origin + '/api/easel/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${issued.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal(r.status, 403, 'REV-003 CONNECT-010 provider custody/status/import require a native finance session, even for a finance write token')
 }
 const planBeforeCheck = await view()
 status = 429
 const limited = await post('connections/gauge/check', { month: '2026-01' })
 assert.match(limited.error, /HTTP 429/); assert.equal(limited.rateLimit, 'Retry after 120 seconds'); assert.ok(limited.lastChecked)
 status = 401
 const invalid = await post('connections/gauge/check', { month: '2026-01' })
 assert.match(invalid.error, /HTTP 401/); assert.equal(invalid.rateLimit, null)
 status = 200
 const healthy = await post('connections/gauge/check', { month: '2026-01' })
 assert.equal(healthy.error, null); assert.equal(healthy.rateLimit, null); assert.equal(healthy.rowCount, 1); assert.ok(healthy.lastRefresh)
 assert.equal(healthy.checkedMonth, '2026-01'); assert.equal(healthy.owner, 'owner@example.test'); assert.equal(healthy.scope, 'utilization:read')
 holdReads = true
 const racing = await Promise.all([1, 2].map(() => h.send('/api/easel/connections/gauge/check', { month: '2026-01' }, h.owner)))
 holdReads = false
 assert.deepEqual(racing.map(r => r.status).sort(), [200, 409], 'CONNECT-010 same-revision health saves admit one result and refuse the stale writer')
 assert.deepEqual(await view(), planBeforeCheck, 'CONNECT-010 explicit health checks never import or change plan data')
 const before = await view(), a = await args(), preview = await post('gauge/preview', a)
 assert.deepEqual(await view(), before, 'preview writes no model data')
 assert.equal(preview.amountCents, 1500004, '360001 seconds × 15000 cents / 3600 rounded once')
 assert.equal(preview.source.participantCount, 3); assert.equal(preview.source.availableSeconds, 1728000)
 assert.ok(!JSON.stringify(preview).includes('Provider private sentinel'))
 await post('gauge/accept', { ...a, digest: 'unreviewed' }, 409)
 billable++; await post('gauge/accept', { ...a, digest: preview.digest }, 409); billable--
 missing = true; await post('gauge/preview', a, 409); missing = false
 wrongPeriod = true; await post('gauge/preview', a, 502); wrongPeriod = false
 status = 429; await post('gauge/preview', a, 502); status = 401; await post('gauge/preview', a, 502); status = 200
 assert.deepEqual(await view(), before, 'all refused reads and accepts leave the model unchanged')
 await post('gauge/accept', { ...a, digest: preview.digest })
 const accepted = await view(); assert.equal(amount(accepted, '2026-01'), preview.amountCents); assert.equal(amount(accepted, '2026-02'), amount(before, '2026-02'))
 const trace = accepted.calculation.cells.find(c => c.line === line.id && c.month === '2026-01').sources[0].trace
 assert.match(trace, /operational utilization actuals at planned rate \(not ledger revenue\)/); assert.ok(trace.includes(preview.digest)); assert.match(trace, /360001 approved billable seconds/)
 assert.equal(accepted.calculation.cash[1].collections, preview.amountCents, 'operational amount follows entered one-month collection timing')
 const same = await post('gauge/preview', await args()); await post('gauge/accept', { ...await args(), digest: same.digest })
 assert.deepEqual(await view(), accepted, 'identical pull is idempotent even though Gauge asOf changes')
 await post('gauge/accept', { ...a, digest: preview.digest }, 409)
 await post('gauge/preview', await args(), 403, outsider)
 const board = await h.get(`/api/easel/scenario/${budget.id}`, viewer)
 assert.equal(board.inputs.revenue.length, 0); assert.ok(!JSON.stringify(board).includes('approvedBillableSeconds'))
 const outside = await h.get(`/api/easel/scenario/${budget.id}`, outsider); assert.equal(outside.inputs.revenue.length, 0)
 const r2 = await h.command('revenue', { ...b, name: 'Second agency driver' })
 await post('gauge/preview', { ...await args(), driver: r2.id }, 409)
 await post('gauge/undo', await args(), 409, h.owner) // later scenario change fences undo
 await h.command('input-delete', { kind: 'revenue', id: r2.id })
 billable = 720000
 const correction = await post('gauge/preview', await args()); await post('gauge/accept', { ...await args(), digest: correction.digest })
 assert.equal(amount(await view(), '2026-01'), 3000000)
 await post('gauge/undo', await args()); assert.equal(amount(await view(), '2026-01'), preview.amountCents)
 const corrected = await post('gauge/preview', await args()); await post('gauge/accept', { ...await args(), digest: corrected.digest })
 await h.command('revenue', { ...b, id: driver.id, hourlyRate: '175' })
 assert.equal(amount(await view(), '2026-01'), 3000000, 'accepted actuals retain reviewed planned rate after forecast assumption edit')
 const frozen = await h.command('approve-budget', { scenario: budget.id, revision: (await view()).scenario.revision })
 const snap = await h.get(`/api/easel/snapshot/${(await view()).scenario.approval.snapshot}`)
 const disconnected = await post('connections/gauge/disconnect', {})
 assert.equal(revokes, 1); assert.equal(revoked, true); assert.equal(disconnected.providerRevocation.status, 'confirmed'); assert.equal(disconnected.providerRevocation.httpStatus, 200); assert.equal(disconnected.error, null)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM e_connection_secrets').first()).n, 0)
 assert.equal(amount(await view(), '2026-01'), 3000000)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${snap.id}`), snap)
 await post('gauge/preview', { ...await args(), scenario: frozen.forecast.id, driver: (await h.get(`/api/easel/scenario/${frozen.forecast.id}`)).inputs.revenue[0].id, scenarioRevision: frozen.forecast.revision }, 409)
 const events = await h.get('/api/easel/activity')
 assert.ok(events.some(e => e.action === 'gauge-connected')); assert.ok(events.some(e => e.action === 'gauge-disconnected')); assert.ok(!JSON.stringify(events).includes(key))
 await post('connections/gauge/connect', { key })
 const archiveService = await createPortability({ db: h.db, policy: easelPolicy }), id = await archiveService.exports.create()
 try {
  while ((await archiveService.exports.advance(id, { maxParts: 16 })).phase === 'building') {}
  const archive = await new Response(await archiveService.exports.download(id)).text(), records = archive.trim().split('\n').map(JSON.parse)
  assert.ok(!records[0].tables.some(t => t.name === 'e_connection_secrets')); assert.ok(!archive.includes(key)); assert.ok(!archive.includes(stored.results[0].sealed))
 } finally { await archiveService.exports.abort(id) }
 for (const code of [503, 302]) {
  revokeStatus = code
  const failed = await post('connections/gauge/disconnect', {})
  assert.equal(failed.connected, false)
  assert.equal(failed.error, 'Gauge did not confirm revocation; revoke it in Gauge Access')
  assert.equal(failed.providerRevocation.status, 'not-confirmed'); assert.equal(failed.providerRevocation.httpStatus, code)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM e_connection_secrets').first()).n, 0, 'CONNECT-010 removes sealed key after refused or redirected provider call')
  assert.ok(!JSON.stringify(failed).includes(key))
  await post('connections/gauge/connect', { key })
 }
 provider.closeAllConnections(); await new Promise(r => provider.close(r))
 const unreachable = await post('connections/gauge/disconnect', {})
 assert.equal(unreachable.error, 'Gauge did not confirm revocation; revoke it in Gauge Access')
 assert.equal(unreachable.providerRevocation.httpStatus, null)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM e_connection_secrets').first()).n, 0, 'CONNECT-010 removes sealed key after network failure too')
 const outcomes = (await h.get('/api/easel/activity')).filter(e => e.action === 'gauge-disconnected').map(e => e.detail.providerRevocation)
 assert.deepEqual(outcomes.map(o => o.status).sort(), ['confirmed', 'not-confirmed', 'not-confirmed', 'not-confirmed'].sort())
 assert.ok(!JSON.stringify(outcomes).includes(key)); assert.ok(!JSON.stringify(outcomes).includes('privateProviderBody'))
 assert.deepEqual(await h.get(`/api/easel/snapshot/${snap.id}`), snap)
 const signedOut = await h.send('/auth/signout', {}, h.owner)
 assert.equal(signedOut.status, 204)
 await post('connections/gauge/connect', { key }, 401)
 await h.get('/api/easel/connections/gauge', h.owner, 401)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM e_connection_secrets').first()).n, 0, 'CONNECT-010 revoked native session cannot recreate custody')
 assert.ok(reads > 0)
})
