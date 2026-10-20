// CONNECT-007: native finance mapping/import/reconciliation at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, freePort, start, fresh } from './browser-runtime.mjs'
import { session, api, noOverflow } from './browser-journey.mjs'
import { balanceSource, seedBalanceActuals } from './balance-actuals-fixture.mjs'

const { chromium, expect } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-balance-actuals')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const initial = await session(browser, root, server.origin, 'owner', 1440)
 const seed = await seedBalanceActuals((op, body) => api(initial.context, server.origin, `command/${op}`, body))
 await initial.context.close()
 for (const width of [1440, 390]) {
  const { context, page } = await session(browser, root, server.origin, 'owner', width)
  try {
   const tab = name => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
   const shot = async name => { await noOverflow(page, `CONNECT-007 ${name} ${width}`); await page.screenshot({ path: join(evidence, `balance-${width}-${name}.png`), fullPage: true }) }
   await tab('Settings')
   // Use the visible exact mapping door, and inspect the reusable-rule target list.
   const mappings = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Account mappings', exact: true }) })
   await mappings.getByLabel('Source account', { exact: true }).fill('2300')
   await mappings.getByLabel('Maps to', { exact: true }).selectOption('bs:debt')
   await mappings.getByRole('button', { name: 'Save mapping', exact: true }).click()
   await mappings.getByRole('row').filter({ hasText: '2300' }).getByText('Debt', { exact: true }).waitFor()
   await expect(mappings.getByRole('button', { name: 'Save mapping', exact: true })).toBeEnabled()
   assert.equal(await page.getByLabel('Rule maps to', { exact: true }).locator('option[value^="bs:"]').count(), 8)
   await shot('settings')
   await tab('Actuals')
   {
    await page.getByLabel('Actuals file', { exact: true }).setInputFiles({ name: balanceSource.filename, mimeType: 'text/csv', buffer: Buffer.from(balanceSource.csv) })
    await page.getByLabel('Date format', { exact: true }).selectOption('YYYY-MM-DD')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Every account and department is mapped.' }).waitFor()
    assert.equal(await page.getByLabel('Map account 1101', { exact: true }).inputValue(), 'bs:receivables')
    await page.getByLabel('Map account 2300', { exact: true }).selectOption('bs:debt')
    await page.getByRole('status').filter({ hasText: 'Every account and department is mapped.' }).waitFor()
    await shot('preview')
    await page.getByRole('button', { name: 'Accept 13 rows', exact: true }).click()
    await page.getByRole('region', { name: 'Actuals imports', exact: true }).getByText(balanceSource.filename, { exact: true }).waitFor()
   }
   const summary = page.locator('summary').filter({ hasText: '2026-01' })
   await summary.click()
   const balances = page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true })
   await balances.getByRole('row').filter({ hasText: 'Receivables' }).getByText('$22,000.00', { exact: true }).waitFor()
   assert.match(await balances.innerText(), /\$95,400.00/)
   assert.match(await page.getByRole('region', { name: 'Trial balance 2026-01', exact: true }).innerText(), /1101/)
   const download = page.waitForEvent('download')
   await page.getByRole('link', { name: 'Download reconciliation (Excel)', exact: true }).click()
   assert.equal((await download).suggestedFilename().endsWith('.xlsx'), true)
   await shot('reconciled')
   await api(context, server.origin, 'command/account-rule-delete', { id: seed.receivables.id })
   await tab('Settings'); await tab('Actuals')
   await page.locator('summary').filter({ hasText: '2026-01' }).click()
   await page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true }).getByText('Unavailable: unresolved mappings', { exact: true }).first().waitFor()
   await shot('blocked')
   seed.receivables = await api(context, server.origin, 'command/account-rule', { match: 'range', from: '1100', to: '1199', target: 'bs:receivables' })
   await tab('Settings'); await tab('Actuals')
   await page.locator('summary').filter({ hasText: '2026-01' }).click()
   await page.getByRole('region', { name: 'Balance-sheet balances 2026-01', exact: true }).getByText('$22,000.00', { exact: true }).waitFor()
   await shot('restored')
   await tab('Activity')
   await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor()
   await page.getByRole('region', { name: 'Most recent first', exact: true }).getByText('Maps to: Debt', { exact: false }).first().waitFor()
   await shot('activity')
   if (width === 1440) {
    const state = await api(context, server.origin, 'state')
    const batch = state.batches.find(b => b.file === balanceSource.filename && b.status === 'accepted')
    await api(context, server.origin, 'import/actuals/undo', { id: batch.id })
   }
   console.log(`CONNECT-007 native finance mapping, journal import, trial balance, source detail, blocked/restored balances and Excel at ${width}`)
  } finally { await context.close() }
 }
 // Continue through the native close and statement doors on the accepted ledger.
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, body) => api(owner.context, server.origin, `command/${op}`, body)
 let state = await api(owner.context, server.origin, 'state')
 const budget = state.scenarios.find(s => s.kind === 'budget')
 const department = await cmd('department', { name: 'Delivery' })
 await cmd('department-map', { source: '', department: department.id })
 const line = async (name, extras = {}) => cmd('line', { name, type: 'operating-expense', ...extras })
 const insurance = await line('Insurance'), payroll = await line('Payroll', { payroll: true }), depreciation = await line('Depreciation', { nonCash: true })
 const common = { scenario: budget.id, department: department.id, start: '2026-01' }
 const prepaid = await cmd('expense', { ...common, name: 'Annual insurance', line: insurance.id, kind: 'prepaid', amount: '1200', paymentMonth: '2025-12', amortizationMonths: 12 })
 const salary = await cmd('position', { ...common, start: '2025-12', title: 'Delivery lead', holder: 'Private employee', line: payroll.id, annualSalary: '12000', payDay: 5, payMonthOffset: 1 })
 const contract = await cmd('revenue', { ...common, name: 'Annual service', line: seed.revenue.id, kind: 'contract', startDate: '2026-01-01', contractValue: '12000', termMonths: 12, billingCadence: 'annual', dsoDays: 0 })
 const category = await cmd('asset-category', { scenario: budget.id, name: 'Equipment', usefulLifeMonths: 60 })
 const asset = await cmd('asset', { ...common, name: 'Existing equipment', line: depreciation.id, category: category.originId, kind: 'existing', cost: '24000', remainingLifeMonths: 24 })
 state = await api(owner.context, server.origin, 'state')
 await cmd('approve-budget', { scenario: budget.id, revision: state.scenarios.find(s => s.id === budget.id).revision })
 await owner.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
 await owner.page.getByRole('button', { name: 'Close Jan 2026', exact: true }).click()
 await owner.page.getByRole('button', { name: 'Close Feb 2026', exact: true }).waitFor()
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 const forecast = (await api(owner.context, server.origin, 'state')).scenarios.find(s => s.kind === 'forecast')
 for (const width of [1440, 390]) {
  const reader = await session(browser, root, server.origin, 'owner', width)
  try {
   await reader.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Overview', exact: true }).click()
   const section = reader.page.locator('section.card').filter({ has: reader.page.getByRole('heading', { name: 'Balance sheet', exact: true }) })
   const cash = section.getByRole('row').filter({ has: reader.page.getByRole('rowheader', { name: 'Cash', exact: true }) }).getByRole('cell')
   assert.equal(await cash.first().innerText(), '$96,000.00')
   await section.getByLabel('Balance sheet reconciliation for Feb 2026: Incomplete', { exact: true }).click()
   await section.getByRole('region', { name: 'Balance sheet reconciliation details', exact: true }).getByText(/no reviewed schedule attribution/).waitFor()
   await noOverflow(reader.page, `CONNECT-007 imported opening ${width}`)
   await reader.page.screenshot({ path: join(evidence, `opening-unallocated-${width}.png`), fullPage: true })
  } finally { await reader.context.close() }
 }
 for (const [target, originId, amount, extra] of [
  ['bs:prepaid', prepaid.originId, '2400', {}], ['bs:accrued-liabilities', salary.originId, '3000', {}],
  ['bs:deferred-revenue', contract.originId, '6000', {}], ['bs:fixed-assets', asset.originId, '18000', { remainingLifeMonths: 36 }],
 ]) {
  const v = await api(owner.context, server.origin, `scenario/${forecast.id}`)
  await cmd('ledger-allocation', { scenario: forecast.id, revision: v.scenario.revision, month: '2026-01', target, allocations: [{ originId, amount, ...extra }] })
 }
 for (const width of [1440, 390]) for (const as of ['owner', 'board']) {
  const reader = await session(browser, root, server.origin, as, width)
  try {
   await reader.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Overview', exact: true }).click()
   const view = await api(reader.context, server.origin, `scenario/${forecast.id}`)
   for (const [heading, field] of [['Balance sheet', 'balanceSheet'], ['Indirect cash flow', 'cashFlow']]) {
    const section = reader.page.locator('section.card').filter({ has: reader.page.getByRole('heading', { name: heading, exact: true }) })
    await section.getByRole('table').waitFor()
    const row = view.calculation[field][1]
    assert.equal(field === 'balanceSheet' ? row.balanceDifference : row.difference, 0)
    await section.getByLabel(`${heading} reconciliation for Feb 2026: Balanced`, { exact: true }).click()
    const details = await section.getByRole('region', { name: `${heading} reconciliation details`, exact: true }).innerText()
    assert.ok(details.includes(row.trace))
    await noOverflow(reader.page, `CONNECT-007 ${heading} ${as} ${width}`)
    await section.screenshot({ path: join(evidence, `opening-${field}-${as}-${width}.png`) })
   }
   const download = reader.page.waitForEvent('download')
   await reader.page.getByRole('link', { name: 'Download Excel', exact: true }).click()
   assert.equal(await (await download).failure(), null)
  } finally { await reader.context.close() }
 }
 const bad = { ...balanceSource, filename: 'february-one-cent.csv', csv: 'Date,Account,Type,Amount,Description\n2026-02-01,1000,Bank,0.01,Incomplete source journal\n' }
 const bp = await api(owner.context, server.origin, 'import/actuals/preview', bad)
 const imported = await api(owner.context, server.origin, 'import/actuals/commit', { ...bad, fingerprint: bp.fingerprint })
 for (const width of [1440, 390]) {
  const reader = await session(browser, root, server.origin, 'owner', width)
  try {
   await reader.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
   await reader.page.getByRole('button', { name: 'Close Feb 2026', exact: true }).click()
   await reader.page.getByRole('alert').filter({ hasText: /trial balance.*1 minor units/ }).waitFor()
   assert.equal((await api(reader.context, server.origin, `scenario/${forecast.id}`)).scenario.actualsThrough, '2026-01')
   await noOverflow(reader.page, `CONNECT-007 refused close ${width}`)
   await reader.page.screenshot({ path: join(evidence, `close-refused-${width}.png`), fullPage: true })
  } finally { await reader.context.close() }
 }
 await api(owner.context, server.origin, 'import/actuals/undo', { id: imported.batch.id })
 await owner.context.close()
 console.log('CONNECT-007 actual openings, explicit schedule attribution, finance/viewer statements, downloads and one-cent native close refusal at 1440/390')
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }) }
