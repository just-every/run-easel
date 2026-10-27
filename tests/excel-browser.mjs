// Excel write-back read in the production Plan grid; Office qualification is
// separately required and is never inferred from this native browser proof.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { installExcelHost } from './excel-host.mjs'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { api, noOverflow } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-excel')
await mkdir(evidence, { recursive: true })
const messages = []
let server, browser
try {
 server = await builtBrowserRuntime({ https: true, bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1' }, outbound: async request => {
  if (new URL(request.url).hostname === 'api.resend.com') { messages.push(await request.json()); return Response.json({ id: 'synthetic-easel-2' }) }
  return new Response('Unexpected provider', { status: 502 })
 } })
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 assert.equal((await owner.request.post(`${server.origin}/auth/bootstrap`, { headers: { origin: server.origin }, data: { token: server.bootstrap, displayName: 'Finance' }, maxRedirects: 0 })).status(), 303)
 const cmd = (op, body) => api(owner, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'synthetic-easel-1', currency: 'USD', planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Sales' }), line = await cmd('line', { name: 'Revenue', type: 'revenue' })
 const scenario = (await api(owner, server.origin, 'state')).scenarios[0].id
 const row = await cmd('schedule', { scenario, name: 'Excel revenue', department: dept.id, line: line.id, values: { '2026-01': '100', '2026-02': '200' } })
 const report = await cmd('report-save', { name: 'Excel report', scenario, department: '', audience: 'board', report: { row: 'department', period: 'month', through: '2026-02', lines: [line.id], comparisons: [], highlightBps: 1000 } })
 const manifest = await owner.request.get(`${server.origin}/api/office/manifest/Excel`)
 assert.equal(manifest.status(), 200)
 const { parseStringPromise } = await import('xml2js')
 const xml = await parseStringPromise(await manifest.text())
 assert.equal(xml.OfficeApp.Hosts[0].Host[0].$.Name, 'Workbook')
 const taskpane = xml.OfficeApp.DefaultSettings[0].SourceLocation[0].$.DefaultValue
 const excel = await owner.newPage()
 await excel.addInitScript(installExcelHost)
 await excel.route('https://appsforoffice.microsoft.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
 const openWorkbook = async () => {
  await excel.goto(taskpane)
  await excel.evaluate(() => window.easelExcelReady)
  const metadata = await excel.evaluate(async () => (await fetch('/excel/functions.json')).json())
  assert.deepEqual(metadata.functions.map(f => f.id), ['VALUE', 'REPORT'])
  await excel.evaluate(({ scenario, report }) => {
   window.excelHost.cell('A1', 'VALUE', ['Revenue', 'Sales', '2026-01', scenario])
   window.excelHost.cell('B1', 'VALUE', ['Revenue', 'Sales', '2026-02', scenario])
   window.excelHost.cell('A3', 'REPORT', [report, '2026-01', 'budget'])
   return window.excelHost.command('refreshWorkbook')
  }, { scenario, report: report.id })
 }
 const snapshot = () => excel.evaluate(() => window.excelHost.snapshot())
 await openWorkbook()
 let book = await snapshot()
 assert.deepEqual([book.values.A1, book.values.B1, book.sum, book.startup], [100, 200, 300, 'load'])
 assert.deepEqual(book.values.A3, [['Row', 'FY2026 budget (USD)'], ['Sales', '$100.00'], ['No department', '$0.00']])
 const write = async (month, value) => {
  const current = await api(owner, server.origin, `scenario/${scenario}`)
  return cmd('excel-write', { scenario, revision: current.scenario.revision, schedule: row.id, month, value })
 }
 await write('2026-01', '125'); await write('2026-02', '250')
 await excel.evaluate(() => { window.excelHost.select("'Plan'!$A$1:$A$1"); return window.excelHost.command('refreshSelection') })
 book = await snapshot(); assert.deepEqual([book.values.A1, book.values.B1, book.sum], [125, 200, 325])
 await excel.getByRole('button', { name: 'Refresh workbook', exact: true }).click()
 await excel.waitForFunction(() => window.excelHost.snapshot().sum === 375)
 book = await snapshot(); assert.deepEqual([book.values.A1, book.values.B1, book.sum], [125, 250, 375])
 assert.equal(book.values.A3[1][1], '$125.00')
 await write('2026-01', '175')
 await openWorkbook()
 book = await snapshot(); assert.deepEqual([book.values.A1, book.values.B1, book.sum], [175, 250, 425])
 for (const width of [1440, 390]) {
  await excel.setViewportSize({ width, height: 1000 })
  await noOverflow(excel, `Excel task pane ${width}`)
  await excel.screenshot({ path: join(evidence, `excel-taskpane-${width}.png`), fullPage: true })
 }
 await excel.close()
 await cmd('member', { email: 'excel@example.test', name: 'Excel contributor', role: 'contributor', departments: [dept.id] })
 await api(owner, server.origin, 'invite', { email: 'excel@example.test' })
 const message = messages.find(m => m.to.includes('excel@example.test'))
 assert.ok(message)
 const token = new URL(message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const contributor = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 assert.equal((await contributor.request.post(`${server.origin}/auth/confirm`, { headers: { origin: server.origin }, data: { token }, maxRedirects: 0 })).status(), 303)
 const setup = await owner.newPage(); await setup.goto(`${server.origin}/setup`); await setup.getByRole('checkbox').check(); await setup.getByRole('button', { name: 'Finish setup' }).click(); await setup.close()
 await cmd('request-submissions', { scenario, departments: [dept.id] })
 const before = await api(contributor, server.origin, `scenario/${scenario}`)
 const direct = await api(contributor, server.origin, 'command/excel-write', { scenario, revision: before.scenario.revision, schedule: row.id, month: '2026-01', value: '150' })
 assert.equal(direct.scenario.revision, before.scenario.revision + 1)
 const page = await contributor.newPage()
 await page.goto(`${server.origin}/app?tab=plan`)
 const grid = page.getByRole('region', { name: 'Planning grid', exact: true })
 const input = grid.getByLabel('Excel revenue Jan 2026 grid amount', { exact: true })
 await input.waitFor(); assert.equal(await input.inputValue(), '150.00')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await noOverflow(page, `Excel direct entry ${width}`)
  await grid.screenshot({ path: join(evidence, `excel-entry-${width}.png`) })
 }
 const payroll = await cmd('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 await cmd('position', { scenario, title: 'Restricted role', holder: 'Restricted person', department: dept.id, line: payroll.id, start: '2026-01', annualSalary: '120000' })
 await cmd('member', { email: 'excel@example.test', name: 'Excel viewer', role: 'viewer' })
 const expired = await contributor.newPage()
 await expired.addInitScript(installExcelHost)
 await expired.route('https://appsforoffice.microsoft.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
 await expired.goto(taskpane); await expired.evaluate(() => window.easelExcelReady)
 await expired.evaluate(scenario => {
  window.excelHost.cell('A1', 'VALUE', ['Revenue', 'Sales', '2026-01', scenario])
  return window.excelHost.command('refreshWorkbook')
 }, scenario)
 assert.equal((await expired.evaluate(() => window.excelHost.snapshot())).values.A1, 150)
 await expired.evaluate(({ scenario, report }) => {
  window.excelHost.cell('A3', 'REPORT', [report, '2026-01', 'budget'])
  window.excelHost.cell('A5', 'VALUE', ['Payroll', 'Sales', '2026-01', scenario])
  return window.excelHost.command('refreshWorkbook')
 }, { scenario, report: report.id })
 const viewerBook = await expired.evaluate(() => window.excelHost.snapshot())
 assert.equal(viewerBook.values.A5, 10000)
 assert.deepEqual(viewerBook.values.A3, [['Row', 'FY2026 budget (USD)'], ['Sales', '$150.00'], ['No department', '$0.00']])
 assert.doesNotMatch(JSON.stringify(viewerBook), /Restricted|120000|sources|trace|inputs/)
 await contributor.clearCookies()
 await expired.evaluate(() => window.excelHost.command('refreshWorkbook'))
 assert.equal((await expired.evaluate(() => window.excelHost.snapshot())).values.A1.code, 'unavailable')
 assert.equal((await expired.evaluate(() => window.excelHost.snapshot())).sum, 'unavailable')
 await expired.close()
 console.log('Production Excel host assets: workbook, selection, report ranges, simulated dependency and reopen, expired authority; native write-back at 1440 and 390')
 console.log('Excel write-back: contributor next-revision entry reads as 150.00 in native Plan; 1440 and 390 proof captured')
} finally { await browser?.close(); await server?.close() }
