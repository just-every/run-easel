import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-saved-reports')
await mkdir(evidence, { recursive: true })
let server, browser, finance, board
const card = (page, title) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const tab = async (page, title) => { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: title, exact: true }).click(); await settle(page) }
const saved = async (page, op, click) => { const pending = page.waitForResponse(r => r.url().endsWith(`/command/${op}`)); await click(); const result = await pending; assert.equal(result.status(), 200, await result.text()); await settle(page); return result.json() }
try {
 const port = await freePort(); await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)]); server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(finance.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Cardinal Advisory', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', timeZone: 'America/New_York' })
 const sales = await cmd('department', { name: 'Sales' }), delivery = await cmd('department', { name: 'Delivery' })
 const revenue = await cmd('line', { name: 'Retainer revenue', type: 'revenue' }), payroll = await cmd('line', { name: 'People costs', type: 'operating-expense', payroll: true })
 const budget = (await api(finance.context, server.origin, 'state')).scenarios[0]
 await cmd('revenue', { scenario: budget.id, name: 'Retainer contracts', line: revenue.id, department: sales.id, start: '2026-01', kind: 'volume', startVolume: '12', rate: '1000' })
 await cmd('position', { scenario: budget.id, title: 'Private salary role', holder: 'Private compensation person', line: payroll.id, department: sales.id, start: '2026-01', annualSalary: '150000' })
 await cmd('account-map', { account: '400', target: revenue.id }); await cmd('department-map', { source: 'Sales', department: sales.id }); await cmd('department-map', { source: 'Delivery', department: delivery.id })
 const rows = []
 for (const year of [2025, 2026]) for (let month = 1; month <= 12; month++) for (const dept of ['Sales', 'Delivery']) rows.push(`${year}-${String(month).padStart(2, '0')}-15,400,${dept},-${dept === 'Delivery' ? '90000' : year === 2025 ? '10000' : '15000'}`)
 const file = { filename: 'synthetic-easel-4.csv', dateFormat: 'YYYY-MM-DD', csv: `Date,Account,Department,Amount\n${rows.join('\n')}\n` }
 const preview = await api(finance.context, server.origin, 'import/actuals/preview', file)
 await api(finance.context, server.origin, 'import/actuals/commit', { ...file, fingerprint: preview.fingerprint })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board reviewer', role: 'viewer' })
 board = await session(browser, root, server.origin, 'board', 1440)
 await finance.page.reload(); await finance.page.getByRole('navigation', { name: 'Easel' }).waitFor()
 let report
 for (const width of [1440, 390]) {
  for (const s of [finance, board]) await s.page.setViewportSize({ width, height: 1000 })
  await tab(finance.page, 'Reports')
  await finance.page.getByRole('button', { name: report ? 'Edit report' : 'Build report', exact: true }).click()
  const editor = card(finance.page, report ? 'Edit report' : 'Build report')
  await editor.getByLabel('Report name', { exact: true }).fill('Quarterly Sales review')
  await editor.getByLabel('Source version', { exact: true }).selectOption(budget.id)
  await editor.getByLabel('Rows', { exact: true }).selectOption('department')
  await editor.getByLabel('Columns', { exact: true }).selectOption('quarter')
  await editor.getByLabel('Through month', { exact: true }).fill('2026-03')
  await editor.getByLabel('Report lines', { exact: true }).selectOption([revenue.id])
  await editor.getByLabel('Department filter', { exact: true }).selectOption(sales.id)
  await editor.getByLabel('Highlight above (basis points)', { exact: true }).fill('1000')
  await editor.getByLabel('Share with', { exact: true }).selectOption('board')
  await noOverflow(finance.page, `Report builder ${width}`); await editor.screenshot({ path: join(evidence, `report-builder-${width}.png`) })
  report = await saved(finance.page, 'report-save', () => editor.getByRole('button', { name: 'Save report', exact: true }).click())
  const panel = card(finance.page, 'Quarterly Sales review')
  await panel.getByRole('table', { name: 'Quarterly Sales review', exact: true }).waitFor()
  const view = await api(finance.context, server.origin, `dashboards/${report.id}/report`)
  assert.equal(view.rows.find(r => r.period === 'FY2026 Q1').actual, 4500000)
  assert.equal(view.rows.find(r => r.period === 'YTD').actual, 4500000)
  assert.equal(view.rows.find(r => r.period === 'TTM').actual, 13500000)
  assert.equal(view.rows.find(r => r.period === 'FY2026 Q1').yoyBps, 5000)
  assert.ok((await panel.innerText()).includes('Above threshold'))
  await panel.getByLabel('Report display', { exact: true }).selectOption('chart')
  await saved(finance.page, 'report-layout', () => panel.getByRole('button', { name: 'Save my report display', exact: true }).click())
  await noOverflow(finance.page, `Report output ${width}`); await panel.screenshot({ path: join(evidence, `report-output-${width}.png`) })
  const schedules = card(finance.page, 'Scheduled reports')
  if (width === 1440) {
   await schedules.getByLabel('Scheduled report', { exact: true }).selectOption(report.id)
   await schedules.getByLabel('Named recipients (emails, separated by commas)', { exact: true }).fill('owner@example.test, board@dev.localhost')
   await schedules.getByLabel('Frequency', { exact: true }).selectOption('weekly')
   await schedules.getByLabel('Weekly day', { exact: true }).selectOption('1')
   await schedules.getByLabel('Local hour (0–23)', { exact: true }).fill('8')
   await saved(finance.page, 'report-schedule-save', () => schedules.getByRole('button', { name: 'Schedule report', exact: true }).click())
  }
  assert.ok((await schedules.innerText()).includes('America/New_York'))
  await schedules.screenshot({ path: join(evidence, `report-schedule-${width}.png`) })
  await board.page.reload(); await board.page.getByRole('navigation', { name: 'Easel' }).waitFor(); await tab(board.page, 'Reports')
  const boardPanel = card(board.page, 'Quarterly Sales review')
  await boardPanel.getByRole('table', { name: 'Quarterly Sales review', exact: true }).waitFor()
  assert.equal(await boardPanel.getByLabel('Report display', { exact: true }).inputValue(), 'table', 'Personal layout stays independent')
  assert.doesNotMatch(await boardPanel.innerText(), /Private salary role|Private compensation person|Delivery/)
  const copy = await api(board.context, server.origin, `dashboards/${report.id}/report`)
  assert.doesNotMatch(JSON.stringify(copy), /annualSalary|holder|originId|Private compensation person/)
  const response = await board.context.request.get(`${server.origin}/api/easel/dashboards/${report.id}/report.xlsx`)
  assert.equal(response.status(), 200); proveFormulas(await readWorkbook(await response.body()))
  await noOverflow(board.page, `Shared report ${width}`); await boardPanel.screenshot({ path: join(evidence, `report-viewer-${width}.png`) })
  await tab(finance.page, 'Dashboards'); await finance.page.getByLabel('Dashboard', { exact: true }).selectOption(report.id); await settle(finance.page)
  const widget = card(finance.page, 'Saved report'); await widget.getByRole('table', { name: 'Quarterly Sales review', exact: true }).waitFor()
  await noOverflow(finance.page, `Report dashboard ${width}`); await widget.screenshot({ path: join(evidence, `report-dashboard-${width}.png`) })
  console.log(`Saved reports ${width}: quarter builder, filter/highlight, YTD/TTM/prior-year/YoY, viewer copy, Excel, independent chart layout, dashboard and named schedule passed`)
 }
} catch (error) { if (finance?.page && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }) }
