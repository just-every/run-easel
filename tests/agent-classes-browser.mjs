// The same payroll-class journey against the built application and native person pages.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { agentClassesJourney } from './agent-classes-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-classes')
await mkdir(evidence, { recursive: true })
const runtime = await builtBrowserRuntime()
let browser
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 const page = await context.newPage()
 const boot = await context.request.post(runtime.origin + '/auth/bootstrap', { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Synthetic Owner' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const cookie = (await context.cookies()).map(row => `${row.name}=${row.value}`).join('; ')
 let captured = false
 await agentClassesJourney({ origin: runtime.origin, cookie,
  captures: async () => (await runtime.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results,
  approve: async ({ approval, native, expected, tool }) => {
   await page.goto(approval.url)
   await page.getByRole('button', { name: 'Approve', exact: true }).waitFor()
   await page.getByText('Details', { exact: true }).click()
   const count = expected.find(row => row.class === 'sensitive').facts.measure
   assert.ok((await page.locator('body').innerText()).includes(`sensitive information (${count} ${count === 1 ? 'record' : 'records'}, kind payroll)`), 'Approval shows the computed record count and kind')
   assert.ok((await page.locator('body').innerText()).includes('MCP client for Synthetic Owner'))
   if (!captured) {
    for (const width of [1440, 390]) {
     await page.setViewportSize({ width, height: 1000 })
     if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Approval fits the assertion viewport')
     await page.screenshot({ path: join(evidence, `approval-${width}.png`), fullPage: true })
    }
    captured = true
   }
   await page.setViewportSize({ width: 1440, height: 1000 })
   const completion = page.waitForResponse(row => row.url().endsWith(`/agents/api/approvals/${approval.id}/approve`) && row.request().method() === 'POST')
   await page.getByRole('button', { name: 'Approve', exact: true }).click()
   assert.equal((await completion).status(), 200)
   const saved = (await native(`/agents/api/approvals/${approval.id}`)).approval
   assert.equal(saved.state, 'executed', tool)
   assert.equal(saved.approvals[0].name, 'Synthetic Owner')
  },
  inspect: async ({ native }) => {
   const activity = await native('/api/easel/activity')
   assert.ok(activity.some(row => row.action === 'expense-removed' && row.detail.authority?.type === 'agent'))
   assert.ok(activity.some(row => row.action === 'revenue-added' && row.detail.authority?.approvers?.some(person => person.name === 'Synthetic Owner')))
   await page.goto(runtime.origin + '/setup')
   await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
   await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
   await page.goto(runtime.origin + '/app?tab=activity')
   await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor()
   await page.getByText('MCP client for Synthetic Owner', { exact: true }).first().waitFor()
   assert.ok((await page.locator('.activity-log').innerText()).includes('Approved by Synthetic Owner'))
   for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Activity fits the assertion viewport')
    await page.screenshot({ path: join(evidence, `activity-${width}.png`), fullPage: true })
   }
  }, proof: line => console.log(`PROBE ${line}`),
 })
 console.log('Native payroll class browser journey passed; approval facts and Activity captured at 1440 and 390')
 await context.close()
} finally { await browser?.close(); await runtime.close() }
