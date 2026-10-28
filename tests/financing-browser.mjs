// FIN-003, FIN-010: finance plans borrowing/equity; members inspect aggregate outcomes.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/financing')
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
 const department = await cmd('department', { name: 'Operations' })
 const revenue = await cmd('line', { name: 'Client contracts', type: 'revenue' })
 const expense = await cmd('line', { name: 'Delivery costs', type: 'operating-expense' })
 const interest = await cmd('line', { name: 'Interest expense', type: 'operating-expense' })
 const budget = (await api(owner.context, server.origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '50000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, department: department.id, line: revenue.id, name: 'Retainers', kind: 'volume', start: '2026-01', startVolume: '10', rate: '1000', collectionLag: 0 })
 await cmd('expense', { scenario: budget.id, department: department.id, line: expense.id, name: 'Delivery team', kind: 'recurring', start: '2026-01', amount: '15000' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await owner.context.close()
 for (const width of [1440, 390]) {
  const reader = await session(browser, root, server.origin, 'owner', width), page = reader.page
  try {
   await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click()
   await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id)
   const debt = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Debt and credit', exact: true }) })
   if (width === 1440) {
    await debt.getByLabel('Loan or credit name', { exact: true }).fill('Revolving working capital')
    await debt.getByLabel('Debt type', { exact: true }).selectOption('credit')
    await debt.getByLabel('Interest expense line', { exact: true }).selectOption(interest.id)
    await debt.getByLabel('Department', { exact: true }).selectOption(department.id)
    await debt.getByLabel('Credit limit', { exact: true }).fill('50000')
    await debt.getByLabel('Annual interest rate %', { exact: true }).fill('12')
    await debt.getByLabel('Minimum closing cash', { exact: true }).fill('40000')
    await debt.getByLabel('Draw in Feb 2026', { exact: true }).fill('20000')
    assert.equal(await debt.locator('form').evaluate(form => form.checkValidity()), true)
    await debt.getByRole('button', { name: 'Add debt', exact: true }).click()
   }
   await debt.getByRole('table', { name: 'Loans and lines of credit', exact: true }).getByText('Revolving working capital', { exact: true }).waitFor()
   await debt.getByRole('heading', { name: 'Debt and credit', exact: true }).scrollIntoViewIfNeeded()
   await noOverflow(page, `FIN-003 Plan debt ${width}`)
   await page.screenshot({ path: join(evidence, `plan-debt-${width}.png`) })
   const assumptions = debt.getByRole('region', { name: 'Debt assumptions by month', exact: true })
   await assumptions.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(evidence, `plan-schedule-${width}.png`) })
   const equity = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Equity raises', exact: true }) })
   if (width === 1440) {
    await equity.getByLabel('Equity raise name', { exact: true }).fill('Series A funding')
    await equity.getByLabel('Funding month', { exact: true }).fill('2026-08')
    await equity.getByLabel('Amount raised', { exact: true }).fill('5000000')
    await equity.getByRole('button', { name: 'Add equity raise', exact: true }).click()
   }
   await equity.getByRole('table', { name: 'Planned equity raises', exact: true }).getByText('Series A funding', { exact: true }).waitFor()
   await equity.scrollIntoViewIfNeeded(); await noOverflow(page, `FIN-003 Plan equity ${width}`)
   await page.screenshot({ path: join(evidence, `plan-equity-${width}.png`) })
   console.log(`FIN-003 finance Plan ${width}: real credit/equity entries and schedules persist without page overflow`)
  } finally { await reader.context.close() }
 }
 for (const width of [1440, 390]) for (const as of ['owner', 'board']) {
  const reader = await session(browser, root, server.origin, as, width), page = reader.page
  try {
   await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Overview', exact: true }).click()
   const view = await api(reader.context, server.origin, `scenario/${budget.id}`), calc = view.calculation
   const section = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Financing', exact: true }) })
   const totals = section.getByRole('table', { name: 'Monthly financing totals', exact: true })
   await totals.waitFor(); assert.equal(await totals.getByRole('row').count(), 13)
   assert.equal(calc.financing.totals[1].interest, 20000)
   const june = section.getByRole('table', { name: 'Monthly covenant results', exact: true }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Jun 2026', exact: true }) })
   assert.ok((await june.innerText()).includes('Breach'))
   await june.getByText('How this was calculated', { exact: true }).click()
   assert.ok((await june.innerText()).includes('3900000'))
   await totals.scrollIntoViewIfNeeded(); await noOverflow(page, `FIN-003 Overview ${as} ${width}`)
   await page.screenshot({ path: join(evidence, `overview-${as}-${width}.png`) })
   const results = section.getByRole('region', { name: 'Monthly covenant results', exact: true })
   await results.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(evidence, `covenants-${as}-${width}.png`) })
   if (as === 'board') { assert.equal(view.inputs.debt.length, 0); assert.equal(await section.getByRole('table', { name: 'Monthly debt principal and interest', exact: true }).count(), 0) }
   for (const heading of ['Balance sheet', 'Indirect cash flow']) {
    const statement = page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    await statement.getByRole('button', { name: `${heading} reconciliation for Aug 2026: Balanced`, exact: true }).click()
    assert.equal(calc.balanceSheet[7].contributedEquity, 500000000)
    assert.equal(calc.cashFlow[7].financing, 500000000)
    await statement.scrollIntoViewIfNeeded(); await noOverflow(page, `FIN-003 ${heading} ${as} ${width}`)
    await page.screenshot({ path: join(evidence, `${heading.replaceAll(' ', '-')}-${as}-${width}.png`) })
   }
   const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download Excel', exact: true }).click()])
   assert.equal(await download.failure(), null)
   const book = await readWorkbook(await readFile(await download.path())); proveFormulas(book)
   assert.ok(book.getWorksheet('Financing'))
   assert.equal(!!book.getWorksheet('Debt schedule'), as === 'owner')
   console.log(`FIN-003 ${as} ${width}: exact funding, breach trace, reconciled statements, filtered Excel and overflow passed`)
  } finally { await reader.context.close() }
 }
} finally {
 await browser?.close(); await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
