// ENTITY-002: finance enters CAD→USD rates in the app and reads the translated
// statements and the closed month's constant-currency variance; a board viewer
// reads the same numbers without the rate form. Desktop and phone widths.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { acceptHistory, historyFile } from './history-fixture.mjs'

const card = (page, title) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const tab = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const cells = async row => (await row.getByRole('cell').allInnerTexts()).slice(1)

async function seed(context, origin) {
 const cmd = (op, body) => api(context, origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Maple Planning', currency: 'CAD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Services', type: 'revenue' }), software = await cmd('line', { name: 'Software', type: 'operating-expense' })
 const budget = (await api(context, origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '10000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: dept.id, line: revenue.id, start: '2026-01', startVolume: '10', rate: '100', growthPercent: '0', collectionLag: 0 })
 await cmd('expense', { scenario: budget.id, name: 'Licences', line: software.id, department: dept.id, start: '2026-01', kind: 'recurring', amount: '400' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await api(context, origin, `scenario/${budget.id}`)).scenario.revision })
 await cmd('account-map', { account: '400', target: revenue.id }); await cmd('account-map', { account: '500', target: software.id })
 await cmd('department-map', { source: 'Sales', department: dept.id })
 await acceptHistory((name, op, body) => api(context, origin, `import/${name}/${op}`, body), historyFile('jan.csv', ['2026-01-15,400,Sales,-1200.00,Revenue', '2026-01-15,500,Sales,500.00,Software']))
 await cmd('close-month', { scenario: approved.forecast.id, month: '2026-01' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
}

async function read(page, label, width) {
 await tab(page, 'Overview')
 const rates = card(page, 'Reporting currency')
 const pl = rates.getByRole('table', { name: 'Profit and loss in USD' }), bs = rates.getByRole('table', { name: 'Balance sheet in USD' })
 await pl.waitFor()
 assert.deepEqual((await cells(pl.getByRole('row').filter({ hasText: /^Profit/ }))).slice(0, 2), ['$560.00', '$468.00'])
 assert.deepEqual((await cells(pl.getByRole('row').filter({ hasText: /^Average rate/ }))).slice(0, 2), ['0.800000', '0.780000'])
 assert.equal((await cells(bs.getByRole('row').filter({ hasText: /^Month-end rate/ })))[0], '0.820000')
 assert.notEqual((await cells(bs.getByRole('row').filter({ hasText: /^Translation adjustment/ })))[1], '—')
 await noOverflow(page, `ENTITY-002 overview ${label} ${width}`)
 await tab(page, 'Review')
 const cc = card(page, 'Constant-currency variance, Jan 2026')
 await cc.getByRole('table', { name: 'Profit in USD' }).waitFor()
 assert.deepEqual(await cc.getByRole('table', { name: 'Profit in USD' }).getByRole('row').nth(1).getByRole('cell').allInnerTexts(), ['$450.00', '$560.00', '$525.00', '$110.00', '$75.00', '$35.00'])
 await noOverflow(page, `ENTITY-002 review ${label} ${width}`)
}

const existing = process.argv.includes('--existing')
const root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-translation')
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
   await tab(p, 'Overview')
   const rates = card(p, 'Reporting currency')
   if (width === 1440) await rates.getByText('The plan is in CAD.', { exact: false }).waitFor()
   if (width === 1440) for (const [month, values] of [['2025-12', { 'Month-end rate': '0.70' }], ['2026-01', { 'Budget rate': '0.75', 'Average rate': '0.80', 'Month-end rate': '0.82' }], ['2026-02', { 'Budget rate': '0.75', 'Average rate': '0.78', 'Month-end rate': '0.76' }]]) {
    await rates.getByLabel('Rate month', { exact: true }).fill(month)
    for (const [label, value] of Object.entries(values)) await rates.getByLabel(label, { exact: true }).fill(value)
    await rates.getByRole('button', { name: 'Save rates', exact: true }).click()
    await p.waitForResponse(r => r.url().includes('/command/fx-rate') && r.ok())
    await p.waitForTimeout(300)
    for (const label of ['Budget rate', 'Average rate', 'Month-end rate']) await rates.getByLabel(label, { exact: true }).fill('')
   }
   await read(p, 'finance', width)
   await p.screenshot({ path: join(evidence, `translation-finance-${width}.png`), fullPage: true })
   const board = await session(browser, root, server.origin, 'board', width)
   try {
    await read(board.page, 'board', width)
    await tab(board.page, 'Overview')
    assert.equal(await board.page.getByRole('button', { name: 'Save rates', exact: true }).count(), 0)
    await board.page.screenshot({ path: join(evidence, `translation-board-${width}.png`), fullPage: true })
   } finally { await board.context.close() }
  } finally { await owner.context.close() }
  console.log(`ENTITY-002 browser passed at ${width}: rates, translated statements, constant-currency variance, board read-only`)
 }
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
