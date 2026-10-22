// AGENT-004: finance reads kept-forecast error split into timing, driver and
// permanent, records deal history in the browser, reviews the backtest and
// creates a draft proposal, at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, command, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-forecast-learning')
await mkdir(evidence, { recursive: true })
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
let server, browser, finance
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 await cmd('workspace', { name: 'Slippage Co', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Contract revenue', type: 'revenue' })
 const software = await cmd('line', { name: 'Software', type: 'operating-expense' })
 await cmd('account-map', { account: '400', target: revenue.id }); await cmd('account-map', { account: '461', target: software.id })
 await cmd('department-map', { source: 'Sales', department: sales.id })
 const budget = (await call('state')).scenarios[0]
 const contract = (startDate, scenario, extra = {}) => ({ scenario, name: `Deal ${startDate.slice(0, 7)}`, kind: 'contract', line: revenue.id, department: sales.id, start: startDate.slice(0, 7), startDate, termMonths: '12', contractValue: '12000', billingCadence: 'monthly', dsoDays: '0', ...extra })
 const planned = months.slice(0, 11).map(m => `${m}-10`)
 for (const d of planned) await cmd('revenue', contract(d, budget.id))
 await cmd('expense', { scenario: budget.id, name: 'Tools', kind: 'recurring', department: sales.id, line: software.id, start: '2026-01', amount: '100' })
 const forecast = (await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision })).forecast
 const reality = await cmd('branch', { from: forecast.id, name: 'What actually happened' })
 for (const r of (await call(`scenario/${reality.id}`)).inputs.revenue) await cmd('revenue', contract(addDays(r.startDate, 34), reality.id, { id: r.id, name: r.name }))
 const actual = (await call(`scenario/${reality.id}`)).calculation.lineTotals[revenue.id]
 for (const month of months.slice(0, 8)) {
  const rows = ['461,100.00', ...(actual[month] ? [`400,-${(actual[month] / 100).toFixed(2)}`] : [])]
  const body = { filename: `gl-${month}.csv`, csv: `Date,Account,Department,Amount\n${rows.map(r => `${month}-28,${r.split(',')[0]},Sales,${r.split(',')[1]}`).join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
  await call('import/actuals/commit', { ...body, fingerprint: (await call('import/actuals/preview', body)).fingerprint })
  await cmd('close-month', { scenario: forecast.id, month })
 }
 const slips = [30, 38, 34, 34, 34, 30, 38, 34, 34, 34, 34]
 const deals = slips.map((d, i) => `synthetic-easel-${i + 1},Deal ${months[i]},${planned[i]},${addDays(planned[i], d)}`).join('\n')

 for (const width of [1440, 390]) {
  if (width === 390) { await finance.context.close(); finance = await session(browser, root, server.origin, 'owner', width) }
  const page = finance.page
  await page.reload(); await page.locator('h1').first().waitFor()
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
  const card = page.getByRole('region', { name: 'Forecast learning' }).or(page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Forecast learning', exact: true }) }))
  await card.first().waitFor()
  const section = card.first()
  await section.getByRole('cell', { name: /^Jan 2026/ }).waitFor()
  if (width === 1440) {
   assert.match(await section.innerText(), /No assumption is measured yet/)
   await section.getByLabel('Deal history', { exact: true }).fill(deals)
   await section.getByRole('button', { name: 'Save deal history', exact: true }).click()
  }
  await section.getByRole('heading', { name: 'Deal close-date slippage: +34 days', exact: true }).waitFor()
  assert.match(await section.innerText(), /Backtest on 8 kept forecasts: error \$[\d,]+\.\d\d now, \$[\d,]+\.\d\d with this revision; lower on 8, higher on 0/)
  assert.match(await section.innerText(), /Stage probabilities: Unavailable until REV-001/)
  await noOverflow(page, `AGENT-004 learning ${width}`)
  await section.screenshot({ path: join(evidence, `forecast-learning-${width}.png`) })
  if (width === 1440) {
   await section.getByRole('button', { name: 'Create proposal', exact: true }).click()
   await section.getByRole('status').filter({ hasText: 'Draft proposal' }).waitFor()
   const state = await call('state')
   const proposals = state.scenarios.filter(s => s.kind === 'proposal')
   assert.equal(proposals.length, 1); assert.equal(proposals[0].proposalStatus, 'draft')
   assert.equal(state.scenarios.find(s => s.id === forecast.id).revision, (await call(`scenario/${forecast.id}`)).scenario.revision)
   await section.screenshot({ path: join(evidence, 'forecast-learning-proposal-1440.png') })
  }
 }
 console.log('AGENT-004: kept-forecast error split, deal history, backtest and draft proposal at 1440/390 without overflow')
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
