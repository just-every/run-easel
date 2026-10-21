// AGENT-007: real Review entry, human confirmation and immutable published HTML at 1440/390.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/variance-commentary')
await mkdir(evidence, { recursive: true })
const root = await fresh()
let server, browser, finance
const settle = page => page.waitForLoadState('networkidle')
try {
 server = await start(root, await freePort())
 // Finish native setup before Chromium creates sandboxed helper processes.
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const { page, context } = finance
 const call = (path, body) => api(context, server.origin, path, body)
 const cmd = (op, body) => call(`command/${op}`, body)
 await page.getByLabel('Company name', { exact: true }).fill('Commentary review')
 await page.getByLabel('First plan month', { exact: true }).fill('2026-01')
 await page.getByRole('button', { name: 'Create the plan', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const dept = await cmd('department', { name: 'Engineering' })
 const expense = await cmd('line', { name: 'Cloud', type: 'operating-expense' })
 const budget = (await call('state')).scenarios[0]
 await cmd('expense', { scenario: budget.id, name: 'Cloud hosting', department: dept.id, line: expense.id, kind: 'recurring', start: '2026-01', amount: '1000' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision })
 await cmd('account-map', { account: '500', target: expense.id })
 await cmd('department-map', { source: 'Engineering', department: dept.id })
 const body = { filename: 'compute.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,500,Engineering,1300\n2026-02-28,500,Engineering,1400\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await call('import/actuals/preview', body)
 await call('import/actuals/commit', { ...body, fingerprint: preview.fingerprint })
 for (const month of ['2026-01', '2026-02']) await cmd('close-month', { scenario: approved.forecast.id, month })
 const shoot = async (name, target = page) => { await settle(target); await noOverflow(target, `AGENT-007 ${name}`); await target.screenshot({ path: join(evidence, `${name}.png`), fullPage: true }) }
 const action = async (op, name) => {
  const pending = page.waitForResponse(r => r.url().endsWith(`/command/${op}`) && r.request().method() === 'POST')
  await page.getByRole('button', { name, exact: true }).click()
  const response = await pending; assert.equal(response.status(), 200, await response.text())
  await settle(page); return response.json()
 }
 const download = async (pack, name) => {
  const card = page.locator('div.pack').filter({ has: page.locator(`a[href="/api/easel/pack/${pack}/document.html"]`) })
  const pending = page.waitForEvent('download')
  await card.getByRole('link', { name: 'Download pack (HTML)', exact: true }).click()
  const file = join(evidence, `${name}.html`); await (await pending).saveAs(file)
  return file
 }
 for (const [width, month, label] of [[1440, '2026-01', 'Jan 2026'], [390, '2026-02', 'Feb 2026']]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.reload(); await page.getByRole('navigation', { name: 'Easel' }).waitFor()
  await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByLabel('Month', { exact: true }).selectOption(month); await settle(page)
  const detail = page.locator('details.card-row').filter({ has: page.getByText('Cloud', { exact: true }) })
  const openDetail = async () => { await detail.waitFor(); if ((await detail.getAttribute('open')) === null) await detail.locator('summary').click() }
  await openDetail()
  const narrative = `Unconfirmed capacity hypothesis ${width}`
  await detail.getByLabel('Explanation for Cloud · Engineering', { exact: true }).fill(narrative)
  await action('explanation', 'Save explanation')
  await detail.getByText('Explanation (draft):', { exact: true }).waitFor({ state: 'attached' })
  await openDetail()
  await detail.getByText('Explanation (draft):', { exact: true }).waitFor()
  await shoot(`draft-review-${width}`)
  const draftPack = await action('pack-create', `Start the ${label} pack`)
  const published = await action('pack-publish', 'Publish pack')
  assert.equal(published.id, draftPack.id)
  const file = await download(published.id, `draft-excluded-${width}`)
  assert.ok(!(await readFile(file, 'utf8')).includes(narrative))
  const rendered = await context.newPage()
  await rendered.setViewportSize({ width, height: 1000 })
  await rendered.goto(pathToFileURL(file).href)
  assert.equal(await rendered.getByText(narrative, { exact: true }).count(), 0)
  await rendered.getByRole('cell', { name: 'No explanation recorded', exact: true }).scrollIntoViewIfNeeded()
  await shoot(`published-draft-excluded-${width}`, rendered); await rendered.close()
  await openDetail()
  await action('explanation-confirm', 'Confirm explanation')
  await detail.getByText(/Explanation \(confirmed/).waitFor({ state: 'attached' })
  await openDetail()
  await detail.getByText(/Explanation \(confirmed/).waitFor()
  await shoot(`confirmed-review-${width}`)
  await action('pack-create', `Start the ${label} pack`)
  const second = await action('pack-publish', 'Publish pack')
  const secondFile = await download(second.id, `confirmed-included-${width}`)
  assert.ok((await readFile(secondFile, 'utf8')).includes(narrative))
  assert.ok(!(await readFile(file, 'utf8')).includes(narrative), 'Earlier immutable pack remains draft-free')
  const visible = await context.newPage(); await visible.setViewportSize({ width, height: 1000 }); await visible.goto(pathToFileURL(secondFile).href)
  await visible.getByText(new RegExp(narrative)).waitFor()
  await visible.getByText(new RegExp(narrative)).scrollIntoViewIfNeeded()
  await shoot(`published-confirmed-${width}`, visible); await visible.close()
 }
 console.log('AGENT-007: native draft/save/publish/confirm and immutable HTML downloads passed at 1440 and 390 without overflow')
} finally {
 await finance?.context.close(); await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true })
}
