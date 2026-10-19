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
 // Every product and import-journal table travels; native auth/credential data does not.
 const { results: tables } = await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'e_*' OR name GLOB 'ik_*') AND name NOT IN ('e_api_tokens','e_api_limits','e_connection_secrets')").all()
 for (const {name} of tables) assert.ok(archive.file(`tables/${name}.csv`), name)
 assert.ok(!Object.keys(archive.files).some(name => /oa_|e_api_tokens|e_api_limits|e_connection_secrets/.test(name)))
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
