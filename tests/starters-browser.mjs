// MODEL-006: create each company from its starter through the native app.
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { command, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-starters')
await mkdir(evidence, { recursive: true })
const excluded = new Set(['.git','node_modules','.rer','.seed','.wrangler','.cache','.tanstack','dist','.output','exports','test-results'])
async function workingInstallation() {
 const root = await mkdtemp(join(tmpdir(), 'easel-starter-'))
 for (const name of await readdir(process.cwd())) {
  if (excluded.has(name) || name.startsWith('.dev.vars') || name.startsWith('.env') || name.endsWith('.tsbuildinfo')) continue
  await cp(join(process.cwd(), name), join(root, name), { recursive: true })
 }
 return root
}
const money = n => `$${Math.abs(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const settle = page => page.waitForLoadState('networkidle')
async function tab(page, name) { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click(); await settle(page) }
async function shoot(page, target, name) { await settle(page); await noOverflow(page, `MODEL-006 ${name}`); await target.screenshot({ path: join(evidence, `${name}.png`) }) }
const browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain','--password-store=basic'] })
try {
 const only = process.argv.find(arg => arg.startsWith('--starter='))?.split('=')[1]
 for (const starter of ['saas','services','project','wholesale'].filter(id => !only || id === only)) {
  const root = await workingInstallation()
  let server, finance
  try {
   const port = await freePort(); await command(root, ['setup','--owner-email','owner@example.test','--port',String(port)]); server = await start(root, port)
   finance = await session(browser, root, server.origin, 'owner', 1440)
   const page = finance.page, call = (path, body) => api(finance.context, server.origin, path, body)
   await page.getByLabel('Starting model', { exact: true }).selectOption(starter)
   await page.getByLabel('Company name', { exact: true }).fill(`Ridgeline ${starter}`)
   await page.getByLabel('First plan month', { exact: true }).fill('2025-01')
   for (const width of [1440,390]) { await page.setViewportSize({ width, height: 1000 }); await shoot(page, page.locator('section.setup-plan'), `${starter}-setup-${width}`) }
   await page.setViewportSize({ width: 1440, height: 1000 })
   const response = page.waitForResponse(r => r.url().endsWith('/command/starter-model') && r.request().method() === 'POST')
   await page.getByRole('button', { name: 'Create the plan', exact: true }).click()
   const created = await response; assert.equal(created.status(), 200, await created.text())
   const result = await created.json(), scenario = result.scenario.id
   await page.getByRole('navigation', { name: 'Easel' }).waitFor(); await settle(page)
   let view = await call(`scenario/${scenario}`)
   assert.equal(view.workspace.currency, 'USD')
   for (const width of [1440,390]) {
    await page.setViewportSize({ width, height: 1000 }); await tab(page, 'Overview')
    await page.getByRole('table', { name: 'Profit and loss by month', exact: true }).waitFor()
    assert.ok(view.calculation.profit[0].revenue > 0)
    for (const heading of ['Profit and loss','Cash','Balance sheet','Indirect cash flow']) {
     await card(page, heading).getByRole('heading', { name: heading, exact: true }).waitFor()
     await shoot(page, card(page, heading), `${starter}-${heading.replaceAll(' ','-').toLowerCase()}-${width}`)
    }
    const balances = card(page,'Balance sheet').getByRole('button', { name: /reconciliation for.*Balanced/ })
    assert.equal(await balances.count(), 12)
    const cash = page.getByRole('table', { name: 'Monthly cash', exact: true }).getByRole('row').filter({ has: page.getByRole('cell', { name: 'Closing', exact: true }) })
    assert.ok((await cash.innerText()).includes(money(view.calculation.cash[0].closing)))
    const traceInput = starter === 'services' ? view.inputs.revenue.find(r => r.kind === 'services') : starter === 'project' ? view.inputs.revenue.find(r => r.kind === 'milestones') : starter === 'wholesale' ? view.inputs.expense.find(e => e.kind === 'inventory') : view.inputs.expense.find(e => e.kind === 'acquisition')
    const line = view.lines.find(l => l.id === traceInput.line)
    await page.getByRole('button', { name: `${line.name} Jan 2025: how it was calculated`, exact: true }).click()
    const trace = page.locator('.trace-panel')
    const text = await trace.innerText()
    assert.match(text, starter === 'services' ? /3 active positions.*160\.00.*75\.00%.*\$150\.00/s : starter === 'project' ? /milestone Kickoff/s : starter === 'wholesale' ? /45 inventory days ÷ 31 calendar days/s : /new customers 10\.00.*CAC \$500\.00/s)
    await shoot(page, trace, `${starter}-trace-${width}`)
    await trace.getByRole('button', { name: 'Close', exact: true }).click()
    if (starter === 'project') {
     const backlog = view.inputs.revenue.find(r => r.kind === 'backlog'), line = view.lines.find(l => l.id === backlog.line)
     await page.getByRole('button', { name: `${line.name} Jan 2025: how it was calculated`, exact: true }).click()
     assert.match(await page.locator('.trace-panel').innerText(), /opening backlog.*additions.*20\.00%/s)
     await shoot(page, page.locator('.trace-panel'), `${starter}-backlog-trace-${width}`)
     await page.locator('.trace-panel').getByRole('button', { name: 'Close', exact: true }).click()
    }
    await tab(page, 'Dashboards')
    await page.getByRole('heading', { name: 'Revenue', exact: true }).waitFor()
    await shoot(page, page.locator('main'), `${starter}-dashboard-${width}`)
    await tab(page,'Plan')
    await page.getByRole('table', { name: 'Revenue models', exact: true }).waitFor()
    await shoot(page, card(page,'Revenue drivers'), `${starter}-drivers-${width}`)
    const dimensionReport = await call(`dimension-report/${scenario}`)
    const dimCard = card(page, 'Dimension planning and reports')
    await dimCard.getByRole('table', { name: 'Dimension rollups', exact: true }).waitFor()
    const rootMember = dimensionReport.dimensions[0].members.find(m => m.rollup)
    for (const line of view.lines) for (const month of view.calculation.months) assert.equal(rootMember.lineTotals[line.id]?.[month] ?? 0, view.calculation.lineTotals[line.id]?.[month] ?? 0)
    const rollupRow = dimCard.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(rootMember.name) }) })
    assert.ok((await rollupRow.innerText()).includes(money(rootMember.amounts[view.calculation.months[0]])))
    await shoot(page, dimCard, `${starter}-dimensions-${width}`)
    const grid = card(page, 'Planning grid')
    await grid.getByText('Calculated cells and their traces (read-only)', { exact: true }).click()
    const dimension = dimensionReport.dimensions[0], leaf = dimension.members.find(m => m.parent && !m.rollup && Object.values(m.amounts).some(amount => amount !== 0))
    const calculated = grid.getByRole('table', { name: 'Read-only calculated planning cells', exact: true })
    const firstLine = view.lines.find(line => dimensionReport.lineTotals[line.id]?.[view.calculation.months[0]])
    const gridRow = calculated.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(firstLine.name) }) }).first()
    assert.ok((await gridRow.innerText()).includes(`${dimension.name}: ${leaf.name}`))
    const sourceCell = view.calculation.cells.find(cell => cell.line === firstLine.id && cell.month === view.calculation.months[0])
    assert.ok((await gridRow.innerText()).includes(money(sourceCell.amount)))
    await shoot(page, grid, `${starter}-dimension-grid-${width}`)
    await grid.getByText('Calculated cells and their traces (read-only)', { exact: true }).click()

    if (['saas','wholesale'].includes(starter)) {
     const expense = view.inputs.expense.find(e => e.kind === (starter === 'saas' ? 'acquisition' : 'inventory'))
     const row = card(page,'Expenses').getByRole('row').filter({ has: page.getByRole('cell', { name: expense.name, exact: true }) })
     await row.getByRole('button', { name: 'Edit', exact: true }).click()
     const form = card(page,'Expenses').locator('form')
     await form.getByLabel(starter === 'saas' ? 'Acquisition cost per new customer' : 'Inventory days', { exact: true }).waitFor()
     await shoot(page, card(page,'Expenses'), `${starter}-cost-editor-${width}`)
    }
    console.log(`MODEL-006 ${starter} ${width}: setup, three statements, cash, dashboard, live drivers and exact traces passed`)
   }
   if (['saas','wholesale'].includes(starter)) {
    const form = card(page,'Expenses').locator('form'), label = starter === 'saas' ? 'Acquisition cost per new customer' : 'Inventory days'
    await form.getByLabel(label, { exact: true }).fill(starter === 'saas' ? '600' : '0')
    const response = page.waitForResponse(r => r.url().endsWith('/command/expense') && r.request().method() === 'POST')
    await form.getByRole('button', { name: starter === 'saas' ? 'Save acquisition assumptions' : 'Save inventory assumptions', exact: true }).click()
    const saved = await response; assert.equal(saved.status(), 200, await saved.text()); await settle(page)
    const changed = await call(`scenario/${scenario}`)
    if (starter === 'saas') assert.equal(changed.inputs.expense.find(e => e.kind === 'acquisition').cacCents, 60000)
    else { assert.equal(changed.calculation.balanceSheet[0].inventory, 0); assert.equal(changed.calculation.cash[1].closing - view.calculation.cash[1].closing, 6532258) }
    await tab(page,'Overview'); await page.getByRole('table', { name:'Balance sheet by month',exact:true }).waitFor()
    for (const width of [1440,390]) { await page.setViewportSize({width,height:1000}); await shoot(page,card(page,'Balance sheet'),`${starter}-edited-balance-${width}`); await shoot(page,card(page,'Cash'),`${starter}-edited-cash-${width}`) }
   }
  } catch (error) { if (finance?.page && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence,`${starter}-failed.png`),fullPage:true }).catch(()=>{}); throw error }
  finally { await finance?.context.close(); await server?.close(); await rm(root,{recursive:true,force:true}) }
 }
} finally { await browser.close() }
