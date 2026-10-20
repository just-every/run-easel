// FIN-005: finance sets the agreement, branches and edits a downside, then
// reads the same cash checks as a viewer through dashboard and comparison.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { api, noOverflow, session } from './browser-journey.mjs'

const card = (page, title) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const tab = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const money = n => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function seedCashHealth(context, origin) {
 const cmd = (op, body) => api(context, origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Operations' })
 const revenue = await cmd('line', { name: 'Services', type: 'revenue' })
 const expense = await cmd('line', { name: 'Operating costs', type: 'operating-expense' })
 const budget = (await api(context, origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '1000000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, name: 'Retainers', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-01', startVolume: '1', rate: '10000' })
 await cmd('expense', { scenario: budget.id, name: 'Operations', kind: 'recurring', department: dept.id, line: expense.id, start: '2026-01', amount: '50000' })
 await cmd('approve-budget', { scenario: budget.id, revision: (await api(context, origin, `scenario/${budget.id}`)).scenario.revision })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
}

async function assertHealth(page, title, health) {
 const scope = page.getByRole('region', { name: title, exact: true })
 await scope.getByText(`First below cash floor: ${health.firstFloorBreach ? 'Mar 2026' : 'None'}. First below runway minimum: ${health.firstRunwayBreach ? 'Mar 2026' : 'None'}.`, { exact: true }).waitFor()
 if (health.firstFloorBreach) {
  const crossing = health.months.find(m => m.month === health.firstFloorBreach)
  await scope.getByText(`Runway at cash-floor crossing: ${(crossing.runwayHundredths / 100).toFixed(2)} months.`, { exact: true }).waitFor()
 }
 const rows = scope.getByRole('table').getByRole('row')
 assert.equal(await rows.count(), health.months.length + 1)
 for (let i = 0; i < health.months.length; i++) {
  const actual = await rows.nth(i + 1).getByRole('cell').allInnerTexts(), m = health.months[i]
  assert.equal(actual[1], money(m.grossBurnCents))
  assert.equal(actual[2], money(m.netBurnCents))
  assert.equal(actual[3], m.runwayHundredths === null ? 'Not burning' : (m.runwayHundredths / 100).toFixed(2))
  assert.equal(actual[4], m.floorBreached ? 'Below minimum' : 'Meets minimum')
  assert.equal(actual[5], m.runwayBreached ? 'Below minimum' : 'Meets minimum')
 }
 await noOverflow(page, `FIN-005 ${title}`)
 return scope
}

export async function cashHealthBrowserJourney(browser, root, origin, evidence, width, create) {
 const owner = await session(browser, root, origin, 'owner', width)
 const p = owner.page
 try {
  await tab(p, 'Overview')
  const agreement = card(p, 'Agreed cash constraints')
  await agreement.getByLabel('Agreed cash floor', { exact: true }).fill('500000')
  await agreement.getByLabel('Minimum runway (months)', { exact: true }).fill('3.25')
  await agreement.getByRole('button', { name: 'Save cash constraints', exact: true }).click()
  await p.getByText('Current agreed cash floor: $500,000.00. Runway minimum: 3.25 months.', { exact: true }).waitFor()
  if (create) {
   await tab(p, 'Scenarios')
   const scenarios = card(p, 'Scenarios')
   await scenarios.getByLabel('Branch from', { exact: true }).selectOption({ label: 'FY2026 forecast' })
   await scenarios.getByLabel('Scenario name', { exact: true }).fill('Downside: expansion investment')
   await scenarios.getByRole('button', { name: 'Branch scenario', exact: true }).click()
   await scenarios.getByRole('cell', { name: 'Downside: expansion investment', exact: true }).waitFor()
   await tab(p, 'Plan')
   await p.getByLabel('Scenario', { exact: true }).selectOption({ label: 'Downside: expansion investment · scenario' })
   const expenses = card(p, 'Expenses')
   for (const [name, kind, start] of [['Expansion team', 'recurring', '2026-01'], ['Launch', 'one-off', '2026-02']]) {
    await expenses.getByLabel('Expense name', { exact: true }).fill(name)
    await expenses.getByLabel('Expense line', { exact: true }).selectOption({ label: 'Operating costs' })
    await expenses.getByLabel('Department', { exact: true }).selectOption({ label: 'Operations' })
    await expenses.getByLabel('Kind', { exact: true }).selectOption(kind)
    await expenses.getByLabel('Amount', { exact: true }).fill('100000')
    await expenses.getByLabel('Start month', { exact: true }).fill(start)
    await expenses.getByRole('button', { name: 'Add expense', exact: true }).click()
    await expenses.getByRole('cell', { name, exact: true }).waitFor()
   }
   await noOverflow(p, `FIN-005 downside inputs ${width}`)
  }
  const state = await api(owner.context, origin, 'state')
  const forecast = state.scenarios.find(s => s.kind === 'forecast'), downside = state.scenarios.find(s => s.name === 'Downside: expansion investment')
  const base = await api(owner.context, origin, `scenario/${forecast.id}`), down = await api(owner.context, origin, `scenario/${downside.id}`)
  assert.equal(down.cashHealth.firstFloorBreach, '2026-03')
  assert.equal(down.cashHealth.cashZeroMonth, '2026-07')
  await tab(p, 'Overview')
  await p.getByLabel('Scenario', { exact: true }).selectOption(forecast.id)
  await assertHealth(p, 'Cash health', base.cashHealth)
  await p.screenshot({ path: join(evidence, `cash-dashboard-${width}.png`), fullPage: true })
  await p.getByLabel('Scenario', { exact: true }).selectOption(downside.id)
  await assertHealth(p, 'Cash health', down.cashHealth)
  await p.getByText('Lowest cash: Dec 2026 · -$780,000.00. Cash-zero month: Jul 2026.', { exact: true }).waitFor()
  await p.screenshot({ path: join(evidence, `cash-scenario-${width}.png`), fullPage: true })
  await tab(p, 'Scenarios')
  const compare = card(p, 'Compare')
  await compare.getByLabel('From', { exact: true }).selectOption(forecast.id)
  await compare.getByLabel('To', { exact: true }).selectOption(downside.id)
  await (await assertHealth(p, `Cash health: ${forecast.name}`, base.cashHealth)).screenshot({ path: join(evidence, `cash-comparison-from-${width}.png`) })
  await (await assertHealth(p, `Cash health: ${downside.name}`, down.cashHealth)).screenshot({ path: join(evidence, `cash-comparison-to-${width}.png`) })
  await p.screenshot({ path: join(evidence, `cash-comparison-${width}.png`), fullPage: true })
  const board = await session(browser, root, origin, 'board', width)
  try {
   await board.page.getByLabel('Scenario', { exact: true }).selectOption(downside.id)
   await assertHealth(board.page, 'Cash health', down.cashHealth)
   assert.equal(await board.page.getByRole('button', { name: 'Save cash constraints', exact: true }).count(), 0)
   await board.page.screenshot({ path: join(evidence, `cash-board-${width}.png`), fullPage: true })
  } finally { await board.context.close() }
  console.log(`FIN-005 browser passed at ${width}: agreed thresholds, downside, monthly burn/runway, scenario, dashboard, comparison and board`)
 } finally { await owner.context.close() }
}
