import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-entities')
await mkdir(evidence, { recursive: true })
let server, browser, finance
const card = (page, label) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: label, exact: true }) })
const tab = async (page, name) => { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click(); await settle(page) }
const saved = async (page, op, click) => { const pending = page.waitForResponse(r => r.url().endsWith(`/command/${op}`)); await click(); const response = await pending; assert.equal(response.status(), 200, await response.text()); await settle(page); return response.json() }
try {
 const port = await freePort(); await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)]); server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const page = finance.page, cmd = (op, body) => api(finance.context, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Northstar Management Group', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await cmd('department', { name: 'Operations' })
 const revenue = await cmd('line', { name: 'Management services', type: 'revenue' }), expense = await cmd('line', { name: 'Management expense', type: 'operating-expense' })
 const parent = (await api(finance.context, server.origin, 'state')).scenarios[0]
 const subsidiary = await cmd('branch', { from: parent.id, name: 'European services plan' })
 await page.reload(); await page.getByRole('navigation', { name: 'Easel' }).waitFor(); await tab(page, 'Settings')
 const entities = card(page, 'Entities'), form = entities.locator('form').filter({ has: page.getByRole('button', { name: 'Add entity', exact: true }) })
 const created = []
 for (const [name, source, currency] of [['Northstar Canada', parent.id, 'CAD'], ['Northstar Europe', subsidiary.id, 'EUR']]) {
  await form.getByLabel('Entity name', { exact: true }).fill(name)
  await form.getByLabel('Source plan', { exact: true }).selectOption(source)
  await form.getByLabel('Local currency', { exact: true }).fill(currency)
  await form.getByLabel('Consolidation group plan', { exact: true }).selectOption(parent.id)
  await form.getByLabel('Group reporting currency', { exact: true }).fill('USD')
  created.push(await saved(page, 'entity-save', () => form.getByRole('button', { name: 'Add entity', exact: true }).click()))
 }
 for (const scenario of [parent.id, subsidiary.id]) await cmd('scenario-cash', { scenario, basis: 'estimate', opening: '10000', collectionLag: 1, paymentLag: 1 })
 const charge = await cmd('revenue', { scenario: parent.id, name: 'European management charge', kind: 'volume', department: department.id, line: revenue.id, start: '2026-01', startVolume: '1', rate: '100', collectionLag: 1 })
 const cost = await cmd('expense', { scenario: subsidiary.id, name: 'Canadian services received', kind: 'recurring', department: department.id, line: expense.id, start: '2026-01', amount: '80' })
 await page.reload(); await page.getByRole('navigation', { name: 'Easel' }).waitFor(); await tab(page, 'Settings')
 const rates = entities.locator('form').filter({ has: page.getByRole('button', { name: 'Save entity rates', exact: true }) })
 for (const [entity, opening, average, monthEnd] of [[created[0], '0.70', '0.80', '0.90'], [created[1], '0.90', '1', '1.125']]) {
  for (const month of ['2025-12', '2026-01']) {
   await rates.getByLabel('Entity', { exact: true }).selectOption(entity.id)
   await rates.getByLabel('Rate month', { exact: true }).fill(month)
   await rates.getByLabel('Budget rate', { exact: true }).fill(month === '2026-01' ? average : '')
   await rates.getByLabel('Average rate', { exact: true }).fill(month === '2026-01' ? average : '')
   await rates.getByLabel('Month-end rate', { exact: true }).fill(month === '2026-01' ? monthEnd : opening)
   await saved(page, 'entity-rate', () => rates.getByRole('button', { name: 'Save entity rates', exact: true }).click())
  }
 }
 const elimination = entities.locator('form').filter({ has: page.getByRole('button', { name: 'Save reviewed elimination', exact: true }) })
 await elimination.getByLabel('Elimination name', { exact: true }).fill('Reviewed intercompany management fee')
 await elimination.getByLabel('Elimination month', { exact: true }).fill('2026-01')
 await elimination.getByLabel('Revenue source', { exact: true }).selectOption(`${created[0].id}:${charge.originId}`)
 await elimination.getByLabel('Expense source', { exact: true }).selectOption(`${created[1].id}:${cost.originId}`)
 for (const [label, value] of [['Local revenue charge', '100'], ['Local expense charge', '80'], ['Local receivable balance', '100'], ['Local payable balance', '80']]) await elimination.getByLabel(label, { exact: true }).fill(value)
 await elimination.getByLabel('I reviewed both source charges, balances and settlements', { exact: true }).check()
 await saved(page, 'entity-elimination-save', () => elimination.getByRole('button', { name: 'Save reviewed elimination', exact: true }).click())
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await tab(page, 'Settings')
  await entities.getByRole('cell', { name: 'Northstar Canada', exact: true }).first().waitFor()
  await noOverflow(page, `Entity settings ${width}`); await entities.screenshot({ path: join(evidence, `entity-settings-${width}.png`) })
  const consolidated = page.getByRole('region', { name: 'Management consolidation', exact: true })
  const view = await api(finance.context, server.origin, `consolidation/${parent.id}`)
  assert.deepEqual([view.consolidated[0].profit.revenue, view.consolidated[0].profit.operatingExpenses, view.consolidated[0].balanceSheet.receivables, view.consolidated[0].balanceSheet.payables], [0, 0, 0, 0])
  for (const statement of ['Profit and loss', 'Balance sheet', 'Cash bridge']) {
   const table = consolidated.getByRole('table', { name: `${statement} in USD`, exact: true })
   await table.waitFor(); assert.ok((await table.innerText()).includes('Northstar Canada'))
   await table.screenshot({ path: join(evidence, `entity-${statement.toLowerCase().replaceAll(' ', '-')}-${width}.png`) })
  }
  assert.ok((await consolidated.innerText()).includes('rate for 2026-02'))
  await consolidated.getByText('Northstar Canada: local statements in CAD', { exact: true }).click()
  await consolidated.getByRole('table', { name: 'Northstar Canada Profit and loss', exact: true }).screenshot({ path: join(evidence, `entity-local-${width}.png`) })
  const download = await finance.context.request.get(`${server.origin}/api/easel/consolidation/${parent.id}/workbook`)
  assert.equal(download.status(), 200); proveFormulas(await readWorkbook(await download.body()))
  await tab(page, 'Plan'); await page.getByLabel('Scenario', { exact: true }).selectOption(parent.id); await settle(page)
  const drivers = card(page, 'Revenue drivers'); assert.match(await drivers.innerText(), /CAD 100\.00/)
  await noOverflow(page, `Entity local plan ${width}`); await drivers.screenshot({ path: join(evidence, `entity-plan-${width}.png`) })
  console.log(`Entities ${width}: native binding, per-entity rates, reviewed fee/balance elimination, three statements, local currency plan, missing-rate state and formula Excel passed`)
 }
} catch (error) { if (finance?.page && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }) }
