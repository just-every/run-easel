// REPORT-004: native saved reports and the real Office adapter, with only the
// contract's Office.js host replaced at the external document boundary.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { api, noOverflow, track } from './browser-journey.mjs'
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-office-reports')
await mkdir(evidence, { recursive: true })
const testHost = (await build({ entryPoints: ['tests/office-browser-host.mjs'], bundle: true, write: false, platform: 'browser', format: 'iife' })).outputFiles[0].text
let browser, server
try {
 server = await builtBrowserRuntime()
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const boot = await context.request.post(`${server.origin}/auth/bootstrap`, { headers: { origin: server.origin }, data: { token: server.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const seed = { context }
 const cmd = (op, body) => api(seed.context, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Harbor Services', currency: 'USD', planStart: '2026-01' })
 const department = await cmd('department', { name: 'Operations' })
 const line = await cmd('line', { name: 'Service revenue', type: 'revenue' })
 const scenario = (await api(seed.context, server.origin, 'state')).scenarios[0].id
 const schedule = await cmd('schedule', { scenario, name: 'Customer retainers', department: department.id, line: line.id, values: { '2026-01': '24000' } })
 const report = await cmd('report-save', { name: 'Operations monthly revenue', scenario, department: department.id, audience: 'board', report: { row: 'department', period: 'month', through: '2026-03', lines: [line.id], comparisons: [], highlightBps: 1000 } })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 const setup = await context.newPage()
 await setup.goto(`${server.origin}/setup`)
 await setup.getByRole('checkbox').check()
 await setup.getByRole('button', { name: 'Finish setup' }).click()
 await setup.close()
 for (const width of [1440, 390]) {
  const p = await context.newPage(), owner = { context, page: p }; track(p); await p.setViewportSize({ width, height: 1000 })
  await p.addInitScript({ content: testHost })
  await p.goto(`${server.origin}/app?tab=reports&office=1`)
  const card = p.getByRole('region', { name: 'Linked Office reports', exact: true })
  await card.getByRole('button', { name: 'Insert linked content', exact: true }).waitFor()
  await card.getByLabel('Linked period', { exact: true }).selectOption('2026-01')
  const insertion = async kind => {
   await card.getByLabel('Linked content', { exact: true }).selectOption(kind)
   if (kind === 'number') await card.getByLabel('Linked row', { exact: true }).selectOption(department.id)
   await card.getByRole('checkbox').check()
   await card.getByRole('button', { name: 'Insert linked content', exact: true }).click()
   await card.getByRole('status').filter({ hasText: 'Linked content inserted' }).waitFor()
  }
  await insertion('table'); await insertion('number'); await insertion('chart')
  assert.equal(await p.evaluate(() => window.officeTestHost.slides[0].shapes.items.length), 3)
  assert.match(await p.evaluate(() => window.officeTestHost.slides[0].shapes.items[2].fill.image), /^[A-Za-z0-9+/]+=*$/)
  const amount = width === 1440 ? '28000' : '32000'
  await api(owner.context, server.origin, 'command/schedule', { scenario, id: schedule.id, name: 'Customer retainers', department: department.id, line: line.id, values: { '2026-01': amount } })
  await card.getByRole('button', { name: 'Refresh linked content', exact: true }).click()
  await card.getByRole('status').filter({ hasText: '3 linked objects refreshed' }).waitFor()
  const result = await p.evaluate(() => window.officeTestHost.snapshot())
  assert.equal(result.slides[0].shapes[0].values[1][1], `$${Number(amount).toLocaleString('en-US')}.00`)
  assert.equal(result.slides[0].shapes[1].text, `$${Number(amount).toLocaleString('en-US')}.00`)
  assert.doesNotMatch(JSON.stringify(result.settings), /token|secret|24000|28000|32000/)
  await noOverflow(p, `Office reports ${width}`)
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: join(evidence, `office-refreshed-${width}.png`) })
  // A browser reload/reopened document keeps identifiers and selectors only.
  await api(owner.context, server.origin, 'command/report-delete', { id: report.id, revision: report.revision })
  const unchanged = await p.evaluate(() => JSON.stringify(window.officeTestHost.snapshot()))
  await card.getByRole('button', { name: 'Refresh linked content', exact: true }).click()
  await card.getByRole('alert').filter({ hasText: /not found/i }).waitFor()
  assert.equal(await p.evaluate(() => JSON.stringify(window.officeTestHost.snapshot())), unchanged)
  await card.screenshot({ path: join(evidence, `office-unavailable-${width}.png`) })
  await p.close()
  // Recreate after the deliberate deletion for the second viewport.
  if (width === 1440) {
   const recreated = await api(context, server.origin, 'command/report-save', { name: 'Operations monthly revenue', scenario, department: department.id, audience: 'board', report: report.report })
   Object.assign(report, recreated)
  }
  console.log(`REPORT-004 ${width}: native table, number and chart insertion, in-place refresh and unavailable-source refusal passed`)
 }
} finally { await browser?.close(); await server?.close(); }
