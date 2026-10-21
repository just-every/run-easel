import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
import { largeWorkbook } from './scale-fixtures.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-calculation')
await mkdir(evidence, { recursive: true })
let server, browser, finance
const tab = async (page, name) => { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click(); await settle(page) }
try {
 const port = await freePort(); await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)]); server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const page = finance.page, cmd = (op, body) => api(finance.context, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Granite Vendor Planning', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 36 })
 await cmd('department', { name: 'Operations' }); await cmd('line', { name: 'Software', type: 'operating-expense' })
 await page.reload(); await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 for (const [index, width] of [1440, 390].entries()) {
  await page.setViewportSize({ width, height: 1000 }); await tab(page, 'Actuals')
  const rows = 2201 + index, file = await largeWorkbook(rows)
  const section = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Move in a planning workbook (.xlsx)', exact: true }) })
  await section.getByLabel('Planning workbook', { exact: true }).setInputFiles({ name: `Vendor plan ${width}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(file.base64, 'base64') })
  const previewResponse = page.waitForResponse(r => r.url().endsWith('/import/workbook/preview'))
  await section.getByRole('button', { name: 'Preview workbook', exact: true }).click()
  const preview = await (await previewResponse).json()
  assert.equal(preview.rows.length, rows)
  const accepted = page.waitForResponse(r => r.url().endsWith('/import/workbook/commit'))
  await section.getByRole('button', { name: 'Import as a new scenario', exact: true }).click()
  const response = await accepted; assert.equal(response.status(), 202)
  const pending = page.getByRole('region', { name: 'Background calculation', exact: true })
  await pending.waitFor(); assert.ok((await pending.innerText()).includes('Recalculating…'))
  assert.equal(await section.count(), 0, 'Old figures are removed while a large change runs')
  await noOverflow(page, `Background calculation ${width}`); await pending.screenshot({ path: join(evidence, `recalculating-${width}.png`) })
  await pending.waitFor({ state: 'hidden' }); await settle(page)
  const startedState = await api(finance.context, server.origin, 'state'), startedImport = startedState.workbooks.find(w => w.rows === rows)
  await tab(page, 'Plan'); await page.getByLabel('Scenario', { exact: true }).selectOption(startedImport.scenario)
  await page.getByRole('heading', { name: 'Finish the source import', exact: true }).waitFor()
  const paused = page.getByRole('region', { name: 'Background calculation', exact: true })
  await noOverflow(page, `Paused source import ${width}`); await paused.screenshot({ path: join(evidence, `calculation-continue-${width}.png`) })
  await paused.getByRole('button', { name: 'Continue workbook import', exact: true }).click(); await settle(page)
  const imports = page.getByRole('table', { name: 'Workbook imports', exact: true })
  const row = imports.getByRole('row').filter({ has: page.getByRole('cell', { name: String(rows), exact: true }) })
  for (let steps = 0; (await row.innerText()).includes('importing'); steps++) {
   assert.ok(steps < 30, 'The bounded import makes progress to completion')
   await row.getByRole('button', { name: 'Continue import', exact: true }).click()
   await pending.waitFor(); await pending.waitFor({ state: 'hidden' }); await settle(page)
  }
  assert.ok((await row.innerText()).includes('imported'))
  const state = await api(finance.context, server.origin, 'state'), imported = state.workbooks.find(w => w.rows === rows)
  const view = await api(finance.context, server.origin, `scenario/${imported.scenario}`)
  assert.equal(view.inputs.schedule.length, rows)
  assert.equal(view.calculation.profit[0].operatingExpenses, preview.totals['2026-01'])
  await noOverflow(page, `Completed large import ${width}`); await imports.locator('..').screenshot({ path: join(evidence, `calculation-complete-${width}.png`) })
  console.log(`Background calculation ${width}: reviewed ${rows}-row workbook, recalculating cells without old figures, bounded continuation and exact completed totals passed`)
 }
} catch (error) { if (finance?.page && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }) }
