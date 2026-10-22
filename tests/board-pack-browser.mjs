// REPORT-003: finance generates a quarter pack in the browser, refreshes it
// after a late adjustment with the commentary kept, publishes it and downloads
// the PDF, PowerPoint and Excel files, at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, command, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-board-pack')
await mkdir(evidence, { recursive: true })
const csv = (rows) => ({ filename: `gl-${Math.random().toString(36).slice(2, 8)}.csv`, csv: `Date,Account,Department,Amount\n${rows.map(([date, account, amount]) => `${date},${account},Sales,${amount}`).join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' })
let server, browser, finance
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 const load = async rows => { const body = csv(rows); await call('import/actuals/commit', { ...body, fingerprint: (await call('import/actuals/preview', body)).fingerprint }) }
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Subscription revenue', type: 'revenue' })
 const software = await cmd('line', { name: 'Software', type: 'operating-expense' })
 await cmd('account-map', { account: '400', target: revenue.id }); await cmd('account-map', { account: '461', target: software.id })
 await cmd('department-map', { source: 'Sales', department: sales.id })
 const budget = (await call('state')).scenarios[0]
 await cmd('revenue', { scenario: budget.id, name: 'Subscriptions', kind: 'volume', line: revenue.id, department: sales.id, start: '2026-01', startVolume: '10', rate: '1000', growthPercent: '0' })
 await cmd('expense', { scenario: budget.id, name: 'Tools', kind: 'recurring', line: software.id, department: sales.id, start: '2026-01', amount: '1000' })
 const forecast = (await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision })).forecast
 for (const [month, tools] of [['2026-01', '1000.00'], ['2026-02', '1800.00'], ['2026-03', '1000.00']]) { await load([[`${month}-28`, '400', '-10000.00'], [`${month}-28`, '461', tools]]); await cmd('close-month', { scenario: forecast.id, month }) }
 await cmd('explanation', { month: '2026-02', line: software.id, department: sales.id, text: 'Annual licences were paid in February.' })
 await cmd('explanation-confirm', { month: '2026-02', line: software.id, department: sales.id })

 let lateAmount = 500
 for (const width of [1440, 390]) {
  if (width === 390) { await finance.context.close(); finance = await session(browser, root, server.origin, 'owner', 390) }
  const page = finance.page
  await page.reload(); await page.locator('h1').first().waitFor()
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click(); await settle(page)
  const packs = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Review packs', exact: true }) })
  await packs.getByText('Quarter packs and templates', { exact: true }).click()
  await packs.getByLabel('Month in the quarter', { exact: true }).selectOption('2026-02')
  await packs.getByRole('button', { name: 'Start the quarter pack', exact: true }).click()
  const draft = packs.locator('.pack').filter({ has: page.getByRole('button', { name: 'Publish pack', exact: true }) })
  await draft.getByText('Quarter pack · FY2026 Q1', { exact: false }).waitFor()
  await draft.getByText('The numbers are current.', { exact: false }).waitFor()
  await draft.getByLabel('Decision or action', { exact: true }).fill(`Move annual licences to quarterly billing (${width})`)
  await draft.getByRole('button', { name: 'Record decision', exact: true }).click()
  await draft.getByText(`Move annual licences to quarterly billing (${width})`, { exact: false }).waitFor()

  // A late adjustment lands in a closed month; the pack says so and refreshes with commentary kept.
  await load([['2026-03-30', '461', `${lateAmount}.00`]]); lateAmount += 100
  await page.reload(); await page.locator('h1').first().waitFor()
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click(); await settle(page)
  await draft.getByRole('alert').getByText('The numbers moved since this pack was generated', { exact: false }).waitFor()
  await noOverflow(page, `REPORT-003 stale quarter pack ${width}`)
  await packs.screenshot({ path: join(evidence, `quarter-pack-stale-${width}.png`) })
  await draft.getByRole('button', { name: 'Refresh pack', exact: true }).click()
  await draft.getByText('Refreshed; 1 explanation kept.', { exact: false }).waitFor()
  await draft.getByRole('button', { name: 'Publish pack', exact: true }).click()
  const published = packs.locator('.pack').filter({ has: page.getByRole('link', { name: 'Download pack (PDF)' }) }).first()
  await published.waitFor()
  for (const [name, magic, file] of [['Download pack (PDF)', '%PDF-', `quarter-${width}.pdf`], ['Download pack (PowerPoint)', 'PK', `quarter-${width}.pptx`], ['Download pack (Excel)', 'PK', `quarter-${width}.xlsx`]]) {
   const download = page.waitForEvent('download')
   await published.getByRole('link', { name, exact: true }).click()
   const saved = join(evidence, file); await (await download).saveAs(saved)
   assert.equal((await readFile(saved)).subarray(0, magic.length).toString('latin1'), magic, `${file} is a real ${name}`)
  }
  assert.match((await readFile(join(evidence, `quarter-${width}.pdf`))).toString('latin1'), /Annual licences were paid in February/)
  await noOverflow(page, `REPORT-003 published quarter pack ${width}`)
  await packs.screenshot({ path: join(evidence, `quarter-pack-published-${width}.png`) })
  const state = await call('state')
  const pack = state.packs.filter(p => p.period === 'quarter' && p.status === 'published').at(-1)
  assert.equal(pack.refreshes.length, 1)
 }
 console.log('REPORT-003: quarter pack generate, late-adjustment refresh with commentary kept, publish and PDF/PowerPoint/Excel downloads at 1440/390 without overflow')
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
