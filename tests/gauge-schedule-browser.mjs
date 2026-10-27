// Built native Settings proof; only Gauge's aggregate network edge is replaced.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/gauge-schedule')
await mkdir(evidence, { recursive: true })
// Mint an ephemeral scoped credential at the provider edge; never store a key fixture.
const key = ['gauge', 'util', randomBytes(32).toString('base64url')].join('_')
let status = 200, billable = 3600, now = '2026-03-07T08:05:00.000Z'
const runtime = await builtBrowserRuntime({ now: () => now, bindings: { GAUGE_ORIGIN: 'https://gauge.example.test' }, outbound: async request => {
 const u = new URL(request.url)
 assert.equal(u.origin, 'https://gauge.example.test'); assert.equal(request.headers.get('authorization'), `Bearer ${key}`)
 if (u.pathname.endsWith('/revoke')) return new Response(null)
 if (status !== 200) return new Response(null, { status })
 return Response.json({ scope: 'utilization:read', from: u.searchParams.get('from'), to: u.searchParams.get('to'), asOf: now, participantCount: 2, availableSeconds: 7200, knownAvailableSeconds: 7200, missingCalendarDays: 0, approvedBillableSeconds: billable })
} })
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_EXECUTABLE ? { executablePath: process.env.EASEL_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext()
 const post = async (path, body, expected = 200) => { const r = await context.request.post(runtime.origin + path, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 }); assert.equal(r.status(), expected, await r.text()); return expected === 200 ? r.json() : null }
 await post('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Fran Finance' }, 303)
 await post('/api/easel/command/workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 page = await context.newPage(); track(page)
 await page.goto(runtime.origin + '/setup')
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Connections', exact: true }) })
 const action = async (path, click) => { const pending = page.waitForResponse(r => r.url().endsWith(path)); await click(); const response = await pending; assert.equal(response.status(), 200, await response.text()); await settle(page); return response.json() }
 // Assert the flow once at desktop width; capture its changed native screens at both widths.
 await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(runtime.origin + '/app?tab=settings')
 await panel.getByLabel('Gauge read key', { exact: true }).fill(key)
 await action('/connections/gauge/connect', () => panel.getByRole('button', { name: 'Connect Gauge', exact: true }).click())
 await panel.getByLabel('Observation cadence', { exact: true }).selectOption('nightly')
 await panel.getByLabel('Scheduled observation month', { exact: true }).fill('2026-01')
 await panel.getByLabel(`Allow scheduled read-only observations in ${['America', 'New_York'].join('/')}`, { exact: true }).check()
 const saved = await action('/connections/gauge/schedule', () => panel.getByRole('button', { name: 'Save Gauge schedule', exact: true }).click())
 assert.equal(saved.refreshSchedule.cadence, 'nightly'); assert.equal(saved.refreshSchedule.month, '2026-01')
 await page.reload(); await panel.getByLabel('Observation cadence', { exact: true }).waitFor()
 assert.equal(await panel.getByLabel('Observation cadence', { exact: true }).inputValue(), 'nightly')
 assert.equal(await panel.getByLabel('Scheduled observation month', { exact: true }).inputValue(), '2026-01')
 const command = (op, body) => post('/api/easel/command/' + op, body)
 const state = await (await context.request.get(runtime.origin + '/api/easel/state')).json()
 const budget = state.scenarios[0]
 const department = await command('department', { name: 'Advisory' })
 const line = await command('line', { name: 'Services', type: 'revenue' })
 const driver = await command('revenue', { scenario: budget.id, kind: 'services', name: 'Agency services', line: line.id, department: department.id, start: '2026-01', collectionLag: 1, monthlyHours: '160', utilizationPercent: '75', hourlyRate: '150' })
 const read = async path => { const response = await context.request.get(runtime.origin + '/api/easel/' + path); assert.equal(response.status(), 200, await response.text()); return response.json() }
 const initial = await read('scenario/' + budget.id)
 const args = { scenario: budget.id, driver: driver.id, month: '2026-01', scenarioRevision: initial.scenario.revision }
 const preview = await post('/api/easel/gauge/preview', args)
 await post('/api/easel/gauge/accept', { ...args, digest: preview.digest })
 const report = await command('report-save', { name: 'Gauge source report', scenario: budget.id, department: department.id, audience: 'board', report: { row: 'line', period: 'month', through: '2026-01', lines: [line.id] } })
 const accepted = await read('scenario/' + budget.id), acceptedInputs = accepted.inputs
 billable = 7200
 now = '2026-03-08T07:05:00.000Z'
 await (await runtime.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 let current = await read('scenario/' + budget.id)
 assert.equal(current.gaugeFreshness[0].observationStatus, 'changed-since-acceptance')
 assert.equal(current.gaugeFreshness[0].lastSuccess, now)
 assert.deepEqual(current.inputs, acceptedInputs); assert.deepEqual(current.calculation, accepted.calculation)
 await page.goto(runtime.origin + '/app?tab=overview')
 const healthyRegion = page.getByRole('region', { name: 'Gauge source freshness', exact: true })
 await healthyRegion.getByText(/Current observation/).waitFor()
 assert.match(await healthyRegion.innerText(), /differs from the accepted source/)
 status = 503; now = '2026-03-09T07:05:00.000Z'
 await (await runtime.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 current = await read('scenario/' + budget.id)
 assert.equal(current.gaugeFreshness[0].stale, true); assert.match(current.gaugeFreshness[0].error, /HTTP 503/)
 assert.deepEqual(current.inputs, acceptedInputs); assert.deepEqual(current.calculation, accepted.calculation)
 // Reading another month succeeds without laundering January's failure.
 status = 200
 await post('/api/easel/connections/gauge/check', { month: '2026-02' })
 assert.match((await read('scenario/' + budget.id)).gaugeFreshness[0].error, /HTTP 503/)
 const workingPlan = await command('branch', { from: budget.id, name: 'Gauge working plan' })
 const forecast = (await command('approve-budget', { scenario: budget.id, revision: current.scenario.revision })).forecast
 await command('account-map', { account: '400', target: line.id })
 await command('department-map', { source: 'Advisory', department: department.id })
 const actuals = { filename: 'synthetic-easel-1.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Advisory,-240\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const staged = await post('/api/easel/import/actuals/preview', actuals)
 await post('/api/easel/import/actuals/commit', { ...actuals, fingerprint: staged.fingerprint })
 await command('close-month', { scenario: forecast.id, month: '2026-01' })
 const snapshotId = (await read('scenario/' + budget.id)).scenario.approval.snapshot
 const capture = await read('snapshot/' + snapshotId)
 const screens = [
  ['settings', panel],
  ['overview', page.getByRole('region', { name: 'Gauge source freshness', exact: true })],
  ['plan', page.getByRole('region', { name: 'Gauge source freshness', exact: true })],
  ['dashboards', page.getByRole('region', { name: 'Gauge source freshness', exact: true }).first()],
  ['reports', page.getByRole('region', { name: 'Gauge source freshness', exact: true })],
  ['review', page.getByRole('region', { name: 'Gauge source freshness', exact: true })],
 ]
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  for (const [tab, region] of screens) {
   await page.goto(runtime.origin + '/app?tab=' + tab)
   if (tab === 'overview' || tab === 'plan') await page.getByLabel('Scenario', { exact: true }).selectOption(tab === 'overview' ? budget.id : workingPlan.id)
   await region.waitFor(); await settle(page)
   if (width === 1440 && tab !== 'settings') {
    const text = await region.innerText()
    assert.match(text, /Stale observation/); assert.match(text, /HTTP 503/)
    assert.match(text, /differs from the accepted source/)
    assert.ok(text.includes('2026-03-08T07:05:00.000Z'))
   }
   await region.scrollIntoViewIfNeeded(); await noOverflow(page, `Gauge freshness ${tab} ${width}`)
   await page.screenshot({ path: join(evidence, `${tab}-${width}.png`), fullPage: true })
   const missingTips = await page.getByRole('button').evaluateAll(nodes => nodes.filter(n => !(n.textContent ?? '').trim() && !n.querySelector('[role=tooltip]')).map(n => n.getAttribute('aria-label')))
   assert.deepEqual(missingTips, [], `Icon-only controls have tooltips on ${tab}`)
  }
 }
 assert.deepEqual(await read('snapshot/' + snapshotId), capture)
 console.log(`CONNECT-005: source-month success, scheduled failure, accepted provenance, unchanged model and captures, consuming screens at 1440 and 390; report ${report.id}`)

} catch (error) { if (page) await page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
