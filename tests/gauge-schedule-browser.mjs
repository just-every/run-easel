// Built native Settings proof; only Gauge's aggregate network edge is replaced.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/gauge-schedule')
await mkdir(evidence, { recursive: true })
// Mint an ephemeral scoped credential at the provider edge; never store a key fixture.
const key = ['gauge', 'util', randomBytes(32).toString('base64url')].join('_')
let status = 200
const runtime = await builtBrowserRuntime({ bindings: { GAUGE_ORIGIN: 'https://gauge.example.test' }, outbound: async request => {
 const u = new URL(request.url)
 assert.equal(u.origin, 'https://gauge.example.test'); assert.equal(request.headers.get('authorization'), `Bearer ${key}`)
 if (u.pathname.endsWith('/revoke')) return new Response(null)
 if (status !== 200) return new Response(null, { status })
 return Response.json({ scope: 'utilization:read', from: u.searchParams.get('from'), to: u.searchParams.get('to'), asOf: new Date().toISOString(), participantCount: 2, availableSeconds: 7200, knownAvailableSeconds: 7200, missingCalendarDays: 0, approvedBillableSeconds: 3600 })
} })
let browser, page
try {
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext()
 const post = async (path, body, expected = 200) => { const r = await context.request.post(runtime.origin + path, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 }); assert.equal(r.status(), expected, await r.text()); return expected === 200 ? r.json() : null }
 await post('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Fran Finance' }, 303)
 await post('/api/easel/command/workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 page = await context.newPage(); track(page)
 await page.goto(runtime.origin + '/setup')
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Connections', exact: true }) })
 const action = async (path, click) => { const pending = page.waitForResponse(r => r.url().endsWith(path)); await click(); const response = await pending; assert.equal(response.status(), 200, await response.text()); await settle(page); return response.json() }
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(runtime.origin + '/app?tab=settings')
  await panel.getByLabel('Gauge read key', { exact: true }).fill(key)
  await action('/connections/gauge/connect', () => panel.getByRole('button', { name: /^(Connect Gauge|Replace Gauge key)$/ }).click())
  await panel.getByLabel('Observation cadence', { exact: true }).selectOption('nightly')
  await panel.getByLabel('Scheduled observation month', { exact: true }).fill('2026-01')
  await panel.getByLabel(`Allow scheduled read-only observations in ${['America', 'New_York'].join('/')}`, { exact: true }).check()
  const saved = await action('/connections/gauge/schedule', () => panel.getByRole('button', { name: 'Save Gauge schedule', exact: true }).click())
  assert.equal(saved.refreshSchedule.cadence, 'nightly'); assert.equal(saved.refreshSchedule.month, '2026-01')
  await panel.scrollIntoViewIfNeeded(); await noOverflow(page, `Gauge schedule ${width}`)
  await panel.screenshot({ path: join(evidence, `schedule-${width}.png`) })
  await page.reload(); await panel.getByLabel('Observation cadence', { exact: true }).waitFor()
  assert.equal(await panel.getByLabel('Observation cadence', { exact: true }).inputValue(), 'nightly')
  assert.equal(await panel.getByLabel('Scheduled observation month', { exact: true }).inputValue(), '2026-01')
  await panel.getByLabel('Connection check month', { exact: true }).fill('2026-01')
  await action('/connections/gauge/check', () => panel.getByRole('button', { name: 'Check Gauge connection', exact: true }).click())
  await panel.getByText('Current observation', { exact: true }).waitFor()
  await panel.screenshot({ path: join(evidence, `current-${width}.png`) })
  status = 503
  await action('/connections/gauge/check', () => panel.getByRole('button', { name: 'Check Gauge connection', exact: true }).click())
  await panel.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor()
  await panel.getByText('Stale — check the source before using its numbers', { exact: true }).waitFor()
  await noOverflow(page, `Gauge failed observation ${width}`)
  await panel.screenshot({ path: join(evidence, `failed-${width}.png`) })
  status = 200
  // Every visible icon-only button in this screen must expose its existing tooltip.
  const iconButtons = await page.getByRole('button').evaluateAll(nodes => nodes.filter(n => !(n.textContent ?? '').trim() && n.getAttribute('aria-label')).map(n => n.getAttribute('aria-label')))
  assert.deepEqual(iconButtons, [], 'Settings currently uses visible text for all button controls')
  console.log(`CONNECT-005 ${width}: explicit schedule consent, saved cadence and month, visible zone, healthy and failed stale observations passed`)
 }
} catch (error) { if (page) await page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
