// AGENT-006: the hiring manager revises and stops published actions and proposes
// decision changes, finance approves or rejects them, and finance, the manager and
// a viewer read approved against realized results, at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-decision-followup')
await mkdir(evidence, { recursive: true })
const DELAY = 'Delay the two engineering hires to July', AUGUST = `${DELAY} and review in August`, SEPTEMBER = `${DELAY} and review in September`
let server, browser, finance
const followup = async page => {
 await page.reload(); await page.locator('h1').first().waitFor()
 await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
 const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Decision follow-up', exact: true }) })
 await card.waitFor()
 return card
}
const action = (card, text) => card.getByRole('article', { name: text, exact: true })
const fill = (scope, label, value) => scope.getByLabel(label, { exact: true }).fill(value)
const press = (scope, name) => scope.getByRole('button', { name, exact: true }).click()
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(finance.context, server.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const eng = await cmd('department', { name: 'Engineering' })
 const salaries = await cmd('line', { name: 'Engineering salaries', type: 'operating-expense', payroll: true })
 const office = await cmd('line', { name: 'Office', type: 'operating-expense' })
 await cmd('member', { email: 'engineering@dev.localhost', name: 'Hiring manager', role: 'contributor', departments: [eng.id] })
 await cmd('pay-detail', { email: 'engineering@dev.localhost', granted: true })
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 const seeder = await session(browser, root, server.origin, 'engineering', 1440)
 const asManager = (path, body) => api(seeder.context, server.origin, path, body)
 const budget = (await call('state')).scenarios[0]
 const hires = { 'Platform engineer': '120000', 'Data engineer': '96000' }
 const position = (send, scenario, title, start, id) => send('command/position', { ...(id ? { id } : {}), scenario, title, department: eng.id, line: salaries.id, start, annualSalary: hires[title], onCostPercent: '0' })
 for (const title of Object.keys(hires)) await position(call, budget.id, title, '2026-05')
 await cmd('expense', { scenario: budget.id, name: 'Office rent', kind: 'recurring', line: office.id, department: eng.id, start: '2026-01', amount: '500' })
 const forecast = (await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision })).forecast.id
 await cmd('account-map', { account: '6000', target: salaries.id })
 await cmd('account-map', { account: '6100', target: office.id })
 await cmd('department-map', { source: 'Engineering', department: eng.id })
 const rows = ['01', '02', '03', '04', '05', '06', '07'].map(m => `2026-${m}-28,6100,Engineering,500,Rent`)
 rows.push('2026-05-20,6000,Engineering,2000,Contract engineer', '2026-07-31,6000,Engineering,18000,July engineering payroll')
 const ledger = { filename: 'ledger.csv', csv: `Date,Account,Department,Amount,Description\n${rows.join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 await call('import/actuals/commit', { ...ledger, fingerprint: (await call('import/actuals/preview', ledger)).fingerprint })
 await cmd('close-month', { scenario: forecast, month: '2026-01' })
 // The hiring manager's proposal delays both hires; finance promotes it, capturing its effect.
 const proposal = await asManager('command/proposal-create', { from: forecast, name: 'Delay engineering hires', request: 'Delay the two engineering hires until July' })
 for (const p of (await asManager(`scenario/${proposal.id}`)).inputs.position) await position(asManager, proposal.id, p.title, '2026-07', p.id)
 const submitted = await asManager('command/proposal-submit', { id: proposal.id })
 await cmd('proposal-promote', { id: proposal.id, revision: submitted.revision })
 await seeder.context.close()
 const pack = await cmd('pack-create', { month: '2026-01' })
 const decide = (text, due, extra = {}) => cmd('pack-decision', { pack: pack.id, text, owner: 'engineering@dev.localhost', department: eng.id, due, ...extra })
 await decide(DELAY, '2026-04-30', { proposal: proposal.id })
 await decide('Renegotiate the contractor rate', '2026-03-10')
 await decide('Review the office lease', '2026-03-20')
 const published = await cmd('pack-publish', { pack: pack.id })

 // At each width the owner revises, stops and proposes; finance approves at 1440 and rejects at 390.
 for (const [width, title, due, stop, proposed, approve] of [[1440, DELAY, '2026-05-15', 'Renegotiate the contractor rate', AUGUST, true], [390, AUGUST, '2026-05-20', 'Review the office lease', SEPTEMBER, false]]) {
  const manager = await session(browser, root, server.origin, 'engineering', width)
  try {
   const card = await followup(manager.page), item = action(card, title)
   await fill(item, 'New due date', due); await fill(item, 'Reason for the new date', `Offer letters wait for the hiring review (${width})`)
   await press(item, 'Revise due date')
   await item.getByText(`Offer letters wait for the hiring review (${width})`, { exact: false }).waitFor()
   await fill(item, 'Changed decision', proposed); await fill(item, 'Reason for the change', `Add a checkpoint (${width})`)
   await press(item, 'Propose change')
   await item.getByText('Pending change', { exact: true }).waitFor()
   const stopped = action(card, stop)
   await fill(stopped, 'Reason to stop', `No longer needed (${width})`); await press(stopped, 'Stop action')
   await stopped.getByRole('heading', { name: `${stop} · stopped`, exact: true }).waitFor()
   assert.equal(await stopped.getByRole('button', { name: 'Revise due date', exact: true }).count(), 0, 'A stopped action cannot be revised')
   assert.equal(await item.getByRole('button', { name: 'Approve change', exact: true }).count(), 0, 'Only finance decides a change')
   await noOverflow(manager.page, `AGENT-006 owner follow-up ${width}`)
   await card.screenshot({ path: join(evidence, `owner-followup-${width}.png`) })
  } finally { await manager.context.close() }
  if (width === 390) { await finance.context.close(); finance = await session(browser, root, server.origin, 'owner', width) }
  const card = await followup(finance.page), item = action(card, title)
  await item.getByText('Pending change', { exact: true }).waitFor()
  await noOverflow(finance.page, `AGENT-006 pending change ${width}`)
  await card.screenshot({ path: join(evidence, `finance-pending-change-${width}.png`) })
  if (approve) { await fill(item, 'Decision note', 'Agreed at the board'); await press(item, 'Approve change') }
  else await press(item, 'Reject change')
  const decided = action(card, approve ? proposed : title)
  await decided.getByText(approve ? 'Change approved' : 'Change rejected', { exact: false }).waitFor()
  assert.equal(await decided.getByText('Pending change', { exact: true }).count(), 0)
  await noOverflow(finance.page, `AGENT-006 decided change ${width}`)
  const view = (await api(finance.context, server.origin, 'decisions')).decisions.find(d => d.text === (approve ? proposed : title))
  assert.equal(view.due, due)
  assert.deepEqual(view.changes.map(ch => ch.status).slice(-1), [approve ? 'approved' : 'rejected'])
 }
 const snapshot = await call(`snapshot/${published.snapshot}`)
 assert.equal(snapshot.body.decisions[0].text, DELAY, 'The published pack keeps the decision as published')

 // After July closes every member reads $36,000 approved against $34,000 realized, without salaries.
 for (const month of ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) await cmd('close-month', { scenario: forecast, month })
 for (const width of [1440, 390]) for (const as of ['owner', 'engineering', 'board']) {
  const reader = as === 'owner' && width === 390 ? finance : await session(browser, root, server.origin, as, width)
  try {
   const card = await followup(reader.page), item = action(card, AUGUST)
   await item.getByText('Payroll saving:', { exact: false }).waitFor()
   assert.match(await item.innerText(), /\$36,000\.00 approved; \$34,000\.00 realized against \$36,000\.00 approved through Jul 2026/)
   const effect = item.getByRole('region', { name: `Forecast effect: ${AUGUST}`, exact: true })
   assert.match(await effect.innerText(), /May 2026\s+Payroll\s+\$18,000\.00\s+\$0\.00\s+\$2,000\.00/)
   assert.match(await effect.innerText(), /Headcount\s+2\s+0\s+Unavailable/)
   assert.doesNotMatch(await reader.page.locator('main').innerText(), /Platform engineer|Data engineer/)
   if (as === 'board') assert.equal(await card.getByRole('button', { name: 'Propose change', exact: true }).count(), 0, 'Viewers only read follow-up')
   await noOverflow(reader.page, `AGENT-006 realized results ${as} ${width}`)
   await card.screenshot({ path: join(evidence, `realized-${as}-${width}.png`) })
  } finally { if (reader !== finance) await reader.context.close() }
 }
 const board = await session(browser, root, server.origin, 'board', 390)
 try {
  const view = await api(board.context, server.origin, 'decisions')
  assert.equal(view.decisions.find(d => d.text === AUGUST).outcome.payrollSaving.realized, 3400000)
  assert.doesNotMatch(JSON.stringify(view), /Platform engineer|Data engineer|annualSalary/)
 } finally { await board.context.close() }
 console.log('AGENT-006: owner revisions, stops and proposed changes, finance decisions and realized payroll saving at 1440/390 without overflow')
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
