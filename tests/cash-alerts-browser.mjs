// REPORT-006: finance adds a cash-floor alert in the app against a closed month
// that broke the floor, reads its numbers and cause and acknowledges it; the
// alert reads the same at phone width and a board viewer sees no alert card.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { acceptHistory, historyFile } from './history-fixture.mjs'

const card = (page, title) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const tab = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()

async function seed(context, origin) {
 const cmd = (op, body) => api(context, origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Larch Labs', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const ops = await cmd('department', { name: 'Operations' })
 const revenue = await cmd('line', { name: 'Subscriptions', type: 'revenue' }), costs = await cmd('line', { name: 'Operating costs', type: 'operating-expense' })
 const budget = (await api(context, origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '520000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, name: 'Plans', kind: 'volume', department: ops.id, line: revenue.id, start: '2026-01', startVolume: '100', rate: '1000', collectionLag: 0 })
 await cmd('expense', { scenario: budget.id, name: 'Running costs', kind: 'recurring', department: ops.id, line: costs.id, start: '2026-01', amount: '110000' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await api(context, origin, `scenario/${budget.id}`)).scenario.revision })
 await cmd('account-map', { account: '400', target: revenue.id }); await cmd('account-map', { account: '500', target: costs.id })
 await cmd('department-map', { source: 'Operations', department: ops.id })
 await cmd('cash-constraints', { floor: '350000', runwayMinimum: '0' })
 await acceptHistory((name, op, body) => api(context, origin, `import/${name}/${op}`, body), historyFile('january.csv', ['2026-01-31,400,Operations,-40000.00,Subscriptions', '2026-01-31,500,Operations,110000.00,Running costs']))
 await cmd('close-month', { scenario: approved.forecast.id, month: '2026-01' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
}

async function read(page, width) {
 await tab(page, 'Overview')
 const alerts = card(page, 'Cash alerts')
 await alerts.getByRole('heading', { name: /^Cash floor/ }).waitFor()
 await alerts.getByText('forecast cash falls below the $350,000.00 floor in Dec 2026.', { exact: true }).waitFor()
 await alerts.getByText('Lowest forecast cash: $340,000.00 in Dec 2026, $10,000.00 below the agreed floor of $350,000.00.', { exact: true }).waitFor()
 await alerts.getByText(/^Cause: owner@example\.test saved a cash alert rule\.$/).waitFor()
 await alerts.getByText(/^Alert 1 acknowledged by/).waitFor()
 assert.equal(await alerts.getByRole('table', { name: 'Alerts sent for Cash floor' }).getByRole('row').count(), 2, 'one send')
 await noOverflow(page, `REPORT-006 cash alerts ${width}`)
}

const existing = process.argv.includes('--existing')
const root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-cash-alerts')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const seeder = await session(browser, root, server.origin, 'owner', 1440)
 await seed(seeder.context, server.origin)
 await seeder.context.close()
 for (const width of [1440, 390]) {
  const owner = await session(browser, root, server.origin, 'owner', width)
  const p = owner.page
  try {
   if (width === 1440) {
    await tab(p, 'Overview')
    const alerts = card(p, 'Cash alerts')
    await alerts.getByText('No cash alerts.', { exact: true }).waitFor()
    await alerts.getByLabel('Rule name', { exact: true }).fill('Cash floor')
    await alerts.getByLabel('Alert when', { exact: true }).selectOption('floor')
    await alerts.getByLabel('Re-alert interval (days)', { exact: true }).fill('7')
    await alerts.getByRole('button', { name: 'Add cash alert rule', exact: true }).click()
    await p.waitForResponse(r => r.url().includes('/command/cash-alert-rule-save') && r.ok())
    await alerts.getByRole('button', { name: 'Acknowledge alert 1', exact: true }).click()
    await p.waitForResponse(r => r.url().includes('/command/cash-alert-acknowledge') && r.ok())
   }
   await read(p, width)
   await p.screenshot({ path: join(evidence, `cash-alerts-finance-${width}.png`), fullPage: true })
   const board = await session(browser, root, server.origin, 'board', width)
   try {
    await tab(board.page, 'Overview')
    await board.page.getByRole('heading', { name: 'Cash health', exact: true }).waitFor()
    assert.equal(await card(board.page, 'Cash alerts').count(), 0, 'cash alerts are finance-only')
    await noOverflow(board.page, `REPORT-006 board overview ${width}`)
   } finally { await board.context.close() }
  } finally { await owner.context.close() }
  console.log(`REPORT-006 browser passed at ${width}: floor alert numbers, cause, acknowledgment; board sees no alert card`)
 }
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
