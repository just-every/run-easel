// The authority journey against the production Worker and native person pages.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { authoritySigner, authorityJourney } from './agent-authority-journey.mjs'
import { settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-authority')
await mkdir(evidence, { recursive: true })
let browser
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 let approvalCaptured = false
 for (const policy of ['autonomous', 'held']) {
  const signing = await authoritySigner(), messages = []
  const runtime = await builtBrowserRuntime({ https: true, bindings: { ...signing.bindings, AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1' },
   outbound: async request => { assert.equal(new URL(request.url).hostname, 'api.resend.com'); messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) },
  })
  const ownerContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
  const personContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
  const ownerPage = await ownerContext.newPage(), personPage = await personContext.newPage()
  track(ownerPage); track(personPage)
  const capture = async (page, name) => {
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The screen fits the assertion viewport')
   await page.screenshot({ path: join(evidence, `${name}-1440.png`), fullPage: true })
   await page.setViewportSize({ width: 390, height: 1000 })
   await page.screenshot({ path: join(evidence, `${name}-390.png`), fullPage: true })
   await page.setViewportSize({ width: 1440, height: 1000 })
  }
  try {
   const boot = await ownerContext.request.post(runtime.origin + '/auth/bootstrap', { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Synthetic Owner' }, maxRedirects: 0 })
   assert.equal(boot.status(), 303)
   await ownerPage.goto(runtime.origin + '/setup')
   await ownerPage.getByRole('checkbox').check()
   await ownerPage.getByRole('button', { name: 'Finish setup', exact: true }).click()
   await ownerPage.waitForURL(/\/app/)
   const owner = (await ownerContext.cookies()).map(row => `${row.name}=${row.value}`).join('; ')
   await authorityJourney({ origin: runtime.origin, request: (url, init) => runtime.mf.dispatchFetch(url, init), owner, signing, messages, policy,
    proof: line => console.log(`PROBE ${line}`),
    approve: async ({ approval, get, personName }) => {
     const saved = (await get(`/agents/api/approvals/${approval.id}`)).approval
     assert.equal(saved.state, 'pending')
     await ownerPage.goto(approval.url)
     await ownerPage.getByText(`Agent door conformance for ${personName}`, { exact: true }).waitFor()
     await ownerPage.getByRole('button', { name: 'Approve', exact: true }).waitFor()
     if (!approvalCaptured) { await capture(ownerPage, 'owner-approval'); approvalCaptured = true }
     const decided = ownerPage.waitForResponse(response => response.url().endsWith(`/agents/api/approvals/${approval.id}/approve`) && response.request().method() === 'POST')
     await ownerPage.getByRole('button', { name: 'Approve', exact: true }).click()
     assert.equal((await decided).status(), 200)
     const completed = (await get(`/agents/api/approvals/${approval.id}`)).approval
     assert.equal(completed.state, 'executed')
     assert.ok(completed.approvals.some(row => row.name === 'Synthetic Owner'))
    },
    inspect: async ({ stage, person, personName, proposal }) => {
     const split = person.indexOf('=')
     await personContext.addCookies([{ name: person.slice(0, split), value: person.slice(split + 1), url: runtime.origin }])
     await ownerPage.goto(runtime.origin + '/app?tab=settings')
     await ownerPage.getByRole('heading', { name: 'People', exact: true }).waitFor()
     await settle(ownerPage)
     const row = ownerPage.getByRole('table', { name: 'People', exact: true }).getByRole('row').filter({ hasText: personName })
     assert.ok((await row.textContent()).includes(stage === 'viewer' ? 'viewer' : 'Sales'))
     assert.ok(!(await row.textContent()).includes('Engineering'))
     await personPage.goto(runtime.origin + '/app?tab=scenarios')
     await personPage.getByRole('heading', { name: 'Proposals', exact: true }).waitFor()
     await settle(personPage)
     const proposals = personPage.getByRole('table', { name: 'Proposals', exact: true })
     assert.equal(await proposals.getByRole('row').filter({ hasText: proposal.name }).count(), stage === 'viewer' ? 0 : 1)
     if (stage === 'departments' && policy === 'autonomous') {
      await capture(ownerPage, 'narrowed-authority')
      await capture(personPage, 'private-proposal')
     }
    },
   })
  } catch (error) {
   await ownerPage.screenshot({ path: join(evidence, `failed-${policy}.png`), fullPage: true }).catch(() => {})
   throw error
  } finally { await personContext.close(); await ownerContext.close(); await runtime.close() }
 }
 console.log('Native agent authority browser journey passed under autonomous and held policies; authority, private proposal and named-owner approval screens captured at 1440 and 390')
} finally { await browser?.close() }
