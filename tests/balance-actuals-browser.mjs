// CONNECT-007: native finance mapping/import/reconciliation at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, freePort, start } from './browser-runtime.mjs'
import { session, api, noOverflow } from './browser-journey.mjs'
import { balanceSource, seedBalanceActuals } from './balance-actuals-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = process.cwd(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-balance-actuals')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const initial = await session(browser, root, server.origin, 'owner', 1440)
 const seed = await seedBalanceActuals((op, body) => api(initial.context, server.origin, `command/${op}`, body))
 await initial.context.close()
 for (const width of [1440, 390]) {
  const { context, page } = await session(browser, root, server.origin, 'owner', width)
  try {
   const tab = name => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
   const shot = async name => { await noOverflow(page, `CONNECT-007 ${name} ${width}`); await page.screenshot({ path: join(evidence, `balance-${width}-${name}.png`), fullPage: true }) }
   await tab('Settings')
   // Use the visible exact mapping door, and inspect the reusable-rule target list.
   const mappings = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Account mappings', exact: true }) })
   await mappings.getByLabel('Source account', { exact: true }).fill('2300')
   await mappings.getByLabel('Maps to', { exact: true }).selectOption('bs:debt')
   await mappings.getByRole('button', { name: 'Save mapping', exact: true }).click()
   await mappings.getByRole('row').filter({ hasText: '2300' }).getByText('Debt', { exact: true }).waitFor()
   assert.equal(await page.getByLabel('Rule maps to', { exact: true }).locator('option[value^="bs:"]').count(), 8)
   await shot('settings')
   await tab('Actuals')
   if (width === 1440) {
    await page.getByLabel('Actuals file', { exact: true }).setInputFiles({ name: balanceSource.filename, mimeType: 'text/csv', buffer: Buffer.from(balanceSource.csv) })
    await page.getByLabel('Date format', { exact: true }).selectOption('YYYY-MM-DD')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Every account and department is mapped.' }).waitFor()
    assert.equal(await page.getByLabel('Map account 1101', { exact: true }).inputValue(), 'bs:receivables')
    await page.getByLabel('Map account 2300', { exact: true }).selectOption('bs:debt')
    await page.getByRole('status').filter({ hasText: 'Every account and department is mapped.' }).waitFor()
    await shot('preview')
    await page.getByRole('button', { name: 'Accept 13 rows', exact: true }).click()
    await page.getByRole('region', { name: 'Actuals imports', exact: true }).getByText(balanceSource.filename, { exact: true }).waitFor()
   }
   const summary = page.locator('summary').filter({ hasText: '2026-01' })
   await summary.click()
   const balances = page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true })
   await balances.getByRole('row').filter({ hasText: 'Receivables' }).getByText('$22,000.00', { exact: true }).waitFor()
   assert.match(await balances.innerText(), /\$95,400.00/)
   assert.match(await page.getByRole('region', { name: 'Trial balance 2026-01', exact: true }).innerText(), /1101/)
   const download = page.waitForEvent('download')
   await page.getByRole('link', { name: 'Download reconciliation (Excel)', exact: true }).click()
   assert.equal((await download).suggestedFilename().endsWith('.xlsx'), true)
   await shot('reconciled')
   await api(context, server.origin, 'command/account-rule-delete', { id: seed.receivables.id })
   await tab('Settings'); await tab('Actuals')
   await page.locator('summary').filter({ hasText: '2026-01' }).click()
   await page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true }).getByText('Unavailable: unresolved mappings', { exact: true }).first().waitFor()
   await shot('blocked')
   seed.receivables = await api(context, server.origin, 'command/account-rule', { match: 'range', from: '1100', to: '1199', target: 'bs:receivables' })
   await tab('Settings'); await tab('Actuals')
   await page.locator('summary').filter({ hasText: '2026-01' }).click()
   await page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true }).getByText('$22,000.00', { exact: true }).waitFor()
   await shot('restored')
   console.log(`CONNECT-007 native finance mapping, journal import, trial balance, source detail, blocked/restored balances and Excel at ${width}`)
  } finally { await context.close() }
 }
} finally { await browser?.close(); await server?.close() }
