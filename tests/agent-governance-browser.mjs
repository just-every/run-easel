import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { commentaryModelRuntime } from './commentary-model-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/agent-governance')
await mkdir(evidence, { recursive: true })
const runtime = await commentaryModelRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext()
 const post = async (path, body) => { const r = await context.request.post(`${runtime.origin}/api/easel/${path}`, { headers: { origin: runtime.origin }, data: body }); assert.equal(r.status(), 200, await r.text()); return r.json() }
 const get = async path => (await context.request.get(`${runtime.origin}/api/easel/${path}`)).json()
 const command = (op, body) => post(`command/${op}`, body)
 const claimed = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 }); assert.equal(claimed.status(), 303)
 await command('workspace', { name: 'Agent governance studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Engineering' }), line = await command('line', { name: 'Payroll', payroll: true, type: 'operating-expense' })
 const scenario = (await get('state')).scenarios[0]
 for (const [title, annualSalary] of [['Private salary sentinel', '120000'], ['Second person', '60000']]) await command('position', { scenario: scenario.id, title, annualSalary, department: department.id, line: line.id, start: '2026-01', onCostPercent: '0' })
 await post('./commentary/settings/configure', { model: 'synthetic-easel-model', inputUsdPerMillion: '1', outputUsdPerMillion: '2', monthlyUsd: '1', enabled: true, consent: true })
 await post('./commentary/connection/connect', { key: runtime.provider.key, consent: true })
 page = await context.newPage(); track(page)
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const action = async (suffix, run) => { const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await run(); const r = await pending; assert.equal(r.status(), 200, await r.text()); await settle(page); return r.json() }
 const capture = async (region, name) => { await settle(page); await noOverflow(page, name); await region.screenshot({ path: join(evidence, name + '.png') }) }
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${runtime.origin}/app?tab=review`)
  const governance = page.getByRole('region', { name: 'Agent governance', exact: true }), analyst = page.getByRole('region', { name: 'Cited analyst', exact: true })
  await governance.getByText('Agent controls and total budget', { exact: true }).click()
  await governance.getByLabel('Monthly total agent budget (USD)', { exact: true }).fill('1')
  await governance.getByLabel('Enable Analyst', { exact: true }).check()
  await governance.getByLabel('Enable Recurring missions', { exact: true }).check()
  await governance.getByLabel('I confirm these agent controls and the shared monthly allowance', { exact: true }).check()
  await action('/agents/settings/configure', () => governance.getByRole('button', { name: 'Save agent controls', exact: true }).click())
  await capture(governance, `agent-controls-${width}`)
  await action('/agents/settings/stop', () => governance.getByRole('button', { name: 'Stop all agents', exact: true }).click())
  await governance.getByText('All agents stopped', { exact: true }).waitFor()
  await capture(governance, `agent-stop-${width}`)
  await action('/agents/settings/resume', () => governance.getByRole('button', { name: 'Release global agent stop', exact: true }).click())
  await analyst.getByLabel('Analysis scenario', { exact: true }).selectOption(scenario.id)
  await analyst.getByLabel('Analysis question', { exact: true }).fill(`What is payroll by department? ${width}`)
  const preview = await action('/analyst/preview', () => analyst.getByRole('button', { name: 'Preview analyst request', exact: true }).click())
  assert.ok(!JSON.stringify(preview.request).includes('Private salary sentinel'))
  assert.ok(!JSON.stringify(preview.request).includes('12000000'))
  await capture(analyst, `analyst-request-${width}`)
  await analyst.getByLabel('I consent to sending this exact aggregate request and reserving its allowance', { exact: true }).check()
  const answer = await action('/analyst/generate', () => analyst.getByRole('button', { name: 'Ask analyst', exact: true }).click())
  assert.equal(answer.status, 'answered'); assert.equal(answer.citations[0].amount, 1500000)
  await analyst.getByText('Agent work; cited aggregate totals, read-only', { exact: true }).waitFor()
  await capture(analyst, `analyst-answer-${width}`)
  await analyst.getByText('Approve a weekly mission from this answer', { exact: true }).click()
  await analyst.getByLabel('Mission name', { exact: true }).fill(`Weekly brief ${width}`)
  await analyst.getByLabel('Finance recipients (comma separated emails)', { exact: true }).fill('owner@example.test')
  await analyst.getByLabel('I approve weekly aggregate model requests and delivery to this exact audience', { exact: true }).check()
  await action('/missions/approve', () => analyst.getByRole('button', { name: 'Approve Monday mission', exact: true }).click())
  await capture(analyst, `mission-approved-${width}`)
  await page.reload(); await analyst.getByText('Saved missions', { exact: true }).click()
  await action('/missions/stop', () => analyst.getByRole('button', { name: `Stop mission Weekly brief ${width}`, exact: true }).click())
  await capture(analyst, `mission-stopped-${width}`)
  // All controls on the changed surface have visible text; there are no icon-only controls.
  assert.equal(await analyst.locator('button').evaluateAll(nodes => nodes.filter(n => !n.textContent.trim()).length), 0)
  console.log(`Agent controls, aggregate analyst request and answer, mission approval and stop passed at ${width}`)
 }
} catch (error) { if (page) await page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
