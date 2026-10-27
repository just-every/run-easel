import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readWorkbook } from './spreadsheet-proof.mjs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness } from './harness.mjs'

// Only the external Gauge network edge is faked; Easel uses real auth/D1/Worker.
test('REV-003 CONNECT-010 reviewed Gauge agency utilization, sealed custody, source changes, undo, authority and frozen values', async t => {
 const key = `gauge_util_${randomBytes(32).toString('base64url')}`
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
  assert.equal(req.method, 'GET'); assert.ok(['2026-01-01', '2026-02-01'].includes(url.searchParams.get('from')))
  const expectedTo = url.searchParams.get('from') === '2026-01-01' ? '2026-01-31' : '2026-02-28'
  assert.equal(url.searchParams.get('to'), expectedTo, 'Gauge reads the complete inclusive calendar month')
  reads++
  const respond = () => {
   res.writeHead(status, { 'content-type': 'application/json', ...(status === 429 ? { 'retry-after': '120' } : {}) })
   res.end(JSON.stringify({ scope: 'utilization:read', from: wrongPeriod ? '2026-02-01' : url.searchParams.get('from'), to: expectedTo, participantCount: 3, availableSeconds: missing ? null : 1728000, knownAvailableSeconds: missing ? 10000 : 1728000, missingCalendarDays: missing ? 1 : 0, approvedBillableSeconds: billable, asOf: now, personName: 'Provider private sentinel' }))
  }
  if (holdReads) { pendingReads.push(respond); if (pendingReads.length === 2) pendingReads.splice(0).forEach(release => release()) }
  else respond()
 })
 provider.listen(0, '127.0.0.1'); await once(provider, 'listening'); t.after(() => new Promise(r => provider.close(r)))
 let now = '2026-03-07T08:05:00.000Z'
 const h = await harness({ now: () => now, bindings: { GAUGE_ORIGIN: `HTTP://127.0.0.1:${provider.address().port}/` } }); t.after(() => h.close())
 await h.command('workspace', { name: 'Cardinal Advisory', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await h.command('department', { name: 'Advisory' }), other = await h.command('department', { name: 'Engineering' })
 const line = await h.command('line', { name: 'Services', type: 'revenue' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const b = { scenario: budget.id, kind: 'services', name: 'Agency services', line: line.id, department: dept.id, start: '2026-01', collectionLag: 1, monthlyHours: '160', utilizationPercent: '75', hourlyRate: '150' }
 const region = await h.command('dimension', { name: 'Region' })
 const east = await h.command('dimension-member', { dimension: region.id, name: 'East' })
 const west = await h.command('dimension-member', { dimension: region.id, name: 'West' })
 b.dimensions = { [region.id]: east.id }
 const driver = await h.command('revenue', b)
 const viewer = await h.person('board@example.test', 'viewer'), outsider = await h.person('engineering@example.test', 'contributor', [other.id])
 const post = async (path, body, code = 200, cookie = h.owner) => { const r = await h.send(path.startsWith('/') ? path : `/api/easel/${path}`, body, cookie); assert.equal(r.status, code, r.text); return r.value }
 const view = () => h.get(`/api/easel/scenario/${budget.id}`)
 const args = async () => ({ scenario: budget.id, driver: driver.id, month: '2026-01', scenarioRevision: (await view()).scenario.revision })
 const amount = (v, month) => v.calculation.cells.find(c => c.line === line.id && c.month === month).amount
 await post('connections/gauge/connect', { key }, 403, outsider)
 await h.get('/api/easel/connections/gauge', viewer, 403)
 await post('connections/gauge/connect', { key: 'session-cookie' }, 400)
 const connected = await post('connections/gauge/connect', { key })
 await post('connections/gauge/check', { month: '2026-01' }, 403, outsider)
 assert.equal(connected.suffix, key.slice(-4)); assert.equal(connected.schedule, 'Manual'); assert.equal(connected.lastRefresh, null)
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
 // Scheduled observations use the same native connection door and never accept model changes.
 const scheduleBody = { cadence: 'nightly', month: '2026-01', consent: true }
 await post('connections/gauge/schedule', { ...scheduleBody, consent: false }, 400)
 await post('connections/gauge/schedule', scheduleBody, 403, outsider)
 await post('connections/gauge/schedule', scheduleBody)
 const run = async at => { now = at; await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' }) }
 const baseReads = reads, beforeSchedule = await view()
 await run('2026-03-08T06:59:00.000Z'); assert.equal(reads, baseReads)
 await run('2026-03-08T07:05:00.000Z')
 let scheduled = await h.get('/api/easel/connections/gauge')
 assert.equal(reads, baseReads + 1); assert.equal(scheduled.scheduledAt, '2026-03-08T07:00:00.000Z')
 assert.equal(scheduled.dispatchedAt, now); assert.equal(scheduled.scheduleZone, ['America', 'New_York'].join('/')); assert.equal(scheduled.stale, false)
 const observation = scheduled.observation, successful = scheduled.lastRefresh
 await run('2026-03-08T07:20:00.000Z'); assert.equal(reads, baseReads + 1)
 status = 503
 const mailBefore = h.messages.length
 await run('2026-03-09T07:05:00.000Z')
 scheduled = await h.get('/api/easel/connections/gauge')
 assert.equal(scheduled.stale, true); assert.match(scheduled.error, /HTTP 503/)
 assert.equal(scheduled.lastRefresh, successful); assert.deepEqual(scheduled.observation, observation)
 let notices = (await h.get('/api/easel/notifications')).notifications.filter(n => n.event === 'refresh-failed' && n.createdAt === now)
 assert.equal(notices.length, 1); assert.equal(notices[0].status, 'accepted')
 const mail = h.messages.slice(mailBefore).filter(m => m.to.includes('owner@example.test'))
 assert.equal(mail.length, 1); assert.match(mail[0].text, /Gauge/); assert.match(mail[0].text, /HTTP 503/); assert.match(mail[0].text, /tab=settings&record=gauge/)
 await run('2026-03-09T07:20:00.000Z'); assert.equal(h.messages.length, mailBefore + 1)
 assert.deepEqual(await view(), beforeSchedule)
 status = 200
 await run('2026-03-10T07:05:00.000Z')
 assert.equal((await h.get('/api/easel/connections/gauge')).stale, false)
 now = '2026-03-11T08:10:00.000Z'
 assert.equal((await h.get('/api/easel/connections/gauge')).stale, true, 'Past the nightly schedule tolerance, an old observation is stale')
 await post('connections/gauge/schedule', { cadence: 'hourly', month: '2026-01', consent: true })
 const hourlyReads = reads
 await run('2026-03-11T09:05:00.000Z'); await run('2026-03-11T09:20:00.000Z'); assert.equal(reads, hourlyReads + 1)
 await post('connections/gauge/schedule', { cadence: 'weekly', month: '2026-01', consent: true })
 const weeklyReads = reads
 await run('2026-03-15T12:00:00.000Z'); assert.equal(reads, weeklyReads)
 await run('2026-03-16T07:05:00.000Z'); assert.equal(reads, weeklyReads + 1)
 await post('connections/gauge/schedule', { cadence: 'manual', month: '2026-01' })
 await run('2026-03-17T12:00:00.000Z'); assert.equal(reads, weeklyReads + 1)
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
 now = '2026-03-17T12:01:00.000Z'
 const same = await post('gauge/preview', await args()); await post('gauge/accept', { ...await args(), digest: same.digest })
 const unchanged = await view()
 assert.deepEqual(unchanged.inputs, accepted.inputs); assert.deepEqual(unchanged.scenario, accepted.scenario)
 assert.deepEqual(unchanged.calculation, accepted.calculation, 'An identical pull keeps model values and accepted provenance')
 assert.equal(unchanged.gaugeFreshness[0].lastSuccess, now)
 assert.equal(unchanged.gaugeFreshness[0].acceptedAt, accepted.gaugeFreshness[0].acceptedAt)
 assert.equal(unchanged.gaugeFreshness[0].acceptedObservedAt, accepted.gaugeFreshness[0].acceptedObservedAt)
 assert.equal(unchanged.gaugeFreshness[0].observedAt, now)
 assert.equal(unchanged.gaugeFreshness[0].observationStatus, 'matches-accepted')
 await post('gauge/accept', { ...a, digest: preview.digest }, 409)
 await post('gauge/preview', await args(), 403, outsider)
 const board = await h.get(`/api/easel/scenario/${budget.id}`, viewer)
 assert.equal(board.inputs.revenue.length, 0); assert.ok(!JSON.stringify(board).includes('approvedBillableSeconds'))
 const outside = await h.get(`/api/easel/scenario/${budget.id}`, outsider); assert.equal(outside.inputs.revenue.length, 0)
 // Consuming reads retain accepted provenance while scheduled observations evolve.
 const report = await h.command('report-save', { name: 'Gauge source report', scenario: budget.id, department: dept.id, audience: 'board', report: { row: 'line', period: 'month', through: '2026-01', lines: [line.id] } })
 const reportPath = `/api/easel/dashboards/${report.id}/report`
 const dashboardPath = `/api/easel/dashboards/${report.id}`
 const acceptedAt = accepted.inputs.revenue[0].gaugeActuals['2026-01'].acceptedAt
 const freshness = (await view()).gaugeFreshness
 assert.equal(freshness.length, 1); assert.equal(freshness[0].acceptedDigest, preview.digest)
 assert.equal(freshness[0].acceptedAt, acceptedAt); assert.equal(freshness[0].observationStatus, 'matches-accepted')
 await post('/api/easel/connections/gauge/schedule', { cadence: 'hourly', month: '2026-01', consent: true })
 billable = 540000
 await run('2026-03-17T13:05:00.000Z')
 const lastSuccess = now
 for (const path of [`/api/easel/scenario/${budget.id}`, dashboardPath, reportPath]) {
  const read = await h.get(path), rows = read.gaugeFreshness
  assert.equal(rows.length, 1); assert.equal(rows[0].stale, false)
  assert.equal(rows[0].lastSuccess, lastSuccess); assert.equal(rows[0].acceptedAt, acceptedAt)
  assert.equal(rows[0].acceptedDigest, preview.digest); assert.equal(rows[0].observationStatus, 'changed-since-acceptance')
 }
 assert.equal(amount(await view(), '2026-01'), 1500004)
 status = 503
 await run('2026-03-17T14:05:00.000Z')
 for (const path of [`/api/easel/scenario/${budget.id}`, dashboardPath, reportPath]) {
  const rows = (await h.get(path)).gaugeFreshness
  assert.equal(rows.length, 1); assert.equal(rows[0].stale, true); assert.match(rows[0].error, /HTTP 503/)
  assert.equal(rows[0].lastSuccess, lastSuccess); assert.equal(rows[0].acceptedDigest, preview.digest)
 }
 status = 200
 await post('/api/easel/connections/gauge/check', { month: '2026-02' })
 const january = (await view()).gaugeFreshness[0]
 assert.equal(january.lastSuccess, lastSuccess); assert.match(january.error, /HTTP 503/, 'Another month cannot clear this month failure')
 await post('connections/gauge/schedule', { cadence: 'hourly', month: '2026-03', consent: true })
 const unobserved = await h.get('/api/easel/connections/gauge')
 assert.equal(unobserved.checkedMonth, '2026-03'); assert.equal(unobserved.stale, true)
 for (const field of ['lastRefresh', 'observedAt', 'observation', 'lastChecked', 'error', 'rateLimit']) assert.equal(unobserved[field], null, `${field} belongs to the selected unobserved month`)
 assert.equal(unobserved.rowCount, 0)
 await post('connections/gauge/schedule', { cadence: 'hourly', month: '2026-01', consent: true })
 const restored = await h.get('/api/easel/connections/gauge')
 assert.equal(restored.lastRefresh, lastSuccess); assert.match(restored.error, /HTTP 503/)
 assert.equal(amount(await view(), '2026-01'), 1500004)
 const visible = (await h.get(reportPath, viewer)).gaugeFreshness
 assert.equal(visible.length, 1); assert.equal(visible[0].stale, true)
 assert.ok(!JSON.stringify(visible).includes(preview.digest)); assert.ok(!JSON.stringify(visible).includes('Agency services'))
 assert.ok(!JSON.stringify(visible).includes('approvedBillableSeconds'))
 const outsideHealth = (await h.get(`/api/easel/scenario/${budget.id}`, outsider)).gaugeFreshness
 assert.deepEqual(outsideHealth, [], 'An unrelated department receives no source provenance')
 const advisory = await h.person('advisory@example.test', 'contributor', [dept.id])
 assert.equal((await h.get(`/api/easel/scenario/${budget.id}`, advisory)).gaugeFreshness[0].acceptedDigest, preview.digest)
 const workbook = async (path, cookie = h.owner) => {
  const r = await h.mf.dispatchFetch(h.origin + path, { headers: { cookie } })
  assert.equal(r.status, 200, await r.clone().text()); return readWorkbook(await r.arrayBuffer())
 }
 for (const path of [`/api/easel/scenario/${budget.id}/document.xlsx`, `${dashboardPath}/document.xlsx`, `${reportPath}.xlsx`]) {
  const book = await workbook(path), row = book.getWorksheet('Gauge freshness').getRow(3).values
  assert.equal(row[2], '2026-01'); assert.equal(row[4], lastSuccess); assert.equal(row[6], 'Stale')
  assert.match(row[7], /HTTP 503/); assert.equal(row[8], acceptedAt); assert.equal(row[9], accepted.gaugeFreshness[0].acceptedObservedAt); assert.equal(row[10], preview.digest); assert.equal(row[11], 'changed-since-acceptance')
 }
 const aggregateSheet = (await workbook(`${dashboardPath}/document.xlsx`, viewer)).getWorksheet('Gauge freshness')
 assert.equal(aggregateSheet.rowCount, 3); assert.equal(aggregateSheet.getCell('D3').value, lastSuccess)
 assert.match(aggregateSheet.getCell('G3').value, /HTTP 503/)
 assert.equal(aggregateSheet.getCell('J3').value, null, 'Aggregate-only download omits the accepted digest')
 const restrictBoard = member => h.command('member', { email: 'board@example.test', name: 'Board', role: 'viewer', departments: [], dimensionMembers: { [region.id]: [member] } })
 await restrictBoard(west.id)
 for (const path of [dashboardPath, reportPath]) assert.deepEqual((await h.get(path, viewer)).gaugeFreshness, [], 'A different dimension cannot read source metadata')
 const excludedBook = await workbook(`${dashboardPath}/document.xlsx`, viewer)
 assert.equal(excludedBook.getWorksheet('Gauge freshness').rowCount, 2, 'Download applies the current dimension grant')
 assert.equal(excludedBook.getWorksheet('Dashboard').lastRow.getCell(5).value, null, 'Unavailable scoped headcount has no fabricated ending balance')
 await restrictBoard(east.id)
 for (const path of [dashboardPath, reportPath]) {
  const rows = (await h.get(path, viewer)).gaugeFreshness
  assert.equal(rows.length, 1); assert.equal(rows[0].lastSuccess, lastSuccess); assert.equal(rows[0].acceptedDigest, undefined)
 }
 assert.equal((await workbook(`${dashboardPath}/document.xlsx`, viewer)).getWorksheet('Gauge freshness').rowCount, 3)
 await h.command('member', { email: 'board@example.test', name: 'Board', role: 'viewer', departments: [], active: false })
 await h.get(reportPath, viewer, 404)
 await h.get(`${dashboardPath}/document.xlsx`, viewer, 403)
 const csv = await h.get(`/api/easel/scenario/${budget.id}/document.csv`)
 assert.ok(csv.includes(lastSuccess)); assert.ok(csv.includes(preview.digest)); assert.ok(csv.includes('HTTP 503'))
 await post('/api/easel/connections/gauge/check', { month: '2026-01' })
 now = '2026-03-17T15:06:00.000Z'
 assert.equal((await view()).gaugeFreshness[0].stale, true, 'Hourly source becomes stale without changing its accepted value')
 billable = 360001
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
 await h.command('account-map', { account: '400', target: line.id })
 await h.command('department-map', { source: 'Advisory', department: dept.id })
 const actuals = { filename: 'synthetic-easel-1.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Advisory,-240\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const staged = await h.kit('actuals', 'preview', actuals)
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: staged.fingerprint })
 await h.command('close-month', { scenario: frozen.forecast.id, month: '2026-01' })
 const review = await h.get('/api/easel/variance/2026-01')
 assert.deepEqual(review.gaugeFreshness.map(row => row.version), ['Approved budget', 'Prior forecast']); assert.equal(review.gaugeFreshness[0].acceptedDigest, corrected.digest)
 const pack = await h.command('pack-create', { month: '2026-01' })
 const published = await h.command('pack-publish', { pack: pack.id })
 const capture = await h.get(`/api/easel/snapshot/${published.snapshot}`)
 const beforeObservation = (await view()).calculation
 billable = 900000; status = 503
 await run('2026-03-17T16:05:00.000Z')
 assert.match((await h.get('/api/easel/variance/2026-01')).gaugeFreshness[0].error, /HTTP 503/)
 assert.deepEqual((await view()).calculation, beforeObservation)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${published.snapshot}`), capture)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${snap.id}`), snap)
 const reviewBook = await workbook('/api/easel/variance/2026-01/document.xlsx')
 assert.match(reviewBook.getWorksheet('Gauge freshness').getCell('G3').value, /HTTP 503/)
 status = 200

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
