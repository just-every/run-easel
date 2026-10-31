// The same independent client against the built application, with person steps.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { standaloneClientJourney } from './mcp-client-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-mcp-client')
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
  await standaloneClientJourney({ origin: runtime.origin, cookie, proof: line => console.log(`PROBE ${line}`),
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
  console.log('Standalone built MCP client journey passed: both paths, both versions, autonomous and held policies, native approvals, unchanged transport refusals and caller-key replay; screens at 1440 and 390')
 await context.close()
} finally { await browser?.close(); await runtime.close() }
