// REPORT-007: finance and a board reader open a saved report's BI dataset in
// the browser, download its CSV and Parquet files, and finance sees the
// warehouse metrics and drop controls, at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, command, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
import { readParquet } from './parquet-reader.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-bi-feeds')
await mkdir(evidence, { recursive: true })
let server, browser, finance
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Platform usage', type: 'revenue' })
 const payroll = await cmd('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 const budget = (await call('state')).scenarios[0]
 await cmd('position', { scenario: budget.id, title: 'Private principal engineer', holder: 'Private Person', department: sales.id, line: payroll.id, start: '2026-01', annualSalary: '120000', onCostPercent: '0' })
 await cmd('revenue', { scenario: budget.id, name: 'Active users', kind: 'usage', line: revenue.id, department: sales.id, start: '2026-01', startUsage: '1000', growthPercent: '10', unitPrice: '2', warehouseMetric: 'active_users', collectionLag: 0 })
 await cmd('dashboard-save', { name: 'Board feed', scenario: budget.id, audience: 'board', department: '', widgets: [{ metric: 'revenue', display: 'table' }], report: { row: 'line', period: 'month', through: '2026-03', lines: [revenue.id, payroll.id], comparisons: [], highlightBps: 1000 } })

 for (const [as, width] of [['owner', 1440], ['board', 1440], ['owner', 390], ['board', 390]]) {
  const who = await session(browser, root, server.origin, as, width)
  try {
   const page = who.page
   await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Reports', exact: true }).click(); await settle(page)
   const feed = page.getByLabel('BI dataset')
   await feed.waitFor()
   assert.match(await feed.innerText(), /one row per report row, month and series/i)
   for (const [name, file, magic] of [['Download dataset (CSV)', `dataset-${as}-${width}.csv`, 'row_id,'], ['Download dataset (Parquet)', `dataset-${as}-${width}.parquet`, 'PAR1']]) {
    const download = page.waitForEvent('download')
    await feed.getByRole('link', { name, exact: true }).click()
    const saved = join(evidence, file); await (await download).saveAs(saved)
    const bytes = await readFile(saved)
    assert.equal(bytes.subarray(0, magic.length).toString('latin1'), magic)
    assert.doesNotMatch(bytes.toString('latin1'), /Private principal engineer|Private Person|annualSalary/)
    if (file.endsWith('.parquet')) assert.ok(readParquet(new Uint8Array(bytes)).rows.length >= 6)
   }
   if (as === 'owner') {
    assert.ok(await feed.getByText('Connect Chest, Google Drive or SharePoint', { exact: false }).count() > 0, 'finance is told how to enable drops')
    await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Settings', exact: true }).click(); await settle(page)
    const card = page.getByLabel('Warehouse metrics')
    await card.waitFor()
    for (const name of ['Connect Snowflake', 'Connect BigQuery', 'Connect Databricks']) await card.getByRole('button', { name, exact: true }).waitFor()
    await noOverflow(page, `REPORT-007 warehouse ${width}`)
    await card.screenshot({ path: join(evidence, `warehouse-${width}.png`) })
   } else assert.equal(await feed.getByRole('heading', { name: 'Nightly drops' }).count(), 0, 'readers never see drop controls')
   await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Reports', exact: true }).click(); await settle(page)
   await noOverflow(page, `REPORT-007 BI dataset ${as} ${width}`)
   await page.getByLabel('BI dataset').screenshot({ path: join(evidence, `bi-dataset-${as}-${width}.png`) })
  } finally { await who.context.close() }
 }
 console.log('REPORT-007: BI dataset downloads, warehouse metric controls and drop controls at 1440/390 without overflow')
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
