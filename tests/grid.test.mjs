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

test('Excel refresh reads live filtered cells and write-back follows submission and exact-revision authority', async () => {
 const h = await harness({ now: () => '2026-01-15T12:00:00.000Z' })
 try {
  await h.command('workspace', { name: 'synthetic-easel-1', currency: 'USD', planStart: '2026-01' })
  const sales = await h.command('department', { name: 'Sales' }), other = await h.command('department', { name: 'Operations' })
  const line = await h.command('line', { name: 'Revenue', type: 'revenue' })
  const pay = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
  const scenario = (await h.get('/api/easel/state')).scenarios[0].id
  const row = await h.command('schedule', { scenario, name: 'Revenue input', line: line.id, department: sales.id, values: { '2026-01': '100', '2026-02': '200' } })
  const foreign = await h.command('schedule', { scenario, name: 'Other input', line: line.id, department: other.id, values: { '2026-01': '400' } })
  await h.command('position', { scenario, title: 'Restricted role', holder: 'Restricted person', department: sales.id, line: pay.id, start: '2026-01', annualSalary: '120000' })
  const contributor = await h.person('excel-sales@example.test', 'contributor', [sales.id], false)
  const viewer = await h.person('excel-board@example.test', 'viewer')
  const view = (id = scenario, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
  const read = (month = '2026-01', cookie = viewer, whichLine = 'Revenue') => h.get(`/api/easel/excel/${scenario}/value?${new URLSearchParams({ line: whichLine, department: 'Sales', month })}`, cookie)
  const payload = async (extra = {}) => ({ scenario, revision: (await view()).scenario.revision, schedule: row.id, month: '2026-01', value: '150', ...extra })
  const report = await h.command('report-save', { name: 'Excel board range', scenario, department: '', audience: 'board', report: { row: 'department', period: 'month', through: '2026-02', lines: [line.id, pay.id], comparisons: [], highlightBps: 1000 } })
  const reportPath = `/api/easel/excel/report/${report.id}?period=2026-01&metric=budget`
  const reportRead = await h.get(reportPath, viewer)
  assert.deepEqual(reportRead.table, [['Row', 'FY2026 budget (USD)'], ['Operations', '$400.00'], ['Sales', '$10,100.00'], ['No department', '$0.00']])
  assert.doesNotMatch(JSON.stringify(reportRead), /Restricted|120000|sources|trace|inputs/)
  await h.get(reportPath, contributor, 404)
  await h.get(`/api/easel/excel/report/${report.id}?period=2030-01`, viewer, 409)
  const before = await view()
  assert.deepEqual(await read(), { scenario, revision: before.scenario.revision, currency: 'USD', line: line.id, department: sales.id, month: '2026-01', amount: 10000 })
  const safe = await read('2026-01', viewer, 'Payroll')
  assert.equal(safe.amount, 1000000)
  assert.doesNotMatch(JSON.stringify(safe), /Restricted|120000|sources|trace|inputs/)
  await h.get(`/api/easel/excel/${scenario}/value?line=Revenue&department=Sales&month=2028-01`, viewer, 409)
  await h.command('excel-write', await payload(), viewer, 403)
  await h.command('excel-write', await payload(), contributor, 409)
  await h.stepUp()
  const issued = await h.send('/api/easel/tokens/issue', { label: 'Excel refusal proof', kind: 'personal', scope: 'write', expiresInSeconds: 86400 }, h.owner)
  assert.equal(issued.status, 200)
  const tokenResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/command/excel-write`, { method: 'POST', headers: { authorization: `Bearer ${issued.value.token}`, 'content-type': 'application/json' }, body: JSON.stringify(await payload()) })
  assert.equal(tokenResponse.status, 403)
  assert.match((await tokenResponse.json()).error, /signed-in session/)
  for (const path of [reportPath, `/api/easel/excel/${scenario}/value?line=Revenue&department=Sales&month=2026-01`]) {
   const response = await h.mf.dispatchFetch(`${h.origin}${path}`, { headers: { authorization: `Bearer ${issued.value.token}` } })
   assert.equal(response.status, 403)
   assert.match((await response.json()).error, /signed-in session/)
  }
  await h.command('request-submissions', { scenario, departments: [sales.id] })
  const requested = await payload(), direct = await h.command('excel-write', requested, contributor)
  assert.equal(direct.mode, 'entry'); assert.equal(direct.scenario.revision, requested.revision + 1)
  assert.equal((await view(scenario, contributor)).inputs.schedule.find(r => r.id === row.id).values['2026-01'], 15000)
  assert.equal((await read()).amount, 15000)
  assert.equal((await view()).inputs.schedule.find(r => r.id === row.id).gridRevisions['2026-01'].by, 'excel-sales@example.test')
  await h.command('excel-write', requested, contributor, 409)
  await h.command('excel-write', await payload({ schedule: foreign.id }), contributor, 403)
  await h.command('excel-write', await payload({ value: 'invalid' }), contributor, 409)
  await h.command('excel-write', await payload({ month: '2030-01' }), contributor, 409)
  await h.command('submit', { scenario, department: sales.id }, contributor)
  const submitted = (await h.get('/api/easel/state')).submissions.find(s => s.department === sales.id)
  assert.equal(submitted.submittedRevision, direct.scenario.revision)
  const proposed = await h.command('excel-write', await payload({ value: '175' }), contributor)
  assert.equal(proposed.mode, 'proposal'); assert.equal(proposed.proposal.proposalStatus, 'submitted')
  assert.equal(proposed.proposal.branchedFrom.revision, direct.scenario.revision)
  assert.equal(proposed.proposal.submittedRevision, proposed.proposal.revision)
  const proposedView = await view(proposed.proposal.id, contributor)
  assert.equal(proposedView.inputs.schedule.find(r => r.originId === row.originId).values['2026-01'], 17500)
  assert.equal((await read()).amount, 15000, 'a proposed write never changes its target')
  await h.command('proposal-promote', { id: proposed.proposal.id, revision: proposed.proposal.revision - 1 }, h.owner, 409)
  await h.command('return-submission', { scenario, department: sales.id, reason: 'Revise input' })
  const returned = await h.command('excel-write', await payload({ value: '180' }), contributor)
  assert.equal(returned.mode, 'entry'); assert.equal((await read()).amount, 18000)
  await h.command('proposal-promote', { id: proposed.proposal.id, revision: proposed.proposal.revision }, h.owner, 409)

  // Production streaming adapter against real HTTP; the host replaces only the
  // external Office boundary. Its SUM is deliberately independent of the API.
  const { excelFunctions } = await import('../public/excel/functions.mjs')
  let formula, results = new Map(), calculations = 0
  class CellError { constructor(code, message) { this.code = code; this.message = message } }
  const host = () => {
   results = new Map()
   const runtime = excelFunctions({
    CustomFunctions: { associate: (name, fn) => { if (name === 'VALUE') formula = fn }, Error: CellError, ErrorCode: { notAvailable: 'unavailable' } },
    Excel: { run: async fn => fn({ workbook: { application: { calculate: () => calculations++ } }, sync: async () => {} }) },
    read: selector => read(selector.month),
   })
   const invocations = ['2026-01', '2026-02'].map(month => ({ setResult: n => results.set(month, n) }))
   invocations.forEach((invocation, i) => formula('Revenue', 'Sales', `2026-0${i + 1}`, scenario, invocation))
   return { runtime, invocations }
  }
  let workbook = host()
  await workbook.runtime.refresh()
  assert.deepEqual([...results.values()], [180, 200]); assert.equal(results.get('2026-01') + results.get('2026-02'), 380)
  await h.command('excel-write', await payload({ value: '220' }))
  await workbook.runtime.refresh()
  assert.deepEqual([...results.values()], [220, 200]); assert.equal(results.get('2026-01') + results.get('2026-02'), 420)
  workbook.invocations.forEach(invocation => invocation.onCanceled())
  await h.command('excel-write', await payload({ value: '260' }))
  workbook = host(); await workbook.runtime.open()
  assert.deepEqual([...results.values()], [260, 200]); assert.equal(results.get('2026-01') + results.get('2026-02'), 460)
  assert.equal(calculations, 3)
  await h.command('member', { email: 'excel-board@example.test', name: 'Board', role: 'viewer', active: false })
  await h.get(reportPath, viewer, 403)
  await assert.rejects(workbook.runtime.refresh(), /403/)
  assert.ok([...results.values()].every(value => value instanceof CellError), 'revoked reads clear stale successful amounts')
  await h.command('submit', { scenario, department: sales.id }, contributor)
  const approved = await h.command('approve-budget', { scenario, revision: (await view()).scenario.revision })
  await h.command('excel-write', await payload(), contributor, 409)
  const forecastView = await view(approved.forecast.id)
  const kept = await h.command('reforecast-save', { from: approved.forecast.id, revision: forecastView.scenario.revision, name: 'Kept forecast' })
  await h.command('excel-write', { ...(await payload()), scenario: kept.id, revision: kept.revision }, contributor, 409)
 } finally { await h.close() }
})
