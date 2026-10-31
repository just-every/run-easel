// The paired journey drives the native Plan controls against the emitted app.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { expenseParityJourney } from './agent-action-parity-flow.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-action-parity')
await mkdir(evidence, { recursive: true })
const runtime = await builtBrowserRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const boot = await context.request.post(runtime.origin + '/auth/bootstrap', { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const cookie = (await context.cookies()).map(row => `${row.name}=${row.value}`).join('; ')
 page = await context.newPage()
 const approvalPage = await context.newPage()
 let finished = false, capturedApproval = false
 const settle = () => page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.disabled && button.textContent === 'Working…'))
 const plan = async draft => {
  if (!finished) {
   await page.goto(runtime.origin + '/setup')
   await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
   await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
   finished = true
  }
  if (!page.url().includes('tab=plan')) await page.goto(runtime.origin + '/app?tab=plan')
  await page.getByRole('heading', { name: 'Expenses', exact: true }).waitFor()
  await settle()
  const picker = page.getByLabel('Scenario', { exact: true })
  if (await picker.inputValue() !== draft.id) {
   const loaded = page.waitForResponse(row => new URL(row.url()).pathname === `/api/easel/scenario/${draft.id}`)
   await picker.selectOption(draft.id)
   assert.equal((await loaded).status(), 200)
  }
  await page.getByRole('table', { name: 'Expenses', exact: true }).waitFor()
 }
 const screen = async name => {
  // Assertions use the desktop viewport. The phone rendering is recorded once.
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 })
   await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
 }
 await expenseParityJourney({ origin: runtime.origin, cookie, proof: line => console.log(`PROBE ${line}`),
  mutateNative: async ({ op, body, stage, fixture, draft }) => {
   await plan(draft)
   const section = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Expenses', exact: true }) })
   const row = section.getByRole('row').filter({ hasText: `Synthetic ${fixture.kind} expense` })
   if (stage !== 'create') await row.getByRole('button', { name: stage === 'remove' ? 'Remove' : 'Edit', exact: true }).click({ trial: true })
   if (stage === 'edit') await row.getByRole('button', { name: 'Edit', exact: true }).click()
   if (op === 'expense') {
    const form = section.locator('form')
    await form.getByLabel('Kind', { exact: true }).selectOption(body.kind)
    for (const name of ['name','line','department','amount','start','end','amortizationMonths','paymentMonth','payMonth','paymentMethod','dpoDays','paymentTermDays','paymentDate']) {
     if (body[name] === undefined) continue
     const field = form.locator(`[name="${name}"]`)
     if (await field.evaluate(node => node.tagName === 'SELECT')) await field.selectOption(body[name])
     else await field.fill(body[name])
    }
    const response = page.waitForResponse(row => row.url().endsWith('/api/easel/command/expense') && row.request().method() === 'POST')
    await form.getByRole('button', { name: stage === 'create' ? 'Add expense' : 'Save expense', exact: true }).click()
    const saved = await response
    assert.equal(saved.status(), 200, await saved.text())
    await section.getByRole('button', { name: 'Add expense', exact: true }).waitFor()
    await settle()
    return saved.json()
   }
   const response = page.waitForResponse(row => row.url().endsWith('/api/easel/command/input-delete') && row.request().method() === 'POST')
   await row.getByRole('button', { name: 'Remove', exact: true }).click()
   const removed = await response
   assert.equal(removed.status(), 200, await removed.text())
   await row.waitFor({ state: 'detached' }); await settle()
   return removed.json()
  },
  approve: async ({ handle, request }) => {
   await approvalPage.goto(handle.url)
   await approvalPage.getByText('MCP client for Fran Finance', { exact: true }).waitFor()
   const { approval } = await request(`/agents/api/approvals/${handle.id}`)
   assert.equal(approval.state, 'pending')
   if (!capturedApproval) {
    for (const width of [1440,390]) {
     await approvalPage.setViewportSize({ width, height: 1000 })
     await approvalPage.screenshot({ path: join(evidence, `approval-${width}.png`), fullPage: true })
    }
    await approvalPage.setViewportSize({ width: 1440, height: 1000 })
    capturedApproval = true
   }
   const response = approvalPage.waitForResponse(row => row.url().endsWith(`/agents/api/approvals/${handle.id}/approve`))
   await approvalPage.getByRole('button', { name: 'Approve', exact: true }).click()
   assert.equal((await response).status(), 200)
  },
  inspect: async ({ stage, fixture, policy, path, personDraft, agentDraft }) => {
   for (const [name, draft] of [['native', personDraft], ['agent', agentDraft]]) {
    await plan(draft)
    const row = page.getByRole('table', { name: 'Expenses', exact: true }).getByRole('row').filter({ hasText: `Synthetic ${fixture.kind} expense` })
    if (stage === 'remove') assert.equal(await row.count(), 0)
    else {
     await row.waitFor()
     const text = await row.innerText()
     for (const expected of ['Vendor costs', 'Operations', fixture.kind, `$${fixture[stage].amount}`]) assert.ok(text.includes(expected), `${name} Plan row: ${text}`)
    }
    if (stage === 'edit' && fixture.kind === 'one-off' && policy === 'held' && path === '/api/easel/mcp') await screen(`${name}-plan`)
   }
  },
 })
 await page.goto(runtime.origin + '/app?tab=activity')
 await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor()
 for (const what of ['Added a expense', 'Changed a expense', 'Removed a expense']) {
  const rows = page.locator('.activity-log tbody tr').filter({ has: page.locator('[data-label="What"]').getByText(what, { exact: true }) })
  const actors = await rows.locator('[data-label="Who"]').allTextContents()
  assert.ok(actors.some(text => text === 'Fran Finance'))
  assert.ok(actors.some(text => text.startsWith('MCP client for Fran Finance') && text.includes('Approved by Fran Finance')))
 }
 await screen('activity')
 await context.close()
 console.log('Built native Plan and MCP expense parity passed for both paths and policies, all four form kinds, every create, edit and removal; Plan, Activity and named-person approval screens at 1440 and 390')
} catch (error) { await page?.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
