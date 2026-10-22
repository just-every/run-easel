import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { modelerBrowserRuntime } from './modeler-browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/modeler')
await mkdir(evidence, { recursive: true })
const runtime = await modelerBrowserRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext()
 const post = async (path, body) => { const response = await context.request.post(`${runtime.origin}${path}`, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 }); assert.equal(response.status(), 200, await response.text()); return response.json() }
 const command = (op, body) => post(`/api/easel/command/${op}`, body)
 const get = async path => { const response = await context.request.get(`${runtime.origin}/api/easel/${path}`); assert.equal(response.status(), 200, await response.text()); return response.json() }
 const claimed = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 }); assert.equal(claimed.status(), 303)
 await command('workspace', { name: 'Southeast modeler', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Southeast sales' }), payroll = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 await command('line', { name: 'Southeast revenue', type: 'revenue' }); await command('line', { name: 'Support costs', type: 'operating-expense' })
 const budget = (await get('state')).scenarios[0]
 await command('position', { scenario: budget.id, title: 'Existing analyst', holder: 'synthetic-easel-private-holder', department: department.id, line: payroll.id, annualSalary: '60000', onCostPercent: '0', start: '2026-01' })
 const { forecast } = await command('approve-budget', { scenario: budget.id, revision: (await get(`scenario/${budget.id}`)).scenario.revision })
 const sourceBefore = await get(`scenario/${forecast.id}`)
 await post('/api/easel/commentary/settings/configure', { model: 'synthetic-easel-model', inputUsdPerMillion: '1', outputUsdPerMillion: '2', monthlyUsd: '1', enabled: false, consent: true })
 await post('/api/easel/commentary/connection/connect', { key: runtime.provider.key, consent: true })
 page = await context.newPage(); track(page); page.on('dialog', dialog => dialog.accept())
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = () => page.getByRole('region', { name: 'Modeler proposals', exact: true })
 const action = async (suffix, click) => { const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await click(); const response = await pending; assert.equal(response.status(), 200, await response.text()); await settle(page); return response.json() }
 const screenshot = async (name, locator = panel()) => { await settle(page); await noOverflow(page, name); await locator.screenshot({ path: join(evidence, `${name}.png`) }) }
 for (const [index, width] of [1440, 390].entries()) {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`${runtime.origin}/app?tab=scenarios`)
  await panel().getByRole('heading', { name: 'Modeler proposals', exact: true }).waitFor()
  await panel().getByText('Configure modeler', { exact: true }).click()
  await panel().getByLabel('Monthly modeler budget (USD)', { exact: true }).fill('5')
  await panel().getByLabel('Enable modeler', { exact: true }).check()
  await panel().getByLabel('I consent to reusing the owner-chosen OpenAI model and sealed key for reviewed planning requests, including pay assumptions', { exact: true }).check()
  await action('/modeler/settings/configure', () => panel().getByRole('button', { name: 'Save modeler settings', exact: true }).click())
  await action('/modeler/settings/resume', () => panel().getByRole('button', { name: 'Resume modeler', exact: true }).click())
  await panel().getByLabel('Modeler source plan', { exact: true }).selectOption(forecast.id)
  await panel().getByLabel('Planning change for modeler', { exact: true }).fill('Add two Southeast account executives at USD 120000 annual salary each from April. Add Southeast contracts at 10 units times USD 1000, Regional capacity of 2 and Regional support at capacity times USD 125.25.')
  const preview = await action('/modeler/preview', () => panel().getByRole('button', { name: 'Preview modeler request', exact: true }).click())
  assert.equal(runtime.provider.calls.length, index)
  await panel().getByText(`Request fingerprint: ${preview.fingerprint}`, { exact: true }).waitFor()
  await screenshot(`modeler-request-${width}`)
  await panel().getByLabel('I consent to sending this exact modeler request and reserving this allowance', { exact: true }).check()
  const result = await action('/modeler/generate', () => panel().getByRole('button', { name: 'Generate draft proposal', exact: true }).click())
  assert.equal(result.status, 'draft'); assert.equal(runtime.provider.calls.length, index + 1); assert.deepEqual(runtime.provider.calls[index], preview.request)
  await panel().getByRole('heading', { name: 'Agent work · synthetic-easel-model', exact: true }).waitFor()
  await panel().getByText('Added position: Southeast account executive A', { exact: true }).click()
  await panel().getByText('Added formula: Regional support', { exact: true }).click()
  await panel().getByRole('heading', { name: 'Recalculated changed cells (27)', exact: true }).waitFor()
  assert.equal((await get(`scenario/${result.proposal}`)).scenario.proposalStatus, 'draft')
  assert.deepEqual(await get(`scenario/${forecast.id}`), sourceBefore)
  assert.equal(await page.getByRole('button', { name: /^Promote revision/ }).count(), 0)
  await screenshot(`modeler-diff-and-checks-${width}`)
  await panel().getByRole('link', { name: 'Review in native comparison', exact: true }).click()
  await page.getByRole('heading', { name: 'Changed cells (27)', exact: true }).waitFor()
  const comparison = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Compare', exact: true }) })
  await screenshot(`modeler-native-comparison-${width}`, comparison)
  await panel().getByLabel('Review modeler proposal', { exact: true }).selectOption(result.proposal)
  await panel().getByRole('heading', { name: 'Expected-value checks', exact: true }).waitFor()
  await action('/modeler/settings/stop', () => panel().getByRole('button', { name: 'Stop modeler', exact: true }).click())
  await panel().getByRole('button', { name: 'Resume modeler', exact: true }).waitFor()
  assert.equal(await panel().getByRole('button', { name: 'Preview modeler request', exact: true }).count(), 0)
  await screenshot(`modeler-stopped-${width}`)
  console.log(`Modeler ${width}: reviewed exact request, explicit consent, separate draft positions/drivers/formulas, recalculated native diff, expected values and local stop passed`)
 }
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'modeler-failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
