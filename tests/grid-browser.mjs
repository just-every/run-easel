// MODEL-008, MODEL-013: contributor's complete planning-grid journey at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { gridFixture } from './grid-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-grid')
await mkdir(evidence, { recursive: true })
let server, browser, contributor
const settle = page => page.waitForLoadState('networkidle')
async function saved(page, click) {
 const response = page.waitForResponse(r => r.url().endsWith('/command/grid-save') && r.request().method() === 'POST')
 await click(); const r = await response; assert.equal(r.status(), 200, await r.text()); const result = await r.json(); await page.locator(`section.planning-grid[data-revision="${result.scenario.revision}"]`).waitFor(); await settle(page)
}
async function reviewed(page, click) {
 const response = page.waitForResponse(r => r.url().endsWith('/command/grid-preview') && r.request().method() === 'POST')
 await click(); const r = await response; assert.equal(r.status(), 200); const result = await r.json(); assert.deepEqual(result.refused, [])
 await saved(page, () => page.getByRole('button', { name: 'Apply grid changes', exact: true }).click())
 return result
}
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body)
 const f = await gridFixture((op, body) => call(`command/${op}`, body), path => call(path), (kit, op, body) => call(`import/${kit}/${op}`, body))
 contributor = await session(browser, root, server.origin, 'sales', 1440)
 const page = contributor.page
 const read = () => api(contributor.context, server.origin, `scenario/${f.scenario}`)
 const grid = () => page.getByRole('region', { name: 'Planning grid', exact: true })
 const monthLabel = index => new Date(`${f.months[index]}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
 const input = (row, index) => grid().getByLabel(`${f.rows[row].name} ${monthLabel(index)} grid amount`, { exact: true })
 const select = (row, index) => grid().getByLabel(`Select ${f.rows[row].name} ${monthLabel(index)}`, { exact: true }).check()
 const shoot = async (name, width) => { await settle(page); await noOverflow(page, `MODEL-008 ${name} ${width}`); await grid().screenshot({ path: join(evidence, `${name}-${width}.png`) }) }
 const paste = async (text, row = 0, month = 0) => {
  await input(row, month).click()
  await input(row, month).evaluate((node, text) => { const data = new DataTransfer(); data.setData('text/plain', text); node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data })) }, text)
 }
 const operation = async (kind, amount, selection = 'row') => {
  if (selection === 'row') await grid().getByRole('button', { name: `Select ${f.rows[0].name} months`, exact: true }).click()
  else for (const index of selection) await select(0, index)
  const details = grid().locator('details').filter({ has: page.locator('summary', { hasText: 'Spread, adjust or copy selected cells' }) }).first()
  await details.evaluate(node => { node.open = true })
  await details.getByLabel('Grid operation', { exact: true }).selectOption(kind)
  await details.getByLabel('Total, percent or amount change', { exact: true }).fill(amount)
  return reviewed(page, () => details.getByRole('button', { name: 'Preview selection changes', exact: true }).click())
 }
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await page.reload()
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click(); await settle(page)
  await grid().getByRole('heading', { name: 'Planning grid', exact: true }).waitFor()
  assert.ok((await grid().innerText()).includes('Region: East'))
  const pasted = f.rows.map((_, r) => f.months.map((_, i) => String((r + 1) * 100 + i)).join('\t')).join('\n')
  const before = await read()
  await paste(pasted)
  await grid().getByRole('heading', { name: 'Review grid changes', exact: true }).waitFor()
  assert.deepEqual((await read()).inputs, before.inputs, 'Paste preview writes nothing')
  assert.equal(await grid().getByRole('table', { name: 'Grid change preview', exact: true }).getByRole('row').count(), 37)
  await shoot('paste-preview', width)
  await saved(page, () => grid().getByRole('button', { name: 'Apply grid changes', exact: true }).click())
  let v = await read()
  for (let r = 0; r < 3; r++) assert.deepEqual(v.inputs.schedule.find(s => s.id === f.rows[r].id).values, Object.fromEntries(f.months.map((m, i) => [m, ((r + 1) * 100 + i) * 100])))
  await operation('even', '120000')
  v = await read(); assert.deepEqual(Object.values(v.inputs.schedule.find(s => s.id === f.rows[0].id).values), Array(12).fill(1000000))
  await operation('prior-year', '120000')
  v = await read(); assert.deepEqual(Object.values(v.inputs.schedule.find(s => s.id === f.rows[0].id).values), [153846,307692,461538,615385,769231,923077,1076923,1230769,1384615,1538462,1692308,1846154])
  await reviewed(page, async () => { await paste('1000\t2000\t3000') })
  await operation('proportional', '60000', [0, 1, 2])
  v = await read(); assert.deepEqual(f.months.slice(0, 3).map(m => v.inputs.schedule.find(s => s.id === f.rows[0].id).values[m]), [1000000,2000000,3000000])
  await operation('percent', '10', [0, 1, 2]); await operation('amount', '-500', [0, 1, 2])
  v = await read(); assert.deepEqual(f.months.slice(0, 3).map(m => v.inputs.schedule.find(s => s.id === f.rows[0].id).values[m]), [1050000,2150000,3250000])
  await input(0, 0).click(); await operation('copy', '', [3, 4])
  v = await read(); assert.deepEqual(f.months.slice(3, 5).map(m => v.inputs.schedule.find(s => s.id === f.rows[0].id).values[m]), [1050000,1050000])
  await input(0, 0).click()
  const detail = grid().locator('details').filter({ has: page.locator('summary', { hasText: `Note and split: ${f.rows[0].name}` }) }).first()
  await detail.evaluate(node => { node.open = true })
  await detail.getByLabel('Grid cell note', { exact: true }).fill('Annual renewal reviewed with department owner')
  for (let i = 0; i < 2; i++) {
   await detail.getByRole('button', { name: 'Add named sub-row', exact: true }).click()
   await detail.getByLabel(`Sub-row ${i + 1} name`, { exact: true }).fill(['Aspen software', 'Birch support'][i])
   await detail.getByLabel(`Sub-row ${i + 1} amount`, { exact: true }).fill(['6000', '4500'][i])
  }
  const beforeSplit = await read()
  await reviewed(page, () => detail.getByRole('button', { name: 'Preview cell note and split', exact: true }).click())
  v = await read(); const splitRow = v.inputs.schedule.find(s => s.id === f.rows[0].id)
  assert.deepEqual(splitRow.subrows[f.months[0]], [{ name: 'Aspen software', amount: 600000 }, { name: 'Birch support', amount: 450000 }])
  assert.equal(splitRow.values[f.months[0]], 1050000)
  assert.equal(splitRow.notes[f.months[0]], 'Annual renewal reviewed with department owner')
  await grid().getByText('Calculated cells and their traces (read-only)', { exact: true }).click()
  const computed = grid().getByRole('table', { name: 'Read-only calculated planning cells', exact: true })
  assert.equal(await computed.locator('input').count(), 0)
  const firstTrace = computed.getByRole('row').filter({ hasText: f.rows[0].name }).getByRole('cell').first().locator('summary')
  await firstTrace.click(); assert.match(await computed.innerText(), /Annual renewal reviewed with department owner/)
  await shoot('split-and-trace', width)
  const region = grid().getByRole('region', { name: 'Planning grid monthly inputs', exact: true })
  const pinned = await region.locator('tbody th').first().boundingBox()
  await region.evaluate(node => { node.scrollLeft = 900 })
  const moved = await region.locator('tbody th').first().boundingBox()
  assert.ok(Math.abs(pinned.x - moved.x) < 2, 'Line column stays pinned while the grid scrolls')
  await shoot('scrolled', width)
  const undoResponse = page.waitForResponse(r => r.url().endsWith('/command/grid-undo'))
  await grid().getByRole('button', { name: 'Undo last grid save', exact: true }).click(); const undone = await undoResponse; assert.equal(undone.status(), 200); const result = await undone.json(); await page.locator(`section.planning-grid[data-revision="${result.revision}"]`).waitFor(); await settle(page)
  assert.deepEqual((await read()).inputs.schedule, beforeSplit.inputs.schedule)
  const dimensional = await api(contributor.context, server.origin, `dimension-report/${f.scenario}?dimension=${f.dimension.id}`)
  const model = await read()
  const expected = model.calculation.cells.filter(c => f.rows.some(row => row.line === c.line)).reduce((n, c) => n + c.amount, 0)
  const regional = dimensional.dimensions[0].members.find(m => m.id === f.region.id)
  assert.equal(Object.values(regional.amounts).reduce((n, a) => n + a, 0), expected)
  await shoot('undo', width)
  await paste('not a number')
  await grid().getByRole('heading', { name: 'Review grid changes', exact: true }).waitFor()
  assert.ok((await grid().getByRole('listitem').allInnerTexts()).some(text => text.includes('A1')))
  assert.equal(await grid().getByRole('button', { name: 'Apply grid changes', exact: true }).isDisabled(), true)
  await shoot('refused', width)
  console.log(`MODEL-008 ${width}: paste3x12, exact spreads, percent/amount, copy, split/note/trace, undo, refused address and pinned no-overflow grid passed`)
 }
} catch (error) {
 if (contributor?.page && !contributor.page.isClosed()) await contributor.page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {})
 throw error
} finally {
 await browser?.close(); await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
