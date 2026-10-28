import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { providerFakes } from './provider-fakes.mjs'
import { readParquet } from './parquet-reader.mjs'
import { readWorkbook } from './spreadsheet-proof.mjs'

const csvRows = text => text.trim().split('\r\n').slice(1).map(line => line.split(',').map(v => v === '' ? null : v))

test('REPORT-007, REPORT-009 a reviewed warehouse query drives a revenue line and a scoped BI token and the nightly CSV and Parquet drop carry the same pay-free dataset rows', async t => {
 let now = '2026-03-10T15:00:00.000Z'
 const remote = providerFakes()
 let responseOverride
 const outbound = request => responseOverride && new URL(request.url).hostname.endsWith('snowflakecomputing.com') ? responseOverride(request) : remote.outbound(request)
 const h = await harness({ now: () => now, outbound }); t.after(() => h.close())
 const run = async at => { now = at; await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' }) }
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const usage = await h.command('line', { name: 'Platform usage', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('position', { scenario: budget.id, title: 'Private principal engineer', holder: 'Private Person', department: sales.id, line: payroll.id, start: '2026-01', annualSalary: '120000', onCostPercent: '0' })
 const driver = await h.command('revenue', { scenario: budget.id, name: 'Active users', kind: 'usage', line: usage.id, department: sales.id, start: '2026-01', startUsage: '1000', growthPercent: '10', unitPrice: '2', warehouseMetric: 'active_users', collectionLag: 0 })
 const planner = await h.person('sales@example.test', 'contributor', [sales.id]), board = await h.person('board@example.test', 'viewer')
 const wh = (path, body, cookie = h.owner) => h.send(path, body, cookie)
 const june = (op, body, cookie = h.owner) => h.send(`/api/easel/warehouse-command/${op}`, body, cookie)
 const calc = async () => (await h.get(`/api/easel/scenario/${budget.id}`)).calculation
 const cell = (c, month) => c.cells.find(x => x.line === usage.id && x.month === month)
 const planOnly = await calc()
 assert.equal(cell(planOnly, '2026-01').amount, 200000)

 // Connections are finance-only, sealed and vendor-domain confined.
 const snowflake = { account: 'acme-prod.us-east-1', token: 'synthetic-easel-sf', warehouse: 'REPORTING', role: 'EASEL_READER' }
 assert.equal((await wh('/api/easel/warehouse/snowflake/connect', snowflake, planner)).status, 403)
 assert.equal((await wh('/api/easel/warehouse/snowflake/connect', { ...snowflake, account: 'evil.example/path' })).status, 400)
 assert.equal((await wh('/api/easel/warehouse/databricks/connect', { host: 'internal.example.com', token: 'synthetic-easel-dbx', warehouseId: 'synthetic-easel-wh' })).status, 400, 'Databricks hosts must be vendor workspaces')
 assert.equal((await wh('/api/easel/warehouse/snowflake/connect', snowflake)).status, 200)
 assert.equal((await wh('/api/easel/warehouse/databricks/connect', { host: 'dbc-1234.cloud.databricks.com', token: 'synthetic-easel-dbx', warehouseId: 'synthetic-easel-wh' })).status, 200)
 assert.equal((await wh('/api/easel/warehouse/bigquery/connect', { projectId: 'synthetic-easel-proj', clientId: 'synthetic-easel-0', clientSecret: 'synthetic-easel-2', refreshToken: 'synthetic-easel-bq' })).status, 200)
 const status = await h.get('/api/easel/warehouse')
 assert.deepEqual(status.connections.map(c => c.connected), [true, true, true])
 assert.ok(!JSON.stringify(status).includes('synthetic-easel-sf') && !JSON.stringify(status).includes('synthetic-easel-2'), 'credentials are never returned')
 await h.get('/api/easel/warehouse', planner, 403)

 // One reviewed read-only query per metric.
 const sql = "WITH measured AS (SELECT TO_CHAR(month, 'YYYY-MM') AS period, active_users AS value FROM usage.monthly_active) SELECT period, SUM(value) AS value FROM measured GROUP BY period ORDER BY period DESC"
 const refused = [
  'DELETE FROM usage.monthly_active', 'select 1; drop table usage.x', `${sql} -- sneaky`, 'select a into b from c',
  'with x as (select 1 as period, 2 as value) insert into y select * from x',
  'WITH x AS (DELETE FROM usage.monthly_active RETURNING *) SELECT * FROM x',
  'SELECT period, FROM', 'SELECT period, value FROM usage.monthly_active FOR UPDATE',
  "SELECT SYSTEM$SEND_EMAIL('synthetic-easel-1') AS value", 'SELECT ops.mutate() AS value',
  "SELECT * FROM TABLE(unknown_function())", "SELECT * FROM @stage", 'SELECT * FROM t /* hidden */',
 ]
 for (const warehouse of ['snowflake', 'bigquery', 'databricks']) {
  const before = remote.calls.length
  for (const bad of refused) assert.equal((await june('warehouse-query-save', { name: 'Bad', warehouse, metric: 'active_users', sql: bad })).status, 400, `${warehouse}: ${bad}`)
  const nativeOnly = warehouse === 'bigquery' ? "SELECT * FROM EXTERNAL_QUERY('synthetic-easel-1', 'DELETE FROM t')" : warehouse === 'databricks' ? "SELECT * FROM read_files('synthetic-easel-1')" : 'SELECT * FROM t CHANGES(INFORMATION => DEFAULT) AT(OFFSET => -60)'
  assert.equal((await june('warehouse-query-save', { name: 'Bad', warehouse, metric: 'active_users', sql: nativeOnly })).status, 400)
  assert.equal(remote.calls.length, before, 'policy refusals never contact a provider, including OAuth')
 }
 assert.equal((await june('warehouse-query-save', { name: 'Users', warehouse: 'snowflake', metric: 'active_users', sql }, planner)).status, 403)
 const saved = (await june('warehouse-query-save', { name: 'Monthly active users', warehouse: 'snowflake', metric: 'active_users', sql })).value
 assert.equal(saved.approved, null)
 remote.warehouse.snowflake = [{ period: '2026-01', value: '1500' }, { period: '2026-02', value: '1600.5' }, { period: '2026-03', value: '1800' }]
 assert.equal((await june('warehouse-refresh', { id: saved.id, revision: saved.revision })).status, 409, 'an unapproved query supplies nothing')
 const preview = (await june('warehouse-query-preview', { id: saved.id, revision: saved.revision })).value
 assert.deepEqual(preview.rows, [{ period: '2026-01', hundredths: 150000 }, { period: '2026-02', hundredths: 160050 }, { period: '2026-03', hundredths: 180000 }])
 assert.deepEqual(remote.queries, [sql], 'only the reviewed statement is sent')
 assert.deepEqual(await calc(), planOnly, 'a preview changes nothing')
 const previewed = (await h.get('/api/easel/warehouse')).queries[0]
 assert.equal((await june('warehouse-query-approve', { id: saved.id, revision: previewed.revision, fingerprint: 'not-the-result-you-reviewed' })).status, 409)
 const approved = (await june('warehouse-query-approve', { id: saved.id, revision: previewed.revision, fingerprint: preview.fingerprint })).value
 assert.equal(approved.approved.by, 'owner@example.test')
 const refreshed = (await june('warehouse-refresh', { id: saved.id, revision: approved.revision })).value
 assert.equal(refreshed.lastRefresh.rows, 3)

 // The monthly metric drives the revenue line; later months grow from the last measured quantity.
 const driven = await calc()
 assert.deepEqual(['2026-01', '2026-02', '2026-03', '2026-04'].map(m => cell(driven, m).amount), [300000, 320100, 360000, 396000])
 assert.match(cell(driven, '2026-02').sources[0].trace, /warehouse metric active_users for this month, 1,?600\.50 units.*finance-approved query/)

 // Streamed bytes, complete body deadline and row bounds refuse atomically.
 const result = rows => ({ resultSetMetaData: { rowType: [{ name: 'PERIOD' }, { name: 'VALUE' }], partitionInfo: [{}] }, data: rows })
 const monthly = Array.from({ length: 600 }, (_, i) => [`${2026 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, '1'])
 responseOverride = () => Response.json(result(monthly))
 let current = (await h.get('/api/easel/warehouse')).queries.find(q => q.id === saved.id)
 const full = await june('warehouse-query-preview', { id: saved.id, revision: current.revision })
 assert.equal(full.status, 200, full.text); assert.equal(full.value.rows.length, 600)
 assert.deepEqual(full.value.rows[599], { period: '2075-12', hundredths: 100 })
 // Exactly the ceiling remains usable; it is not an unconditional size refusal.
 const boundary = JSON.stringify({ ...result([['2026-01', '1']]), padding: '' })
 responseOverride = () => new Response(boundary.replace('"padding":""', '"padding":"' + 'x'.repeat(4_000_000 - Buffer.byteLength(boundary)) + '"'))
 current = (await h.get('/api/easel/warehouse')).queries.find(q => q.id === saved.id)
 const atByteLimit = await june('warehouse-query-preview', { id: saved.id, revision: current.revision })
 assert.equal(atByteLimit.status, 200, atByteLimit.text)
 assert.deepEqual(atByteLimit.value.rows, [{ period: '2026-01', hundredths: 100 }])
 const snapshot = await h.get('/api/easel/warehouse')
 const stream = (chunks, headers = {}) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close() } }), { headers })
 const small = JSON.stringify(result([['2026-01', '9999']]))
 const failures = [
  ['row overflow', () => Response.json(result([...monthly, ['2076-01', '1']])), 409, /too many rows/],
  ['declared oversized', () => new Response(small, { headers: { 'content-length': '4000001' } }), 502, /too large/],
  ['chunked oversized', () => stream(['{"padding":"', 'x'.repeat(2_000_000), 'x'.repeat(2_000_000), '"}']), 502, /too large/],
  ['invalid JSON', () => stream(['{"data":']), 502, /invalid JSON/],
  ['body deadline', () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() {} })), 502, /timed out/],
 ]
 for (const [label, respond, status, message] of failures) {
  responseOverride = respond
  // Both doors must refuse without replacing the last accepted observation.
  for (const op of label === 'body deadline' ? ['warehouse-refresh'] : ['warehouse-query-preview', 'warehouse-refresh']) {
   const q = snapshot.queries.find(q => q.id === saved.id), start = performance.now()
   const refused = await june(op, { id: q.id, revision: q.revision })
   assert.equal(refused.status, status, `${label} ${op}: ${refused.text}`)
   assert.match(refused.value.error, message, label)
   if (label === 'body deadline') assert.ok(performance.now() - start < 30000, 'a stalled body cannot outlive the request deadline')
   assert.deepEqual(await h.get('/api/easel/warehouse'), snapshot, `${label}: last refresh, approval and preview stay unchanged`)
   assert.deepEqual(await calc(), driven, `${label}: prior metric quantities and the plan stay unchanged`)
  }
 }
 // A valid chunked response below the ceiling is accepted.
 responseOverride = () => stream([small.slice(0, 20), small.slice(20)])
 current = snapshot.queries.find(q => q.id === saved.id)
 assert.equal((await june('warehouse-query-preview', { id: saved.id, revision: current.revision })).status, 200)
 responseOverride = undefined
 const afterPreview = (await h.get('/api/easel/warehouse')).queries.find(q => q.id === saved.id)
 const beforeInvalidEdit = await h.get('/api/easel/warehouse'), beforeCalls = remote.calls.length
 assert.equal((await june('warehouse-query-save', { ...afterPreview, sql: 'SELECT unknown_function()' })).status, 400)
 assert.equal(remote.calls.length, beforeCalls)
 assert.deepEqual(await h.get('/api/easel/warehouse'), beforeInvalidEdit, 'an invalid edit cannot withdraw approval or replace stored metrics')
 assert.deepEqual(await calc(), driven)

 // Editing the query withdraws approval until it is reviewed again.
 const edited = (await june('warehouse-query-save', { id: saved.id, revision: afterPreview.revision, name: 'Monthly active users', warehouse: 'snowflake', metric: 'active_users', sql: `${sql} LIMIT 600` })).value
 assert.equal(edited.approved, null)
 assert.equal((await june('warehouse-refresh', { id: saved.id, revision: edited.revision })).status, 409)

 // BigQuery and Databricks return the same shape; malformed results are refused.
 remote.warehouse.bigquery = [{ period: '2026-01', value: '250.5' }]; remote.warehouse.databricks = [{ period: '2026-01', value: '12' }]
 const bq = (await june('warehouse-query-save', { name: 'Shipments', warehouse: 'bigquery', metric: 'shipments', sql: 'SELECT FORMAT_DATE("%Y-%m", d) AS period, n AS value FROM ops.shipments ORDER BY 1 DESC' })).value
 assert.deepEqual((await june('warehouse-query-preview', { id: bq.id, revision: bq.revision })).value.rows, [{ period: '2026-01', hundredths: 25050 }])
 const db = (await june('warehouse-query-save', { name: 'Orders', warehouse: 'databricks', metric: 'orders', sql: "SELECT date_format(month, 'yyyy-MM') AS period, CAST(n AS DECIMAL(12,2)) AS value FROM ops.orders ORDER BY period ASC" })).value
 assert.deepEqual((await june('warehouse-query-preview', { id: db.id, revision: db.revision })).value.rows, [{ period: '2026-01', hundredths: 1200 }])
 remote.warehouse.databricks = [{ period: '2026-13', value: '1' }]
 assert.equal((await june('warehouse-query-preview', { id: db.id, revision: (await h.get('/api/easel/warehouse')).queries.find(q => q.metric === 'orders').revision })).status, 400)

 // The dataset endpoint: a saved report as a flat table for a scoped, read-only token.
 const report = await h.command('dashboard-save', { name: 'Board feed', scenario: budget.id, audience: 'board', department: '', widgets: [{ metric: 'revenue', display: 'table' }], report: { row: 'line', period: 'month', through: '2026-03', lines: [usage.id, payroll.id], comparisons: [], highlightBps: 1000 } })
 await h.stepUp(board)
 const issued = await h.send('/api/easel/tokens/issue', { label: 'Power BI', kind: 'service', scope: 'read' }, board)
 assert.equal(issued.status, 200); const bearer = { authorization: `Bearer ${issued.value.token}` }
 const dataset = async (format, headers = bearer) => h.mf.dispatchFetch(h.origin + `/api/easel/dataset/${report.id}?format=${format}`, { headers })
 const json = await (await dataset('json')).json()
 assert.deepEqual(json.columns, ['row_id', 'row_name', 'month', 'series', 'amount_minor', 'currency'])
 assert.ok(json.rows.length >= 6)
 const usageActual = json.rows.find(r => r.row_name === 'Platform usage' && r.month === '2026-02' && r.series === 'Actual')
 assert.equal(usageActual.currency, 'USD')
 assert.doesNotMatch(JSON.stringify(json), /Private principal engineer|Private Person|annualSalary|originId/)
 assert.equal((await h.mf.dispatchFetch(h.origin + `/api/easel/command/department`, { method: 'POST', headers: { ...bearer, 'content-type': 'application/json', origin: h.origin }, body: JSON.stringify({ name: 'X' }) })).status, 403, 'a read token cannot write')
 assert.equal((await h.mf.dispatchFetch(h.origin + `/api/easel/dataset/${report.id}?format=csv`)).status === 200, false, 'no token or session, no dataset')
 const asRows = d => d.rows.map(r => d.columns.map(c => r[c]))
 const csv = csvRows(await (await dataset('csv')).text()), parquetBytes = new Uint8Array(await (await dataset('parquet')).arrayBuffer())
 assert.deepEqual(csv, asRows(json).map(r => r.map(v => v === null ? null : String(v))))
 assert.deepEqual(readParquet(parquetBytes).rows, asRows(json))
 const book = await readWorkbook(new Uint8Array(await (await dataset('xlsx')).arrayBuffer()))
 assert.ok(book.getWorksheet('Saved report') && book.getWorksheet('Monthly'), 'the Excel door is the saved report workbook with its live formulas')
 assert.doesNotMatch(JSON.stringify(book.worksheets.map(w => w.getSheetValues())), /Private principal engineer|Private Person/)

 // The nightly drop: the audience's current access, no Pay detail, retried only for unfinished files.
 const connect = (store, input) => h.send(`/api/easel/connections/pack-stores/${store}/connect`, input, h.owner)
 const dropBody = { dashboard: report.id, store: 'drive', audience: 'board@example.test', formats: ['csv', 'parquet'], hour: 2 }
 assert.equal((await h.send('/api/easel/command/bi-drop-save', dropBody, h.owner)).status, 409, 'the store must be connected first')
 assert.equal((await connect('drive', { clientId: 'synthetic-easel-0', clientSecret: 'synthetic-easel-2', refreshToken: 'synthetic-easel-1', folderId: 'synthetic-easel-folder' })).status, 200)
 assert.equal((await h.send('/api/easel/command/bi-drop-save', dropBody, planner)).status, 403)
 assert.equal((await h.send('/api/easel/command/bi-drop-save', { ...dropBody, audience: 'nobody@example.test' }, h.owner)).status, 400)
 const drop = (await h.send('/api/easel/command/bi-drop-save', dropBody, h.owner)).value
 await run('2026-03-10T16:00:00.000Z'); assert.equal(remote.saved.drive.length, 0, 'a drop starts the night after it is saved')
 assert.equal((await h.send('/api/easel/connections/pack-stores/drive/disconnect', {}, h.owner)).status, 200)
 await run('2026-03-11T07:00:00.000Z')
 let runs = (await h.get('/api/easel/bi-drops')).runs
 assert.deepEqual([runs[0].status, runs[0].attempts], ['failed', 1]); assert.equal(remote.saved.drive.length, 0)
 assert.equal((await connect('drive', { clientId: 'synthetic-easel-0', clientSecret: 'synthetic-easel-2', refreshToken: 'synthetic-easel-1', folderId: 'synthetic-easel-folder' })).status, 200)
 await run('2026-03-11T07:30:00.000Z')
 runs = (await h.get('/api/easel/bi-drops')).runs
 assert.deepEqual([runs[0].status, runs[0].attempts, runs[0].receipts.map(r => r.format)], ['saved', 2, ['csv', 'parquet']])
 await run('2026-03-11T08:00:00.000Z'); assert.equal(remote.saved.drive.length, 2, 'a saved night is never dropped twice')
 const files = Object.fromEntries(remote.saved.drive.map(f => [f.name.split('.').pop(), f]))
 assert.match(files.csv.name, /^easel-dataset-board-feed-2026-03-11\.csv$/)
 const nightly = await (await dataset('json')).json()
 assert.deepEqual(csvRows(files.csv.bytes.toString()), asRows(nightly).map(r => r.map(v => v === null ? null : String(v))), 'CSV drop rows equal the endpoint rows')
 assert.deepEqual(readParquet(new Uint8Array(files.parquet.bytes)).rows, asRows(nightly), 'Parquet drop rows equal the endpoint rows')
 assert.doesNotMatch(files.csv.bytes.toString() + files.parquet.bytes.toString('latin1'), /Private principal engineer|Private Person|annualSalary/)
 assert.equal(drop.revision, 1)
})
