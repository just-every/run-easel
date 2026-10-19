import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { harness } from './harness.mjs'
import { seedParallelMonth } from './parallel-month-fixture.mjs'

const sha = s => createHash('sha256').update(s).digest('hex')
const differences = v => v.rows.flatMap(r => r.differences)

test('MOVE-004 closed-month actual/budget/forecast comparison captures exactly mapping and formula differences and finance signs the exact classified content', async t => {
 const h = await harness(); t.after(() => h.close())
 const f = await seedParallelMonth(h.command, p => h.get(`/api/easel/${p}`), (op, b) => h.kit('actuals', op, b))
 const b = f.body
 const viewer = await h.person('board@example.test', 'viewer')
 const contributor = await h.person('planner@example.test', 'contributor', [f.department.id])
 const before = await h.db.prepare('SELECT count(*) AS n FROM e_records').first()
 const preview = await h.command('parallel-month-preview', b)
 assert.deepEqual(await h.db.prepare('SELECT count(*) AS n FROM e_records').first(), before, 'preview writes nothing')
 assert.equal(preview.source.sha256, sha(b.csv)); assert.equal(preview.source.csv, b.csv)
 assert.equal(preview.currency, 'USD'); assert.equal(preview.month, '2026-01')
 assert.deepEqual(preview.rows.find(r => r.line === f.revenue.id), {
  key: `${f.revenue.id}|${f.department.id}`, line: f.revenue.id, department: f.department.id, lineName: 'Services', departmentName: 'Consulting', actual: 90000, budget: 100000, forecast: 120000, oldActual: 95000, oldBudget: 100000, oldForecast: 120000,
  differences: [{ key: `${f.revenue.id}|${f.department.id}|actual`, measure: 'actual', easel: 90000, old: 95000, delta: -5000, classification: null }],
 })
 assert.equal(differences(preview).length, 2)
 const formula = differences(preview).find(d => d.measure === 'budget')
 assert.deepEqual(formula, { key: `${f.costs.id}|${f.department.id}|budget`, measure: 'budget', easel: 40000, old: 41000, delta: -1000, classification: null })
 const template = await h.send('/api/easel/parallel-month/template/2026-01.csv', undefined, h.owner)
 assert.equal(template.status, 200)
 const equal = await h.command('parallel-month-preview', { ...b, csv: template.text })
 assert.deepEqual(differences(equal), [])
 assert.equal(equal.rows.length, 2)
 for (const bad of [{ month: '2026-02' }, { month: 'invalid' }, { csv: b.csv + b.csv.split('\n')[1] + '\n' }, { csv: b.csv.replace(f.revenue.id, 'unknown') }, { csv: b.csv.replace(',950,', ',950.001,') }, { csv: b.csv.replace('forecast', 'other') }]) await h.command('parallel-month-preview', { ...b, ...bad }, h.owner, bad.month === '2026-02' ? 409 : bad.csv?.includes('unknown') ? 404 : 400)
 await h.command('parallel-month-save', { ...b, fingerprint: 'stale' }, h.owner, 409)
 assert.deepEqual(await h.get('/api/easel/parallel-month'), [])
 let saved = await h.command('parallel-month-save', { ...b, fingerprint: preview.sha256 })
 const url = `/api/easel/parallel-month/${saved.id}`
 assert.equal(saved.status, 'draft'); assert.equal(saved.sha256, preview.sha256)
 for (const cookie of [viewer, contributor]) {
  for (const op of ['parallel-month-preview', 'parallel-month-save', 'parallel-month-classify', 'parallel-month-sign']) await h.command(op, { ...b, id: saved.id, revision: saved.revision, sha256: saved.sha256, fingerprint: preview.sha256 }, cookie, 403)
  for (const path of ['/api/easel/parallel-month', url, '/api/easel/parallel-month/template/2026-01.csv']) await h.get(path, cookie, 403)
 }
 await h.command('parallel-month-sign', { id: saved.id, revision: saved.revision, sha256: saved.sha256 }, h.owner, 409)
 const initial = saved
 for (const d of differences(saved)) {
  const kind = d.measure === 'actual' ? 'mapping' : 'formula'
  saved = await h.command('parallel-month-classify', { id: saved.id, revision: saved.revision, key: d.key, kind, explanation: kind === 'mapping' ? 'Old tool includes a 50-dollar adjustment mapped to Services; checked the ledger.' : 'Old spreadsheet formula added a 10-dollar rounding constant; reviewed cell C12.' })
 }
 assert.deepEqual(differences(saved).map(d => d.classification.kind).sort(), ['formula', 'mapping'])
 assert.notEqual(saved.sha256, initial.sha256)
 await h.command('parallel-month-classify', { id: saved.id, revision: initial.revision, key: formula.key, kind: 'timing', explanation: 'Stale request' }, h.owner, 409)
 await h.command('parallel-month-classify', { id: saved.id, revision: saved.revision, key: formula.key, kind: 'other', explanation: 'Invalid' }, h.owner, 400)
 await h.command('parallel-month-classify', { id: saved.id, revision: saved.revision, key: formula.key, kind: 'formula', explanation: '' }, h.owner, 400)
 await h.command('parallel-month-sign', { id: saved.id, revision: saved.revision, sha256: initial.sha256 }, h.owner, 409)
 const signed = await h.command('parallel-month-sign', { id: saved.id, revision: saved.revision, sha256: saved.sha256 })
 assert.equal(signed.status, 'signed'); assert.equal(signed.signedBy, 'owner@example.test'); assert.ok(Date.parse(signed.signedAt)); assert.equal(signed.sha256, saved.sha256)
 assert.deepEqual(signed.rows, saved.rows)
 for (const op of ['parallel-month-sign', 'parallel-month-classify']) await h.command(op, { id: signed.id, revision: signed.revision, sha256: signed.sha256, key: formula.key, kind: 'timing', explanation: 'Change signed record' }, h.owner, 409)
 await h.command('revenue', { ...f.driver, scenario: f.forecast.id, id: f.input.id, rate: '999' })
 await h.command('workspace', { name: 'Later name', currency: 'AUD', fiscalYearStart: 1, planStart: '2026-01' })
 assert.deepEqual(await h.get(url), signed, 'later model/currency changes never alter the sign-off')
 assert.equal((await h.get('/api/easel/parallel-month?month=2026-01'))[0].signedBy, signed.signedBy)
 assert.deepEqual(await h.get('/api/easel/parallel-month?month=2026-02'), [])
 const events = await h.get(`/api/easel/activity?record=${signed.id}`)
 assert.ok(events.some(e => e.action === 'parallel-month-sign' && e.detail.sha256 === signed.sha256 && e.actor === signed.signedBy))
 // All four classifications are available; omissions on either side mean zero,
 // not a silently dropped nonzero line. A zero-difference month can be signed.
 for (const kind of ['timing', 'source-data']) {
  const p = await h.command('parallel-month-preview', b)
  let v = await h.command('parallel-month-save', { ...b, fingerprint: p.sha256 })
  for (const d of differences(v)) v = await h.command('parallel-month-classify', { id: v.id, revision: v.revision, key: d.key, kind, explanation: 'Finance reviewed the source and month boundary.' })
  assert.ok(differences(v).every(d => d.classification.kind === kind))
 }
 const matchedPreview = await h.command('parallel-month-preview', { ...b, csv: template.text })
 const matched = await h.command('parallel-month-save', { ...b, csv: template.text, fingerprint: matchedPreview.sha256 })
 assert.equal((await h.command('parallel-month-sign', { id: matched.id, revision: matched.revision, sha256: matched.sha256 })).status, 'signed')
 const forecastDifference = await h.command('parallel-month-preview', { ...b, csv: b.csv.replace(',1200', ',1201') })
 assert.deepEqual(differences(forecastDifference).find(d => d.measure === 'forecast'), { key: `${f.revenue.id}|${f.department.id}|forecast`, measure: 'forecast', easel: 120000, old: 120100, delta: -100, classification: null })
 const omitted = await h.command('parallel-month-preview', { ...b, csv: b.csv.split('\n').slice(0, 2).join('\n') + '\n' })
 assert.equal(differences(omitted).filter(d => d.key.startsWith(f.costs.id)).length, 3)
})
