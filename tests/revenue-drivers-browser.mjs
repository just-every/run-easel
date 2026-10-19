// REV-003: fixed driver entry/edit, exact rendered traces and formula Excel.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/revenue-drivers')
await mkdir(evidence, { recursive: true })
let server, browser
const card = (page, name) => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(owner.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Cardinal Growth Partners', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await cmd('department', { name: 'Client delivery' })
 const payroll = await cmd('line', { name: 'Delivery salaries', type: 'operating-expense', payroll: true })
 const budget = (await api(owner.context, server.origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '350000' })
 for (const title of ['Lead consultant', 'Delivery consultant']) await cmd('position', { scenario: budget.id, department: department.id, line: payroll.id, title, holder: `Private ${title}`, start: '2026-01', annualSalary: '120000', onCostPercent: '15' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await owner.context.close()
 const definitions = [
  ['seats', 'Subscriptions', { 'Starting seats': '200', 'Monthly seat expansion %': '5', 'Monthly price per seat': '40' }, 800000, 'seats 200.00'],
  ['usage', 'Platform usage', { 'Starting monthly usage': '12500', 'Monthly usage growth %': '2', 'Price per usage unit': '0.02' }, 25000, 'usage units 12500.00'],
  ['services', 'Advisory services', { 'Monthly available hours per position': '160', 'Billable utilization %': '75', 'Billable hourly rate': '150' }, 3600000, '2 active positions'],
  ['milestones', 'Implementation projects', { 'Milestone 1 name': 'Discovery', 'Milestone 1 month': '2026-01', 'Milestone 1 amount': '15000' }, 1500000, 'project milestone Discovery'],
  ['backlog', 'Signed backlog', { 'Opening backlog': '200000', 'Monthly backlog additions': '20000', 'Monthly backlog recognition %': '10' }, 2200000, 'closing backlog USD 198,000.00'],
 ]
 for (const width of [1440, 390]) {
  const finance = await session(browser, root, server.origin, 'owner', width), page = finance.page
  try {
   const lines = {}
   for (const [kind, label] of definitions) lines[kind] = await api(finance.context, server.origin, 'command/line', { name: `${label} ${width}`, type: 'revenue' })
   await page.reload(); await page.getByRole('navigation', { name: 'Easel' }).waitFor()
   await nav(page, 'Plan')
   await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id)
   const models = card(page, 'Revenue drivers')
   for (const [kind, label, fields, expected, trace] of definitions) {
    await models.getByLabel('Driver', { exact: true }).selectOption(kind)
    await models.getByLabel('Revenue model name', { exact: true }).fill(`${label} ${width}`)
    await models.getByLabel('Revenue line', { exact: true }).selectOption(lines[kind].id)
    await models.getByLabel('Department', { exact: true }).selectOption(department.id)
    await models.getByLabel('Start month', { exact: true }).fill('2026-01')
    await models.getByLabel('Collected after (months)', { exact: true }).selectOption('1')
    for (const [field, value] of Object.entries(fields)) await models.getByLabel(field, { exact: true }).fill(value)
    if (kind === 'milestones') {
     await models.getByRole('button', { name: 'Add milestone', exact: true }).click()
     for (const [field, value] of [['Milestone 2 name', 'Launch'], ['Milestone 2 month', '2026-03'], ['Milestone 2 amount', '35000']]) await models.getByLabel(field, { exact: true }).fill(value)
    }
    await models.locator('form').scrollIntoViewIfNeeded(); await noOverflow(page, `REV-003 ${kind} form ${width}`)
    await models.locator('form').screenshot({ path: join(evidence, `${kind}-form-${width}.png`) })
    await models.getByRole('button', { name: 'Add revenue model', exact: true }).click()
    const row = models.getByRole('row').filter({ has: page.getByRole('cell', { name: `${label} ${width}`, exact: true }) })
    await row.waitFor()
    const view = await api(finance.context, server.origin, `scenario/${budget.id}`)
    const cell = view.calculation.cells.find(c => c.line === lines[kind].id && c.month === '2026-01')
    assert.equal(cell.amount, expected)
    assert.ok(cell.sources.some(source => source.trace.includes(trace)))
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    assert.equal(await models.getByLabel('Driver', { exact: true }).inputValue(), kind)
    for (const [field, value] of Object.entries(fields)) assert.equal(Number(await models.getByLabel(field, { exact: true }).inputValue()) || await models.getByLabel(field, { exact: true }).inputValue(), Number(value) || value)
    await models.getByRole('button', { name: 'Save revenue model', exact: true }).click()
    await models.getByRole('button', { name: 'Add revenue model', exact: true }).waitFor()
    assert.deepEqual((await api(finance.context, server.origin, `scenario/${budget.id}`)).calculation, view.calculation, `${kind}: edited values retain exact arithmetic and traces`)
   }
   await models.scrollIntoViewIfNeeded(); await noOverflow(page, `REV-003 models ${width}`)
   await models.screenshot({ path: join(evidence, `all-models-${width}.png`) })
   await nav(page, 'Overview')
   await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id)
   await page.getByRole('link', { name: 'Download Excel', exact: true }).waitFor()
   for (const [kind, label, _fields, _expected, trace] of definitions) {
    await page.getByRole('button', { name: `${label} ${width} Jan 2026: how it was calculated`, exact: true }).click()
    const panel = page.getByRole('region', { name: `${label} ${width}, Jan 2026`, exact: true })
    await panel.waitFor()
    assert.ok((await panel.innerText()).includes(trace), `${kind}: rendered trace contains the exact driver arithmetic`)
    await noOverflow(page, `REV-003 ${kind} trace ${width}`)
    await panel.screenshot({ path: join(evidence, `${kind}-trace-${width}.png`) })
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
   }
   const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download Excel', exact: true }).click()])
   assert.equal(await download.failure(), null)
   proveFormulas(await readWorkbook(await readFile(await download.path())))
   await noOverflow(page, `REV-003 Overview ${width}`)
   await page.screenshot({ path: join(evidence, `overview-${width}.png`) })
   console.log(`REV-003 ${width}: five new driver forms entered, edited and read exact traces; complete formula Excel and no page overflow passed`)
  } finally { await finance.context.close() }
  const viewer = await session(browser, root, server.origin, 'board', width)
  try {
   const view = await api(viewer.context, server.origin, `scenario/${budget.id}`)
   assert.equal(view.inputs.revenue.length, 0)
   assert.doesNotMatch(JSON.stringify(view), /Private Lead|Private Delivery|hourlyRateCents|milestones"/)
   await noOverflow(viewer.page, `REV-003 viewer ${width}`)
   await viewer.page.screenshot({ path: join(evidence, `viewer-${width}.png`) })
  } finally { await viewer.context.close() }
 }
} finally { await browser?.close(); await server?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
