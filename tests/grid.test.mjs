import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { acceptHistory, historyFile } from './history-fixture.mjs'

test('MODEL-008: exact grid operations, preview, split custody, revisions, traces and undo through HTTP', async () => {
 const h = await harness()
 try {
  await h.command('workspace', { name: 'Ridgeline Planning', currency: 'USD', fiscalYearStart: 1, planStart: '2025-01' })
  const sales = await h.command('department', { name: 'Sales' }), other = await h.command('department', { name: 'Delivery' })
  const lines = []
  for (const name of ['Software', 'Travel', 'Events', 'Driver']) lines.push(await h.command('line', { name, type: 'operating-expense' }))
  const scenario = (await h.get('/api/easel/state')).scenarios[0].id
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)
  const rows = []
  for (let i = 0; i < 3; i++) rows.push(await h.command('schedule', { scenario, name: `Plan ${i + 1}`, line: lines[i].id, department: sales.id, values: Object.fromEntries(months.map(m => [m, '0'])) }))
  const foreign = await h.command('schedule', { scenario, name: 'Delivery costs', line: lines[0].id, department: other.id, values: { [months[0]]: '321' } })
  const driverRow = await h.command('schedule', { scenario, name: 'Driver cell', line: lines[3].id, department: sales.id, values: { [months[0]]: '0' } })
  await h.command('expense', { scenario, name: 'Calculated cost', line: lines[3].id, department: sales.id, start: months[0], kind: 'recurring', amount: '19' })
  const contributor = await h.person('sales@example.test', 'contributor', [sales.id])
  const outsider = await h.person('delivery@example.test', 'contributor', [other.id]), viewer = await h.person('board@example.test', 'viewer')
  await h.command('request-submissions', { scenario, departments: [sales.id] })
  const view = cookie => h.get(`/api/easel/scenario/${scenario}`, cookie)
  const cell = (row, index) => ({ schedule: row.id, month: months[index] })
  const values = v => v.inputs.schedule.find(r => r.id === rows[0].id).values
  const save = async body => {
   const v = await view(contributor), request = { scenario, revision: v.scenario.revision, ...body }
   const before = await view(contributor)
   const preview = await h.command('grid-preview', request, contributor)
   assert.deepEqual(preview.refused, [])
   assert.deepEqual(await view(contributor), before, 'preview writes nothing')
   await h.command('grid-save', { ...request, fingerprint: preview.fingerprint }, contributor)
   return { preview, request, before }
  }
  const pasted = rows.flatMap((r, i) => months.map((m, j) => ({ schedule: r.id, month: m, value: String((i + 1) * 100 + j), address: `${String.fromCharCode(66 + j)}${i + 2}` })))
  await save({ changes: pasted })
  let v = await view(contributor)
  for (const [i, row] of rows.entries()) assert.deepEqual(v.inputs.schedule.find(r => r.id === row.id).values, Object.fromEntries(months.map((m, j) => [m, ((i + 1) * 100 + j) * 100])))
  await save({ operation: 'even', cells: months.map((_, i) => cell(rows[0], i)), amount: '120000' })
  assert.deepEqual(Object.values(values(await view(contributor))), months.map(() => 1000000))
  await h.command('account-map', { account: '500', target: lines[0].id })
  await h.command('department-map', { source: 'Sales', department: sales.id })
  const history = historyFile('prior.csv', months.map((m, i) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}-15,500,Sales,${i + 1},Prior ${i + 1}`))
  await acceptHistory(h.kit, history)
  await save({ operation: 'prior-year', cells: months.map((_, i) => cell(rows[0], i)), amount: '120000' })
  v = await view(contributor)
  const spread = Object.values(values(v)); assert.equal(spread.reduce((a, b) => a + b, 0), 12000000)
  // Largest remainders over weights 1..12; no implementation-derived expectations.
  assert.deepEqual(spread, [153846,307692,461538,615385,769231,923077,1076923,1230769,1384615,1538462,1692308,1846154])
  await save({ changes: [0, 1, 2].map(i => ({ ...cell(rows[0], i), value: String((i + 1) * 1000) })) })
  await save({ operation: 'proportional', cells: [0, 1, 2].map(i => cell(rows[0], i)), amount: '60000' })
  v = await view(contributor); assert.deepEqual(months.slice(0, 3).map(m => values(v)[m]), [1000000,2000000,3000000])
  await save({ operation: 'percent', cells: [0, 1, 2].map(i => cell(rows[0], i)), percent: '10' })
  await save({ operation: 'amount', cells: [0, 1, 2].map(i => cell(rows[0], i)), amount: '-500' })
  v = await view(contributor); assert.deepEqual(months.slice(0, 3).map(m => values(v)[m]), [1050000,2150000,3250000])
  await save({ operation: 'copy', cells: [3, 4].map(i => cell(rows[0], i)), value: '10500' })
  v = await view(contributor); assert.deepEqual(months.slice(3, 5).map(m => values(v)[m]), [1050000,1050000])
  const split = await save({ changes: [{ ...cell(rows[0], 0), subrows: [{ name: 'Private vendor Aspen', amount: '6000' }, { name: 'Private vendor Birch', amount: '4500' }], note: 'Annual renewal reviewed' }] })
  v = await view(contributor)
  const source = v.calculation.cells.find(c => c.line === lines[0].id && c.department === sales.id && c.month === months[0]).sources[0]
  assert.equal(source.amount, 1050000); assert.match(source.trace, /Private vendor Aspen/); assert.match(source.trace, /Annual renewal reviewed/)
  assert.match(source.trace, new RegExp(`cell revision ${v.scenario.revision}`))
  for (const cookie of [outsider, viewer]) {
   const filtered = await view(cookie)
   assert.equal(filtered.calculation.cells.find(c => c.line === lines[0].id && c.department === sales.id && c.month === months[0]).amount, 1050000)
   assert.doesNotMatch(JSON.stringify(filtered), /Private vendor|Annual renewal reviewed/)
   const workbook = await h.mf.dispatchFetch(`${h.origin}/api/easel/scenario/${scenario}/document.xlsx`, { headers: { cookie } })
   assert.equal(workbook.status, 200)
   const zip = await JSZip.loadAsync(await workbook.arrayBuffer())
   const xml = (await Promise.all(Object.values(zip.files).filter(f => !f.dir).map(f => f.async('string')))).join('')
   assert.doesNotMatch(xml, /Private vendor|Annual renewal reviewed/)

  }
  await h.command('grid-save', { ...split.request, fingerprint: split.preview.fingerprint }, contributor, 409)
  const beforeUndo = await view(contributor)
  await h.command('grid-undo', { scenario, revision: beforeUndo.scenario.revision }, contributor)
  v = await view(contributor)
  assert.deepEqual(v.inputs.schedule, split.before.inputs.schedule, 'undo restores exactly changed cells, metadata and unrelated rows')
  assert.deepEqual(values(v), values(beforeUndo), 'split undo preserves preexisting total')
  const request = { scenario, revision: v.scenario.revision, changes: [{ ...cell(rows[0], 1), value: 'bad', address: 'C2' }, { ...cell(foreign, 0), value: '0', address: 'B5' }] }
  const refusal = await h.command('grid-preview', request, contributor)
  assert.ok(refusal.refused.some(r => r.address === 'B5'))
  await h.command('grid-save', { ...request, fingerprint: refusal.fingerprint }, contributor, 400)
  assert.deepEqual(await view(contributor), v)
  assert.equal((await view(h.owner)).inputs.schedule.find(r => r.id === foreign.id).values[months[0]], 32100, 'The refused cross-department cell is unchanged')
  const invalid = await h.command('grid-preview', { scenario, revision: v.scenario.revision, changes: [{ ...cell(rows[0], 1), value: 'x', address: 'C2' }] }, contributor)
  assert.ok(invalid.refused.some(r => r.address.includes('C2')))
  const derived = await h.command('grid-preview', { scenario, revision: v.scenario.revision, changes: [{ ...cell(driverRow, 0), value: '100', address: 'B6' }] }, contributor)
  assert.ok(derived.refused.some(r => r.address === 'B6'))
  const badHistory = await h.command('grid-preview', { scenario, revision: v.scenario.revision, operation: 'prior-year', cells: [cell(rows[1], 0)], amount: '1' }, contributor)
  assert.ok(badHistory.refused.length, 'absent actual cell is unavailable, never zero')
  await h.command('grid-save', { scenario, revision: v.scenario.revision, changes: [{ ...cell(rows[0], 1), value: '1' }], fingerprint: 'unreviewed' }, contributor, 409)
  await h.command('grid-preview', { scenario, revision: v.scenario.revision, changes: [{ ...cell(rows[0], 1), value: '1' }] }, viewer).then(r => assert.ok(r.refused.length))
  const remainder = await save({ operation: 'even', cells: [0, 1, 2].map(i => cell(rows[1], i)), amount: '0.01' })
  assert.deepEqual(remainder.preview.changes.map(c => c.value), [1, 0, 0])
  await save({ operation: 'percent', cells: [cell(rows[1], 0)], percent: '-50' })
  assert.equal((await view(contributor)).inputs.schedule.find(r => r.id === rows[1].id).values[months[0]], 1, 'Half-cent rounds away from zero')
  v = await view(contributor)
  const priorRevision = v.scenario.revision
  await h.command('schedule', { ...rows[2], scenario, values: { [months[0]]: '5' } })
  await h.command('grid-undo', { scenario, revision: (await view(contributor)).scenario.revision }, contributor, 409)
  await h.command('grid-preview', { scenario, revision: priorRevision, changes: [{ ...cell(rows[0], 0), value: '0' }] }, contributor, 409)
  await h.command('member', { email: 'sales@example.test', name: 'Sales', role: 'contributor', departments: [other.id] })
  v = await view(contributor)
  const revoked = await h.command('grid-preview', { scenario, revision: v.scenario.revision, changes: [{ ...cell(rows[0], 0), value: '1' }] }, contributor)
  assert.ok(revoked.refused.length, 'Current membership applies to each write')

 } finally { await h.close() }
})
