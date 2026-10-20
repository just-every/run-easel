// CONNECT-006 CONNECT-008: the finance operator creates reusable rules, previews new
// accounts, resolves the one exception and sees complete reconciliation.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { api, noOverflow, session } from './browser-journey.mjs'

export async function seedMappingRules(context, origin) {
 await api(context, origin, 'command/workspace', { name: 'Harbour Services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await api(context, origin, 'command/department', { name: 'Sales' })
 const services = await api(context, origin, 'command/line', { name: 'Services revenue', type: 'revenue' })
 await api(context, origin, 'command/department-map', { source: 'US Sales', department: sales.id })
 return { sales, services }
}

export async function mappingRulesJourney(browser, root, origin, evidence, width, seed) {
 const { context, page } = await session(browser, root, origin, 'owner', width)
 try {
  const tab = name => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
  const shot = async name => { await noOverflow(page, `CONNECT-006 ${name} ${width}`); await page.screenshot({ path: join(evidence, `mapping-${width}-${name}.png`), fullPage: true }) }
  await tab('Settings')
  const rules = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Reusable account rules', exact: true }) })
  const first = width === 1440 ? '4000' : '5000', last = width === 1440 ? '4999' : '5999', account = width === 1440 ? '4100' : '5100'
  await rules.getByLabel('First account', { exact: true }).fill(first)
  await rules.getByLabel('Last account', { exact: true }).fill(last)
  await rules.getByLabel('Rule maps to', { exact: true }).selectOption(seed.services.id)
  await rules.getByRole('button', { name: 'Add account rule', exact: true }).click()
  await page.getByRole('row').filter({ hasText: `${first} through ${last}` }).waitFor()
  await shot('rules')
  await tab('Actuals')
  const csv = `Date,Account,Account type,Department,Amount,Description\n2026-01-15,${account},Income,US Sales,-12500,Consulting retainer ${width}\n2026-01-16,OTHER-${width},Income,US Sales,-250,Implementation fee ${width}\n`
  await page.getByLabel('Actuals file', { exact: true }).setInputFiles({ name: `services-${width}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByLabel('Date format', { exact: true }).selectOption('YYYY-MM-DD')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '1 accounts and 0 departments' }).waitFor()
  assert.equal(await page.getByLabel(`Map account ${account}`, { exact: true }).inputValue(), seed.services.id)
  const accountRow = page.getByRole('region', { name: 'Accounts', exact: true }).getByRole('row').filter({ hasText: account })
  assert.match(await accountRow.innerText(), /Automatic/)
  assert.match(await page.getByRole('region', { name: 'Months in this file', exact: true }).innerText(), new RegExp(`Blocked: OTHER-${width}`))
  await shot('blocked-preview')
  await page.getByLabel(`Map account OTHER-${width}`, { exact: true }).selectOption(seed.services.id)
  await page.getByRole('status').filter({ hasText: 'Every account and department is mapped.' }).waitFor()
  await shot('mapped-preview')
  await page.getByRole('button', { name: 'Accept 2 rows', exact: true }).click()
  await page.getByRole('region', { name: 'Actuals imports', exact: true }).getByRole('row').filter({ hasText: `services-${width}.csv` }).waitFor()
  await page.getByRole('region', { name: 'Reconciliation by month', exact: true }).getByText('Complete', { exact: true }).waitFor()
  await shot('reconciled')
  const result = await api(context, origin, 'actuals')
  assert.equal(result.months[0].blocked, false)
  assert.equal(result.months[0].revenue, width === 1440 ? 1275000 : 2550000)
  console.log(`CONNECT-006 rules, automatic new-account mapping, blocked period, exact exception and accepted reconciliation at ${width}`)
 } finally { await context.close() }
}

export async function seedMappingReview(context, origin, services) {
 await api(context, origin, 'command/member', { email: 'board@dev.localhost', name: 'Board reader', role: 'viewer' })
 let state = await api(context, origin, 'state')
 const budget = state.scenarios.find(s => s.kind === 'budget')
 const current = await api(context, origin, `scenario/${budget.id}`)
 const { forecast } = await api(context, origin, 'command/approve-budget', { scenario: budget.id, revision: current.scenario.revision })
 await api(context, origin, 'command/close-month', { scenario: forecast.id, month: '2026-01' })
 const rule = await api(context, origin, 'command/account-rule', { match: 'prefix', from: 'FEB-', target: services.id })
 const source = { filename: 'february-services.csv', csv: 'Date,Account,Department,Amount,Description\n' + Array.from({ length: 12 }, (_, i) => `2026-02-15,FEB-retainer,US Sales,-1250,February consulting retainer ${i+1}`).join('\n') + '\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await api(context, origin, 'import/actuals/preview', source)
 await api(context, origin, 'import/actuals/commit', { ...source, fingerprint: preview.fingerprint })
 await api(context, origin, 'command/close-month', { scenario: forecast.id, month: '2026-02' })
 return rule
}

export async function mappingReviewJourney(browser, root, origin, evidence, width, rule) {
 const { context, page } = await session(browser, root, origin, 'owner', width)
 try {
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
  const variance = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Variances, Feb 2026', exact: true }) })
  await variance.locator('summary').first().click()
  await variance.getByRole('region', { name: 'Accepted rows', exact: true }).waitFor()
  assert.match(await variance.innerText(), /February consulting retainer 12/)
  assert.equal(await variance.getByRole('region', { name: 'Accepted rows', exact: true }).getByRole('row').count(), 13, 'CONNECT-008 displays every row beyond the former eight-row sample')
  await noOverflow(page, `CONNECT-006 CONNECT-008 complete review ${width}`)
  await page.screenshot({ path: join(evidence, `mapping-${width}-review-complete.png`), fullPage: true })
  await page.getByLabel('Month', { exact: true }).selectOption('2026-01')
  await page.getByRole('heading', { name: 'Variances, Jan 2026', exact: true }).waitFor()
  await api(context, origin, 'command/account-rule-delete', { id: rule.id })
  await page.getByLabel('Month', { exact: true }).selectOption('2026-02')
  await page.getByRole('alert').filter({ hasText: 'Actuals reconciliation blocked for 2026-02' }).waitFor()
  assert.equal(await page.locator('details.card-row').count(), 0, 'a blocked period clears previously displayed variance numbers')
  await noOverflow(page, `CONNECT-006 blocked review ${width}`)
  await page.screenshot({ path: join(evidence, `mapping-${width}-review-blocked.png`), fullPage: true })
  const restored = await api(context, origin, 'command/account-rule', { match: 'prefix', from: rule.from, target: rule.target })
  await page.getByLabel('Month', { exact: true }).selectOption('2026-01')
  await page.getByRole('heading', { name: 'Variances, Jan 2026', exact: true }).waitFor()
  await page.getByLabel('Month', { exact: true }).selectOption('2026-02')
  await page.getByRole('heading', { name: 'Variances, Feb 2026', exact: true }).waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  return restored
 } finally { await context.close() }
}

export async function mappingViewerJourney(browser, root, origin, evidence, width) {
 const { context, page } = await session(browser, root, origin, 'board', width)
 try {
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
  const variance = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Variances, Feb 2026', exact: true }) })
  await variance.locator('summary').first().click()
  assert.match(await variance.innerText(), /\$15,000.00/)
  assert.equal(await variance.getByRole('region', { name: 'Accepted rows', exact: true }).count(), 0)
  assert.doesNotMatch(await variance.innerText(), /February consulting retainer/)
  await noOverflow(page, `CONNECT-008 viewer variance ${width}`)
  await page.screenshot({ path: join(evidence, `mapping-${width}-viewer-review.png`), fullPage: true })
 } finally { await context.close() }
}
