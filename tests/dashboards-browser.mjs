// REPORT-002: real saved dashboards, personal layouts, live Excel and revocation.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { dashboardFixture } from './dashboard-fixture.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-dashboards')
await mkdir(evidence, { recursive: true })
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const press = (scope, name) => scope.getByRole('button', { name, exact: true }).click()
const settle = page => page.waitForLoadState('networkidle', { timeout: 15000 })
const tab = async page => { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Dashboards', exact: true }).click(); await settle(page) }
const saved = async (page, op, click) => {
 const response = page.waitForResponse(r => r.url().endsWith(`/api/easel/command/${op}`) && r.request().method() === 'POST')
 await click()
 const result = await response
 assert.equal(result.status(), 200, `REPORT-002 ${op}: ${await result.text()}`)
 await settle(page)
}
async function shoot(page, name, width) {
 await settle(page)
 await noOverflow(page, `REPORT-002 ${name} ${width}`)
 await page.screenshot({ path: join(evidence, `dashboard-${name}-${width}.png`), fullPage: true })
}
function privateDetailsAbsent(value) { assert.doesNotMatch(value, /Private Salary Person|Private compensation|annualSalary|salaryCents|"holder"|"positions"/, 'REPORT-002 board receives aggregate metrics without private compensation inputs') }
async function metricChecks(reader, origin, id) {
 const view = await api(reader.context, origin, `dashboards/${id}`)
 assert.equal(view.blocked, null)
 assert.equal(view.currency, 'USD')
 assert.equal(view.rows.length, 12)
 for (const [index, row] of view.rows.entries()) {
  assert.equal(row.arr, 12000000, 'ARR excludes nonrecurring revenue on the same planning line')
  assert.equal(row.headcount, 2)
  assert.equal(row.revenue, 1500000)
  assert.equal(row.grossMargin, 1200000)
  assert.equal(row.burn, 550000)
  assert.equal(row.closingCash, 10000000 - (index + 1) * 550000)
  assert.equal(row.runway, Math.round(row.closingCash * 100 / row.burn), 'Runway is monthly closing cash divided by trailing average net burn')
 }
 assert.equal(view.rows.at(-1).runway, 618)
 return view
}
async function renderedMetrics(page) {
 await card(page, 'Runway').getByText('6.18 months', { exact: true }).waitFor()
 await card(page, 'ARR').getByText('$120,000.00', { exact: true }).waitFor()
 await card(page, 'Headcount').getByText('2 people', { exact: true }).waitFor()
}

let server, browser, finance
const readers = []
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 readers.push(finance)
 const call = (path, body) => api(finance.context, server.origin, path, body)
 const fixture = await dashboardFixture((op, body) => call(`command/${op}`, body), path => call(path))
 await call('command/member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer', departments: [] })
 for (const width of [1440, 390]) {
  const page = finance.page, name = `Board operating outlook ${width}`
  await page.setViewportSize({ width, height: 1000 })
  await page.reload(); await tab(page)
  await press(card(page, 'Dashboards'), 'Create dashboard')
  const editor = card(page, 'Create dashboard')
  await editor.getByLabel('Dashboard name', { exact: true }).fill(name)
  await editor.getByLabel('Source scenario', { exact: true }).selectOption(fixture.budget.id)
  await editor.getByLabel('Audience', { exact: true }).selectOption('board')
  for (const [metric, display] of [['runway', 'tile'], ['arr', 'tile'], ['headcount', 'tile']]) {
   await editor.getByLabel('Add metric', { exact: true }).selectOption(metric)
   await press(editor, 'Add widget')
   const label = { runway: 'Runway', arr: 'ARR', headcount: 'Headcount' }[metric]
   await editor.getByLabel(`${label} display`, { exact: true }).selectOption(display)
  }
  await shoot(page, 'finance-definition', width)
  await saved(page, 'dashboard-save', () => press(editor, 'Create dashboard'))
  const definition = (await call('dashboards')).find(d => d.name === name)
  assert.ok(definition, 'UI-created dashboard is persisted')
  assert.equal(definition.audience, 'board')
  assert.equal(definition.scenario, fixture.budget.id)
  // REPORT-001, REPORT-008 saved numeric definitions share the existing dashboard audience.
  await call('command/dashboard-save', { ...definition, report: { row: 'department', period: 'quarter', through: '2026-03', lines: [fixture.revenue.id], highlightBps: 1000 } })
  await page.reload(); await tab(page)
  await page.getByLabel('Dashboard', { exact: true }).selectOption(definition.id)
  await settle(page); await card(page, name).waitFor()
  await renderedMetrics(page)
  const financeView = await metricChecks(finance, server.origin, definition.id)
  await shoot(page, 'finance', width)

  const board = await session(browser, root, server.origin, 'board', width)
  readers.push(board)
  const bp = board.page
  await tab(bp)
  await bp.getByLabel('Dashboard', { exact: true }).selectOption(definition.id)
  await settle(bp); await card(bp, name).waitFor()
  await renderedMetrics(bp)
  privateDetailsAbsent(JSON.stringify(await metricChecks(board, server.origin, definition.id)))
  privateDetailsAbsent(await bp.locator('body').innerText())
  assert.equal(await bp.getByRole('button', { name: 'Edit and share', exact: true }).count(), 0)
  await shoot(bp, 'board', width)

  const [reportDownload] = await Promise.all([bp.waitForEvent('download'), bp.getByRole('link', { name: 'Download saved report (Excel)', exact: true }).click()])
  assert.equal(await reportDownload.failure(), null)
  const reportBook = await readWorkbook(await readFile(await reportDownload.path()))
  const reportSheet = reportBook.getWorksheet('Saved report')
  const salesQuarter = reportSheet.getRows(3, reportSheet.rowCount - 2).find(row => row.getCell(1).value === 'Sales' && row.getCell(2).value === 'FY2026 Q1')
  assert.ok(salesQuarter)
  assert.equal(salesQuarter.getCell(4).result, 4500000, 'REPORT-001 department quarter equals the three planned months')
  assert.equal(salesQuarter.getCell(3).value, null, 'REPORT-001 no actuals is unavailable, never zero')
  privateDetailsAbsent(JSON.stringify(reportBook.model))
  const report = await api(board.context, server.origin, `dashboards/${definition.id}/report`)
  assert.equal(report.rows.find(r => r.name === 'Sales' && r.period === 'YTD').budget, 4500000)

  const [download] = await Promise.all([bp.waitForEvent('download'), bp.getByRole('link', { name: 'Download dashboard (Excel)', exact: true }).click()])
  assert.equal(await download.failure(), null)
  const exported = join(evidence, `dashboard-board-${width}.xlsx`)
  await download.saveAs(exported)
  const workbook = await readWorkbook(await readFile(exported))
  proveFormulas(workbook)
  const sheet = workbook.getWorksheet('Dashboard')
  assert.ok(sheet)
  assert.equal(sheet.getCell('G3').result, 12000000)
  assert.equal(evaluate(sheet, 'G3', new Map([['F3', 2000000]])), 24000000, 'ARR remains a live annualisation formula')
  assert.equal(sheet.getCell('E14').value, 2)
  assert.equal(sheet.getCell('I14').value, 618)
  privateDetailsAbsent(JSON.stringify(workbook.model))

  const layout = card(bp, name)
  await layout.getByText('Arrange my dashboard', { exact: true }).click()
  await press(layout, 'Move Headcount up'); await press(layout, 'Move Headcount up')
  await layout.getByLabel('Headcount display', { exact: true }).selectOption('table')
  await layout.getByLabel('Runway display', { exact: true }).selectOption('tile')
  await layout.getByLabel('ARR display', { exact: true }).selectOption('chart')
  await saved(bp, 'dashboard-layout', () => press(layout, 'Save my layout'))
  const expectedLayout = [{ metric: 'headcount', display: 'table' }, { metric: 'runway', display: 'tile' }, { metric: 'arr', display: 'chart' }]
  await bp.reload(); await tab(bp)
  await bp.getByLabel('Dashboard', { exact: true }).selectOption(definition.id)
  await settle(bp)
  assert.deepEqual((await api(board.context, server.origin, `dashboards/${definition.id}`)).widgets, expectedLayout)
  assert.deepEqual((await call(`dashboards/${definition.id}`)).widgets, financeView.widgets, 'Board personal layout does not change finance layout')
  assert.deepEqual(await bp.locator('section.card > h2').allInnerTexts(), ['Dashboards', name, 'Headcount', 'Runway', 'ARR'])
  assert.equal(await card(bp, 'Headcount').getByRole('table', { name: 'Headcount by month', exact: true }).getByRole('row').last().getByRole('cell').innerText(), '2 people')
  assert.doesNotMatch(await card(bp, 'Headcount').innerText(), /USD|\$/)
  await card(bp, 'ARR').getByRole('img', { name: 'ARR by month', exact: true }).waitFor()
  assert.equal(await card(bp, 'ARR').locator('.table-scroll').getByRole('table', { name: 'ARR by month', exact: true }).getByRole('row').last().getByRole('cell').first().innerText(), '$120,000.00')
  await card(bp, 'Runway').getByText('6.18 months', { exact: true }).waitFor()
  privateDetailsAbsent(await bp.locator('body').innerText())
  await shoot(bp, 'board-customized', width)

  await press(card(page, name), 'Edit and share')
  const edit = card(page, 'Edit and share dashboard')
  await edit.getByLabel('Audience', { exact: true }).selectOption('private')
  await saved(page, 'dashboard-save', () => press(edit, 'Save dashboard definition'))
  assert.equal((await call(`dashboards/${definition.id}`)).dashboard.audience, 'private')
  await press(card(bp, 'Dashboards'), 'Reload dashboards')
  await card(bp, name).waitFor({ state: 'detached' })
  await settle(bp)
  assert.equal((await api(board.context, server.origin, 'dashboards')).some(d => d.id === definition.id), false)
  for (const suffix of ['', '/document.xlsx', '/report', '/report.xlsx']) {
   const denied = await board.context.request.get(`${server.origin}/api/easel/dashboards/${definition.id}${suffix}`)
   assert.equal(denied.status(), 404, 'Revoked dashboard and workbook access are checked server-side')
  }
  assert.equal(await bp.getByRole('link', { name: 'Download dashboard (Excel)', exact: true }).count(), 0)
  assert.equal(await bp.getByRole('link', { name: 'Download saved report (Excel)', exact: true }).count(), 0)
  await shoot(bp, 'board-revoked', width)
  await board.context.close()
  console.log(`REPORT-002 ${width}: UI dashboard, aggregate metrics, Excel formulas, personal layout persistence and access revocation passed`)
 }
} catch (error) {
 for (const [index, reader] of readers.entries()) if (!reader.page.isClosed()) await reader.page.screenshot({ path: join(evidence, `dashboard-failed-${index}.png`), fullPage: true }).catch(() => {})
 throw error
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
