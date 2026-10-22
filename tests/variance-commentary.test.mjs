import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook } from './spreadsheet-proof.mjs'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'

test('AGENT-007 accepted citations stay in their visible variance and unconfirmed commentary never publishes', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Commentary sources', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const eng = await h.command('department', { name: 'Engineering' }), sales = await h.command('department', { name: 'Sales' })
 const cloud = await h.command('line', { name: 'Cloud', type: 'operating-expense' })
 const travel = await h.command('line', { name: 'Travel', type: 'operating-expense' })
 const salary = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const author = await h.person('engineering@example.test', 'contributor', [eng.id], false)
 const board = await h.person('board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('expense', { scenario: budget.id, name: 'Hosting plan', department: eng.id, line: cloud.id, kind: 'recurring', start: '2026-01', amount: '1000' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 for (const [account, target] of [['500', cloud.id], ['510', travel.id], ['600', salary.id]]) await h.command('account-map', { account, target })
 for (const dept of [eng, sales]) await h.command('department-map', { source: dept.name, department: dept.id })
 const body = { filename: 'source-rows.csv', csv: 'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,1300,Additional compute\n2026-01-31,500,Sales,2500,Sales infrastructure\n2026-01-31,510,Engineering,200,Conference travel\n2026-01-31,600,Engineering,7400,synthetic-private-payroll\n2026-02-28,500,Engineering,1600,February compute\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', body)
 await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
 for (const month of ['2026-01', '2026-02']) await h.command('close-month', { scenario: forecast.id, month })
 const january = await h.get('/api/easel/variance/2026-01')
 const row = january.rows.find(r => r.line === cloud.id && r.department === eng.id)
 assert.equal(row.actual, 130000); assert.equal(row.budget, 100000)
 assert.equal(row.citations[0].description, 'Additional compute')
 const id = row.citations[0].id
 assert.equal(typeof id, 'string'); assert.ok(id.length > 0)
 const february = await h.get('/api/easel/variance/2026-02')
 assert.equal((await h.get('/api/easel/variance/2026-01', author)).rows.find(r => r.key === row.key).citations[0].id, id)
 assert.ok((await h.get('/api/easel/variance/2026-01', board)).rows.every(r => r.citations.length === 0))
 const explanation = { month: '2026-01', line: cloud.id, department: eng.id, text: 'synthetic-unconfirmed-compute-hypothesis', citationIds: [id, id] }
 const saved = await h.command('explanation', explanation, author)
 assert.deepEqual(saved.citationIds, [id]); assert.equal(saved.status, 'draft')
 // The same refusal applies to invented rows and real rows in another scope.
 const invalid = ['synthetic-unknown-row', january.rows.find(r => r.department === sales.id).citations[0].id, january.rows.find(r => r.line === travel.id).citations[0].id, february.rows.find(r => r.line === cloud.id && r.department === eng.id).citations[0].id]
 const records = () => h.db.prepare('SELECT * FROM e_records ORDER BY kind,id').all().then(r => r.results)
 const before = await records()
 for (const citationId of invalid) await h.command('explanation', { ...explanation, citationIds: [citationId] }, author, 400)
 for (const citationIds of [null, 'synthetic-row', [12], [''], Array(101).fill(id)]) await h.command('explanation', { ...explanation, citationIds }, author, 400)
 await h.command('explanation', explanation, board, 403)
 await h.command('explanation', { ...explanation, line: salary.id, citationIds: [january.rows.find(r => r.line === salary.id).citations[0].id] }, author, 400)
 assert.deepEqual(await records(), before, 'Rejected commentary leaves every product record unchanged')
 // Non-detail readers retain commentary, but not its accepted-row identifiers.
 const restricted = (await h.get('/api/easel/variance/2026-01', board)).rows.find(r => r.key === row.key)
 assert.deepEqual(restricted.explanation.citationIds, [])
 // Public MCP clients use the same source checker and cannot confirm drafts.
 const mcp = async args => (await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'explanation', arguments: args } }, author)).value
 assert.equal((await mcp({ ...explanation, citationIds: ['synthetic-invented-model-row'] })).result.isError, true)
 assert.equal((await mcp({ ...explanation, citationIds: [id] })).result.isError, undefined)
 // A mapping change invalidates the saved citation before confirmation.
 await h.command('account-map', { account: '500', target: travel.id })
 const remapped = await records()
 await h.command('explanation-confirm', explanation, author, 400)
 assert.deepEqual(await records(), remapped)
 await h.command('account-map', { account: '500', target: cloud.id })
 const pack = await h.command('pack-create', { month: '2026-01' })
 const published = await h.command('pack-publish', { pack: pack.id })
 const frozen = await h.get(`/api/easel/snapshot/${published.snapshot}`, board)
 assert.equal(frozen.body.variances.find(r => r.line === 'Cloud' && r.department === 'Engineering').explanation, null)
 const documents = async (packId, excluded) => {
  for (const format of ['html', 'csv', 'xlsx']) {
   const response = await h.mf.dispatchFetch(h.origin + `/api/easel/pack/${packId}/document.${format}`, { headers: { cookie: board } })
   assert.equal(response.status, 200)
   const text = format === 'xlsx' ? JSON.stringify((await readWorkbook(await response.arrayBuffer())).worksheets.map(s => s.getSheetValues())) : await response.text()
   assert.ok(!text.includes(excluded), `${format} excludes unconfirmed narrative`)
  }
 }
 await documents(pack.id, explanation.text)
 // Confirmation does not retrofit an already published immutable pack.
 await h.command('explanation-confirm', explanation, author)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${published.snapshot}`, board), frozen)
 await documents(pack.id, explanation.text)
 const next = await h.command('pack-create', { month: '2026-01' })
 // Confirmation cannot authorize a later pack against differently mapped sources.
 await h.command('account-map', { account: '500', target: travel.id })
 const beforeRefusedPack = await records()
 await h.command('pack-publish', { pack: next.id }, h.owner, 409)
 assert.deepEqual(await records(), beforeRefusedPack)
 await h.command('account-map', { account: '500', target: cloud.id })
 const confirmed = await h.command('pack-publish', { pack: next.id })
 const confirmedSnapshot = await h.get(`/api/easel/snapshot/${confirmed.snapshot}`, board)
 const commentary = confirmedSnapshot.body.variances.find(r => r.line === 'Cloud' && r.department === 'Engineering').explanation
 assert.equal(commentary.text, explanation.text); assert.equal(commentary.status, 'confirmed')
 assert.deepEqual(commentary.citationIds, [id]); assert.equal(commentary.confirmedBy, 'engineering@example.test')
 const html = await h.send(`/api/easel/pack/${next.id}/document.html`, undefined, board)
 assert.ok(html.text.includes(explanation.text))
 // Human-written commentary remains supported without structured citations.
 const manual = await h.command('explanation', { ...explanation, text: 'Finance reviewed the cost change', citationIds: undefined })
 assert.deepEqual(manual.citationIds, []); assert.equal(manual.status, 'draft')
})

test('AGENT-007 opt-in model drafts reserve budget before one fixed-endpoint call and require human confirmation', async t => {
 let h, mode = 'valid', release, entered
 const calls = [], key = 'synthetic-easel-1'
 h = await harness({ outbound: async request => {
  assert.equal(request.url, 'https://api.openai.com/v1/responses')
  assert.equal(request.method, 'POST'); assert.equal(request.headers.get('authorization'), `Bearer ${key}`)
  const body = await request.json(), source = JSON.parse(body.input)
  calls.push(body)
  const pending = await h.db.prepare("SELECT value FROM e_records WHERE kind='commentary-run' AND json_extract(value,'$.status')='pending'").all()
  assert.equal(pending.results.length, 1, 'Durable intent exists before model egress')
  assert.ok(JSON.parse(pending.results[0].value).reserveMicroUsd > 0)
  assert.equal(body.store, false); assert.equal(body.tools, undefined)
  assert.ok(!JSON.stringify(body).includes('synthetic-private-payroll'))
  assert.ok(!JSON.stringify(body).includes(key))
  assert.ok(source.acceptedRows.every(row => row.description !== 'synthetic-other-department'))
  if (mode === 'held') { entered(); await new Promise(resolve => { release = resolve }) }
  if (mode === 'unknown') return Response.json({ status: 'incomplete', output: [] })
  const citationId = mode === 'invalid' ? 'synthetic-easel-unknown-row' : source.acceptedRows[0].id
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ claims: [
   { text: 'Accepted compute costs exceeded the approved plan.', label: 'evidence', citationIds: [citationId] },
   { text: 'Additional capacity might explain the change.', label: 'hypothesis', citationIds: [] },
  ] }) }] }] })
 } }); t.after(() => h.close())
 const post = async (path, body, cookie = h.owner, status = 200) => { const r = await h.send(`/api/easel/commentary/${path}`, body, cookie); assert.equal(r.status, status, r.text); return r.value }
 await h.command('workspace', { name: 'Model commentary', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const eng = await h.command('department', { name: 'Engineering' }), sales = await h.command('department', { name: 'Sales' })
 const cloud = await h.command('line', { name: 'Cloud', type: 'operating-expense' }), payroll = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const author = await h.person('commentary@example.test', 'contributor', [eng.id], false), viewer = await h.person('commentary-board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('expense', { scenario: budget.id, name: 'Cloud plan', line: cloud.id, department: eng.id, amount: '1000', kind: 'recurring', start: '2026-01' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 await h.command('account-map', { account: '500', target: cloud.id }); await h.command('account-map', { account: '600', target: payroll.id })
 for (const dept of [eng, sales]) await h.command('department-map', { source: dept.name, department: dept.id })
 const actuals = { filename: 'model-sources.csv', csv: 'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,1300,Additional compute\n2026-02-28,500,Engineering,1400,February compute\n2026-01-31,500,Sales,2000,synthetic-other-department\n2026-01-31,600,Engineering,7600,synthetic-private-payroll\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const imported = await h.kit('actuals', 'preview', actuals)
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: imported.fingerprint })
 for (const month of ['2026-01', '2026-02']) await h.command('close-month', { scenario: forecast.id, month })
 const scope = { month: '2026-01', line: cloud.id, department: eng.id }
 await post('preview', scope, author, 409)
 const config = { model: 'synthetic-easel-model', inputUsdPerMillion: '1', outputUsdPerMillion: '2', monthlyUsd: '1', enabled: true, consent: true }
 await post('settings/configure', config, author, 403)
 await post('settings/configure', { ...config, consent: false }, h.owner, 400)
 await post('settings/configure', config)
 await post('connection/connect', { key, consent: true })
 const sealed = (await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('model:variance-commentary').first()).sealed
 assert.ok(!sealed.includes(key))
 await post('preview', scope, author, 409)
 await post('settings/resume', {})
 await post('preview', scope, viewer, 403)
 await post('preview', { ...scope, line: payroll.id }, h.owner, 403)
 await post('preview', { ...scope, department: sales.id }, author, 403)
 const preview = await post('preview', scope, author)
 assert.deepEqual(calls, [], 'Preview never sends a model request')
 assert.equal(preview.request.model, config.model)
 const source = JSON.parse(preview.request.input)
 assert.equal(source.acceptedRows.length, 1); assert.equal(source.actual, 130000); assert.equal(source.budget, 100000)
 await post('generate', { ...scope, fingerprint: preview.fingerprint }, author, 400)
 assert.deepEqual(calls, [])
 const generated = await post('generate', { ...scope, fingerprint: preview.fingerprint, consent: true }, author)
 assert.equal(generated.status, 'draft'); assert.equal(calls.length, 1)
 assert.deepEqual(calls[0], preview.request, 'The network receives exactly the reviewed payload')
 const saved = (await h.get('/api/easel/variance/2026-01', author)).rows.find(r => r.line === cloud.id && r.department === eng.id).explanation
 assert.equal(saved.status, 'draft'); assert.equal(saved.agent, 'Variance commentary')
 assert.deepEqual(saved.citationIds, [source.acceptedRows[0].id]); assert.deepEqual(saved.claims.map(c => c.label), ['evidence', 'hypothesis'])
 const pack = await h.command('pack-create', { month: scope.month }), published = await h.command('pack-publish', { pack: pack.id })
 const frozen = await h.get(`/api/easel/snapshot/${published.snapshot}`)
 assert.equal(frozen.body.variances.find(r => r.line === 'Cloud' && r.department === 'Engineering').explanation, null)
 await post('generate', { ...scope, fingerprint: preview.fingerprint, consent: true }, author, 409)
 assert.equal(calls.length, 1, 'A consumed request cannot be silently retried')
 mode = 'invalid'
 const febScope = { ...scope, month: '2026-02' }, invalidPreview = await post('preview', febScope, author)
 const refused = await post('generate', { ...febScope, fingerprint: invalidPreview.fingerprint, consent: true }, author)
 assert.equal(refused.status, 'refused'); assert.equal(calls.length, 2)
 assert.equal((await h.get('/api/easel/variance/2026-02', author)).rows.find(r => r.line === cloud.id).explanation, null)
 // Fresh settings invalidate an already-shown request; no model call follows.
 const stale = await post('preview', scope, author)
 await post('settings/configure', config)
 await post('generate', { ...scope, fingerprint: stale.fingerprint, consent: true }, author, 409)
 assert.equal(calls.length, 2)
 mode = 'unknown'
 const unknownPreview = await post('preview', scope, author)
 const unknown = await post('generate', { ...scope, fingerprint: unknownPreview.fingerprint, consent: true }, author)
 assert.equal(unknown.status, 'unknown'); assert.equal(calls.length, 3)
 await post('generate', { ...scope, fingerprint: unknownPreview.fingerprint, consent: true }, author, 409)
 assert.equal(calls.length, 3)
 const reserved = (await h.get('/api/easel/commentary/status')).reservedMicroUsd
 assert.equal(reserved, preview.reserveMicroUsd + invalidPreview.reserveMicroUsd + unknownPreview.reserveMicroUsd)
 await post('settings/configure', { ...config, monthlyUsd: '0.000001' })
 const overBudget = await post('preview', scope, author)
 await post('generate', { ...scope, fingerprint: overBudget.fingerprint, consent: true }, author, 409)
 assert.equal(calls.length, 3)
 await post('settings/configure', config)
 mode = 'held'
 const stoppedPreview = await post('preview', scope, author)
 const atProvider = new Promise(resolve => { entered = resolve })
 const running = post('generate', { ...scope, fingerprint: stoppedPreview.fingerprint, consent: true }, author)
 await atProvider
 await post('settings/stop', {})
 release()
 assert.equal((await running).status, 'refused', 'A stop while the model runs prevents acceptance of its draft')
 assert.deepEqual((await h.get('/api/easel/variance/2026-01', author)).rows.find(r => r.line === cloud.id && r.department === eng.id).explanation, saved)
 await post('preview', scope, author, 409)
 assert.equal(calls.length, 4)
 const events = await h.get('/api/easel/activity')
 assert.ok(events.some(e => e.action === 'commentary-model-intent' && e.actor === 'commentary@example.test' && e.detail.model === config.model && e.detail.reserveMicroUsd > 0))
 assert.ok(events.some(e => e.action === 'commentary-model-outcome' && e.detail.status === 'unknown'))
 assert.ok(!JSON.stringify(events).includes(key)); assert.ok(!JSON.stringify(await h.get('/api/easel/state')).includes(key))
 const archiveService = await createPortability({ db: h.db, policy: easelPolicy }), archiveId = await archiveService.exports.create()
 try {
  while ((await archiveService.exports.advance(archiveId, { maxParts: 16 })).phase === 'building') {}
  const archive = await new Response(await archiveService.exports.download(archiveId)).text()
  assert.ok(!JSON.parse(archive.split('\n')[0]).tables.some(table => table.name === 'e_connection_secrets'))
  assert.ok(!archive.includes(key)); assert.ok(!archive.includes(sealed))
 } finally { await archiveService.exports.abort(archiveId) }
 await h.command('explanation-confirm', scope, author)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${published.snapshot}`), frozen)
})
