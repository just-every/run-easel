// REV-004: contract entry/edit, linked statements, exact dates and formula Excel.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '../screens-rev004')
await mkdir(evidence, { recursive: true })
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(owner.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Contract Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Delivery' })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 const budget = (await api(owner.context, server.origin, 'state')).scenarios[0]
 await cmd('cash-constraints', { floor: '100000', runwayMinimum: '6' })
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '250000' })
 await owner.context.close()
 const createdLines = []
 const amount = n => `USD ${Math.floor(n / 100).toLocaleString('en-US')}.${String(n % 100).padStart(2, '0')}`
 for (const width of [1440, 390]) {
  const finance = await session(browser, root, server.origin, 'owner', width), page = finance.page
  const line = await api(finance.context, server.origin, 'command/line', { name: `Contract ${width}`, type: 'revenue' }); createdLines.push(line)
  try {
   await page.reload(); await nav(page, 'Plan')
   await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id)
   const models = card(page, 'Revenue drivers')
   await models.getByLabel('Driver', { exact: true }).selectOption('contract')
   for (const [label, value] of [['Revenue model name', `Private annual agreement ${width}`], ['Start month', '2026-01'], ['Contract start date', '2026-01-01'], ['Total contract value', '120000'], ['Contract term (months)', '12'], ['DSO (days)', '45']]) await models.getByLabel(label, { exact: true }).fill(value)
   await models.getByLabel('Revenue line', { exact: true }).selectOption(line.id)
   await models.getByLabel('Department', { exact: true }).selectOption(dept.id)
   await models.getByLabel('Upfront billing cadence', { exact: true }).selectOption('annual')
   await noOverflow(page, `REV-004 form ${width}`)
   await models.locator('form').screenshot({ path: join(evidence, `contract-form-${width}.png`) })
   await models.getByRole('button', { name: 'Add revenue model', exact: true }).click()
   const row = models.getByRole('row').filter({ has: page.getByRole('cell', { name: `Private annual agreement ${width}`, exact: true }) })
   await row.waitFor()
   const annual = await api(finance.context, server.origin, `scenario/${budget.id}`)
   const own = annual.calculation.contracts.rows.filter(r => r.line === line.id)
   assert.equal(own[0].billings, 12000000); assert.equal(own[0].revenue, 1000000); assert.equal(own[0].deferredRevenue, 11000000)
   assert.equal(own[1].collections, 12000000)
   await row.getByRole('button', { name: 'Edit', exact: true }).click()
   assert.equal(await models.getByLabel('Contract start date', { exact: true }).inputValue(), '2026-01-01')
   for (const cadence of ['monthly', 'quarterly', 'annual']) {
    await models.getByLabel('Upfront billing cadence', { exact: true }).selectOption(cadence)
    await models.getByRole('button', { name: 'Save revenue model', exact: true }).click()
    await models.getByRole('button', { name: 'Add revenue model', exact: true }).waitFor()
    const calc = (await api(finance.context, server.origin, `scenario/${budget.id}`)).calculation
    assert.equal(calc.contracts.rows.find(r => r.line === line.id && r.month === '2026-01').billings, { monthly: 1000000, quarterly: 3000000, annual: 12000000 }[cadence])
    if (cadence !== 'annual') await row.getByRole('button', { name: 'Edit', exact: true }).click()
   }
   await nav(page, 'Overview'); await page.getByLabel('Scenario', { exact: true }).selectOption(budget.id)
   const contracts = card(page, 'Bookings, billings, revenue and collections')
   await contracts.getByRole('table', { name: 'Contract flows by month', exact: true }).waitFor()
   const current = await api(finance.context, server.origin, `scenario/${budget.id}`)
   const jan = contracts.getByRole('table', { name: 'Contract flows by month', exact: true }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Jan 2026', exact: true }) })
   assert.deepEqual(await jan.getByRole('cell').allInnerTexts(), ['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue', 'unbilledRevenue'].map(k => amount(current.calculation.contracts.months[0][k])))
   const invoice = contracts.getByRole('table', { name: 'Contract invoice dates', exact: true }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: `Private annual agreement ${width}`, exact: true }) })
   assert.deepEqual(await invoice.getByRole('cell').allInnerTexts(), ['2026-01-01', '2026-02-15', 'USD 120,000.00'])
   await contracts.screenshot({ path: join(evidence, `contract-flows-${width}.png`) }); await noOverflow(page, `REV-004 ledger ${width}`)
   for (const [heading, field, labels] of [['Balance sheet', 'balanceSheet', [['Deferred revenue', 'deferredRevenue'], ['Receivables', 'receivables']]], ['Indirect cash flow', 'cashFlow', [['Deferred revenue change', 'deferredRevenueChange'], ['Closing cash', 'closing']]]]) {
    const section = card(page, heading)
    for (const [label, key] of labels) assert.deepEqual(await section.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).getByRole('cell').allInnerTexts(), current.calculation[field].map(r => r[key] < 0 ? '-' + amount(-r[key]) : amount(r[key])))
    await section.getByRole('button', { name: `${heading} reconciliation for Jan 2026: Balanced`, exact: true }).click()
    await section.screenshot({ path: join(evidence, `${field}-${width}.png`) }); await noOverflow(page, `REV-004 ${heading} ${width}`)
   }
   await page.getByRole('button', { name: `Contract ${width} Jan 2026: how it was calculated`, exact: true }).click()
   const trace = page.getByRole('region', { name: `Contract ${width}, Jan 2026`, exact: true })
   assert.match(await trace.innerText(), /2026-01-01.*12 service months.*45 exact calendar days/)
   await trace.screenshot({ path: join(evidence, `contract-trace-${width}.png`) }); await trace.getByRole('button', { name: 'Close', exact: true }).click()
   const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download Excel', exact: true }).click()])
   assert.equal(await download.failure(), null)
   const book = await readWorkbook(await readFile(await download.path())); proveFormulas(book)
   assert.equal(book.getWorksheet('Contracts').getCell('C3').value, current.calculation.contracts.months[0].billings)
   const proposal = await api(finance.context, server.origin, 'command/proposal-create', { from: budget.id, name: `Contract terms ${width}`, request: 'Review a longer quarterly contract' })
   const proposed = (await api(finance.context, server.origin, `scenario/${proposal.id}`)).inputs.revenue.find(r => r.line === line.id)
   await api(finance.context, server.origin, 'command/revenue', { scenario: proposal.id, id: proposed.id, name: proposed.name, kind: 'contract', line: line.id, department: dept.id, start: '2026-01', startDate: '2026-01-15', termMonths: '18', contractValue: '180000', billingCadence: 'quarterly', dsoDays: '30' })
   await page.reload(); await nav(page, 'Scenarios')
   await page.getByLabel('From', { exact: true }).selectOption(budget.id)
   await page.getByLabel('To', { exact: true }).selectOption(proposal.id)
   const comparison = page.getByText(new RegExp(`Changed revenue: Private annual agreement ${width}`))
   await comparison.waitFor()
   const diff = await comparison.innerText()
   for (const text of ['contract start date', 'total contract value', 'contract term', 'upfront billing cadence', 'DSO']) assert.ok(diff.includes(text), `readable ${text} diff`)
   await card(page, 'Compare').screenshot({ path: join(evidence, `contract-compare-${width}.png`) })
   await noOverflow(page, `REV-004 Compare ${width}`)
   console.log(`REV-004 ${width}: contract form, three cadences, exact DSO dates, deferred release, linked statements, trace and formula Excel passed`)
  } finally { await finance.context.close() }
  const viewer = await session(browser, root, server.origin, 'board', width)
  try {
   await nav(viewer.page, 'Overview')
   const view = await api(viewer.context, server.origin, `scenario/${budget.id}`)
   assert.equal(view.calculation.contracts.invoices.length, 0)
   assert.equal(view.calculation.contracts.rows.length, 0)
   assert.doesNotMatch(JSON.stringify(view), /Private annual agreement|contractValueCents/)
   await card(viewer.page, 'Bookings, billings, revenue and collections').screenshot({ path: join(evidence, `contract-viewer-${width}.png`) })
   await noOverflow(viewer.page, `REV-004 viewer ${width}`)
  } finally { await viewer.context.close() }
 }
 const publisher = await session(browser, root, server.origin, 'owner', 1440)
 try {
  const send = (op, body) => api(publisher.context, server.origin, `command/${op}`, body)
  const current = await api(publisher.context, server.origin, `scenario/${budget.id}`)
  const approved = await send('approve-budget', { scenario: budget.id, revision: current.scenario.revision })
  for (let i = 0; i < createdLines.length; i++) await send('account-map', { account: String(400 + i), target: createdLines[i].id })
  await send('department-map', { source: 'Delivery', department: dept.id })
  const actuals = { filename: 'january-contracts.csv', csv: 'Date,Account,Department,Amount\n' + createdLines.map((_, i) => `2026-01-31,${400 + i},Delivery,-${i === 0 ? 9000 : 10000}\n`).join(''), columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
  const preview = await api(publisher.context, server.origin, 'import/actuals/preview', actuals)
  await api(publisher.context, server.origin, 'import/actuals/commit', { ...actuals, fingerprint: preview.fingerprint })
  await send('close-month', { scenario: approved.forecast.id, month: '2026-01' })
  for (const width of [1440, 390]) {
   const finance = await session(browser, root, server.origin, 'owner', width)
   try {
    await nav(finance.page, 'Overview'); await finance.page.getByLabel('Scenario', { exact: true }).selectOption(approved.forecast.id)
    const health = card(finance.page, 'Cash health')
    await health.getByRole('status').waitFor()
    await health.screenshot({ path: join(evidence, `contract-incomplete-health-${width}.png`) })
    for (const heading of ['Balance sheet', 'Indirect cash flow']) {
     const section = card(finance.page, heading)
     await section.getByRole('button', { name: `${heading} reconciliation for Jan 2026: Incomplete`, exact: true }).click()
     assert.match(await section.getByRole('status').innerText(), /Incomplete/)
     await section.screenshot({ path: join(evidence, `contract-incomplete-${heading === 'Balance sheet' ? 'balance' : 'cash-flow'}-${width}.png`) })
    }
    await noOverflow(finance.page, `REV-004 incomplete reconciliation ${width}`)
   } finally { await finance.context.close() }
  }
  const pack = await send('pack-create', { forecast: approved.forecast.id, month: '2026-01', title: 'Contract review' })
  await send('pack-publish', { pack: pack.id })
  const response = await publisher.context.request.get(`${server.origin}/api/easel/pack/${pack.id}/document.html`)
  assert.equal(response.status(), 200)
  const html = await response.text()
  assert.doesNotMatch(html, /Private annual agreement/)
  for (const width of [1440, 390]) {
   const context = await browser.newContext({ viewport: { width, height: 1000 } })
   try {
    // The real downloaded printable artifact, rendered in a fresh browser document.
    const page = await context.newPage(); await page.setContent(html)
    for (const heading of ['Bookings, billings, revenue and collections', 'Balance sheet', 'Indirect cash flow']) await page.getByRole('heading', { name: heading, exact: true }).waitFor()
    for (const [heading, name] of [['Bookings, billings, revenue and collections', 'contracts'], ['Balance sheet', 'balance'], ['Indirect cash flow', 'cash-flow']]) {
     await page.getByRole('heading', { name: heading, exact: true }).scrollIntoViewIfNeeded()
     await page.screenshot({ path: join(evidence, `contract-pack-${name}-${width}.png`) })
     await noOverflow(page, `REV-004 published ${heading} ${width}`)
    }
   } finally { await context.close() }
  }
 } finally { await publisher.context.close() }
} finally { await browser?.close(); await server?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
