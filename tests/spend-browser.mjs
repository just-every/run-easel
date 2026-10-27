// Native spend review on the built Worker; only provider HTTP boundaries are faked.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { settle, noOverflow, track } from './browser-journey.mjs'
import { spendProvider, spendKeys, spendFixture } from './spend-fixture.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-spend')
await mkdir(evidence, { recursive: true })
const provider = spendProvider(), runtime = await builtBrowserRuntime({ https: true, bindings: { PURSE_ORIGIN: 'https://purse.example.test' }, outbound: provider.outbound })
let browser
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox','--use-mock-keychain','--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage(); track(page)
 const send = async (path, body, status = 200) => { const r = await context.request[body === undefined ? 'get' : 'post'](runtime.origin + path, { headers: { origin: runtime.origin }, ...(body === undefined ? {} : { data: body }), maxRedirects: 0 }); assert.equal(r.status(), status, await r.text()); return status === 200 ? r.json() : null }
 await send('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Fran Finance' }, 303)
 await page.goto(runtime.origin + '/setup'); await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); await page.waitForURL('**/app')
 const f = await spendFixture({ command: (op, b) => send('/api/easel/command/' + op, b), get: p => send(p) })
 const card = name => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
 const action = async (suffix, run) => { const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await run(); const r = await pending; assert.equal(r.status(), 200, await r.text()); await settle(page); return r.json() }
 const capture = async (scope, name) => { for (const width of [1440,390]) { await page.setViewportSize({ width, height: 1000 }); await settle(page); await noOverflow(page, `${name} ${width}`); await scope.screenshot({ path: join(evidence, `${name}-${width}.png`) }) } await page.setViewportSize({ width: 1440, height: 1000 }) }
 await page.goto(runtime.origin + '/app?tab=settings')
 for (const [p, label] of [['ramp','Ramp'],['purse','Purse']]) {
  const scope = card(label + ' spend connection')
  await scope.getByLabel(label + ' read-only credential', { exact: true }).fill(spendKeys[p]); await scope.getByLabel('Allow read-only ' + label + ' spend access', { exact: true }).check()
  await action(`/connections/spend/${p}/connect`, () => scope.getByRole('button', { name: 'Connect ' + label + ' spend', exact: true }).click())
  await scope.getByText('••••' + spendKeys[p].slice(-4), { exact: true }).waitFor()
  assert.equal(await scope.locator('input[type=password]').count(), 0)
  await capture(scope, p + '-spend-connected')
  if (p === 'ramp') {
   await runtime.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('spend-ramp').run()
   await page.reload()
   await scope.getByText('Reconnect after restore; spend credentials are excluded from archives', { exact: true }).waitFor()
   assert.equal(await scope.getByRole('button', { name: 'Connect Ramp spend', exact: true }).count(), 1)
   assert.equal(await scope.getByRole('button', { name: 'Disconnect Ramp spend', exact: true }).count(), 1)
   await capture(scope, 'ramp-spend-restore')
   await scope.getByLabel('Ramp read-only credential', { exact: true }).fill(spendKeys.ramp)
   await scope.getByLabel('Allow read-only Ramp spend access', { exact: true }).check()
   await action('/connections/spend/ramp/connect', () => scope.getByRole('button', { name: 'Connect Ramp spend', exact: true }).click())
   await scope.getByText('••••1001', { exact: true }).waitFor()
  }
 }
 await page.goto(runtime.origin + '/app?tab=review')
 const review = card('Committed spend')
 await review.getByLabel('Purse PO IDs, separated by commas', { exact: true }).fill('synthetic-easel-102')
 await action('/spend/sources', () => review.getByRole('button', { name: 'Read spend sources', exact: true }).click())
 await review.getByLabel('Replace forecast expense', { exact: true }).selectOption(f.driver.id)
 await review.getByLabel('PO link for synthetic-easel-101', { exact: true }).selectOption('synthetic-easel-102')
 const preview = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([preview.budget,preview.committed,preview.actual,preview.remaining], [100000,37975,12025,50000])
 const table = review.getByRole('table', { name: 'Budget and committed spend', exact: true })
 assert.deepEqual(await table.locator('tbody tr').first().locator('td').allTextContents(), ['2026-01','$1,000.00','$379.75','$120.25','$500.00'])
 await capture(review, 'spend-mapping-review')
 await action('/spend/accept', () => review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click())
 await page.reload(); await review.getByRole('heading', { name: 'Accepted spend reviews', exact: true }).waitFor()
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).locator('tbody tr').first().locator('td').allTextContents(), ['2026-01','$1,000.00','$379.75','$120.25','$500.00'])
 await capture(review, 'spend-accepted')
 await page.goto(runtime.origin + '/app?tab=settings')
 for (const [p,label] of [['ramp','Ramp'],['purse','Purse']]) {
  const scope = card(label + ' spend connection')
  await action(`/connections/spend/${p}/disconnect`, () => scope.getByRole('button', { name: 'Disconnect ' + label + ' spend', exact: true }).click())
  await scope.getByRole('cell', { name: 'Disconnected', exact: true }).waitFor()
  await capture(scope, p + '-spend-disconnected')
 }
 await context.close()
 console.log('SPEND-001 native custody, explicit mapping, exact nonduplicated spend, persisted forecast and disconnect passed at 1440; changed screens captured at 1440 and 390')
} finally { await browser?.close(); await runtime.close() }
