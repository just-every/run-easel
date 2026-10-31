// The same independent client against the built application, with person steps.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { droppedResponseProxy, standaloneClientJourney } from './mcp-client-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-mcp-client')
await mkdir(evidence, { recursive: true })
const runtime = await builtBrowserRuntime()
let browser, edge
try {
 edge = await droppedResponseProxy(runtime.origin)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 const page = await context.newPage()
 const boot = await context.request.post(runtime.origin + '/auth/bootstrap', { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Synthetic Owner' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const cookie = (await context.cookies()).map(row => `${row.name}=${row.value}`).join('; ')
 let captured = false
 let setupFinished = false, frozen
 await standaloneClientJourney({ origin: runtime.origin, cookie, edge, proof: line => console.log(`PROBE ${line}`),
  inspect: async ({ proposal, activity, policy, path }) => {
   const captures = (await runtime.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
   assert.ok(captures.length > 0)
   if (frozen) assert.deepEqual(captures, frozen, 'Dropped responses and retries preserve stored snapshot bytes and hashes')
   frozen = captures
   if (!setupFinished) {
    await page.goto(runtime.origin + '/setup')
    await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    setupFinished = true
   }
   await page.setViewportSize({ width: 1440, height: 1000 })
   await page.goto(runtime.origin + '/app?tab=scenarios')
   const proposals = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Proposals', exact: true }) })
   const row = proposals.getByRole('row').filter({ has: page.getByRole('cell', { name: proposal.name, exact: true }) })
   await row.waitFor()
   assert.equal(await row.count(), 1, 'Only one recovered proposal appears in the native screen')
   assert.ok((await row.textContent()).includes('draft'))
   assert.ok((await row.textContent()).includes('Synthetic Owner'))
   if (path === '/mcp') for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await proposals.screenshot({ path: join(evidence, `recovered-proposals-${policy}-${width}.png`) })
   }
   await page.setViewportSize({ width: 1440, height: 1000 })
   await page.goto(runtime.origin + '/app?tab=activity')
   await page.locator('.activity-log').waitFor()
   await page.getByLabel('Record', { exact: true }).selectOption(proposal.id)
   const filtered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/easel/activity' && new URL(response.url()).searchParams.get('record') === proposal.id)
   await page.getByRole('button', { name: 'Filter activity', exact: true }).click()
   await filtered
   const creation = page.locator('.activity-log tbody tr').filter({ has: page.getByText('Created a proposal', { exact: true }) })
   await creation.waitFor()
   assert.equal(await creation.count(), 1, 'Native Activity shows one creation after recovery')
   assert.ok((await creation.textContent()).includes(proposal.name))
   assert.ok((await creation.locator('[data-label="Who"]').textContent()).includes(activity.detail.authority.label))
   if (policy === 'held') assert.ok((await creation.textContent()).includes('Approved by Synthetic Owner'))
   if (path === '/mcp') for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Activity', exact: true }) }).screenshot({ path: join(evidence, `recovered-activity-${policy}-${width}.png`) })
   }
   await page.setViewportSize({ width: 1440, height: 1000 })
  },
  approve: async ({ approval, native }) => {
   await page.goto(approval.url)
   await page.getByRole('button', { name: 'Approve', exact: true }).waitFor()
   if (!captured) {
    for (const width of [1440, 390]) {
     await page.setViewportSize({ width, height: 1000 })
     if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Approval fits the assertion viewport')
     await page.screenshot({ path: join(evidence, `approval-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    captured = true
   }
   const response = page.waitForResponse(row => row.url().endsWith(`/agents/api/approvals/${approval.id}/approve`))
   await page.getByRole('button', { name: 'Approve', exact: true }).click()
   assert.equal((await response).status(), 200)
   assert.equal((await native(`/agents/api/approvals/${approval.id}`)).approval.state, 'executed')
  },
 })
 await page.goto(runtime.origin + '/agents')
 await page.getByRole('heading', { name: 'Agents', exact: true }).waitFor()
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.screenshot({ path: join(evidence, `agents-${width}.png`), fullPage: true })
 }
 console.log('Standalone built MCP client journey passed: both paths, both versions, autonomous and held policies, native approvals, unchanged transport refusals, caller-key replay and dropped-response recovery; proposal and Activity screens at 1440 and 390')
 await context.close()
} finally { await browser?.close(); await edge?.close(); await runtime.close() }
