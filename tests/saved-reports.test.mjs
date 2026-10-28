import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas, evaluate } from './spreadsheet-proof.mjs'

// REPORT-001, REPORT-008: one real user flow covers saved numeric comparisons and the
// existing dashboard share boundary.
test('REPORT-001, REPORT-008 saved reports compare fiscal periods, YTD, TTM and prior-year actuals without compensation detail or invented zeroes', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Report comparisons', planStart: '2026-10', fiscalYearStart: 10, horizon: 24 })
 const sales = await h.command('department', { name: 'Sales' })
 const ops = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Retainers', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const months = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor((i + 9) / 12)}-${String((i + 9) % 12 + 1).padStart(2, '0')}`)
 await h.command('schedule', { scenario: budget.id, name: 'Retainers plan', line: revenue.id, department: sales.id, values: Object.fromEntries(months.map(m => [m, '100.01'])) })
 await h.command('position', { scenario: budget.id, title: 'Private salary role', holder: 'Private pay sentinel', department: ops.id, line: payroll.id, start: '2026-10', annualSalary: '120000', onCostPercent: '0' })
 await h.command('account-map', { account: '400', target: revenue.id })
 await h.command('account-map', { account: '600', target: payroll.id })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 await h.command('department-map', { source: 'Operations', department: ops.id })
 const ledgerMonths = Array.from({ length: 24 }, (_, i) => `${2025 + Math.floor((i + 3) / 12)}-${String((i + 3) % 12 + 1).padStart(2, '0')}`)
 const source = { filename: 'report-history.csv', dateFormat: 'YYYY-MM-DD', csv: 'Date,Account,Department,Amount\n' + ledgerMonths.flatMap((m, i) => [`${m}-01,400,Sales,-${i < 12 ? '80.00' : '120.02'}`, `${m}-01,600,Operations,10000.00`]).join('\n') + '\n' }
 await h.kit('actuals', 'commit', { ...source, fingerprint: (await h.kit('actuals', 'preview', source)).fingerprint })
 const board = await h.person('board@example.test', 'viewer')
 const manager = await h.person('sales@example.test', 'contributor', [sales.id], false)
 let prior = await h.get(`/api/easel/scenario/${budget.id}`)
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: prior.scenario.revision })
 const frozen = await h.get(`/api/easel/scenario/${budget.id}`)
 const extra = await h.command('schedule', { scenario: forecast.id, name: 'Revised plan', line: revenue.id, department: sales.id, values: { '2026-10': '30.01' } })
 const body = { name: 'Sales actual against budget', scenario: budget.id, audience: 'board', department: sales.id,
  widgets: [{ metric: 'revenue', display: 'table' }], report: { row: 'department', period: 'quarter', through: '2027-03', lines: [revenue.id], comparison: forecast.id, comparisons: [budget.id], highlightBps: 1000 } }
 let d = await h.command('dashboard-save', body)
 const path = `/api/easel/dashboards/${d.id}/report`
 const read = (cookie = h.owner) => h.get(path, cookie)
 let result = await read(), shared = await read(board)
 assert.deepEqual(shared, result)
 assert.equal(shared.rows.length, 4)
 const first = result.rows.find(r => r.period === 'FY2027 Q1')
 assert.equal(first.name, 'Sales'); assert.deepEqual(first.months, ['2026-10', '2026-11', '2026-12'])
 assert.equal(first.actual, 36006); assert.equal(first.budget, 30003); assert.equal(first.comparison, 33004)
 assert.equal(first.versions[budget.id], 30003)
 assert.equal(first.priorYearActual, 24000); assert.equal(first.yoy, 12006); assert.equal(first.yoyBps, 5003)
 assert.equal(first.variance, 6003); assert.equal(first.varianceBps, 2001); assert.equal(first.highlight, true)
 const ytd = result.rows.find(r => r.period === 'YTD'), ttm = result.rows.find(r => r.period === 'TTM')
 assert.equal(ytd.actual, 72012); assert.equal(ytd.budget, 60006); assert.equal(ytd.priorYearActual, 48000)
 assert.equal(ttm.actual, 144024); assert.equal(ttm.budget, null, 'TTM outside plan horizon is unavailable')
 assert.equal(ttm.priorYearActual, 96000)
 assert.doesNotMatch(JSON.stringify(shared), /Private pay sentinel|Private salary role|annualSalary|sources|originId/)
 await h.get(path, manager, 404)
 await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision - 1 }, h.owner, 409)
 await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision, report: { ...body.report, through: '2030-01' } }, h.owner, 409)
 assert.deepEqual(await read(), result, 'Invalid report edit is atomic')
 // An ordinary dashboard edit preserves the saved numeric report.
 const { report: ignored, ...ordinary } = body
 d = await h.command('dashboard-save', { ...ordinary, id: d.id, revision: d.revision })
 assert.deepEqual(await read(), { ...result, definitionRevision: d.revision })
 const download = async (who = board) => h.mf.dispatchFetch(h.origin + `/api/easel/dashboards/${d.id}/report.xlsx`, { headers: { cookie: who } })
 let response = await download(); assert.equal(response.status, 200)
 const book = await readWorkbook(await response.arrayBuffer()); proveFormulas(book)
 const sheet = book.getWorksheet('Saved report')
 assert.equal(evaluate(sheet, 'F3'), 6003); assert.equal(evaluate(sheet, 'G3'), 2001); assert.equal(evaluate(sheet, 'J3'), 5003)
 assert.equal(sheet.getCell('D6').value, null, 'Unavailable TTM plan remains blank in Excel')
 const monthlySheet = book.getWorksheet('Monthly')
 const october = monthlySheet.getRows(2, monthlySheet.rowCount - 1).find(r => r.getCell(1).value === 'Sales' && r.getCell(2).value === '2026-10')
 october.getCell(3).value += 100
 assert.equal(evaluate(sheet, 'C3'), 36106, 'Quarter totals are live sums of the monthly cells')
 assert.equal(evaluate(sheet, 'F3'), 6103, 'Variance updates with its underlying monthly cells')
 assert.doesNotMatch(JSON.stringify(book.model), /Private pay sentinel|Private salary role|annualSalary/)
 // Closed and missing data are explicit, and formula percentages never divide by zero.
 d = await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision, department: '', report: { ...body.report, row: 'line', lines: [revenue.id, payroll.id], period: 'month', through: '2026-10' } })
 result = await read(); assert.equal(result.rows.find(r => r.name === 'Payroll' && r.period === '2026-10').actual, 1000000)
 assert.doesNotMatch(JSON.stringify(result), /Private pay sentinel|Private salary role|annualSalary/)
 await h.command('account-map', { account: '400', target: '' }, h.owner, 400)
 await h.command('account-map', { account: '400', target: 'excluded' })
 assert.equal((await read()).rows.find(r => r.name === 'Retainers' && r.period === '2026-10').actual, 0)
 await h.command('account-map', { account: '400', target: revenue.id })
 const rule = await h.command('account-rule', { match: 'prefix', from: '499', target: revenue.id })
 const pending = { filename: 'later.csv', dateFormat: 'YYYY-MM-DD', csv: 'Date,Account,Department,Amount\n2026-10-10,499,Sales,0\n' }
 await h.kit('actuals', 'commit', { ...pending, fingerprint: (await h.kit('actuals', 'preview', pending)).fingerprint })
 await h.command('account-rule-delete', { id: rule.id })
 const blocked = await read()
 assert.ok(blocked.blockedMonths.includes('2026-10'))
 assert.ok(blocked.rows.filter(r => r.period === '2026-10').every(r => r.actual === null && r.variance === null && !r.highlight))
 await h.command('account-rule', { match: 'prefix', from: '499', target: revenue.id })
 d = await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision, report: { ...body.report, through: '2027-12' } })
 const missing = await read()
 assert.ok(missing.missingMonths.includes('2027-12'))
 assert.equal(missing.rows.find(r => r.period === 'TTM').actual, null)
 // Fiscal-year rollups use elapsed periods; zero denominators stay unavailable.
 d = await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision, report: { ...body.report, period: 'year', lines: [payroll.id] } })
 const zero = await read()
 const annual = zero.rows.find(r => r.period === 'FY2027')
 assert.deepEqual(annual.months, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
 assert.equal(annual.actual, 0); assert.equal(annual.budget, 0); assert.equal(annual.priorYearActual, 0)
 assert.equal(annual.varianceBps, null); assert.equal(annual.yoyBps, null); assert.equal(annual.highlight, false)
 const zeroResponse = await download()
 const zeroSheet = (await readWorkbook(await zeroResponse.arrayBuffer())).getWorksheet('Saved report')
 assert.equal(zeroSheet.getCell('G3').value, null); assert.equal(zeroSheet.getCell('J3').value, null)
 // Unsharing removes both JSON and file access immediately; source versions stay intact.
 d = await h.command('dashboard-save', { ...body, id: d.id, revision: d.revision, audience: 'private' })
 await h.get(path, board, 404); assert.equal((await download()).status, 404)
 assert.deepEqual(await h.get(`/api/easel/scenario/${budget.id}`), frozen)
 await h.command('dashboard-delete', { id: d.id, revision: d.revision })
 await h.get(path, h.owner, 404)
})

