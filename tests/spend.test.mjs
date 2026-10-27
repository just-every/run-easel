import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { spendProvider, spendKeys, spendFixture } from './spend-fixture.mjs'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'

test('Reviewed Ramp cards and Purse POs replace one forecast assumption with exact nonduplicated department spend under native custody', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test' }, outbound: provider.outbound, now: () => '2026-02-15T12:00:00Z' }); t.after(() => h.close())
 const route = (...parts) => parts.join('/')
 const f = await spendFixture(h), post = async (path, body, status = 200, cookie = h.owner) => { const r = await h.send('/api/easel/' + path, body, cookie); assert.equal(r.status, status, r.text); return r.value }
 for (const p of ['ramp','purse']) {
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: false }, 400)
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: true })
 }
 const secrets = await h.db.prepare('SELECT sealed FROM e_connection_secrets').all()
 assert.equal(secrets.results.length, 2)
 for (const key of Object.values(spendKeys)) assert.ok(!JSON.stringify(secrets).includes(key), 'Stored credentials are sealed')
 const status = await h.get('/api/easel/connections/spend/ramp')
 assert.equal(status.suffix, '1001'); assert.equal(status.scope, 'transactions:read'); assert.equal(status.schedule, 'Manual'); assert.ok(!JSON.stringify(status).includes(spendKeys.ramp))
 assert.equal(status.owner, 'owner@example.test')
 const before = await h.get('/api/easel/scenario/' + f.forecast.id)
 const preview = await post(route('spend','preview'), f.input)
 assert.deepEqual([preview.budget, preview.committed, preview.actual, preview.remaining, preview.forecast], [100000,37975,12025,50000,50000], 'A linked card is actual once and reduces its PO commitment once')
 assert.deepEqual(preview.rows.map(r => `${r.provider}:${r.id}`), ['ramp:synthetic-easel-101','purse:synthetic-easel-102'])
 assert.deepEqual(await h.get('/api/easel/scenario/' + f.forecast.id), before, 'Preview writes no forecast data')
 assert.deepEqual(await h.get('/api/easel/spend'), [])
 const unlinked = await post(route('spend','preview'), { ...f.input, mapping: f.input.mapping.map(({ order, ...m }) => m) })
 assert.deepEqual([unlinked.actual,unlinked.committed,unlinked.remaining,unlinked.forecast], [12025,50000,37975,62025], 'An unlinked card remains separate spend rather than silently releasing a PO')
 await post(route('spend','preview'), { ...f.input, mapping: [] }, 400)
 await post(route('spend','preview'), { ...f.input, mapping: f.input.mapping.map(r => ({ ...r, department: 'synthetic-easel-999' })) }, 400)
 provider.state.card = 12125
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint }, 409)
 provider.state.card = 12025
 provider.state.po = 10000; await post(route('spend','preview'), f.input, 409); provider.state.po = 50000
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint })
 const accepted = await h.get('/api/easel/scenario/' + f.forecast.id)
 assert.equal(accepted.calculation.cells.find(c => c.line === f.line.id && c.department === f.department.id && c.month === '2026-01').amount, 50000, 'Accepted source replaces the 100000-cent assumption rather than adding to it')
 assert.equal(accepted.inputs.expense.length, 1)
 const refreshed = await h.get('/api/easel/connections/spend/ramp'); assert.equal(refreshed.rowCount, 1); assert.equal(refreshed.lastRefresh, '2026-02-15T12:00:00Z')
 assert.equal((await h.get('/api/easel/spend'))[0].forecastChanged, false)
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint }, 409)
 const again = { ...f.input, revision: accepted.scenario.revision }, p2 = await post(route('spend','preview'), again)
 await post(route('spend','accept'), { ...again, fingerprint: p2.fingerprint })
 assert.equal((await h.get('/api/easel/scenario/' + f.forecast.id)).calculation.cells.find(c => c.line === f.line.id && c.month === '2026-01').amount, 50000, 'Repeated reviews never duplicate sources')
 assert.equal((await h.get('/api/easel/scenario/' + f.budget.id)).calculation.cells.find(c => c.line === f.line.id && c.month === '2026-01').amount, 100000, 'Approved budget remains frozen')
 provider.state.next = 'https://untrusted.example.test/'; await post(route('spend','preview'), { ...again, revision: accepted.scenario.revision + 1 }, 502); provider.state.next = null
 provider.state.currency = 'EUR'; await post(route('spend','preview'), { ...again, revision: accepted.scenario.revision + 1 }, 409); provider.state.currency = 'USD'
 for (const code of [302,429,500]) {
  provider.state.status = code; await post(route('spend','sources'), { orders: f.input.orders, month: f.input.month }, 502)
  if (code === 429) assert.match((await h.get('/api/easel/connections/spend/ramp')).rateLimit, /rate limit/)
 }
 assert.match((await h.get('/api/easel/connections/spend/ramp')).error, /HTTP 500/)
 assert.ok(provider.state.calls.every(url => !url.includes('untrusted')), 'Neither redirects nor pagination can send a credential to another origin')
 provider.state.status = 200
 const planner = await h.person('synthetic-easel-201@example.test', 'contributor', [f.department.id])
 await post(route('spend','preview'), again, 403, planner)
 const reader = await h.person('synthetic-easel-200@example.test', 'viewer')
 await post(route('spend','preview'), again, 403, reader)
 await h.get('/api/easel/connections/spend/ramp', reader, 403)
 for (const cookie of [planner, reader]) for (const p of ['ramp','purse']) {
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: true }, 403, cookie)
  await post(route('connections','spend',p,'disconnect'), {}, 403, cookie)
 }
 await h.stepUp()
 const issued = await post(route('tokens','issue'), { label: 'Synthetic spend caller', kind: 'personal', scope: 'write', expiresInSeconds: 3600 })
 for (const path of [route('connections','spend','ramp'),'spend']) {
  const r = await h.mf.dispatchFetch(h.origin + '/api/easel/' + path, { headers: { authorization: `Bearer ${issued.token}` } }); assert.equal(r.status,403,'Finance API credentials cannot read native-only spend custody or source detail')
 }
 const tokenWrite = await h.mf.dispatchFetch(h.origin + '/api/easel/spend/accept', { method: 'POST', headers: { authorization: `Bearer ${issued.token}`, 'content-type': ['application','json'].join('/') }, body: JSON.stringify(again) }); assert.equal(tokenWrite.status,403)
 const tokenDisconnect = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/spend/ramp/disconnect', { method: 'POST', headers: { authorization: `Bearer ${issued.token}`, 'content-type': ['application','json'].join('/') }, body: '{}' }); assert.equal(tokenDisconnect.status,403)
 const cross = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/spend/ramp/disconnect', { method: 'POST', headers: { cookie: h.owner, origin: 'https://untrusted.example.test', 'content-type': ['application','json'].join('/') }, body: '{}' }); assert.equal(cross.status, 403)
 const archive = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } }); assert.equal(archive.status, 200)
 const { default: JSZip } = await import('jszip'), zip = await JSZip.loadAsync(await archive.arrayBuffer())
 for (const file of Object.values(zip.files).filter(f => !f.dir)) { const body = await file.async('string'); for (const key of Object.values(spendKeys)) assert.ok(!body.includes(key), 'Open archive excludes plaintext credentials'); for (const row of secrets.results) assert.ok(!body.includes(row.sealed), 'Open archive excludes sealed credentials') }
 const portable = await createPortability({ db: h.db, policy: easelPolicy }), archiveId = await portable.exports.create()
 try {
  while ((await portable.exports.advance(archiveId, { maxParts: 16 })).phase === 'building') {}
  const body = await new Response(await portable.exports.download(archiveId)).text(), records = body.trim().split('\n').map(JSON.parse)
  assert.ok(!records[0].tables.some(t => t.name === 'e_connection_secrets'))
  for (const key of Object.values(spendKeys)) assert.ok(!body.includes(key))
  for (const row of secrets.results) assert.ok(!body.includes(row.sealed))
 } finally { await portable.exports.abort(archiveId) }
 for (const p of ['ramp','purse']) { const disconnected = await post(route('connections','spend',p,'disconnect'), {}); assert.equal(disconnected.connected, false); assert.equal(disconnected.providerRevocation.status, 'unsupported'); assert.match(disconnected.ownerStep, /cannot confirm provider revocation/) }
 assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM e_connection_secrets').first()).n, 0)
 assert.equal((await h.get('/api/easel/spend')).length, 1, 'Disconnect retains accepted evidence')
 const activity = await h.get('/api/easel/activity'); assert.match(JSON.stringify(activity), /spend-connected/); assert.match(JSON.stringify(activity), /spend-disconnected/)
})
