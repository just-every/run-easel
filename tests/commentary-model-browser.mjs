import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { commentaryModelRuntime } from './commentary-model-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/commentary-model')
await mkdir(evidence, { recursive: true })
const runtime = await commentaryModelRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext()
 const post = async (path, body) => { const response = await context.request.post(`${runtime.origin}${path}`, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 }); assert.equal(response.status(), 200, await response.text()); return response.json() }
 const command = (op, body) => post(`/api/easel/command/${op}`, body)
 const get = async path => { const response = await context.request.get(`${runtime.origin}/api/easel/${path}`); assert.equal(response.status(), 200, await response.text()); return response.json() }
 const claimed = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 }); assert.equal(claimed.status(), 303)
 await command('workspace', { name: 'Commentary model review', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await command('department', { name: 'Engineering' }), line = await command('line', { name: 'Cloud', type: 'operating-expense' }), pay = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await get('state')).scenarios[0]
 await command('expense', { scenario: budget.id, name: 'Hosting', line: line.id, department: dept.id, amount: '1000', kind: 'recurring', start: '2026-01' })
 const { forecast } = await command('approve-budget', { scenario: budget.id, revision: (await get(`scenario/${budget.id}`)).scenario.revision })
 await command('account-map', { account: '500', target: line.id }); await command('account-map', { account: '600', target: pay.id }); await command('department-map', { source: 'Engineering', department: dept.id })
 const actuals = { filename: 'compute-model.csv', csv: 'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,1300,Additional compute\n2026-02-28,500,Engineering,1400,February compute\n2026-01-31,600,Engineering,7600,synthetic-private-payroll\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const imported = await post('/api/easel/import/actuals/preview', actuals)
 await post('/api/easel/import/actuals/commit', { ...actuals, fingerprint: imported.fingerprint })
 for (const month of ['2026-01', '2026-02']) await command('close-month', { scenario: forecast.id, month })
 page = await context.newPage(); track(page); page.on('dialog', dialog => dialog.accept())
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = () => page.getByRole('region', { name: 'Model variance commentary', exact: true })
 const action = async (suffix, click) => { const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await click(); const response = await pending; assert.equal(response.status(), 200, await response.text()); await settle(page); return response.json() }
 const screenshot = async name => { await settle(page); await noOverflow(page, name); await panel().screenshot({ path: join(evidence, `${name}.png`) }) }
 for (const [width, month] of [[1440, '2026-01'], [390, '2026-02']]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${runtime.origin}/app?tab=review&reviewMonth=${month}`)
  await panel().getByRole('heading', { name: 'Model variance commentary', exact: true }).waitFor()
  await panel().getByText('Configure model and budget', { exact: true }).click()
  await panel().getByLabel('Owner-chosen OpenAI model', { exact: true }).fill('synthetic-easel-model')
  await panel().getByLabel('Input USD per million tokens', { exact: true }).fill('1')
  await panel().getByLabel('Output USD per million tokens', { exact: true }).fill('2')
  await panel().getByLabel('Monthly commentary budget (USD)', { exact: true }).fill('1')
  await panel().getByLabel('Enable variance commentary', { exact: true }).check()
  await panel().getByLabel('I consent to reviewed non-pay variance requests being sent to OpenAI', { exact: true }).check()
  await action('/commentary/settings/configure', () => panel().getByRole('button', { name: 'Save commentary settings', exact: true }).click())
  await panel().getByText('Owner-provided OpenAI key', { exact: true }).click()
  await panel().getByLabel('OpenAI API key', { exact: true }).fill(runtime.provider.key)
  await panel().getByLabel('I consent to sealed storage of this owner-provided key', { exact: true }).check()
  await action('/commentary/connection/connect', () => panel().getByRole('button', { name: 'Store OpenAI key', exact: true }).click())
  await action('/commentary/settings/resume', () => panel().getByRole('button', { name: 'Resume variance commentary', exact: true }).click())
  await panel().getByLabel('Variance for model draft', { exact: true }).selectOption(`${line.id}|${dept.id}`)
  const preview = await action('/commentary/preview', () => panel().getByRole('button', { name: 'Preview model request', exact: true }).click())
  assert.equal(runtime.provider.calls.length, width === 1440 ? 0 : 1, 'Preview does not send')
  assert.equal(JSON.parse(preview.request.input).acceptedRows.length, 1)
  await panel().getByText(`Request fingerprint: ${preview.fingerprint}`, { exact: true }).waitFor()
  await screenshot(`model-request-${width}`)
  await panel().getByLabel('I consent to sending this exact request to OpenAI and reserving this allowance', { exact: true }).check()
  const generated = await action('/commentary/generate', () => panel().getByRole('button', { name: 'Generate model draft', exact: true }).click())
  assert.equal(generated.status, 'draft')
  await panel().getByText('Agent work · synthetic-easel-model · explanation draft', { exact: true }).waitFor()
  await panel().getByText('Evidence:', { exact: true }).waitFor(); await panel().getByText('Hypothesis:', { exact: true }).waitFor()
  await screenshot(`model-draft-${width}`)
  const pack = await command('pack-create', { month }), published = await command('pack-publish', { pack: pack.id })
  const frozen = await get(`snapshot/${published.snapshot}`)
  assert.equal(frozen.body.variances.find(r => r.line === 'Cloud' && r.department === 'Engineering').explanation, null)
  const variance = page.locator('details.card-row').filter({ has: page.getByText('Cloud', { exact: true }) })
  if ((await variance.getAttribute('open')) === null) await variance.locator('summary').click()
  await action('/command/explanation-confirm', () => variance.getByRole('button', { name: 'Confirm explanation', exact: true }).click())
  await panel().getByText('Agent work · synthetic-easel-model · explanation confirmed', { exact: true }).waitFor()
  await screenshot(`model-confirmed-${width}`)
  assert.deepEqual(await get(`snapshot/${published.snapshot}`), frozen)
  await action('/commentary/settings/stop', () => panel().getByRole('button', { name: 'Stop variance commentary', exact: true }).click())
  await panel().getByRole('button', { name: 'Resume variance commentary', exact: true }).waitFor()
  assert.equal(await panel().getByRole('button', { name: 'Preview model request', exact: true }).count(), 0)
  await screenshot(`model-stopped-${width}`)
  console.log(`Model commentary ${width}: native configuration/custody, explicit request consent, cited unconfirmed draft, human confirmation, immutable pack and local stop passed`)
 }
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'model-failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