// The same public doors exercise author authority and durable scheduled mail.
test('Report authors stay within their department and scheduled copies follow current recipients and company DST', async t => {
 let now = '2026-10-30T12:00:00.000Z', response = 'accepted'
 const h = await harness({ now: () => now, mailResponse: () => response === 'refused' ? new Response('provider refused', { status: 429 }) : response === 'unknown' ? new Response('upstream unavailable', { status: 503 }) : Response.json({ id: crypto.randomUUID() }) }); t.after(() => h.close())
 await h.command('workspace', { name: 'Report delivery', fiscalYearStart: 10, planStart: '2026-10', horizon: 12, timeZone: 'America/New_York' })
 const sales = await h.command('department', { name: 'Sales' }), ops = await h.command('department', { name: 'Ops' })
 const line = await h.command('line', { name: 'Retainers', type: 'revenue' })
 const scenario = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('schedule', { scenario: scenario.id, name: 'Plan', line: line.id, department: sales.id, values: { '2026-10': '100.00' } })
 const manager = await h.person('report-manager@example.test', 'contributor', [sales.id], false)
 const viewer = await h.person('report-viewer@example.test', 'viewer')
 const definition = { name: 'Sales report', scenario: scenario.id, audience: 'department', department: sales.id,
  report: { row: 'department', period: 'quarter', through: '2026-10', lines: [line.id], highlightBps: 1000 } }
 const own = await h.command('report-save', definition, manager)
 assert.equal((await h.get(`/api/easel/dashboards/${own.id}/report`, manager)).rows[0].name, 'Sales')
 await h.command('report-save', { ...definition, department: ops.id }, manager, 403)
 await h.command('report-save', { ...definition, audience: 'board' }, manager, 403)
 await h.command('report-save', definition, viewer, 403)
 await h.command('report-schedule-save', { dashboard: own.id, cadence: 'weekly', recipients: ['report-manager@example.test'] }, manager, 403)
 const shared = await h.command('report-save', { ...definition, name: 'Weekly board report', audience: 'board' })
 await h.command('report-schedule-save', { dashboard: shared.id, cadence: 'weekly', weekday: 1, hour: 8, recipients: ['owner@example.test', 'report-viewer@example.test'] })
 const schedule = async () => (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 h.messages.length = 0
 now = '2026-11-02T12:59:00.000Z'; await schedule(); assert.equal(h.messages.length, 0)
 now = '2026-11-02T13:00:00.000Z'; await schedule(); await schedule()
 assert.equal(h.messages.length, 2, 'Monday 8 Eastern after DST sends once per named recipient')
 assert.ok(h.messages.every(m => m.to.length === 1))
 assert.doesNotMatch(JSON.stringify(h.messages), /annualSalary|originId|sources/)
 let deliveries = (await h.get('/api/easel/report-schedules')).deliveries
 assert.equal(deliveries.length, 2)
 assert.ok(deliveries.every(d => d.status === 'accepted' && d.scheduledAt === now && d.dispatchedAt === now && d.zone === 'America/New_York' && !('message' in d)))
 await h.command('report-schedule-retry', { id: deliveries[0].id }, h.owner, 409)
 await h.get('/api/easel/report-schedules', viewer, 403)
 // Current membership is rechecked when the next scheduled copy is prepared.
 await h.command('member', { email: 'report-viewer@example.test', name: 'Viewer', role: 'viewer', active: false })
 now = '2026-11-09T13:00:00.000Z'; await schedule()
 deliveries = (await h.get('/api/easel/report-schedules')).deliveries
 assert.equal(deliveries.find(d => d.recipient === 'report-viewer@example.test' && d.scheduledAt === now).status, 'blocked')
 assert.equal(h.messages.length, 3)
 // Refused sends stay pending and require an explicit finance retry.
 response = 'refused'; now = '2026-11-16T13:00:00.000Z'; await schedule(); await schedule()
 deliveries = (await h.get('/api/easel/report-schedules')).deliveries
 const refused = deliveries.find(d => d.recipient === 'owner@example.test' && d.scheduledAt === now)
 assert.equal(refused.status, 'pending'); assert.equal(refused.attempts, 1)
 response = 'accepted'; await h.command('report-schedule-retry', { id: refused.id })
 assert.equal((await h.get('/api/easel/report-schedules')).deliveries.find(d => d.id === refused.id).status, 'accepted')
 // Unknown provider outcomes are sealed against explicit and automatic resend.
 response = 'unknown'; now = '2026-11-23T13:00:00.000Z'; await schedule()
 const unknown = (await h.get('/api/easel/report-schedules')).deliveries.find(d => d.recipient === 'owner@example.test' && d.scheduledAt === now)
 assert.equal(unknown.status, 'uncertain'); const unknownCount = h.messages.length
 await schedule(); assert.equal(h.messages.length, unknownCount)
 await h.command('report-schedule-retry', { id: unknown.id }, h.owner, 409)
 // The spring transition also follows 08:00 local, rather than fixed UTC.
 response = 'accepted'; now = '2027-03-15T11:59:00.000Z'; const count = h.messages.length; await schedule(); assert.equal(h.messages.length, count)
 now = '2027-03-15T12:00:00.000Z'; await schedule(); assert.equal(h.messages.length, count + 1)
 // Daily and monthly schedules share the same persistent delivery guard.
 now = '2027-03-15T13:00:00.000Z'
 await h.command('report-schedule-save', { dashboard: shared.id, cadence: 'daily', hour: 8, recipients: ['owner@example.test'] })
 await h.command('report-schedule-save', { dashboard: shared.id, cadence: 'monthly', day: 16, hour: 8, recipients: ['owner@example.test'] })
 now = '2027-03-16T12:05:00.000Z'; const dailyCount = h.messages.length; await schedule(); await schedule()
 assert.equal(h.messages.length, dailyCount + 2)
 const late = (await h.get('/api/easel/report-schedules')).deliveries.filter(d => d.scheduledAt === '2027-03-16T12:00:00.000Z')
 assert.ok(late.every(d => d.dispatchedAt === now))
})

test('Saved report dimension and account hierarchies preserve source cuts, frozen versions and blocked-cell availability', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Ridgeline dimensional reports', currency: 'USD', planStart: '2026-01', fiscalYearStart: 1 })
 const department = await h.command('department', { name: 'Marketing' })
 const ads = await h.command('line', { name: 'Advertising', type: 'operating-expense' }), events = await h.command('line', { name: 'Events', type: 'operating-expense' })
 const dimension = await h.command('dimension', { name: 'Region' })
 const domestic = await h.command('dimension-member', { dimension: dimension.id, name: 'Domestic' })
 const east = await h.command('dimension-member', { dimension: dimension.id, name: 'East', parent: domestic.id }), west = await h.command('dimension-member', { dimension: dimension.id, name: 'West', parent: domestic.id })
 const group = await h.command('line-group', { name: 'Sales and marketing', type: 'operating-expense' })
 for (const line of [ads, events]) await h.command('line-hierarchy', { line: line.id, parent: group.id })
 const scenario = (await h.get('/api/easel/state')).scenarios[0]
 const inputs = []
 for (const [member, value] of [[east, '100'], [west, '200']]) inputs.push(await h.command('schedule', { scenario: scenario.id, name: `${member.name} advertising`, line: ads.id, department: department.id, dimensions: { [dimension.id]: member.id }, values: { '2026-01': value } }))
 await h.command('schedule', { scenario: scenario.id, name: 'Eastern events', line: events.id, department: department.id, dimensions: { [dimension.id]: east.id }, values: { '2026-01': '60' } })
 await h.command('account-map', { account: '500', target: ads.id }); await h.command('account-map', { account: '510', target: events.id }); await h.command('department-map', { source: 'Marketing', department: department.id })
 const eastRule = await h.command('dimension-map', { dimension: dimension.id, member: east.id, sourceKind: 'class', source: 'East' })
 await h.command('dimension-map', { dimension: dimension.id, member: west.id, sourceKind: 'class', source: 'West' })
 const file = { filename: 'synthetic-easel-3.csv', csv: 'Date,Account,Department,Class,Amount\n2026-01-31,500,Marketing,East,120\n2026-01-31,500,Marketing,West,210\n2026-01-31,510,Marketing,West,70\n', columns: { date: 'Date', account: 'Account', department: 'Department', class: 'Class', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD' }
 const preview = await h.kit('actuals', 'preview', file); await h.kit('actuals', 'commit', { ...file, fingerprint: preview.fingerprint })
 const branch = await h.command('branch', { from: scenario.id, name: 'Forecast case' })
 const kept = await h.command('reforecast-save', { from: branch.id, name: 'January outlook', revision: branch.revision })
 const base = { name: 'Regional advertising', scenario: scenario.id, audience: 'board', report: { row: 'dimension', dimension: dimension.id, period: 'month', through: '2026-01', lines: [ads.id], comparisons: [branch.id, kept.id] } }
 const saved = await h.command('report-save', base)
 const read = () => h.get(`/api/easel/dashboards/${saved.id}/report`)
 let report = await read(), root = report.rows.find(r => r.row === domestic.id && r.period === '2026-01')
 assert.equal(root.actual, 33000); assert.equal(root.budget, 30000)
 assert.equal(root.versions[branch.id], 30000); assert.equal(root.versions[kept.id], 30000)
 assert.equal(report.rows.find(r => r.row === east.id && r.period === '2026-01').actual, 12000)
 const filtered = await h.command('report-save', { ...base, name: 'East filter', report: { ...base.report, dimensions: { [dimension.id]: east.id } } })
 assert.equal((await h.get(`/api/easel/dashboards/${filtered.id}/report`)).rows.find(r => r.row === domestic.id && r.period === '2026-01').actual, 12000)
 const accounts = await h.command('report-save', { ...base, name: 'Account hierarchy', report: { ...base.report, row: 'hierarchy', dimension: '', lines: [ads.id, events.id] } })
 const hierarchy = await h.get(`/api/easel/dashboards/${accounts.id}/report`)
 const subtotal = hierarchy.rows.find(r => r.row === `group:${group.id}` && r.period === '2026-01')
 assert.equal(subtotal.actual, 40000); assert.equal(subtotal.budget, 36000)
 const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/dashboards/${accounts.id}/report.xlsx`, { headers: { cookie: h.owner } })
 assert.equal(response.status, 200); proveFormulas(await readWorkbook(await response.arrayBuffer()))
 await h.command('dimension-map', { id: eastRule.id, dimension: dimension.id, member: east.id, sourceKind: 'class', source: 'Changed' })
 report = await read()
 assert.equal(report.rows.find(r => r.row === domestic.id && r.period === '2026-01').actual, null)
 const independent = await h.command('report-save', { ...base, name: 'Independent events', report: { row: 'line', period: 'month', through: '2026-01', lines: [events.id] } })
 assert.equal((await h.get(`/api/easel/dashboards/${independent.id}/report`)).rows.find(r => r.period === '2026-01').actual, 7000)
})

// REPORT-004's Office.js host is an explicit acceptance boundary; application
// values and authority still travel through the real Worker and D1 routes.
test('Linked Office reports insert a native table and number into a pptx and refresh in place under live report authority', async t => {
 const h = await harness(); t.after(() => h.close())
 const { officeReportFlow } = await import('./office-report-flow.mjs')
 await officeReportFlow(h)
})
