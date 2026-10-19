// REV-003 + CONNECT-010: two real sibling installations and native finance UI.
import assert from 'node:assert/strict'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { session, api, noOverflow } from './browser-journey.mjs'
import { gaugeProvider } from './gauge-provider.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/gauge')
await mkdir(evidence, { recursive: true })
let provider, browser, server
const card = (page, name) => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
try {
 provider = await gaugeProvider()
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 await appendFile(join(root, '.dev.vars'), `\nGAUGE_ORIGIN=${JSON.stringify(provider.origin)}\n`)
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 let scenario
 for (const width of [1440, 390]) {
  const finance = await session(browser, root, server.origin, 'owner', width), page = finance.page
  try {
   await api(finance.context, server.origin, 'command/workspace', { name: 'Cardinal Growth Partners', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
   const state = await api(finance.context, server.origin, 'state'); scenario ??= state.scenarios[0].id
   const dept = state.departments.find(d => d.name === 'Advisory') ?? await api(finance.context, server.origin, 'command/department', { name: 'Advisory' })
   const line = await api(finance.context, server.origin, 'command/line', { name: `Advisory services ${width}`, type: 'revenue' })
   const driver = await api(finance.context, server.origin, 'command/revenue', { scenario, kind: 'services', name: `Agency utilization ${width}`, line: line.id, department: dept.id, start: '2026-01', collectionLag: 1, monthlyHours: '160', utilizationPercent: '75', hourlyRate: '150' })
   await page.reload(); await nav(page, 'Settings')
   const connections = card(page, 'Connections')
   await connections.getByLabel('Gauge read key', { exact: true }).fill(provider.token)
   await connections.getByRole('button', { name: /^(Connect Gauge|Replace Gauge key)$/ }).click()
   await connections.getByText('Key stored; checked when you preview an import', { exact: true }).waitFor()
   assert.ok(!(await connections.innerText()).includes(provider.token))
   await connections.scrollIntoViewIfNeeded(); await noOverflow(page, `CONNECT-010 connected ${width}`)
   await connections.screenshot({ path: join(evidence, `connected-${width}.png`) })
   await nav(page, 'Plan'); await page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
   const utilization = card(page, 'Gauge utilization actuals')
   await utilization.getByLabel('Services driver', { exact: true }).selectOption(driver.id)
   await utilization.getByLabel('Utilization month', { exact: true }).fill('2026-01')
   const before = await api(finance.context, server.origin, `scenario/${scenario}`)
   await utilization.getByRole('button', { name: 'Preview Gauge utilization', exact: true }).click()
   await utilization.getByRole('table', { name: 'Gauge utilization preview', exact: true }).waitFor()
   assert.deepEqual(await api(finance.context, server.origin, `scenario/${scenario}`), before)
   assert.ok((await utilization.innerText()).includes('28800'))
   assert.ok((await utilization.innerText()).includes('USD 1,200.00'))
   await utilization.scrollIntoViewIfNeeded(); await noOverflow(page, `REV-003 preview ${width}`)
   await utilization.screenshot({ path: join(evidence, `preview-${width}.png`) })
   await utilization.getByRole('button', { name: 'Accept Gauge utilization', exact: true }).click()
   await utilization.getByRole('table', { name: `Accepted Gauge utilization · Agency utilization ${width}`, exact: true }).waitFor()
   const accepted = await api(finance.context, server.origin, `scenario/${scenario}`), cell = accepted.calculation.cells.find(c => c.line === line.id && c.month === '2026-01')
   assert.equal(cell.amount, 120000); assert.match(cell.sources[0].trace, /28800 approved billable seconds/)
   await utilization.getByRole('button', { name: 'Preview Gauge utilization', exact: true }).waitFor()
   await utilization.screenshot({ path: join(evidence, `accepted-${width}.png`) })
   await page.reload(); await nav(page, 'Plan')
   await card(page, 'Gauge utilization actuals').getByRole('table', { name: `Accepted Gauge utilization · Agency utilization ${width}`, exact: true }).waitFor()
   await card(page, 'Gauge utilization actuals').getByRole('button', { name: `Undo latest Gauge import · Agency utilization ${width}`, exact: true }).click()
   await card(page, 'Gauge utilization actuals').getByRole('table', { name: `Accepted Gauge utilization · Agency utilization ${width}`, exact: true }).waitFor({ state: 'detached' })
   assert.equal((await api(finance.context, server.origin, `scenario/${scenario}`)).calculation.cells.find(c => c.line === line.id && c.month === '2026-01').amount, 0)
   await card(page, 'Gauge utilization actuals').getByRole('button', { name: 'Preview Gauge utilization', exact: true }).waitFor()
   await card(page, 'Gauge utilization actuals').screenshot({ path: join(evidence, `undone-${width}.png`) })
   await nav(page, 'Settings')
   await card(page, 'Connections').getByRole('button', { name: 'Disconnect Gauge', exact: true }).click()
   await card(page, 'Connections').getByText('Disconnected', { exact: true }).waitFor()
   await card(page, 'Connections').screenshot({ path: join(evidence, `disconnected-${width}.png`) })
   await noOverflow(page, `CONNECT-010 disconnected ${width}`)
   console.log(`REV-003 CONNECT-010 ${width}: real Gauge approved time → scoped owner key → sealed Easel connection → exact 120000 cents, no-write preview, native accept/reload/undo/disconnect passed`)
  } finally { await finance.context.close() }
 }
} finally { await browser?.close(); await server?.close(); await provider?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
