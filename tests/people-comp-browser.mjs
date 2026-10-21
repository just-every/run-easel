// PEOPLE-004: native commission planning estimates and inherited PEOPLE-005/MOBILE-001 doors.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = process.env.EASEL_BROWSER_ROOT ?? await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '../screens-people004')
await mkdir(evidence, { recursive: true })
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const fill = async (scope, values) => { for (const [label, value] of Object.entries(values)) await scope.getByLabel(label, { exact: true }).fill(value) }
let server, browser
try {
 const port = await freePort()
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const setup = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(setup.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Contract Commission Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Sales' })
 const salary = await cmd('line', { name: 'Sales compensation', type: 'operating-expense', payroll: true })
 const revenue = await cmd('line', { name: 'Annual bookings', type: 'revenue' })
 const scenario = (await api(setup.context, server.origin, 'state')).scenarios[0].id
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await setup.context.close()
 for (const width of [1440, 390]) {
  const finance = await session(browser, root, server.origin, 'owner', width), { page, context } = finance
  try {
   await nav(page, 'Plan'); await page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
   const positions = card(page, 'Positions'), models = card(page, 'Revenue drivers')
   const save = async (scope, op, label) => {
    const pending = page.waitForResponse(r => r.url().endsWith(`/command/${op}`) && r.request().method() === 'POST')
    await scope.getByRole('button', { name: label, exact: true }).click()
    const response = await pending; assert.equal(response.status(), 200, await response.text())
    await page.waitForLoadState('networkidle'); return response.json()
   }
   const title = `Sales representative ${width}`
   await fill(positions, { 'Position title': title, Person: `Private recipient ${width}`, 'Start month': '2026-01', 'Annual salary': '1200', 'On-costs %': '25', 'Commission planning estimate %': '10' })
   await positions.getByLabel('Department', { exact: true }).selectOption(dept.id)
   await positions.getByLabel('Salary line', { exact: true }).selectOption(salary.id)
   await positions.getByLabel('Employment type', { exact: true }).selectOption('1099')
   await positions.getByLabel('Payroll cash timing', { exact: true }).selectOption('date')
   await positions.getByLabel('Payroll pay day', { exact: true }).fill('15')
   await positions.getByLabel('Payroll pay month offset', { exact: true }).selectOption('1')
   await noOverflow(page, `PEOPLE-004 position form ${width}`)
   await positions.locator('form').screenshot({ path: join(evidence, `position-form-${width}.png`) })
   const position = await save(positions, 'position', 'Add position')
   await models.getByLabel('Driver', { exact: true }).selectOption('contract')
   await fill(models, { 'Revenue model name': `Agreement ${width}`, 'Start month': '2026-01', 'Contract start date': '2026-01-01', 'Total contract value': '1000.05', 'Contract term (months)': '12', 'DSO (days)': '0' })
   await models.getByLabel('Department', { exact: true }).selectOption(dept.id)
   await models.getByLabel('Revenue line', { exact: true }).selectOption(revenue.id)
   await models.getByLabel('Commission position (planning estimate)', { exact: true }).selectOption(position.originId)
   await models.getByLabel('Upfront billing cadence', { exact: true }).selectOption('annual')
   await noOverflow(page, `PEOPLE-004 contract form ${width}`)
   await models.locator('form').screenshot({ path: join(evidence, `contract-link-${width}.png`) })
   const contract = await save(models, 'revenue', 'Add revenue model')
   let view = await api(context, server.origin, `scenario/${scenario}`)
   const source = () => view.calculation.cells.find(c => c.line === salary.id && c.month === '2026-01').sources.find(s => s.id === position.originId)
   assert.equal(source().amount, 22501)
   assert.match(source().trace, /Commission planning estimate.*100.01.*no on-costs/)
   await page.reload(); await nav(page, 'Plan'); await page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
   const positionRow = positions.getByRole('row').filter({ has: page.getByRole('cell', { name: title, exact: true }) })
   await positionRow.getByRole('button', { name: 'Edit', exact: true }).click()
   assert.equal(await positions.getByLabel('Commission planning estimate %', { exact: true }).inputValue(), '10.00')
   await positions.getByLabel('Commission planning estimate %', { exact: true }).fill('20')
   await save(positions, 'position', 'Save position')
   const contractRow = models.getByRole('row').filter({ has: page.getByRole('cell', { name: `Agreement ${width}`, exact: true }) })
   await contractRow.getByRole('button', { name: 'Edit', exact: true }).click()
   assert.equal(await models.getByLabel('Commission position (planning estimate)', { exact: true }).inputValue(), position.originId)
   await save(models, 'revenue', 'Save revenue model')
   view = await api(context, server.origin, `scenario/${scenario}`)
   assert.equal(source().amount, 32501)
   assert.equal(view.inputs.revenue.find(r => r.id === contract.id).commissionPosition, position.originId)
   await nav(page, 'Overview'); await page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
   await page.getByRole('button', { name: 'Sales compensation Jan 2026: how it was calculated', exact: true }).click()
   const trace = page.getByRole('region', { name: 'Sales compensation, Jan 2026', exact: true })
   assert.match(await trace.innerText(), /Commission planning estimate.*20.00%.*200.01.*ASC 340-40/)
   await trace.screenshot({ path: join(evidence, `commission-trace-${width}.png`) })
   await noOverflow(page, `PEOPLE-004 trace ${width}`)
   await trace.getByRole('button', { name: 'Close', exact: true }).click()
   const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download Excel', exact: true }).click()])
   assert.equal(await download.failure(), null)
   const book = await readWorkbook(await readFile(await download.path())); proveFormulas(book)
   assert.match(JSON.stringify(book.worksheets.map(s => s.getSheetValues())), /Commission planning estimate/)
   const proposal = await api(context, server.origin, 'command/proposal-create', { from: scenario, name: `Commission proposal ${width}`, request: 'Review a 30 percent commission planning estimate' })
   const copied = (await api(context, server.origin, `scenario/${proposal.id}`)).inputs.position.find(p => p.originId === position.originId)
   await api(context, server.origin, 'command/position', { scenario: proposal.id, id: copied.id, title, holder: copied.holder, department: dept.id, line: salary.id, annualSalary: '1200', onCostPercent: '25', start: '2026-01', employmentType: '1099', commissionPercent: '30', payDay: '15', payMonthOffset: '1' })
   await page.reload(); await nav(page, 'Scenarios')
   await page.getByLabel('From', { exact: true }).selectOption(scenario)
   await page.getByLabel('To', { exact: true }).selectOption(proposal.id)
   const diff = page.getByText(new RegExp(`Changed position: ${title}`))
   await diff.waitFor(); assert.match(await diff.innerText(), /commission rate \(planning estimate\).*20.00%.*30.00%/)
   await card(page, 'Compare').screenshot({ path: join(evidence, `commission-compare-${width}.png`) })
   await noOverflow(page, `PEOPLE-004 comparison ${width}`)
   console.log(`PEOPLE-004 ${width}: native rate/link create, reload/edit, exact traces, formula Excel and proposal comparison passed`)
  } finally { await context.close() }
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await nav(board.page, 'Overview'); await board.page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
   const safe = await api(board.context, server.origin, `scenario/${scenario}`)
   assert.doesNotMatch(JSON.stringify(safe), /Private recipient|commissionPosition|commissionRateBps|Commission planning estimate: contract/)
   await board.page.getByRole('button', { name: 'Sales compensation Jan 2026: how it was calculated', exact: true }).click()
   const trace = board.page.getByRole('region', { name: 'Sales compensation, Jan 2026', exact: true })
   assert.doesNotMatch(await trace.innerText(), /Private recipient|Commission planning estimate: contract/)
   await trace.screenshot({ path: join(evidence, `restricted-trace-${width}.png`) }); await noOverflow(board.page, `PEOPLE-005 commission ${width}`)
  } finally { await board.context.close() }
 }
} finally { await browser?.close(); await server?.close(); if (!process.env.EASEL_BROWSER_ROOT) await rm(root, { recursive: true, force: true }) }
