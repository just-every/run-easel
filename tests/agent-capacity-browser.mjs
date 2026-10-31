// The raw capacity journey against production Worker assets and native person pages.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { agentCapacityJourney, capacitySigning } from './agent-capacity-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-capacity')
await mkdir(evidence, { recursive: true })
const signing = await capacitySigning()
const runtime = await builtBrowserRuntime({ bindings: signing.bindings })
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 page = await context.newPage()
 const boot = await context.request.post(runtime.origin + '/auth/bootstrap', { headers: { origin: runtime.origin },
  data: { token: runtime.bootstrap, displayName: 'Synthetic Owner' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const cookie = (await context.cookies()).map(row => `${row.name}=${row.value}`).join('; ')
 const screens = async name => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Native page fits the assertion viewport')
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 })
   await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
 }
 let setupFinished = false
 const receipts = await agentCapacityJourney({ origin: runtime.origin, cookie, signing,
  proof: line => console.log(`PROBE ${line}`),
  pause: async ({ paused, native }) => {
   await page.goto(runtime.origin + '/agents')
   const response = page.waitForResponse(row => row.url().endsWith('/agents/api/pause') && row.request().method() === 'POST')
   await page.getByRole('button', { name: paused ? 'Pause agents' : 'Resume agents', exact: true }).click()
   assert.equal((await response).status(), 200)
   await page.getByRole('button', { name: paused ? 'Resume agents' : 'Pause agents', exact: true }).waitFor()
   assert.equal((await native('/agents/api/state')).paused.local, paused)
  },
  inspect: async ({ phase, control, policy, args }) => {
   if (!setupFinished) {
    await page.goto(runtime.origin + '/setup')
    await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await page.waitForURL(/\/app/)
    setupFinished = true
   }
   if (phase === 'paused' || phase === 'resumed') {
    await page.goto(runtime.origin + '/agents')
    await page.getByRole('heading', { name: 'Agents', exact: true }).waitFor()
    assert.equal(await page.locator('[data-agents-state]').innerText(), phase === 'paused' ? 'Agents are paused.' : 'Agents are on.')
    assert.equal(await page.getByText('Paused in Business.', { exact: true }).count(), control === 'business' && phase === 'paused' ? 1 : 0)
    if (policy === 'held') await screens(`${control}-${phase}`)
    return
   }
   await page.goto(runtime.origin + '/app?tab=scenarios')
   await page.getByRole('heading', { name: 'Proposals', exact: true }).waitFor()
   const proposal = page.getByRole('table', { name: 'Proposals', exact: true }).getByRole('cell', { name: args.name, exact: true })
   assert.equal(await proposal.count(), phase === 'refused' ? 0 : 1, 'Native proposal list shows the effect only after capacity recovery and any required approval')
   if (policy === 'held') await screens(`proposals-${phase}`)
   if (phase === 'refused') {
    await page.goto(runtime.origin + '/agents')
    await page.getByRole('heading', { name: 'Agents', exact: true }).waitFor()
    assert.equal(await page.locator('[data-approval-id]').count(), 0, 'Rate-refused work leaves no native pending action')
    if (policy === 'held') await screens('agents-refused')
   }
  },
  approve: async ({ approval, native }) => {
   await page.goto(approval.url)
   await page.getByRole('button', { name: 'Approve', exact: true }).waitFor()
   assert.equal((await native(`/agents/api/approvals/${approval.id}`)).approval.state, 'pending')
   await screens('approval-recovered')
   const response = page.waitForResponse(row => row.url().endsWith(`/agents/api/approvals/${approval.id}/approve`) && row.request().method() === 'POST')
   await page.getByRole('button', { name: 'Approve', exact: true }).click()
   assert.equal((await response).status(), 200)
   assert.equal((await native(`/agents/api/approvals/${approval.id}`)).approval.state, 'executed')
  },
 })
 await writeFile(join(evidence, 'capacity-result.json'), JSON.stringify({ receipts, assertionWidth: 1440, screenWidths: [1440, 390] }, null, 2) + '\n')
 console.log('Built agent capacity and Pause journey passed under both policies; native refusal, recovery, approval and Pause screens at 1440 and 390')
 await context.close()
} catch (error) {
 await page?.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {})
 throw error
} finally { await browser?.close(); await runtime.close() }
