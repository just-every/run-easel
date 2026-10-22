// FIN-007: real native sessions and Overview at desktop and phone widths.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
import { mkdir, rm, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-weekly-cash')
await mkdir(evidence, { recursive: true })
const overview = page => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Overview', exact: true }).click()
const card = page => page.getByRole('region', { name: '13-week planned cash', exact: true })
let server, browser
try {
 const port = await freePort()
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const seeder = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, body) => api(seeder.context, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbor Services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Operations' })
 const revenue = await cmd('line', { name: 'Service revenue', type: 'revenue' })
 const payroll = await cmd('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const spend = await cmd('line', { name: 'Software', type: 'operating-expense' })
 const scenario = (await api(seeder.context, server.origin, 'state')).scenarios[0].id
 await cmd('scenario-cash', { scenario, basis: 'estimate', opening: '400000', receivables: '20000', payables: '5000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario, name: 'Customer service agreement', kind: 'contract', department: dept.id, line: revenue.id, start: '2026-01', startDate: '2026-01-15', termMonths: '12', contractValue: '1200000', billingCadence: 'monthly', dsoDays: '10' })
 await cmd('position', { scenario, title: 'Delivery team', holder: 'Private payroll sentinel', department: dept.id, line: payroll.id, start: '2026-01', annualSalary: '360000', onCostPercent: '20', payDay: '15', payMonthOffset: '0' })
 await cmd('expense', { scenario, name: 'Annual software', kind: 'one-off', department: dept.id, line: spend.id, start: '2026-01', amount: '24000' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await seeder.context.close()
 for (const width of [1440, 390]) {
  const owner = await session(browser, root, server.origin, 'owner', width), p = owner.page
  try {
   await p.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click()
   const positions = p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Positions', exact: true }) })
   const edit = () => positions.getByRole('row').filter({ has: p.getByRole('cell', { name: 'Delivery team', exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click()
   await edit()
   const firstDay = width === 1440 ? '15' : '14', secondDay = width === 1440 ? '31' : '30'
   await positions.getByLabel('Payroll pay day', { exact: true }).fill(firstDay)
   await positions.getByLabel('Second payroll pay day', { exact: true }).fill(secondDay)
   await Promise.all([p.waitForResponse(r => r.url().includes('/command/position') && r.ok()), positions.getByRole('button', { name: 'Save position', exact: true }).click()])
   await p.reload()
   await p.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click()
   await edit()
   assert.equal(await positions.getByLabel('Payroll pay day', { exact: true }).inputValue(), firstDay)
   assert.equal(await positions.getByLabel('Second payroll pay day', { exact: true }).inputValue(), secondDay)
   const scheduled = await api(owner.context, server.origin, `scenario/${scenario}`)
   assert.equal(scheduled.calculation.dailyCash.find(r => r.date === `2026-01-${firstDay}`).payments, 1800000)
   assert.equal(scheduled.calculation.dailyCash.find(r => r.date === `2026-01-${secondDay}`).payments, 1800000 + (secondDay === '31' ? 2400000 + 500000 : 0))
   assert.equal(scheduled.calculation.dailyCash.find(r => r.date === '2026-02-28').payments, 1800000, 'second payroll date clamps to February end')
   await noOverflow(p, `FIN-007 semimonthly Plan ${width}`)
   await positions.getByLabel('Second payroll pay day', { exact: true }).scrollIntoViewIfNeeded()
   await p.screenshot({ path: join(evidence, `semimonthly-plan-${width}.png`) })
   const expenses = p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Expenses', exact: true }) })
   const editExpense = () => expenses.getByRole('row').filter({ has: p.getByRole('cell', { name: 'Annual software', exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click()
   await editExpense()
   await expenses.getByLabel('Vendor payment timing', { exact: true }).selectOption('date')
   const paymentDate = width === 1440 ? '2026-01-08' : '2026-01-09'
   await expenses.getByLabel('Planned payment date', { exact: true }).fill(paymentDate)
   await Promise.all([p.waitForResponse(r => r.url().includes('/command/expense') && r.ok()), expenses.getByRole('button', { name: 'Save expense', exact: true }).click()])
   await p.reload()
   await p.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).click()
   await editExpense()
   assert.equal(await expenses.getByLabel('Vendor payment timing', { exact: true }).inputValue(), 'date')
   assert.equal(await expenses.getByLabel('Planned payment date', { exact: true }).inputValue(), paymentDate)
   const dated = await api(owner.context, server.origin, `scenario/${scenario}`)
   assert.equal(dated.calculation.dailyCash.find(r => r.date === paymentDate).payments, 2400000)
   assert.deepEqual(dated.calculation.cash, scheduled.calculation.cash, 'an explicit date within the period preserves every monthly cash value')
   assert.match(dated.calculation.cells.find(r => r.line === spend.id && r.month === '2026-01').sources[0].trace, new RegExp(`planned payment on ${paymentDate}`))
   await noOverflow(p, `FIN-007 dated spend Plan ${width}`)
   await expenses.getByLabel('Planned payment date', { exact: true }).scrollIntoViewIfNeeded()
   await p.screenshot({ path: join(evidence, `planned-spend-plan-${width}.png`) })
   await overview(p)
   const c = card(p), table = c.getByRole('table', { name: 'Weekly planned cash', exact: true })
   await table.waitFor()
   assert.equal(await table.getByRole('row').count(), 14)
   const first = table.getByRole('row').nth(1)
   assert.match(await first.innerText(), /400,000.00/)
   await c.getByLabel('Week starting', { exact: true }).selectOption('2026-01-22')
   await c.getByLabel('Cash adjustment', { exact: true }).fill(width === 1440 ? '-125.01' : '-250.02')
   const note = `Customer timing reviewed at ${width}`
   await c.getByLabel('Adjustment note', { exact: true }).fill(note)
   await Promise.all([p.waitForResponse(r => r.url().includes('/command/weekly-cash-override') && r.ok()), c.getByRole('button', { name: 'Save weekly adjustment', exact: true }).click()])
   await p.reload(); await overview(p); await card(p).getByText(note, { exact: true }).waitFor()
   const result = await api(owner.context, server.origin, `weekly-cash/${scenario}?start=2026-01-01`)
   const plannedWeek = result.weeks.find(w => w.start <= paymentDate && w.end >= paymentDate)
   assert.equal(plannedWeek.payments, 2400000 + (width === 390 ? 1800000 : 0), 'explicit spend date reaches its planned week together with that week’s payroll')
   assert.equal(result.weeks.find(w => w.start === '2026-01-29').payments, 1800000 + 500000, 'month end does not charge dated spend a second time')
   assert.equal(result.weeks[3].adjustment, width === 1440 ? -12501 : -25002)
   assert.equal(result.weeks[3].note, note)
   for (const r of result.reconciliation) assert.equal(r.difference, result.weeks[3].adjustment)
   assert.doesNotMatch(await card(p).innerText(), /Private payroll sentinel/)
   const [download] = await Promise.all([p.waitForEvent('download'), card(p).getByRole('link', { name: 'Download weekly cash Excel', exact: true }).click()])
   const book = await readWorkbook(await readFile(await download.path())); proveFormulas(book)
   assert.equal(book.getWorksheet('Reconciliation').getCell('F3').result, result.weeks[3].adjustment)
   await noOverflow(p, `FIN-007 finance ${width}`)
   await card(p).screenshot({ path: join(evidence, `weekly-finance-${width}.png`) })
   // The phone's table scrolls within the card; inspect the closing and note columns too.
   if (width === 390) {
    await card(p).getByRole('region', { name: 'Weekly planned cash', exact: true }).evaluate(el => { el.scrollLeft = el.scrollWidth })
    await card(p).screenshot({ path: join(evidence, 'weekly-finance-390-notes.png') })
   }
  } finally { await owner.context.close() }
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await overview(board.page); await card(board.page).getByRole('table', { name: 'Weekly planned cash', exact: true }).waitFor()
   assert.equal(await card(board.page).getByRole('button', { name: 'Save weekly adjustment', exact: true }).count(), 0)
   const readable = await api(board.context, server.origin, `weekly-cash/${scenario}?start=2026-01-01`)
   assert.equal(readable.weeks[3].adjustment, width === 1440 ? -12501 : -25002)
   assert.doesNotMatch(JSON.stringify(readable), /Private payroll sentinel/)
   await noOverflow(board.page, `FIN-007 board ${width}`)
   await card(board.page).screenshot({ path: join(evidence, `weekly-board-${width}.png`) })
  } finally { await board.context.close() }
  console.log(`FIN-007 ${width}: native semimonthly pay schedule and adjustment persisted; weekly cash, month-end differences and read-only board view passed`)
 }
} finally { await browser?.close(); await server?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
