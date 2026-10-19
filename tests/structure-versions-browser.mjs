// MODEL-005: use Plan, then inspect the captured version in Activity at both widths.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/structure-versions')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, body) => api(owner.context, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await cmd('department', { name: 'Client services' })
 const line = await cmd('line', { name: 'Retained contracts', type: 'revenue' })
 const budget = (await api(owner.context, server.origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '350000', collectionLag: 1, paymentLag: 1 })
 const driver = { scenario: budget.id, name: 'Support retainers', kind: 'volume', department: department.id, line: line.id, start: '2026-01', startVolume: '20', rate: '1000', growthPercent: '0', collectionLag: 1 }
 await cmd('revenue', driver)
 const approval = await cmd('approve-budget', { scenario: budget.id, revision: (await api(owner.context, server.origin, `scenario/${budget.id}`)).scenario.revision })
 const frozen = await api(owner.context, server.origin, `snapshot/${approval.snapshot}`)
 await owner.page.reload()
 await owner.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click()
 await owner.page.getByLabel('Scenario', { exact: true }).selectOption(approval.forecast.id)
 const revenue = owner.page.locator('section.card').filter({ has: owner.page.getByRole('heading', { name: 'Revenue drivers', exact: true }) })
 await revenue.getByRole('button', { name: 'Edit', exact: true }).click()
 await revenue.getByLabel('Rate per unit', { exact: true }).fill('1250')
 await revenue.getByLabel('Monthly growth %', { exact: true }).fill('10')
 await revenue.getByRole('button', { name: 'Save revenue model', exact: true }).click()
 await revenue.getByRole('button', { name: 'Add revenue model', exact: true }).waitFor()
 const versions = await api(owner.context, server.origin, `activity?action=structure-version&scenario=${approval.forecast.id}`)
 const version = versions[0], scenario = version.detail.scenarios.find(sc => sc.id === approval.forecast.id)
 assert.equal(scenario.changedCells.length, 12)
 assert.equal(scenario.changedCells[0].before, 2000000)
 assert.equal(scenario.changedCells[0].after, 2500000)
 assert.deepEqual(await api(owner.context, server.origin, `snapshot/${approval.snapshot}`), frozen)
 await owner.context.close()
 for (const width of [1440, 390]) {
  const reader = await session(browser, root, server.origin, 'owner', width), page = reader.page
  try {
   await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Activity', exact: true }).click()
   await page.getByLabel('Action', { exact: true }).selectOption('structure-version')
   await page.getByLabel('Scenario', { exact: true }).selectOption(approval.forecast.id)
   await page.getByRole('button', { name: 'Filter activity', exact: true }).click()
   const first = page.getByRole('row').filter({ has: page.getByText('Versioned model structure', { exact: true }) }).first()
   await first.getByText('Model structure version', { exact: true }).click()
   const fields = first.getByRole('table', { name: 'Changed fields: Support retainers', exact: true })
   await fields.waitFor()
   for (const value of ['USD 1,000.00', 'USD 1,250.00', '10.00%']) assert.ok((await fields.innerText()).includes(value))
   const cells = first.getByRole('table', { name: `Changed cells: ${approval.forecast.name}`, exact: true })
   assert.equal(await cells.getByRole('row').count(), 13)
   assert.ok((await cells.innerText()).includes('USD 25,000.00'))
   await noOverflow(page, `MODEL-005 Activity ${width}`)
   await page.screenshot({ path: join(evidence, `activity-${width}.png`), fullPage: true })
   const frame = cells.locator('..').locator('..')
   await frame.locator('.table-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth })
   await noOverflow(page, `MODEL-005 moved amounts ${width}`)
   await page.screenshot({ path: join(evidence, `moved-amounts-${width}.png`), fullPage: true })
   const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download activity (Excel)', exact: true }).click()])
   assert.equal(await download.failure(), null)
   proveFormulas(await readWorkbook(await readFile(await download.path())))
   console.log(`MODEL-005 ${width}: Plan edit, version fields, all moved cells, frozen digest, filtered Excel and page overflow passed`)
  } finally { await reader.context.close() }
 }
} finally {
 await browser?.close(); await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
