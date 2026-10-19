import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

// All current editable structure forms pass through the real HTTP save door.
test('MODEL-005 structure versions retain exact definitions, readable diffs and moved cells without recomputing frozen versions', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Services' })
 const line = await h.command('line', { name: 'Contract revenue', type: 'revenue' })
 const salary = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const driver = { scenario: budget.id, name: 'Annual contracts', kind: 'volume', department: department.id, line: line.id, start: '2026-01', startVolume: '10', rate: '1000', growthPercent: '0' }
 await h.command('revenue', driver)
 await h.command('position', { scenario: budget.id, department: department.id, line: salary.id, title: 'Consultant', holder: 'Restricted employee', annualSalary: '120000', start: '2026-01' })
 await h.command('account-map', { account: '4000', target: line.id })
 await h.command('department-map', { source: 'Services', department: department.id })
 const source = { filename: 'january.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,4000,Services,-9000\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', source)
 await h.kit('actuals', 'commit', { ...source, fingerprint: preview.fingerprint })
 const approval = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approval.forecast
 const reforecast = await h.command('reforecast-save', { from: forecast.id, revision: forecast.revision, name: 'Q1 outlook' })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await h.command('pack-create', { forecast: forecast.id, month: '2026-01', title: 'January review' })
 await h.command('pack-publish', { pack: pack.id })
 const allSnapshots = (await h.get('/api/easel/state')).snapshots
 const frozen = await Promise.all(allSnapshots.map(sn => h.get(`/api/easel/snapshot/${sn.id}`)))
 assert.deepEqual(new Set(frozen.map(sn => sn.kind)), new Set(['approval', 'forecast', 'pack', 'reforecast']))
 for (const sn of frozen) {
  assert.equal(sn.body.structure['account-map'][0].target, line.id)
  assert.equal(sn.body.structure.department[0].name, 'Services')
  assert.equal(sn.body.structure.line.find(l => l.id === line.id).name, 'Contract revenue')
 }
 const approvedView = await h.get(`/api/easel/scenario/${budget.id}`)
 const keptView = await h.get(`/api/easel/scenario/${reforecast.id}`)
 const working = await h.get(`/api/easel/scenario/${forecast.id}`)
 const old = working.inputs.revenue[0]
 await h.command('revenue', { ...driver, id: old.id, scenario: forecast.id, rate: '1250', growthPercent: '10' })
 const changed = await h.get(`/api/easel/scenario/${forecast.id}`)
 const versions = () => h.get('/api/easel/activity?action=structure-version')
 let events = await versions(), event = events[0]
 assert.equal(event.actor, 'owner@example.test')
 assert.ok(Number.isSafeInteger(event.seq) && Number.isSafeInteger(event.detail.modelRevisionBefore))
 const record = event.detail.changes.find(c => c.id === old.id)
 assert.deepEqual(record.before, Object.fromEntries(Object.entries(old).filter(([key]) => key !== 'id')))
 assert.deepEqual(record.after, Object.fromEntries(Object.entries(changed.inputs.revenue[0]).filter(([key]) => key !== 'id')))
 assert.deepEqual(record.fields.map(f => f.field), ['growthBps', 'rateCents'])
 const moved = event.detail.scenarios.find(sc => sc.id === forecast.id)
 assert.equal(moved.revisionBefore, working.scenario.revision)
 assert.equal(moved.revisionAfter, changed.scenario.revision)
 assert.equal(moved.changedCells.length, 11, 'closed January is retained, every future revenue cell moves')
 for (const cell of moved.changedCells) {
  assert.equal(cell.before, working.calculation.cells.find(c => c.line === cell.line && c.department === cell.department && c.month === cell.month).amount)
  assert.equal(cell.after, changed.calculation.cells.find(c => c.line === cell.line && c.department === cell.department && c.month === cell.month).amount)
  assert.equal(cell.difference, cell.after - cell.before)
 }
 assert.ok(!event.detail.scenarios.some(sc => sc.id === budget.id || sc.id === reforecast.id))
 const savedEvent = structuredClone(event)
 await h.command('line', { ...line, name: 'Renewal revenue' })
 await h.command('department', { ...department, name: 'Client services' })
 const rule = await h.command('account-rule', { match: 'range', from: '4000', to: '4999', target: line.id })
 assert.equal((await versions())[0].detail.changes[0].kind, 'account-rule')
 await h.command('account-rule-delete', { id: rule.id })
 assert.equal((await versions())[0].detail.changes[0].after, null)
 // Exact and reusable mapping changes are versioned even when no cell amount moves.
 await h.command('account-map', { account: '4000', target: 'excluded' })
 assert.equal((await versions())[0].detail.changes[0].kind, 'account-map')
 assert.equal((await versions())[0].detail.scenarios.find(sc => sc.id === forecast.id).changedCells.find(c => c.month === '2026-01').after, null)
 await h.command('account-map', { account: '4000', target: line.id })
 for (const sn of frozen) assert.deepEqual(await h.get(`/api/easel/snapshot/${sn.id}`), sn)
 assert.deepEqual(await h.get(`/api/easel/scenario/${budget.id}`), approvedView)
 assert.deepEqual(await h.get(`/api/easel/scenario/${reforecast.id}`), keptView)
 assert.deepEqual((await versions()).find(e => e.seq === savedEvent.seq), savedEvent)
 await assert.rejects(h.db.prepare('UPDATE e_activity SET detail=? WHERE seq=?').bind('{}', event.seq).run(), /append-only/)
 await assert.rejects(h.db.prepare('DELETE FROM e_activity WHERE seq=?').bind(event.seq).run(), /append-only/)
 const viewer = await h.person('board@example.test', 'viewer')
 const planner = await h.person('planner@example.test', 'contributor', [department.id])
 for (const who of [viewer, planner]) for (const door of ['activity?action=structure-version', 'activity.csv?action=structure-version', 'activity.xlsx?action=structure-version']) await h.get(`/api/easel/${door}`, who, 403)
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'Retainer upside', request: 'Increase renewal rate' }, planner)
 const proposalInput = (await h.get(`/api/easel/scenario/${proposal.id}`, planner)).inputs.revenue[0]
 const mcp = await h.send('/api/easel/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'revenue', arguments: { ...driver, scenario: proposal.id, id: proposalInput.id, rate: '1300' } } }, planner)
 assert.equal(mcp.status, 200); assert.equal(mcp.value.result.isError, undefined)
 assert.equal((await versions())[0].detail.authority.type, 'agent')
 assert.equal((await versions())[0].detail.changes[0].after.rateCents, 130000)
 assert.ok((await h.get(`/api/easel/activity?action=structure-version&scenario=${proposal.id}`)).every(e => e.detail.scenarios.some(sc => sc.id === proposal.id)))
 const beforeFailure = await versions()
 await h.command('approve-budget', { scenario: budget.id, revision: 1 }, h.owner, 409)
 assert.deepEqual(await versions(), beforeFailure)
 const exported = await h.send('/api/easel/activity.csv?action=structure-version', undefined, h.owner)
 assert.equal(exported.status, 200); assert.ok(exported.text.includes('rateCents') && exported.text.includes('125000'))
 const excel = await h.mf.dispatchFetch(h.origin + '/api/easel/activity.xlsx?action=structure-version', { headers: { cookie: h.owner } })
 assert.equal(excel.status, 200); proveFormulas(await readWorkbook(await excel.arrayBuffer()))
 const zipResponse = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } })
 const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer())
 const csv = await zip.file('tables/e_activity.csv').async('string')
 assert.ok(csv.includes('structure-version') && csv.includes('rateCents'))
 for (const sn of frozen) assert.deepEqual(JSON.parse(await zip.file(`snapshots/${sn.id}.json`).async('string')), sn)
})
