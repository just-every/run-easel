// MODEL-009: accepted history recipes, seeded budgets and editable monthly inputs.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { historyFixture } from './history-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-history')
await mkdir(evidence, { recursive: true })
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const press = (scope, name) => scope.getByRole('button', { name, exact: true }).click()
const settle = page => page.waitForLoadState('networkidle', { timeout: 15000 })
async function tab(page, name) { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click(); await settle(page) }
async function saved(page, op, click) {
 const pending = page.waitForResponse(response => response.url().endsWith(`/api/easel/command/${op}`) && response.request().method() === 'POST')
 await click()
 const response = await pending
 assert.equal(response.status(), 200, `MODEL-009 ${op}: ${await response.text()}`)
 await settle(page)
}
async function shoot(page, name, width) {
 await settle(page); await noOverflow(page, `MODEL-009 ${name} ${width}`)
 await page.screenshot({ path: join(evidence, `history-${name}-${width}.png`), fullPage: true })
 const section = name.includes('source-form') || name === 'derived-traces' ? 'Actual-reference schedules' : name === 'seed-form' ? 'Budget from actuals' : ['seeded-grid', 'edited-grid'].includes(name) ? 'Monthly budget inputs' : name === 'overview' ? 'Actuals alongside the plan' : ''
 if (section) await card(page, section).screenshot({ path: join(evidence, `history-${name}-detail-${width}.png`) })
}
const monthLabel = month => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const prior = (month, offset) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - offset); return date.toISOString().slice(0, 7) }
const decimal = cents => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`
const money = cents => `USD ${Number(decimal(cents)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const historyAmount = (view, row, month) => view.actualsHistory.cells.find(cell => cell.line === row.line && cell.department === row.department && cell.month === month)?.amount
function overlayTexts(view, row, month) {
 const current = historyAmount(view, row, month), previous = historyAmount(view, row, prior(month, 12))
 return [`Actual: ${current === undefined ? 'Missing' : money(current)}`, `Prior year: ${previous === undefined ? 'Missing' : money(previous)}`]
}
async function checkGrid(page, view) {
 assert.equal(view.calculation.months.length, 12)
 const grid = card(page, 'Monthly budget inputs')
 const schedules = view.inputs.schedule.filter(row => row.values && !row.history)
 assert.ok(schedules.length, 'Seeded budget has ordinary editable schedules')
 for (const row of schedules) {
  const table = grid.getByRole('table', { name: `${row.name} monthly inputs`, exact: true })
  const cells = table.getByRole('row').nth(1).getByRole('cell')
  for (const [index, month] of view.calculation.months.entries()) {
   assert.equal(await table.getByLabel(`${row.name} ${monthLabel(month)} amount`, { exact: true }).inputValue(), decimal(row.values[month]))
   assert.deepEqual(await cells.nth(index + 2).locator('small').allInnerTexts(), overlayTexts(view, row, month))
  }
 }
}
async function checkOverlay(page, view) {
 const table = card(page, 'Actuals alongside the plan').getByRole('table', { name: 'Plan and accepted actuals by month', exact: true })
 for (const schedule of view.inputs.schedule.filter(row => row.values && !row.history)) {
  const line = view.lines.find(line => line.id === schedule.line), department = view.departments.find(department => department.id === schedule.department)
  const row = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: line.name, exact: true }) }).filter({ has: page.getByRole('cell', { name: department.name, exact: true }) })
  for (const [index, month] of view.calculation.months.entries()) {
   const cell = row.getByRole('cell').nth(index + 1)
   const plan = view.calculation.cells.filter(cell => cell.line === schedule.line && cell.department === schedule.department && cell.month === month).reduce((sum, cell) => sum + cell.amount, 0)
   assert.equal(await cell.locator('span').innerText(), `Scenario: ${money(plan)}`)
   assert.deepEqual(await cell.locator('small').allInnerTexts(), overlayTexts(view, schedule, month))
  }
 }
}
async function addReference(page, fixture, name, recipe, target, source, growth, width) {
 const section = card(page, 'Actual-reference schedules'), form = section.locator('form')
 await form.getByLabel('Schedule name', { exact: true }).fill(name)
 await form.getByLabel('Target line', { exact: true }).selectOption(target.id)
 await form.getByLabel('Target department', { exact: true }).selectOption(fixture.sales.id)
 await form.getByLabel('Actual source line', { exact: true }).selectOption(source.id)
 await form.getByLabel('Actual source department', { exact: true }).selectOption(fixture.sales.id)
 await form.getByLabel('Actual-reference recipe', { exact: true }).selectOption(recipe)
 await form.getByLabel('Growth %', { exact: true }).fill(String(growth))
 await shoot(page, `source-form-${recipe}`, width)
 await saved(page, 'schedule', () => press(form, 'Add actual-reference schedule'))
 await section.getByRole('table', { name: `${name} calculated monthly amounts`, exact: true }).waitFor()
}
let server, browser, finance
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body)
 const fixture = await historyFixture((op, body) => call(`command/${op}`, body), path => call(path), (kit, op, body) => call(`import/${kit}/${op}`, body))
 for (const width of [1440, 390]) {
  const page = finance.page
  await page.setViewportSize({ width, height: 1000 })
  await page.reload(); await tab(page, 'Plan')
  await page.getByLabel('Scenario', { exact: true }).selectOption(fixture.budget.id); await settle(page)
  const projectedName = `Prior-year revenue ${width}`, smoothedName = `Trailing cost ${width}`
  await addReference(page, fixture, projectedName, 'prior-year', fixture.projected, fixture.revenue, 5, width)
  let original = await call(`scenario/${fixture.budget.id}`)
  const projected = original.inputs.schedule.find(row => row.name === projectedName)
  assert.deepEqual(projected.history, { sourceLine: fixture.revenue.id, sourceDepartment: fixture.sales.id, offset: 12, window: 1, growthBps: 500 })
  const table = page.getByRole('table', { name: `${projectedName} calculated monthly amounts`, exact: true })
  assert.equal(await table.getByRole('row').nth(1).getByRole('cell').first().innerText(), 'USD 1,050.11')
  assert.equal(original.calculation.cells.find(cell => cell.line === fixture.projected.id && cell.department === fixture.sales.id && cell.month === '2025-01').sources.find(source => source.id === projected.originId).amount, 105011)
  await table.getByRole('row').nth(1).locator('summary').click()
  const citation = await table.getByRole('row').nth(1).locator('details').innerText()
  assert.ok(citation.includes('2024-01')); assert.ok(citation.includes('USD 1,000.10')); assert.ok(citation.includes('USD 1,050.11'))
  assert.equal(await table.locator('input').count(), 0, 'Derived amounts are read-only')
  await shoot(page, 'derived-traces', width)
  await addReference(page, fixture, smoothedName, 'trailing-three', fixture.smoothed, fixture.cost, 0, width)
  original = await call(`scenario/${fixture.budget.id}`)
  const smoothed = original.inputs.schedule.find(row => row.name === smoothedName)
  assert.equal(smoothed.history.offset, 1); assert.equal(smoothed.history.window, 3)
  const smoothedTable = page.getByRole('table', { name: `${smoothedName} calculated monthly amounts`, exact: true })
  for (const [index, month] of original.calculation.months.entries()) {
   const expected = Math.round([1, 2, 3].reduce((sum, offset) => sum + fixture.amounts[prior(month, offset)].cost, 0) / 3)
   const source = original.calculation.cells.find(cell => cell.line === fixture.smoothed.id && cell.department === fixture.sales.id && cell.month === month).sources.find(source => source.id === smoothed.originId)
   assert.equal(source.amount, expected, 'Trailing average uses the three immediately preceding accepted months')
   assert.equal(await smoothedTable.getByRole('row').nth(index + 1).getByRole('cell').first().innerText(), money(expected))
  }

  const budgetName = `Actuals-based budget ${width}`, seed = card(page, 'Budget from actuals')
  await seed.getByLabel('New budget name', { exact: true }).fill(budgetName)
  await seed.getByLabel(`${fixture.revenue.name} growth %`, { exact: true }).fill('5')
  await shoot(page, 'seed-form', width)
  await saved(page, 'budget-from-actuals', () => press(seed, 'Create budget from actuals'))
  const state = await call('state'), budget = state.scenarios.find(scenario => scenario.name === budgetName)
  assert.ok(budget); assert.equal(budget.kind, 'budget'); assert.notEqual(budget.id, fixture.budget.id)
  await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id); await settle(page)
  let view = await call(`scenario/${budget.id}`)
  await checkGrid(page, view)
  const revenue = view.inputs.schedule.find(row => row.line === fixture.revenue.id && row.department === fixture.sales.id)
  for (const month of view.calculation.months) assert.equal(revenue.values[month], Math.round(fixture.amounts[prior(month, 12)].revenue * 105 / 100))
  await shoot(page, 'seeded-grid', width)
  const sourcesBefore = structuredClone(view.actualsHistory)
  const edit = card(page, 'Monthly budget inputs').locator('form').filter({ has: page.getByRole('table', { name: `${revenue.name} monthly inputs`, exact: true }) })
  await edit.getByLabel(`${revenue.name} Jan 2025 amount`, { exact: true }).fill('1500.00')
  await saved(page, 'schedule', () => press(edit, `Save ${revenue.name}`))
  await page.reload(); await tab(page, 'Plan')
  await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id); await settle(page)
  view = await call(`scenario/${budget.id}`)
  assert.equal(view.inputs.schedule.find(row => row.id === revenue.id).values['2025-01'], 150000)
  assert.deepEqual(view.actualsHistory, sourcesBefore, 'Editing the budget does not change accepted source actuals')
  await checkGrid(page, view); await shoot(page, 'edited-grid', width)
  await tab(page, 'Overview')
  await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id); await settle(page)
  await checkOverlay(page, view); await shoot(page, 'overview', width)
  await tab(page, 'Budget cycle')
  await page.getByLabel('Budget', { exact: true }).selectOption(budget.id)
  await card(page, budgetName).waitFor()
  assert.equal(await page.getByLabel('Budget', { exact: true }).inputValue(), budget.id)
  await shoot(page, 'budget-selection', width)
  await saved(page, 'approve-budget', () => press(card(page, budgetName), `Approve and freeze revision ${view.scenario.revision}`))
  const afterApproval = await call('state')
  assert.equal(afterApproval.scenarios.find(s => s.id === fixture.budget.id).status, 'working')
  assert.ok(afterApproval.scenarios.filter(s => s.kind === 'forecast').every(s => s.alternativeBudget))
  await card(page, 'After approval').waitFor(); await shoot(page, 'alternative-approved', width)
  await tab(page, 'Review')
  assert.equal(await page.getByRole('button', { name: 'Close Jan 2025', exact: true }).count(), 0, 'Alternative approval never opens operating review')
  await shoot(page, 'operating-review-unchanged', width)
  console.log(`MODEL-009 ${width}: actual references, exact growth and trailing average, seeded monthly budget, persisted edit and matching source overlays passed`)
 }
} catch (error) {
 if (finance && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence, 'history-failed.png'), fullPage: true }).catch(() => {})
 throw error
} finally {
 await browser?.close(); await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
