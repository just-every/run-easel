// CYCLE-001: finance sets a dated task and turns reminders on; the assignee
// sees and completes it; a viewer has no calendar. CYCLE-003: the mentioned
// contributor opens their notification and picks the digest. Both at desktop
// and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-calendar')
await mkdir(evidence, { recursive: true })
let server, browser
const cycle = page => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Budget cycle', exact: true }).click()
const calendar = page => page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Planning calendar', exact: true }) })
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const setup = await session(browser, root, server.origin, 'owner', 1440)
 const call = (p, b) => api(setup.context, server.origin, p, b)
 await call('command/workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await call('command/department', { name: 'Engineering' })
 await call('command/member', { email: 'sales@dev.localhost', name: 'Delivery planner', role: 'contributor', departments: [department.id] })
 await call('command/member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await (await session(browser, root, server.origin, 'sales', 1440)).context.close()
 const budget = (await call('state')).scenarios[0]
 await call('command/request-submissions', { scenario: budget.id, departments: [department.id], due: '2026-10-30' })
 await setup.context.close()
 for (const width of [1440, 390]) {
  const finance = await session(browser, root, server.origin, 'owner', width)
  try {
   const page = finance.page
   await api(finance.context, server.origin, 'command/comment', { scenario: budget.id, department: department.id, text: `Width ${width}: @sales@dev.localhost please check hosting` })
   await cycle(page)
   const card = calendar(page)
   await card.getByText(/company zone, America\/New_York/).waitFor()
   await card.getByLabel('Task', { exact: true }).selectOption('review-headcount')
   await card.getByLabel('Task name', { exact: true }).fill(`Review headcount ${width}`)
   await card.getByLabel('Department', { exact: true }).selectOption(department.id)
   await card.getByLabel('Owner', { exact: true }).selectOption('sales@dev.localhost')
   await card.getByLabel('Due date', { exact: true }).fill('2026-10-30')
   await card.getByRole('button', { name: 'Add task', exact: true }).click()
   const row = card.getByRole('row').filter({ hasText: `Review headcount ${width}` })
   await row.waitFor()
   assert.match(await row.innerText(), /EDT[\s\S]*Escalates[\s\S]*EST/)
   await card.getByLabel('Send reminders, escalations and digests', { exact: true }).check()
   await card.getByRole('button', { name: 'Save reminders', exact: true }).click()
   await card.getByText(/Reminders are on, sent as scheduler:calendar/).waitFor()
   await noOverflow(page, `CYCLE-001 finance calendar ${width}`)
   await card.screenshot({ path: join(evidence, `calendar-finance-${width}.png`) })
  } finally { await finance.context.close() }
  const owner = await session(browser, root, server.origin, 'sales', width)
  try {
   const page = owner.page
   await cycle(page)
   const card = calendar(page)
   const row = card.getByRole('row').filter({ hasText: `Review headcount ${width}` })
   await row.getByRole('button', { name: 'Mark complete', exact: true }).click()
   await row.getByText('Completed', { exact: true }).waitFor()
   assert.equal(await card.getByRole('heading', { name: 'New planning task', exact: true }).count(), 0)
   await noOverflow(page, `CYCLE-001 assignee calendar ${width}`)
   await card.screenshot({ path: join(evidence, `calendar-assignee-${width}.png`) })
   const notes = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Notifications', exact: true }) })
   const link = notes.getByRole('link', { name: /Comment on .* Engineering/ }).first()
   await link.waitFor()
   assert.match(await link.getAttribute('href'), /^\/app\?tab=cycle&record=/)
   await notes.getByLabel('Notify me', { exact: true }).selectOption('digest')
   await notes.getByRole('button', { name: 'Save notification preference', exact: true }).click()
   await page.waitForResponse(r => r.url().endsWith('/api/easel/notifications') && r.ok())
   assert.equal((await api(owner.context, server.origin, 'notifications')).preference.mode, 'digest')
   await noOverflow(page, `CYCLE-003 notifications ${width}`)
   await notes.screenshot({ path: join(evidence, `notifications-${width}.png`) })
   await api(owner.context, server.origin, 'notifications/preference', { mode: 'email' })
  } finally { await owner.context.close() }
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await cycle(board.page)
   assert.equal(await board.page.getByRole('heading', { name: 'Planning calendar', exact: true }).count(), 0)
  } finally { await board.context.close() }
  console.log(`CYCLE-001 ${width}: finance task and reminder settings, assignee completion and viewer exclusion without overflow; CYCLE-003 mention link and preference saved`)
 }
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
