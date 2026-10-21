// Required measured journey; deliberately outside push Verify's test glob.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { harness } from './harness.mjs'
import { smallBusinessModel } from './scale-fixtures.mjs'

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const run = `sx-easel-c37-model-scale-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}`
console.log(`SCALE_RUN ${run} candidate=${sha}`)
const h = await harness()
try {
 const { scenario, departments, lines, dimensions } = await smallBusinessModel(h)
 let first, firstBody, expected = 0
 for (let i = 0; i < 2000; i++) {
  const amount = 100 + i % 19
  const body = { scenario: scenario.id, name: `Vendor ${String(i + 1).padStart(4, '0')}`, kind: 'recurring', line: lines[i % 5].id, department: departments[Math.floor(i / 5) % 5].id, start: '2026-01', amount: String(amount),
   dimensions: Object.fromEntries(dimensions.map(({ dimension, members }, d) => [dimension.id, members[Math.floor(i / 5 ** d) % 5].id])) }
  const saved = await h.command('expense', body)
  expected += amount * 100
  if (i === 0) { first = saved; firstBody = body }
  if ((i + 1) % 200 === 0) console.log(`Scale fixture: ${i + 1}/2000 recurring input rows through HTTP`)
 }
 const viewer = await h.person('scale-reader@example.test', 'viewer')
 const initial = await h.get(`/api/easel/scenario/${scenario.id}`)
 assert.equal(initial.inputs.expense.length, 2000)
 assert.equal(initial.calculation.months.length, 36)
 assert.equal(initial.dimensionStructure.dimension.length, 5)
 assert.ok(initial.inputs.expense.every(e => Object.keys(e.dimensions).length === 5))
 assert.equal(initial.calculation.profit[35].operatingExpenses, expected)
 const elapsed = []
 for (let i = 1; i <= 50; i++) {
  const start = performance.now()
  await h.command('expense', { ...firstBody, id: first.id, amount: (100 + i / 100).toFixed(2) })
  const updated = await h.get(`/api/easel/scenario/${scenario.id}`, viewer)
  elapsed.push(performance.now() - start)
  assert.equal(updated.calculation.profit[0].operatingExpenses, expected + i)
  assert.equal(updated.calculation.profit[35].operatingExpenses, expected + i)
  assert.equal(updated.calculation.cells.reduce((sum, c) => sum + (c.month === '2028-12' ? c.amount : 0), 0), expected + i)
  if (i % 5 === 0) console.log(`Scale edits: ${i}/50; latest ${elapsed.at(-1).toFixed(1)} ms (save, exact structure effects and filtered recalculated read)`)
 }
 const sorted = [...elapsed].sort((a, b) => a - b), p95 = sorted[Math.ceil(sorted.length * .95) - 1]
 console.log(`SCALE_RESULT run=${run} candidate=${sha} rows=2000 dimensions=5 months=36 edits=50 p95_ms=${p95.toFixed(1)} max_ms=${sorted.at(-1).toFixed(1)}`)
 assert.ok(p95 < 2000, `Measured p95 ${p95.toFixed(1)} ms must meet the published two-second target`)
} finally { await h.close() }
