// Real large-input path, kept outside routine CI with the scale journey.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { largeWorkbook, finishJob } from './scale-fixtures.mjs'
const h = await harness()
try {
 await h.command('workspace', { name: 'Synthetic large workbook business', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 36 })
 await h.command('department', { name: 'Operations' }); await h.command('line', { name: 'Software', type: 'operating-expense' })
 const dimension = await h.command('dimension', { name: 'Region' }), member = await h.command('dimension-member', { dimension: dimension.id, name: 'North America' })
 const file = { ...await largeWorkbook(), dimensions: { [dimension.id]: member.id } }
 const preview = await h.kit('workbook', 'preview', file)
 const response = await h.send('/api/easel/import/workbook/commit', { ...file, fingerprint: preview.fingerprint }, h.owner)
 assert.equal(response.status, 202, JSON.stringify(response.value))
 const firstJob = response.value.calculationJob
 assert.equal(firstJob.status, 'running')
 let result = await finishJob(h, response.value)
 const incomplete = await h.send(`/api/easel/scenario/${result.import.scenario}`, undefined, h.owner)
 assert.equal(incomplete.status, 425); assert.equal(incomplete.value.calculation.status, 'awaiting-continuation')
 assert.equal(incomplete.value.calculation.cells, undefined)
 while (result.import.status === 'importing') {
  const next = await h.send('/api/easel/import/workbook/resume', { id: result.import.id }, h.owner)
  assert.equal(next.status, 202, JSON.stringify(next.value)); result = await finishJob(h, next.value)
  console.log(`Background import: ${result.job.checkpoint}/${result.job.total}`)
 }
 assert.equal(result.import.status, 'imported')
 const view = await h.get(`/api/easel/scenario/${result.import.scenario}`)
 assert.equal(view.inputs.schedule.length, 2201)
 assert.ok(view.inputs.schedule.every(s => s.dimensions[dimension.id] === member.id))
 assert.equal(view.calculation.profit[0].operatingExpenses, preview.totals['2026-01'])
 const schedule = view.inputs.schedule[0]
 const edit = await h.send('/api/easel/command/schedule', { id: schedule.id, scenario: result.import.scenario, name: schedule.name, line: schedule.line, department: schedule.department, values: { '2026-01': '101.00' } }, h.owner)
 assert.equal(edit.status, 202)
 const running = await h.send(`/api/easel/scenario/${result.import.scenario}`, undefined, h.owner)
 assert.ok([200, 202].includes(running.status))
 if (running.status === 202) assert.equal(running.value.calculation, undefined)
 else assert.equal(running.value.calculation.profit[0].operatingExpenses, preview.totals['2026-01'] + 10100 - schedule.values['2026-01'], 'A completed read already has the new total, never stale figures')
 await finishJob(h, edit.value)
 const final = await h.get(`/api/easel/scenario/${result.import.scenario}`)
 assert.equal(final.calculation.profit[0].operatingExpenses, preview.totals['2026-01'] + 10100 - schedule.values['2026-01'])
 const outsider = await h.person('job-outsider@example.test', 'viewer')
 const metadata = await h.get(`/api/easel/calculation-jobs/${firstJob.id}`, outsider)
 assert.equal(metadata.calculationJob.status, 'completed'); assert.equal(metadata.result, undefined)
 console.log('Background calculation: real reviewed workbook, bounded continuation, filtered job metadata and final exact totals passed')
} finally { await h.close() }
