// CYCLE-006: use the annual-plan form, inspect the linked budget and every
// target gap, then read the same plan as the board at both supported widths.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { api, noOverflow, session } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
import { readFile } from 'node:fs/promises'

export async function seedLongRange(context, origin) {
 const cmd = (op, body) => api(context, origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 10, planStart: '2026-10' })
 const dept = await cmd('department', { name: 'Consulting' })
 const revenue = await cmd('line', { name: 'Services', type: 'revenue' })
 const costs = await cmd('line', { name: 'Delivery costs', type: 'operating-expense' })
 const budget = (await api(context, origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '500000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, name: 'Retained contracts', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-10', startVolume: '100', rate: '1000', collectionLag: 0 })
 await cmd('expense', { scenario: budget.id, name: 'Delivery team', kind: 'recurring', department: dept.id, line: costs.id, start: '2026-10', amount: '50000' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
}
const amount = n => `${n < 0 ? '-' : ''}USD ${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function longRangeJourney(browser, root, origin, evidence, width, as = 'owner') {
 const reader = await session(browser, root, origin, as, width), page = reader.page
 try {
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Scenarios', exact: true }).click()
  const section = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Long-range plan', exact: true }) })
  await section.waitFor()
  if (as === 'owner') {
   const newButton = section.getByRole('button', { name: 'New long-range plan', exact: true })
   if (await newButton.count()) await newButton.click()
   await section.getByLabel('Long-range plan name', { exact: true }).fill(`Strategy ${width}`)
   await section.getByLabel('Prior-year revenue', { exact: true }).fill('1000000')
   await section.getByLabel('Target annual revenue growth %', { exact: true }).fill('40')
   await section.getByLabel('Target operating margin %', { exact: true }).fill('25')
   await section.getByLabel('Target year-end headcount', { exact: true }).fill('8')
   await section.getByLabel('Target year-end cash', { exact: true }).fill('1500000')
   for (let y = 2; y <= 5; y++) {
    for (const [label, value] of [['revenue growth %', '20'], ['operating margin %', '30'], ['headcount change', '2'], ['net cash change', '200000']]) await section.getByLabel(`Year ${y} ${label}`, { exact: true }).fill(value)
   }
   await noOverflow(page, `CYCLE-006 form ${width}`)
   await section.screenshot({ path: join(evidence, `annual-form-${width}.png`) })
   await section.getByRole('button', { name: 'Save long-range plan', exact: true }).click()
  }
  await section.getByRole('table').waitFor()
  if (as === 'board') await section.getByLabel('Annual plan', { exact: true }).selectOption({ label: `Strategy ${width}` })
  const plans = await api(reader.context, origin, 'long-range'), plan = plans.find(p => p.name === `Strategy ${width}`)
  assert.ok(plan)
  await section.getByRole('heading', { name: `Strategy ${width}`, exact: true }).waitFor()
  const view = await api(reader.context, origin, `long-range/${plan.id}`)
  const readRow = async label => section.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).getByRole('cell').allInnerTexts()
  for (const [label, key] of [['Revenue', 'revenue'], ['Operating profit', 'profit'], ['Year-end cash', 'closingCash'], ['Revenue gap', 'revenueGap'], ['Profit gap', 'profitGap'], ['Cash gap', 'cashGap']]) assert.deepEqual(await readRow(label), view.rows.map(r => amount(r[key])))
  assert.deepEqual(await readRow('Headcount gap'), view.rows.map(r => String(r.headcountGap)))
  assert.equal(view.rows[0].revenue, 120000000)
  assert.equal(view.rows[0].revenueGap, -20000000)
  const [download] = await Promise.all([page.waitForEvent('download'), section.getByRole('link', { name: 'Download long-range plan (Excel)', exact: true }).click()])
  assert.equal(await download.failure(), null)
  const book = await readWorkbook(await readFile(await download.path())); proveFormulas(book)
  await noOverflow(page, `CYCLE-006 ${as} ${width}`)
  await section.screenshot({ path: join(evidence, `annual-${as}-${width}.png`) })
  const region = section.getByRole('region', { name: 'Annual plan and target reconciliation' })
  await region.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await section.screenshot({ path: join(evidence, `annual-final-year-${as}-${width}.png`) })
  if (as === 'board') assert.equal(await section.getByRole('button', { name: 'Save long-range plan', exact: true }).count(), 0)
  console.log(`CYCLE-006 ${as} ${width}: saved linked annual plan, exact reconciliation, Excel and overflow passed`)
 } catch (error) { await page.screenshot({ path: join(evidence, `annual-failed-${as}-${width}.png`), fullPage: true }); throw error } finally { await reader.context.close() }
}
