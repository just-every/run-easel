import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { exportFixture } from './export-fixture.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

test('PORT-001 finance opens the complete plan export with verified digests, original bytes and scenario formulas', async t => {
 const h = await harness(); t.after(() => h.close())
 const f = await exportFixture(h)
 const download = async (cookie = h.owner) => h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: {cookie} })
 assert.equal((await download('')).status, 401)
 const board = await h.person('board@example.test', 'viewer')
 assert.equal((await download(board)).status, 403)
 const response = await download()
 assert.equal(response.status, 200)
 assert.match(response.headers.get('content-type'), /application\/zip/)
 const archive = await JSZip.loadAsync(await response.arrayBuffer(), { checkCRC32: true })
 const manifest = JSON.parse(await archive.file('manifest.json').async('string'))
 assert.equal(manifest.files.length + 1, Object.keys(archive.files).length)
 for (const file of manifest.files) {
  const bytes = await archive.file(file.path).async('uint8array')
  assert.equal(bytes.length, file.size, file.path)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
 }
 const model = JSON.parse(await archive.file('model.json').async('string'))
 const state = await h.get('/api/easel/state')
 assert.equal(model.workspace.name, state.workspace.name)
 assert.equal(model.records.length, Number((await h.db.prepare('SELECT COUNT(*) AS n FROM e_records').first()).n))
 // Every product and import-journal table travels; native auth, credentials, calculation receipts and the installation erasure key do not.
 const { results: tables } = await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'e_*' OR name GLOB 'ik_*') AND name NOT IN ('e_api_tokens','e_api_limits','e_connection_secrets','e_erasure_key','e_calculation_jobs','e_calculation_job_chunks')").all()
 for (const {name} of tables) assert.ok(archive.file(`tables/${name}.csv`), name)
 assert.ok(!Object.keys(archive.files).some(name => /oa_|e_api_tokens|e_api_limits|e_connection_secrets|e_erasure_key|e_calculation_job/.test(name)))
 const originals = manifest.originals.filter(o => o.status === 'retained')
 assert.ok(originals.length)
 assert.ok((await Promise.all(originals.map(o => archive.file(o.path).async('string')))).includes(f.body.csv), 'Original accepted ledger bytes are exact')
 for (const sn of state.snapshots) {
  const saved = JSON.parse(await archive.file(`snapshots/${sn.id}.json`).async('string'))
  assert.deepEqual(saved, await h.get(`/api/easel/snapshot/${sn.id}`))
 }
 for (const sc of state.scenarios) {
  const entry = manifest.files.find(file => file.path.startsWith('scenarios/') && file.path.endsWith(`-${sc.id}.xlsx`))
  assert.ok(entry)
  const book = await readWorkbook(await archive.file(entry.path).async('uint8array')); proveFormulas(book)
  const view = await h.get(`/api/easel/scenario/${sc.id}`), pnl = book.getWorksheet('Profit and loss')
  for (let i = 0; i < view.calculation.months.length; i++) assert.equal(evaluate(pnl, pnl.getRow(pnl.rowCount).getCell(i + 2).address), view.calculation.profit[i].profit)
 }
})

test("The open export leaves out stored calculation responses from other people's private work", async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const author = await h.person('sales@example.test', 'contributor', [sales.id])
 const sandbox = await h.command('sandbox-create', { from: budget.id, name: 'Private hiring case' }, author)
 const { operator } = await h.get('/auth/session', author)
 // A finished background command's response, stored for its initiating person as calculation jobs keep it.
 const job = 'synthetic-easel-1', at = new Date().toISOString()
 await h.db.batch([
  h.db.prepare("INSERT INTO e_calculation_jobs(id,actor_id,authority_digest,scenarios,source_revision,status,started_at,deadline_at,completed_at,response_status,result_chunks) VALUES(?,?,?,?,1,'completed',?,?,?,200,1)").bind(job, operator.id, 'synthetic-easel-2', JSON.stringify([sandbox.id]), at, Date.now() + 120000, at),
  h.db.prepare('INSERT INTO e_calculation_job_chunks(job_id,ordinal,body) VALUES(?,0,?)').bind(job, JSON.stringify({ title: 'Private hire', holder: 'Sandbox Private Holder', annualSalary: 13579100 })),
 ])
 const response = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } })
 assert.equal(response.status, 200)
 const archive = await JSZip.loadAsync(await response.arrayBuffer())
 const text = (await Promise.all(Object.values(archive.files).filter(f => !f.dir).map(f => f.async('string')))).join('\n')
 assert.doesNotMatch(text, /Sandbox Private Holder|13579100/)
 assert.ok(!text.includes(sandbox.id), 'The hidden sandbox is not referenced anywhere in the archive')
})
