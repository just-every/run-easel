// Native spend review on the built Worker; only provider HTTP boundaries are faked.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow } from './browser-journey.mjs'
import { spendProvider, spendKeys, spendFixture } from './spend-fixture.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const track = page => { const pending = new Set(); const mine = r => r.url().includes('/api/easel/'); page.on('request', r => { if (mine(r)) pending.add(r) }); for (const event of ['requestfinished','requestfailed']) page.on(event, r => pending.delete(r)); page.on('framenavigated', frame => { if (frame === page.mainFrame()) pending.clear() }); page.inflight = () => pending.size }
const settle = async page => { const deadline = Date.now() + 15000; for (let quiet = 0; quiet < 3;) { assert.ok(Date.now() < deadline, `Spend page did not settle; ${page.inflight()} requests remain`); await page.waitForTimeout(100); quiet = page.inflight() === 0 ? quiet + 1 : 0 } }
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
 const action = async (suffix, run) => { console.log('Native spend action:', suffix); const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await run(); const r = await pending.catch(async error => { console.error('Spend screen alerts:', await page.getByRole('alert').allTextContents()); throw error }); assert.equal(r.status(), 200, await r.text()); await settle(page); return r.json() }
 const capture = async (scope, name, focus) => { for (const width of [1440,390]) { await page.setViewportSize({ width, height: 1000 }); await settle(page); if (focus) { await focus.evaluate(el => el.blur()); await focus.focus(); await settle(page) } await noOverflow(page, `${name} ${width}`); await scope.screenshot({ path: join(evidence, `${name}-${width}.png`) }) } await page.setViewportSize({ width: 1440, height: 1000 }) }
 await page.goto(runtime.origin + '/app?tab=settings')
 for (const [p, label] of [['ramp','Ramp'],['purse','Purse'],['coaster','Coaster'],['brex','Brex']]) {
  const scope = card(label + ' spend connection')
  await scope.getByLabel(label + ' read-only credential', { exact: true }).fill(spendKeys[p]); await scope.getByLabel('Allow read-only ' + label + ' spend access', { exact: true }).check()
  await action(`/connections/spend/${p}/connect`, () => scope.getByRole('button', { name: 'Connect ' + label + ' spend', exact: true }).click())
  await scope.getByText('••••' + spendKeys[p].slice(-4), { exact: true }).waitFor()
  assert.equal(await scope.locator('input[type=password]').count(), 0)
  if (p === 'brex') await capture(scope, 'brex-spend-connected')
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

 // Review an unequal payment overlap through the native matched-part control.
 provider.state.bills = [{ id: 'synthetic-easel-401', reference: 'BILL-401', currency: 'USD', totalMinor: 14025, paymentStatus: 'paid', paymentStatusAt: '2026-01-16T12:00:00Z' }]
 await review.getByLabel('Purse PO IDs, separated by commas', { exact: true }).fill('synthetic-easel-102')
 await action('/spend/sources', () => review.getByRole('button', { name: 'Read spend sources', exact: true }).click())
 await review.getByLabel('Replace forecast expense', { exact: true }).selectOption(f.driver.id)
 await review.getByLabel('PO link for synthetic-easel-101', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Duplicate actual for synthetic-easel-102--synthetic-easel-401', { exact: true }).selectOption('ramp:synthetic-easel-101')
 const matchedPart = review.getByLabel('Duplicate matched amount for synthetic-easel-102--synthetic-easel-401 in 2026-01', { exact: true })
 await matchedPart.fill('120.25')
 const partial = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([partial.actual,partial.committed,partial.remaining,partial.forecast], [14025,35975,50000,50000])
 assert.equal(partial.rows.find(r => r.id.endsWith('--synthetic-easel-401')).countedAmount, 2000)
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).first().locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$359.75','$140.25','$500.00','$0.00'])
 await capture(review, 'spend-partial-provider-match', matchedPart)
 await matchedPart.fill('120.26')
 const overmatch = page.waitForResponse(r => r.url().endsWith('/spend/preview') && r.request().method() === 'POST')
 await review.getByRole('button', { name: 'Preview committed spend', exact: true }).click()
 assert.equal((await overmatch).status(), 409)
 await review.getByRole('alert').filter({hasText:'Duplicate parts exceed the independent source actual'}).waitFor()
 await settle(page)
 assert.equal(await review.getByRole('table',{name:'Spend source mapping',exact:true}).count(),0,'A conflict clears the old reviewed source mapping')
 await review.getByLabel('Purse PO IDs, separated by commas', { exact: true }).fill('synthetic-easel-102')
 await action('/spend/sources', () => review.getByRole('button', { name: 'Read spend sources', exact: true }).click())
 await review.getByLabel('Replace forecast expense', { exact: true }).selectOption(f.driver.id)
 await review.getByLabel('PO link for synthetic-easel-101', { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Duplicate actual for synthetic-easel-102--synthetic-easel-401', { exact: true }).selectOption('ramp:synthetic-easel-101')
 await matchedPart.fill('120.25')
 const reviewedPart = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.equal(reviewedPart.actual,14025)
 await action('/spend/accept', () => review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click())
 await page.reload(); await review.getByRole('heading', { name: 'Accepted spend reviews', exact: true }).waitFor()
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$359.75','$140.25','$500.00','$0.00'])

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
 await review.getByLabel('Matched amount for ledger ' + ledgerRows.rows[0].id, { exact: true }).fill('100.25')
 await review.getByLabel('PO link for ledger ' + ledgerRows.rows[0].id, { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Source actual for ledger ' + ledgerRows.rows[1].id, { exact: true }).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('Matched amount for ledger ' + ledgerRows.rows[1].id, { exact: true }).fill('20.00')
 await review.getByLabel('I reviewed every ledger row', { exact: true }).check()
 const reconciled = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([reconciled.actual,reconciled.committed,reconciled.remaining,reconciled.forecast], [12000,45011,42989,57011])
 assert.equal(await review.getByRole('table', { name: 'Spend ledger reconciliation', exact: true }).locator('tbody tr').count(), 2)

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
 await review.getByLabel('Matched amount for ledger ' + ledgerRows.rows[0].id, { exact: true }).fill('100.25')
 await review.getByLabel('PO link for ledger ' + ledgerRows.rows[0].id, { exact: true }).selectOption('synthetic-easel-102')
 await review.getByLabel('Source actual for ledger ' + ledgerRows.rows[1].id, { exact: true }).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('Matched amount for ledger ' + ledgerRows.rows[1].id, { exact: true }).fill('20.00')
 await review.getByLabel('I reviewed every ledger row', { exact: true }).check()
 const released = await action('/spend/preview', () => review.getByRole('button', { name: 'Preview committed spend', exact: true }).click())
 assert.deepEqual([released.actual,released.committed,released.remaining,released.released,released.forecast], [12000,7011,80989,38000,19011])
 await action('/spend/accept', () => review.getByRole('button', { name: 'Accept reviewed spend', exact: true }).click())
 await page.reload()
 await review.getByRole('heading', { name: 'Accepted spend reviews', exact: true }).waitFor()
 assert.deepEqual(await review.getByRole('table', { name: 'Budget and committed spend', exact: true }).locator('tbody tr').first().locator('td').allTextContents(), ['Software','Operations','2026-01','$1,000.00','$70.11','$120.00','$809.89','$380.00'])

 // Explicitly allocate a multi-month source into recurring forecast cells.
 provider.state.refunds = []; provider.state.bills = []; provider.state.poStatus = 'issued'
 await send('/api/easel/command/expense',{id:f.driver.id,scenario:f.forecast.id,name:'Supplier assumption',kind:'recurring',line:f.line.id,department:f.department.id,start:'2026-01',amount:'1000'})
 await page.reload()
 await review.getByLabel('Allocation end month for recurring expense',{exact:true}).fill('2026-02')
 await review.getByLabel('Read Brex cards',{exact:true}).check()
 await review.getByLabel('Purse PO IDs, separated by commas',{exact:true}).fill('synthetic-easel-102')
 await action('/spend/sources',()=>review.getByRole('button',{name:'Read spend sources',exact:true}).click())
 await review.getByLabel('Replace forecast expense',{exact:true}).selectOption(f.driver.id)
 await review.getByLabel('I reviewed every ledger row',{exact:true}).waitFor()
 for (const id of ['synthetic-easel-101','synthetic-easel-601','synthetic-easel-602']) await review.getByLabel('PO link for '+id,{exact:true}).selectOption('synthetic-easel-102')
 const allocations = {'synthetic-easel-101':['120.25','0.00'],'synthetic-easel-102':['300.00','200.00'],'synthetic-easel-601':['0.00','80.00'],'synthetic-easel-602':['0.00','-10.00']}
 for (const [id,values] of Object.entries(allocations)) for (const [i,m] of ['2026-01','2026-02'].entries()) await review.getByLabel(`Allocation for ${id} in ${m}`,{exact:true}).fill(values[i])
 await review.getByLabel('Source actual for ledger '+ledgerRows.rows[0].id,{exact:true}).selectOption('ramp:synthetic-easel-101')
 await review.getByLabel('PO link for ledger '+ledgerRows.rows[1].id,{exact:true}).selectOption('synthetic-easel-102')
 await review.getByLabel('I reviewed every ledger row',{exact:true}).check()
 const allocated = await action('/spend/preview',()=>review.getByRole('button',{name:'Preview committed spend',exact:true}).click())
 assert.deepEqual(allocated.cells.map(r=>[r.month,r.actual,r.committed,r.remaining,r.forecast]),[['2026-01',14025,15975,70000,30000],['2026-02',7000,13000,-20000,20000]])
 assert.deepEqual(await review.getByRole('table',{name:'Budget and committed spend',exact:true}).first().locator('tbody tr').allTextContents(),['SoftwareOperations2026-01$1,000.00$159.75$140.25$700.00$0.00','SoftwareOperations2026-02$0.00$130.00$70.00-$200.00$0.00'])
 await capture(review,'spend-recurring-allocation')
 await action('/spend/accept',()=>review.getByRole('button',{name:'Accept reviewed spend',exact:true}).click())
 await page.reload(); await review.getByRole('heading',{name:'Accepted spend reviews',exact:true}).waitFor()
 assert.equal(await review.getByRole('table',{name:'Budget and committed spend',exact:true}).locator('tbody tr').count(),2)
 const recurring = await send('/api/easel/scenario/'+f.forecast.id)
 assert.deepEqual(recurring.calculation.cells.filter(r=>r.line===f.line.id&&['2026-01','2026-02','2026-03'].includes(r.month)).map(r=>[r.month,r.amount]),[['2026-01',30000],['2026-02',20000],['2026-03',100000]])
 await page.goto(runtime.origin + '/app?tab=settings')
 for (const [p,label] of [['ramp','Ramp'],['purse','Purse'],['coaster','Coaster'],['brex','Brex']]) {
  const scope = card(label + ' spend connection')
  await action(`/connections/spend/${p}/disconnect`, () => scope.getByRole('button', { name: 'Disconnect ' + label + ' spend', exact: true }).click())
  await scope.getByRole('cell', { name: 'Disconnected', exact: true }).waitFor()

 }
 await context.close()
 console.log('SPEND-001 native custody, Brex settlements, recurring allocation, Coaster obligations, refunds, ledger reconciliation, PO release, persisted forecast and disconnect passed at 1440; changed screens captured at 1440 and 390')
} finally { await browser?.close(); await runtime.close() }
