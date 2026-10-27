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
const provider = spendProvider(), runtime = await builtBrowserRuntime({ https: true, bindings: { PURSE_ORIGIN: 'https://purse.example.test', COASTER_ORIGIN: 'https://coaster.example.test' }, outbound: provider.outbound })
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
 for (const [p, label] of [['ramp','Ramp'],['purse','Purse'],['coaster','Coaster']]) {
  const scope = card(label + ' spend connection')
  await scope.getByLabel(label + ' read-only credential', { exact: true }).fill(spendKeys[p]); await scope.getByLabel('Allow read-only ' + label + ' spend access', { exact: true }).check()
  await action(`/connections/spend/${p}/connect`, () => scope.getByRole('button', { name: 'Connect ' + label + ' spend', exact: true }).click())
  await scope.getByText('••••' + spendKeys[p].slice(-4), { exact: true }).waitFor()
  assert.equal(await scope.locator('input[type=password]').count(), 0)
  if (p === 'coaster') await capture(scope, 'coaster-spend-connected')
  if (p === 'ramp') {
   await runtime.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('spend-ramp').run()
   await page.reload()
   await scope.getByText('Reconnect after restore; spend credentials are excluded from archives', { exact: true }).waitFor()
   assert.equal(await scope.getByRole('button', { name: 'Connect Ramp spend', exact: true }).count(), 1)
   assert.equal(await scope.getByRole('button', { name: 'Disconnect Ramp spend', exact: true }).count(), 1)

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
 assert.deepEqual(await table.locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$379.75','$120.25','$500.00','$0.00'])

 await action('/spend/accept', () => review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click())
 await page.reload(); await review.getByRole('heading', { name: 'Accepted spend reviews', exact: true }).waitFor()
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$379.75','$120.25','$500.00','$0.00'])

 // Reconcile provider settlement, refund and accepted ledger through native controls.
 provider.state.refunds = [-2025]
 provider.state.bills = [{ id: 'synthetic-easel-401', reference: 'BILL-401', currency: 'USD', totalMinor: 12025, paymentStatus: 'paid', paymentStatusAt: '2026-01-16T12:00:00Z' }]
 await send('/api/easel/command/account-map', { account: '500', target: f.line.id })
 await send('/api/easel/command/department-map', { source: 'Operations', department: f.department.id })
 const actuals = { filename: 'synthetic-easel-501.csv', csv: 'Date,Account,Department,Amount,Reference\n2026-01-15,500,Operations,120.25,synthetic-easel-502\n2026-01-16,500,Operations,20.00,synthetic-easel-503\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', reference: 'Reference' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const actualPreview = await send('/api/easel/import/actuals/preview', actuals)
 await send('/api/easel/import/actuals/commit', { ...actuals, fingerprint: actualPreview.fingerprint })
 await page.reload()
 await review.getByLabel('Purse PO IDs, separated by commas', { exact: true }).fill('synthetic-easel-102')
 await review.getByLabel('Coaster report IDs, separated by commas', { exact: true }).fill('synthetic-easel-301')
 await action('/spend/sources', () => review.getByRole('button', { name: 'Read spend sources', exact: true }).click())
 await action('/spend/ledger', () => review.getByLabel('Replace forecast expense', { exact: true }).selectOption(f.driver.id))
 await review.getByLabel('PO link for synthetic-easel-101', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('PO link for synthetic-easel-110', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Duplicate actual for synthetic-easel-102--synthetic-easel-401', { exact: true }).selectOption('ramp:synthetic-easel-101')
 const ledgerRows = await send('/api/easel/spend/ledger', { ...f.input, revision: (await send('/api/easel/scenario/' + f.forecast.id)).scenario.revision })
 await review.getByLabel('Source actual for ledger ' + ledgerRows.rows[0].id, { exact: true }).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('PO link for ledger ' + ledgerRows.rows[1].id, { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('I reviewed every ledger row', { exact: true }).check()
 const reconciled = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([reconciled.actual,reconciled.committed,reconciled.remaining,reconciled.forecast], [12000,45011,42989,57011])
 assert.equal(await review.getByRole('table', { name: 'Spend ledger reconciliation', exact: true }).locator('tbody tr').count(), 2)
 await capture(review, 'spend-reconciled-preview')
 // A changed PO invalidates the old preview before the reviewed release is accepted.
 provider.state.poStatus = 'closed'
 const refusal = page.waitForResponse(r => r.url().endsWith('/spend/accept') && r.request().method() === 'POST')
 await review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click()
 assert.equal((await refusal).status(), 409)
 await page.reload()
 await review.getByLabel('Purse PO IDs, separated by commas', { exact: true }).fill('synthetic-easel-102')
 await review.getByLabel('Coaster report IDs, separated by commas', { exact: true }).fill('synthetic-easel-301')
 await action('/spend/sources', () => review.getByRole('button', { name: 'Read spend sources', exact: true }).click())
 await action('/spend/ledger', () => review.getByLabel('Replace forecast expense', { exact: true }).selectOption(f.driver.id))
 await review.getByLabel('PO link for synthetic-easel-101', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('PO link for synthetic-easel-110', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Duplicate actual for synthetic-easel-102--synthetic-easel-401', { exact: true }).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('Source actual for ledger ' + ledgerRows.rows[0].id, { exact: true }).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('PO link for ledger ' + ledgerRows.rows[1].id, { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('I reviewed every ledger row', { exact: true }).check()
 const released = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([released.actual,released.committed,released.remaining,released.released,released.forecast], [12000,7011,80989,38000,19011])
 await action('/spend/accept', () => review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click())
 await page.reload()
 await review.getByRole('heading', { name: 'Accepted spend reviews', exact: true }).waitFor()
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$70.11','$120.00','$809.89','$380.00'])
 await capture(review, 'spend-released-accepted')
 await page.goto(runtime.origin + '/app?tab=settings')
 for (const [p,label] of [['ramp','Ramp'],['purse','Purse'],['coaster','Coaster']]) {
  const scope = card(label + ' spend connection')
  await action(`/connections/spend/${p}/disconnect`, () => scope.getByRole('button', { name: 'Disconnect ' + label + ' spend', exact: true }).click())
  await scope.getByRole('cell', { name: 'Disconnected', exact: true }).waitFor()

 }
 await context.close()
 console.log('SPEND-001 native custody, Coaster obligations, refunds, bill settlement, ledger reconciliation, PO release, persisted forecast and disconnect passed at 1440; changed screens captured at 1440 and 390')
} finally { await browser?.close(); await runtime.close() }
