// Built native screens with real sessions and D1; only provider HTTP edges are faked.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command } from './browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
import { providerFakes } from './provider-fakes.mjs'
import { readParquet } from './parquet-reader.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-bi-feeds')
await mkdir(evidence, { recursive: true })
if (!process.argv.includes('--existing-build')) await command(process.cwd(), ['build'])
const remote = providerFakes(), messages = []
let oversized = false
const runtime = await builtBrowserRuntime({ https: true, bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-900000001' }, outbound: async request => {
 if (new URL(request.url).hostname === 'api.resend.com') { messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) }
 if (oversized && new URL(request.url).hostname.endsWith('snowflakecomputing.com')) return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(' '.repeat(2_000_000))); c.enqueue(new TextEncoder().encode(' '.repeat(2_000_001))); c.close() } }))
 return remote.outbound(request)
} })
let browser, finance, board
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 finance = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
 const send = async (path, body, status = 200) => {
  const r = await finance.request[body === undefined ? 'get' : 'post'](runtime.origin + path, { headers: { origin: runtime.origin }, ...(body === undefined ? {} : { data: body }), maxRedirects: 0 })
  assert.equal(r.status(), status, await r.text()); return status === 200 ? r.json() : null
 }
 const call = (path, body) => send('/api/easel/' + path, body), cmd = (op, body) => call('command/' + op, body)
 await send('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Fran Finance' }, 303)
 const page = await finance.newPage(); track(page); page.on('dialog', d => d.accept())
 await page.goto(runtime.origin + '/setup'); await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); await page.waitForURL('**/app')
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Platform usage', type: 'revenue' })
 const payroll = await cmd('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 await cmd('member', { email: 'board@example.test', name: 'Board', role: 'viewer' })
 const budget = (await call('state')).scenarios[0]
 await cmd('position', { scenario: budget.id, title: 'Private principal engineer', holder: 'Private Person', department: sales.id, line: payroll.id, start: '2026-01', annualSalary: '120000', onCostPercent: '0' })
 await cmd('revenue', { scenario: budget.id, name: 'Active users', kind: 'usage', line: revenue.id, department: sales.id, start: '2026-01', startUsage: '1000', growthPercent: '10', unitPrice: '2', warehouseMetric: 'active_users', collectionLag: 0 })
 await cmd('dashboard-save', { name: 'Board feed', scenario: budget.id, audience: 'board', department: '', widgets: [{ metric: 'revenue', display: 'table' }], report: { row: 'line', period: 'month', through: '2026-03', lines: [revenue.id, payroll.id], comparisons: [], highlightBps: 1000 } })
 await call('invite', { email: 'board@example.test' })
 const token = new URL(messages.find(m => m.to.includes('board@example.test')).text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 board = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
 assert.equal((await board.request.post(runtime.origin + '/auth/confirm', { headers: { origin: runtime.origin }, data: { token }, maxRedirects: 0 })).status(), 303)

 // Query validation and a bounded provider refusal appear beside the native actions.
 await page.goto(runtime.origin + '/app?tab=settings')
 const card = page.getByLabel('Warehouse metrics')
 await card.getByLabel('Snowflake account', { exact: true }).fill('acme-prod.us-east-1')
 await card.getByLabel('Snowflake token', { exact: true }).fill('synthetic-easel-sf')
 await card.getByRole('button', { name: 'Connect Snowflake', exact: true }).click(); await settle(page)
 await card.getByRole('button', { name: 'Disconnect Snowflake', exact: true }).waitFor()
 await card.getByLabel('Query name', { exact: true }).fill('Monthly active users')
 await card.getByLabel('Warehouse', { exact: true }).selectOption('snowflake')
 await card.getByLabel('Metric name', { exact: true }).fill('active_users')
 await card.getByLabel('Read-only query', { exact: true }).fill("SELECT TO_CHAR(month, 'YYYY-MM') AS period, n AS value FROM usage.monthly_active")
 await card.getByRole('button', { name: 'Save query', exact: true }).click(); await settle(page)
 remote.warehouse.snowflake = [{ period: '2026-01', value: '1500' }]
 await card.getByRole('button', { name: 'Preview result', exact: true }).click(); await settle(page)
 const result = card.getByRole('table', { name: 'Result of Monthly active users', exact: true })
 assert.deepEqual(await result.locator('tbody tr').first().getByRole('cell').allTextContents(), ['2026-01', '1500.00'])
 await card.getByRole('button', { name: 'Approve this query and result', exact: true }).click(); await settle(page)
 await card.getByRole('button', { name: 'Refresh metric', exact: true }).click(); await settle(page)
 const accepted = await call('warehouse'), plan = await call(`scenario/${budget.id}`)
 assert.equal(plan.calculation.cells.find(c => c.line === revenue.id && c.month === '2026-01').amount, 300000)
 oversized = true
 await card.getByRole('button', { name: 'Refresh metric', exact: true }).click(); await settle(page)
 await card.getByRole('alert').filter({ hasText: 'response is too large; prior metrics were kept' }).waitFor()
 const calls = remote.calls.length
 await card.getByLabel('Query name', { exact: true }).fill('Unsafe query')
 await card.getByLabel('Warehouse', { exact: true }).selectOption('snowflake')
 await card.getByLabel('Metric name', { exact: true }).fill('unsafe_metric')
 await card.getByLabel('Read-only query', { exact: true }).fill("SELECT SYSTEM$SEND_EMAIL('synthetic-easel-1')")
 await card.getByRole('button', { name: 'Save query', exact: true }).click(); await settle(page)
 await card.getByRole('alert').filter({ hasText: 'function is not supported' }).waitFor()
 assert.equal(remote.calls.length, calls, 'unsafe SQL is refused before provider contact')
 assert.deepEqual(await call('warehouse'), accepted, 'native refusals retain accepted metrics and approval')
 assert.deepEqual(await call(`scenario/${budget.id}`), plan, 'native refusals keep the plan unchanged')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await settle(page); await noOverflow(page, `Warehouse errors ${width}`)
  for (const button of await card.getByRole('button').all()) {
   if ((await button.innerText()).trim()) continue
   await button.focus(); assert.ok(await page.getByRole('tooltip').isVisible(), 'icon controls show a tooltip on focus')
  }
  await card.screenshot({ path: join(evidence, `warehouse-errors-${width}.png`) })
 }
 for (const [as, context] of [['owner', finance], ['board', board]]) {
  const p = as === 'owner' ? page : await context.newPage(); if (as === 'board') track(p)
  await p.setViewportSize({ width: 1440, height: 1000 }); await p.goto(runtime.origin + '/app?tab=reports')
  const feed = p.getByLabel('BI dataset'); await feed.waitFor()
  for (const [name, extension, magic] of [['Download dataset (CSV)', 'csv', 'row_id,'], ['Download dataset (Parquet)', 'parquet', 'PAR1']]) {
   const download = p.waitForEvent('download'); await feed.getByRole('link', { name, exact: true }).click()
   const saved = join(evidence, `dataset-${as}.${extension}`); await (await download).saveAs(saved)
   const bytes = await readFile(saved); assert.equal(bytes.subarray(0, magic.length).toString('latin1'), magic)
   assert.doesNotMatch(bytes.toString('latin1'), /Private principal engineer|Private Person|annualSalary/)
   if (extension === 'parquet') assert.ok(readParquet(new Uint8Array(bytes)).rows.length >= 6)
  }
  if (as === 'owner') assert.ok(await feed.getByText('Connect Chest, Google Drive or SharePoint', { exact: false }).count() > 0)
  else assert.equal(await feed.getByRole('heading', { name: 'Nightly drops' }).count(), 0)
  for (const width of [1440, 390]) { await p.setViewportSize({ width, height: 1000 }); await settle(p); await noOverflow(p, `BI dataset ${as} ${width}`); await feed.screenshot({ path: join(evidence, `bi-dataset-${as}-${width}.png`) }) }
 }
 console.log('REPORT-007 native supported SELECT, approval, metric refresh, policy and streamed-byte refusals retain metrics and plan; dataset privacy asserted at 1440, screens captured at 1440 and 390')
} finally { await finance?.close(); await board?.close(); await browser?.close(); await runtime.close() }
