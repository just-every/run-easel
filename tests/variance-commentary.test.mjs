import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook } from './spreadsheet-proof.mjs'

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
