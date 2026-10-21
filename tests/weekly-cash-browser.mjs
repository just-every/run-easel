// FIN-007: real native sessions and Overview at desktop and phone widths.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir, rm, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
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
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
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
  console.log(`FIN-007 ${width}: native adjustment persisted; weekly cash, month-end differences and read-only board view passed`)
 }
} finally { await browser?.close(); await server?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
