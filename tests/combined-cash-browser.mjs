// Native combined source review through the built Worker. Provider boundaries
// and a fixed UTC clock are controlled; the shipped UI and commands are real.
import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
import { pantryProvider, pantryGrant } from './pantry-provider.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-combined-cash')
await mkdir(evidence, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'easel-combined-cash-')), port = await freePort(), origin = `https://127.0.0.1:${port}`
const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = []
async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
await enumerate(workerDir)
const provider = pantryProvider(), bankGrant = { environment: 'sandbox', clientId: 'synthetic-easel-31', secret: 'synthetic-easel-32', accessToken: 'synthetic-easel-33', consent: true }
// Instrument only the existing business-clock boundary. Authentication keeps
// its real clock, including D1 session expiry, as in the HTTP flow harness.
const modules = await Promise.all(scripts.map(async path => {
 const contents = await readFile(path, 'utf8')
 if (path !== entry) return { type: 'ESModule', path }
 const boundary = /async function currentTime\([^)]*\) \{[^}]*\}/g
 assert.equal([...contents.matchAll(boundary)].length, 1, 'The business-clock boundary is instrumented once')
 return { type: 'ESModule', path, contents: contents.replace(boundary, `async function currentTime() { return '2026-02-01T12:00:00.000Z' }`) }
}))
const mf = new Miniflare({ ...convertV4MiniflareOptions({
 host: '127.0.0.1', port, https: true, inspectorPort: 0, modules, modulesRoot: workerDir, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-combined-cash' },
 bindings: { PANTRY_ORIGIN: 'https://pantry.example.test', AUTH_ORIGIN: origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'synthetic-easel-session-01234567890123456789', SETUP_TOKEN: 'synthetic-easel-bootstrap-01234567890123456789', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1', MAIL_FROM: 'Easel <easel@example.test>' },
 assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
 outboundService: async request => {
  const url = new URL(request.url)
  if (url.hostname === 'pantry.example.test') return provider.outbound(request)
  assert.equal(url.origin, 'https://sandbox.plaid.com')
  const body = await request.json(); assert.equal(body.access_token, bankGrant.accessToken)
  if (url.pathname === '/accounts/balance/get') return Response.json({ accounts: [{ account_id: 'synthetic-easel-34', type: 'depository', balances: { current: 6000, iso_currency_code: 'USD' } }, { account_id: 'synthetic-easel-35', type: 'depository', balances: { current: 4000, iso_currency_code: 'USD' } }] })
  assert.equal(url.pathname, '/transactions/get'); return Response.json({ transactions: [], total_transactions: 0 })
 },
}), resourcePersistencePath: scratch })
let browser
try {
 await mf.ready
 const db = await mf.getD1Database('DB')
 for (const file of (await readdir('./migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage()
 await page.clock.install({ time: new Date('2026-02-01T12:00:00.000Z') })
 track(page)
 const post = async (path, body, status = 200) => { const r = await context.request.post(origin + path, { headers: { origin }, data: body, maxRedirects: 0 }); assert.equal(r.status(), status, await r.text()); return status === 200 ? r.json() : null }
 const cmd = (op, body) => post('/api/easel/command/' + op, body)
 const get = async path => { const r = await context.request.get(origin + '/api/easel/' + path); assert.equal(r.status(), 200, await r.text()); return r.json() }
 await post('/auth/bootstrap', { token: 'synthetic-easel-bootstrap-01234567890123456789', displayName: 'Fran Finance' }, 303)
 await cmd('workspace', { name: 'Harbour Services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Operations' }), revenue = await cmd('line', { name: 'Service revenue', type: 'revenue' }), spend = await cmd('line', { name: 'Supplier spend', type: 'operating-expense' }), payroll = await cmd('line', { name: 'Payroll', type: 'operating-expense', payroll: true }), interest = await cmd('line', { name: 'Interest', type: 'operating-expense' })
 const scenario = (await get('state')).scenarios[0].id, base = { scenario, department: dept.id, start: '2026-02' }
 await cmd('scenario-cash', { scenario, basis: 'estimate', opening: '10000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { ...base, line: revenue.id, name: 'Customer schedule', kind: 'contract', startDate: '2026-02-10', termMonths: 12, contractValue: '600', billingCadence: 'monthly', dsoDays: 12 })
 await cmd('expense', { ...base, line: spend.id, name: 'Existing bill estimate', kind: 'one-off', amount: '20', paymentMethod: 'date', paymentDate: '2026-02-15' })
 await cmd('expense', { ...base, line: spend.id, name: 'New planned spend', kind: 'one-off', amount: '10', paymentMethod: 'date', paymentDate: '2026-02-20' })
 await cmd('position', { ...base, line: payroll.id, title: 'Private payroll sentinel', annualSalary: '1200', payDay: 15, secondPayDay: 28, onCostPercent: 0 })
 await cmd('debt', { ...base, start: '2026-01', line: interest.id, name: 'Scheduled loan', debtKind: 'term', maturity: '2026-12', opening: '1200', rateKind: 'fixed', annualRate: 0, amortization: 'equal-principal', amortizationStart: '2026-01', termMonths: 12, draws: {}, repayments: {} })
 await post('/api/easel/connections/pantry/connect', pantryGrant)
 await post('/api/easel/connections/plaid/connect', bankGrant)
 await post('/api/easel/connections/plaid/refresh', {})
 await page.goto(origin + '/setup'); await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 const panel = () => page.getByRole('region', { name: '13-week planned cash', exact: true })
 const action = async (path, click, status = 200) => { const pending = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST'); await click(); const r = await pending; assert.equal(r.status(), status, await r.text()); await settle(page); return status === 200 ? r.json() : null }
 const review = () => action('/pantry/cash', () => panel().getByRole('button', { name: 'Review Pantry open items', exact: true }).click())
 const preview = (status = 200) => action('/pantry/cash-forecast', () => panel().getByRole('button', { name: 'Preview combined cash', exact: true }).click(), status)
 const allocations = async () => {
  await panel().getByLabel('Replace collections on 2026-02-22', { exact: true }).fill('50.00')
  await panel().getByLabel('Replace payments on 2026-02-15', { exact: true }).fill('20.00')
 }
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(origin + '/app?tab=overview'); await settle(page)
  await panel().getByLabel('Weekly cash first day', { exact: true }).fill('2026-02-02'); await settle(page)
  await panel().getByLabel('Week starting', { exact: true }).selectOption('2026-02-02')
  await panel().getByLabel('Cash adjustment', { exact: true }).fill('1.23')
  await panel().getByLabel('Adjustment note', { exact: true }).fill('Reviewed timing')
  await action('/command/weekly-cash-override', () => panel().getByRole('button', { name: 'Save weekly adjustment', exact: true }).click())
  const unchanged = await get(`scenario/${scenario}`)
  await panel().getByLabel('Weekly cash sources', { exact: true }).selectOption('pantry')
  const source = await review()
  assert.deepEqual(source.events.map(e => [e.kind, e.date, e.amount]), [['bill', '2026-02-15', 2000], ['invoice', '2026-02-22', 5000]])
  const items = panel().getByRole('table', { name: 'Pantry open cash items', exact: true })
  assert.match(await items.innerText(), /12 days late/); assert.match(await items.innerText(), /50.00/); assert.match(await items.innerText(), /20.00/)
  await noOverflow(page, `Combined source review ${width}`); await panel().screenshot({ path: join(evidence, `source-review-${width}.png`) })
  await allocations(); const combined = await preview()
  assert.deepEqual(combined.weeks.slice(0, 4).map(w => [w.collections, w.payments, w.adjustment, w.closing]), [[0, 0, 123, 990123], [0, 7000, 0, 983123], [5000, 1000, 0, 987123], [0, 15000, 0, 972123]])
  assert.equal(combined.weeks.length, 13); assert.equal(combined.reconciliation[0].difference, 123)
  const table = panel().getByRole('table', { name: 'Weekly planned cash', exact: true })
  assert.equal(await table.getByRole('row').count(), 14)
  assert.deepEqual((await table.getByRole('row').nth(3).getByRole('cell').allTextContents()).slice(1, 6), ['$9,831.23', '$50.00', '$10.00', '$0.00', '$9,871.23'])
  assert.match(await table.innerText(), /Reviewed timing/); assert.doesNotMatch(await panel().innerText(), /Private payroll sentinel/)
  assert.match(await panel().getByRole('table', { name: 'Weekly to monthly cash reconciliation', exact: true }).innerText(), /\$1.23/)
  await noOverflow(page, `Combined forecast ${width}`); await panel().screenshot({ path: join(evidence, `combined-plan-${width}.png`) })
  const download = page.waitForEvent('download'); await panel().getByRole('button', { name: 'Download combined cash Excel', exact: true }).click()
  const book = await readWorkbook(await readFile(await (await download).path())); proveFormulas(book)
  assert.equal(book.getWorksheet('Weekly cash').getCell('H4').value, 'Reviewed timing')
  assert.equal(book.getWorksheet('Weekly cash').getCell('G7').value.result, 972123)
  assert.equal(book.getWorksheet('Reconciliation').getCell('F3').value.result, 123)
  await panel().getByLabel('Additional source collections', { exact: true }).fill('0.01')
  assert.equal(await panel().getByRole('heading', { name: 'Combined cash forecast', exact: true }).count(), 0)
  await preview(400); assert.equal(await panel().getByRole('heading', { name: 'Combined cash forecast', exact: true }).count(), 0)
  await panel().getByLabel('Additional source collections', { exact: true }).fill('0.00')
  // Explicitly additional cash is a distinct reviewed choice, not inferred.
  await panel().getByLabel('Replace collections on 2026-02-22', { exact: true }).fill('0.00')
  await panel().getByLabel('Additional source collections', { exact: true }).fill('50.00')
  const additional = await preview(); assert.equal(additional.weeks[2].collections, 10000); assert.equal(additional.reconciliation[0].difference, 5123)
  await allocations(); await panel().getByLabel('Additional source collections', { exact: true }).fill('0.00'); await preview()
  provider.reversed = true
  await action('/pantry/cash-forecast', () => panel().getByRole('button', { name: 'Download combined cash Excel', exact: true }).click(), 409)
  assert.equal(await panel().getByRole('heading', { name: 'Combined cash forecast', exact: true }).count(), 0)
  assert.match(await panel().innerText(), /Resolve every open-item date/)
  await preview(409)
  await review(); assert.match(await panel().innerText(), /No fully paid invoice history/); assert.equal(await panel().getByRole('button', { name: 'Preview combined cash', exact: true }).count(), 0)
  await panel().screenshot({ path: join(evidence, `unresolved-source-${width}.png`) }); provider.reversed = false
  await panel().getByLabel('Weekly cash basis', { exact: true }).selectOption('bank'); await settle(page)
  await review(); await allocations(); const bank = await preview()
  assert.equal(bank.bank.accountCount, 2); assert.equal(bank.bank.balanceCents, 1000000)
  assert.equal(bank.weeks[3].closing, 982123); assert.equal(bank.reconciliation[0].difference, 10123)
  assert.match(await panel().getByRole('table', { name: 'Weekly planned cash', exact: true }).innerText(), /\$9,821.23/)
  assert.match(await panel().getByRole('table', { name: 'Weekly to monthly cash reconciliation', exact: true }).innerText(), /\$101.23/)
  await noOverflow(page, `Combined bank ${width}`); await panel().screenshot({ path: join(evidence, `combined-bank-${width}.png`) })
  const bankDownload = page.waitForEvent('download'); await panel().getByRole('button', { name: 'Download combined cash Excel', exact: true }).click()
  const bankBook = await readWorkbook(await readFile(await (await bankDownload).path())); proveFormulas(bankBook)
  assert.equal(bankBook.getWorksheet('Weekly cash').getCell('G7').value.result, 982123)
  assert.equal(bankBook.getWorksheet('Reconciliation').getCell('F3').value.result, 10123)
  assert.deepEqual(await get(`scenario/${scenario}`), unchanged, 'Combined review and exports preserve the monthly plan and its revision')
  await cmd('weekly-cash-override', { scenario, start: '2026-02-02', adjustment: '2.34', note: 'New revision from finance' })
  await preview(409)
  assert.match(await panel().innerText(), /scenario changed after review/)
  assert.equal(await panel().getByRole('heading', { name: 'Combined cash forecast', exact: true }).count(), 0)
  const icons = await panel().locator('button').evaluateAll(buttons => buttons.filter(b => !b.textContent.trim()).map(b => b.getAttribute('aria-label')))
  assert.deepEqual(icons, [], 'Cash controls have visible labels')
  console.log(`Combined cash ${width}: exact source replacements, payroll, debt, spend, noted adjustments, reconciliation, Excel and fail-closed review passed`)
 }
 await context.close()
} finally { await browser?.close(); await mf.dispose(); await rm(scratch, { recursive: true, force: true }) }
