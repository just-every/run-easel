// The same policy journey against the emitted Worker and native person pages.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow } from './browser-journey.mjs'
import { policyFixture, policyLifecycle } from './agent-policy-flow.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-policy')
await mkdir(evidence, { recursive: true })
const f = await policyFixture(builtBrowserRuntime)
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const split = f.owner.indexOf('=')
 await context.addCookies([{ name: f.owner.slice(0, split), value: f.owner.slice(split + 1), url: f.origin }])
 page = await context.newPage()
 const show = async (id, name, state) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${f.origin}/agents/approvals/${id}`)
  await page.locator(`[data-approval-state="${state}"]`).waitFor()
  await page.getByText('Synthetic planning agent for Fran Finance', { exact: true }).waitFor()
  await page.getByText('Details', { exact: true }).click()
  await noOverflow(page, `Agent policy ${name}`)
  // Only the existing page is inspected; it has text-labelled action controls.
  assert.equal(await page.getByRole('button').evaluateAll(buttons => buttons.filter(button => !button.textContent.trim()).length), 0)
  const small = await page.locator('main').evaluate(root => [...root.querySelectorAll('p, dt, dd, button, summary, a')].filter(node => node.getClientRects().length && Number.parseFloat(getComputedStyle(node).fontSize) < 13).length)
  assert.equal(small, 0)
  await page.screenshot({ path: join(evidence, `${name}-1440.png`), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: join(evidence, `${name}-390.png`), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
 }
 await policyLifecycle(f, {
  pending: async ({ handle, approval }) => {
   await show(handle.id, 'pending', 'pending')
   await page.getByText('Waiting for your decision', { exact: true }).waitFor()
   const summary = await page.locator('[data-approval-summary]').innerText()
   assert.ok(summary.includes('Private held preparation'))
   assert.equal(await page.locator('time[datetime]').first().getAttribute('datetime'), approval.expires_at)
  },
  approve: async ({ handle }) => {
   const response = page.waitForResponse(r => r.url().endsWith(`/agents/api/approvals/${handle.id}/approve`))
   await page.getByRole('button', { name: 'Approve', exact: true }).click()
   assert.equal((await response).status(), 200)
   await page.locator('[data-approval-state="executed"]').waitFor()
  },
  approved: async ({ handle }) => { await show(handle.id, 'completed', 'executed') },
  expired: async ({ approval }) => { await show(approval.id, 'policy-expired', 'refused'); assert.equal(await page.locator('[data-approval-code]').getAttribute('data-approval-code'), 'policy_unavailable') },
 })
 console.log('Agent policy browser: built Worker, native approval, audit, elapsed expiry and private retry fences passed; screens captured at 1440 and 390')
} catch (error) {
 await page?.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {})
 throw error
} finally { await browser?.close(); await f.close() }
