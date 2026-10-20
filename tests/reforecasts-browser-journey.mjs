// CYCLE-005: save reviewed versions, edit the working forecast, close and
// compare through the real page. Assertions use the same public API as readers.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { api, noOverflow, session } from './browser-journey.mjs'

const tab = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const card = (page, name) => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const money = value => `${value < 0 ? '-' : ''}$${(Math.abs(value) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function seedReforecasts(context, origin) {
 const cmd = (op, body) => api(context, origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Consulting' })
 const services = await cmd('line', { name: 'Services', type: 'revenue' })
 const costs = await cmd('line', { name: 'Team costs', type: 'operating-expense' })
 const budget = (await api(context, origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '250000', collectionLag: 0, paymentLag: 0 })
 const driver = { name: 'Consulting retainers', kind: 'volume', department: dept.id, line: services.id, start: '2026-01', startVolume: '100', rate: '1000', growthPercent: '0', collectionLag: 0 }
 await cmd('revenue', { scenario: budget.id, ...driver })
 await cmd('expense', { scenario: budget.id, name: 'Delivery team', kind: 'recurring', department: dept.id, line: costs.id, start: '2026-01', amount: '50000' })
 const { forecast } = await cmd('approve-budget', { scenario: budget.id, revision: (await api(context, origin, `scenario/${budget.id}`)).scenario.revision })
 const input = (await api(context, origin, `scenario/${forecast.id}`)).inputs.revenue[0]
 await cmd('revenue', { ...driver, id: input.id, scenario: forecast.id, rate: '1200' })
 await cmd('account-map', { account: '400', target: services.id })
 await cmd('account-map', { account: '500', target: costs.id })
 await cmd('department-map', { source: 'Consulting', department: dept.id })
 const body = { filename: 'january.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,400,Consulting,-90000\n2026-01-31,500,Consulting,50000\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await api(context, origin, 'import/actuals/preview', body)
 await api(context, origin, 'import/actuals/commit', { ...body, fingerprint: preview.fingerprint })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
}

export async function saveReforecastJourney(browser, root, origin, evidence, width, name, nextRate) {
 const owner = await session(browser, root, origin, 'owner', width), p = owner.page
 try {
  const state = await api(owner.context, origin, 'state'), forecast = state.scenarios.find(s => s.kind === 'forecast')
  const before = await api(owner.context, origin, `scenario/${forecast.id}`)
  await tab(p, 'Scenarios')
  await p.getByLabel('Reforecast from', { exact: true }).selectOption(forecast.id)
  await p.getByLabel('Reforecast name', { exact: true }).fill(name)
  await p.getByRole('button', { name: 'Save reforecast', exact: true }).click()
  await p.getByRole('cell', { name, exact: true }).waitFor()
  await p.getByRole('status').filter({ hasText: `${name} saved from` }).waitFor()
  const saved = (await api(owner.context, origin, 'state')).scenarios.find(s => s.name === name)
  assert.equal(saved.reforecast.revision, before.scenario.revision)
  assert.deepEqual((await api(owner.context, origin, `scenario/${saved.id}`)).calculation, before.calculation)
  await noOverflow(p, `CYCLE-005 save at ${width}`)
  await p.screenshot({ path: join(evidence, `reforecast-save-${width}.png`), fullPage: true })
  await tab(p, 'Plan')
  await p.getByLabel('Scenario', { exact: true }).selectOption(forecast.id)
  const section = card(p, 'Revenue drivers')
  await section.getByRole('row').filter({ hasText: 'Consulting retainers' }).getByRole('button', { name: 'Edit', exact: true }).click()
  await section.getByLabel('Rate per unit', { exact: true }).fill(nextRate)
  await section.getByRole('button', { name: 'Save revenue model', exact: true }).click()
  await section.getByRole('button', { name: 'Add revenue model', exact: true }).waitFor()
  assert.deepEqual((await api(owner.context, origin, `scenario/${saved.id}`)).calculation, before.calculation)
  if (width === 390) {
   await tab(p, 'Review')
   await p.getByRole('button', { name: 'Close Jan 2026', exact: true }).click()
   await p.getByRole('heading', { name: 'Actual against every version', exact: true }).waitFor()
  }
 } finally { await owner.context.close() }
}

export async function readReforecastsJourney(browser, root, origin, evidence, width, as = 'owner') {
 const reader = await session(browser, root, origin, as, width), p = reader.page
 try {
  const state = await api(reader.context, origin, 'state'), q2 = state.scenarios.find(s => s.name === 'Q2 reforecast'), forecast = state.scenarios.find(s => s.kind === 'forecast')
  await tab(p, 'Scenarios')
  await p.getByLabel('From', { exact: true }).selectOption(q2.id)
  await p.getByLabel('To', { exact: true }).selectOption(forecast.id)
  await p.getByRole('heading', { name: `Cash health: ${q2.name}`, exact: true }).waitFor()
  const table = p.getByRole('table').filter({ has: p.getByText(`Profit and closing cash: ${q2.name} → ${forecast.name}`, { exact: true }) })
  const january = await table.getByRole('row').filter({ hasText: 'Jan 2026' }).getByRole('cell').allInnerTexts()
  assert.deepEqual(january.slice(0, 4), ['Jan 2026', money(7000000), money(4000000), money(-3000000)])
  await noOverflow(p, `CYCLE-005 compare at ${width}`)
  await p.screenshot({ path: join(evidence, `reforecast-compare-${as}-${width}.png`), fullPage: true })
  await tab(p, 'Overview')
  await p.getByLabel('Scenario', { exact: true }).selectOption(q2.id)
  await p.getByText(/frozen · saved by/).waitFor()
  await p.getByRole('heading', { name: 'Profit and loss', exact: true }).waitFor()
  await noOverflow(p, `CYCLE-005 frozen overview at ${width}`)
  await p.screenshot({ path: join(evidence, `reforecast-overview-${as}-${width}.png`), fullPage: true })
  await tab(p, 'Review')
  const v = await api(reader.context, origin, 'variance/2026-01')
  const scope = card(p, 'Actual against every version')
  await scope.waitFor()
  const cells = await scope.getByRole('row').filter({ has: p.getByRole('cell', { name: 'Services', exact: true }) }).getByRole('cell').allInnerTexts()
  assert.deepEqual(cells.slice(0, 3), ['Services', 'Consulting', money(9000000)])
  const expected = [10000000, 12000000, 14000000, 9000000]
  assert.equal(v.versions.length, expected.length)
  for (let i = 0; i < expected.length; i++) assert.equal(cells[i + 3].replace(/\s+/g, ' ').trim(), `${money(expected[i])} Δ ${money(9000000 - expected[i])}`)
  const download = p.getByRole('link', { name: 'Download variances (Excel)', exact: true })
  const [file] = await Promise.all([p.waitForEvent('download'), download.click()])
  assert.equal(await file.failure(), null)
  await noOverflow(p, `CYCLE-005 review at ${width}`)
  await p.screenshot({ path: join(evidence, `reforecast-review-${as}-${width}.png`), fullPage: true })
  console.log(`CYCLE-005 ${as} saves, frozen numbers, every-version reports and Excel at ${width}: passed`)
 } finally { await reader.context.close() }
}
