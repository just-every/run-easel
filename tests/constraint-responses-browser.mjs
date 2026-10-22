// AGENT-002: finance reads the decision item a promoted change opened, marks a
// lever adjustable, asks for responses and rejects them all with a reason, at
// desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, command, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-constraints')
await mkdir(evidence, { recursive: true })
let server, browser, finance
const open = async page => {
 await page.reload(); await page.locator('h1').first().waitFor()
 await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click(); await settle(page)
 const card = page.getByLabel('Constraint watch'); await card.waitFor(); return card
}
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 await cmd('workspace', { name: 'Constraint Co', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const revenue = await cmd('line', { name: 'Consulting', type: 'revenue' }), payroll = await cmd('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const software = await cmd('line', { name: 'Software', type: 'operating-expense' }), marketing = await cmd('line', { name: 'Marketing', type: 'operating-expense' })
 const budget = (await call('state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '200000', collectionLag: 0, paymentLag: 0 })
 await cmd('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: sales.id, line: revenue.id, start: '2026-01', startVolume: '10', rate: '5000', growthPercent: '0', collectionLag: 0 })
 const recurring = (name, line) => cmd('expense', { scenario: budget.id, name, kind: 'recurring', department: sales.id, line: line.id, start: '2026-01', amount: '10000' })
 const sw = await recurring('Software', software), mk = await recurring('Marketing', marketing)
 await cmd('expense', { scenario: budget.id, name: 'Conference', kind: 'one-off', department: sales.id, line: marketing.id, start: '2026-06', amount: '30000' })
 const hires = []
 for (const [title, start] of [['Account executive A', '2026-05'], ['Account executive B', '2026-06'], ['Account executive C', '2026-07']]) hires.push(await cmd('position', { scenario: budget.id, title, holder: `Private ${title}`, department: sales.id, line: payroll.id, start, annualSalary: '240000', onCostPercent: '0' }))
 const forecast = (await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision })).forecast
 await cmd('cash-constraints', { floor: '100000', runwayMinimum: '0' })
 const proposal = await cmd('proposal-create', { from: forecast.id, name: 'Hire earlier', request: 'Start the three account executives earlier' })
 for (const row of (await call(`scenario/${proposal.id}`)).inputs.position) await cmd('position', { scenario: proposal.id, id: row.id, title: row.title, holder: row.holder, department: sales.id, line: payroll.id, start: { 'Account executive A': '2026-03', 'Account executive B': '2026-04', 'Account executive C': '2026-05' }[row.title], annualSalary: '240000', onCostPercent: '0' })
 const submitted = await cmd('proposal-submit', { id: proposal.id }); await cmd('proposal-promote', { id: proposal.id, revision: submitted.revision })
 for (const [kind, origin, max] of [['spend-cut', sw.originId, 50], ['spend-cut', mk.originId, 50], ['hire-start', hires[1].originId, 8]]) await cmd('lever-save', { kind, scenario: forecast.id, origin, max })

 {
  const card = await open(finance.page)
  const item = card.getByLabel('Decision item cash-floor')
  await item.getByText('Forecast cash falls below the $100,000.00 floor in Sep 2026', { exact: false }).waitFor()
  await item.getByText('Account executive A · changed', { exact: false }).waitFor()
  // Mark the first hire adjustable in the form.
  await card.getByLabel('Input', { exact: true }).selectOption({ label: 'Account executive A (starts Mar 2026)' })
  await card.getByLabel('Largest change', { exact: true }).fill('8')
  await card.getByRole('button', { name: 'Mark adjustable', exact: true }).click()
  await card.getByText('Account executive A · up to 8 months', { exact: false }).waitFor()
  await item.getByRole('button', { name: 'Find responses', exact: true }).click()
  await item.getByText('Draft proposals bound to forecast revision', { exact: false }).waitFor()
  const lines = await item.locator('ul.plain li').allInnerTexts()
  assert.ok(lines.filter(t => /lowest cash/.test(t)).length >= 3, `three or more responses: ${lines.join(' | ')}`)
  assert.equal(await item.getByRole('button', { name: 'Find responses', exact: true }).count(), 0)
  await noOverflow(finance.page, 'AGENT-002 responses 1440')
  await card.screenshot({ path: join(evidence, 'constraint-watch-1440.png') })
 }
 await finance.context.close(); finance = await session(browser, root, server.origin, 'owner', 390)
 {
  const card = await open(finance.page), item = card.getByLabel('Decision item cash-floor')
  await item.getByText('lowest cash', { exact: false }).first().waitFor()
  await noOverflow(finance.page, 'AGENT-002 responses 390')
  await card.screenshot({ path: join(evidence, 'constraint-watch-390.png') })
  await item.getByLabel('Reason for rejecting every response', { exact: true }).fill('The board will raise money instead.')
  await item.getByRole('button', { name: 'Reject every response', exact: true }).click()
  await item.getByText('Cash floor · rejected', { exact: false }).waitFor()
  const items = (await call('constraints')).items
  assert.equal(items.find(i => i.constraint === 'cash-floor').status, 'rejected')
  assert.ok((await call('state')).scenarios.filter(s => s.kind === 'proposal' && s.proposalStatus === 'declined').length >= 3, 'rejecting closes every draft response')
  await noOverflow(finance.page, 'AGENT-002 rejected 390')
 }
 console.log('AGENT-002: decision item, lever marking, three recalculated responses and rejection at 1440/390 without overflow')
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
