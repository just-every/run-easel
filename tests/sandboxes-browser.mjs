// CYCLE-004: real native planner/viewer/finance sessions and rendered public doors.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/sandboxes')
await mkdir(evidence, { recursive: true })
let server, browser
const card = (page, name) => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const shot = async (page, scope, name) => { await scope.scrollIntoViewIfNeeded(); await noOverflow(page, `CYCLE-004 ${name}`); await scope.screenshot({ path: join(evidence, `${name}.png`) }) }
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(owner.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Cardinal Advisory', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Client services' }), eng = await cmd('department', { name: 'Product' })
 const revenue = await cmd('line', { name: 'Client retainers', type: 'revenue' }), payroll = await cmd('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 const budget = (await api(owner.context, server.origin, 'state')).scenarios[0]
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '150000' })
 await cmd('revenue', { scenario: budget.id, name: 'Monthly retainers', line: revenue.id, department: sales.id, kind: 'volume', start: '2026-01', startVolume: '10', rate: '1000' })
 await cmd('position', { scenario: budget.id, title: 'Product engineer', holder: 'Private compensation', line: payroll.id, department: eng.id, start: '2026-01', annualSalary: '180000', onCostPercent: '12' })
 for (const [email, role, departments] of [['sales@dev.localhost', 'contributor', [sales.id]], ['engineering@dev.localhost', 'contributor', [eng.id]], ['board@dev.localhost', 'viewer', []]]) await cmd('member', { email, name: email.split('@')[0], role, departments })
 await owner.context.close()
 for (const as of ['sales', 'engineering', 'board']) { const native = await session(browser, root, server.origin, as, 1440); await native.context.close() }
 for (const width of [1440, 390]) {
  const planner = await session(browser, root, server.origin, 'sales', width), page = planner.page, name = `Client growth ${width}`
  try {
   await nav(page, 'Scenarios')
   const privateCard = card(page, 'Private sandboxes')
   await privateCard.getByLabel('Sandbox source', { exact: true }).selectOption(budget.id)
   await privateCard.getByLabel('Sandbox name', { exact: true }).fill(name)
   await privateCard.getByRole('button', { name: 'Create private sandbox', exact: true }).click()
   await privateCard.getByRole('heading', { name, exact: true }).waitFor()
   const sandbox = (await api(planner.context, server.origin, 'state')).scenarios.find(sc => sc.name === name)
   assert.ok(sandbox.sandbox)
   const sandboxCard = privateCard.getByRole('article', { name: `Sandbox ${name}`, exact: true })
   await nav(page, 'Plan')
   await page.getByLabel('Scenario', { exact: true }).selectOption(sandbox.id)
   const models = card(page, 'Revenue drivers')
   const input = models.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Monthly retainers', exact: true }) })
   await input.getByRole('button', { name: 'Edit', exact: true }).click()
   await models.getByLabel('Starting volume', { exact: true }).fill(width === 1440 ? '12' : '14')
   await models.getByRole('button', { name: 'Save revenue model', exact: true }).click()
   await models.getByRole('button', { name: 'Add revenue model', exact: true }).waitFor()
   await shot(page, models, `plan-${width}`)
   await nav(page, 'Scenarios')
   await privateCard.getByLabel(`Share ${name} with email`, { exact: true }).fill('board@dev.localhost')
   await privateCard.getByLabel(`Access to ${name}`, { exact: true }).selectOption('read')
   await sandboxCard.getByRole('button', { name: 'Save sharing', exact: true }).click()
   await privateCard.getByRole('table', { name: `Sharing for ${name}`, exact: true }).getByText('board@dev.localhost', { exact: true }).waitFor()
   await shot(page, sandboxCard, `sharing-${width}`)
   const viewer = await session(browser, root, server.origin, 'board', width)
   try {
    await nav(viewer.page, 'Scenarios')
    const comparison = card(viewer.page, 'Compare')
    await comparison.getByLabel('From', { exact: true }).selectOption(budget.id)
    await comparison.getByLabel('To', { exact: true }).selectOption(sandbox.id)
    await comparison.getByRole('link', { name: 'Download comparison (Excel)', exact: true }).waitFor()
    const values = await api(viewer.context, server.origin, `compare?a=${budget.id}&b=${sandbox.id}`)
    assert.ok(values.changedCells.some(cell => cell.line === revenue.id && cell.difference === 200000))
    assert.equal(values.changedInputs.length, 0)
    const response = await viewer.context.request.post(server.origin + '/api/easel/command/revenue', { headers: { origin: server.origin }, data: { scenario: sandbox.id, name: 'Viewer cannot edit', kind: 'volume', line: revenue.id, department: sales.id, start: '2026-01', startVolume: '1', rate: '1000' } })
    assert.equal(response.status(), 403)
    const [download] = await Promise.all([viewer.page.waitForEvent('download'), comparison.getByRole('link', { name: 'Download comparison (Excel)', exact: true }).click()])
    assert.equal(await download.failure(), null)
    await shot(viewer.page, comparison, `viewer-comparison-${width}`)
   } finally { await viewer.context.close() }
   await privateCard.getByLabel(`Submit ${name} into`, { exact: true }).selectOption(budget.id)
   await privateCard.getByLabel(`Request for ${name}`, { exact: true }).fill('Increase our client retainers; keep Product compensation private.')
   await sandboxCard.getByRole('button', { name: 'Submit sandbox to finance', exact: true }).click()
   await card(page, 'Proposals').getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) }).getByRole('cell', { name: 'submitted', exact: true }).waitFor()
   assert.equal((await api(planner.context, server.origin, `scenario/${sandbox.id}`)).scenario.id, sandbox.id)
   await shot(page, card(page, 'Proposals'), `submitted-${width}`)
   const finance = await session(browser, root, server.origin, 'owner', width)
   try {
    const state = await api(finance.context, server.origin, 'state')
    assert.equal(state.scenarios.some(sc => sc.id === sandbox.id), false)
    const proposal = state.scenarios.find(sc => sc.kind === 'proposal' && sc.name === name)
    await nav(finance.page, 'Scenarios')
    await card(finance.page, 'Proposals').getByRole('button', { name: `Promote revision ${proposal.revision}`, exact: true }).click()
    await card(finance.page, 'Proposals').getByRole('cell', { name: 'promoted', exact: true }).last().waitFor()
    const official = card(finance.page, 'Official cases')
    await official.getByLabel('Official scenario', { exact: true }).selectOption(budget.id)
    await official.getByLabel('Designation', { exact: true }).selectOption(width === 1440 ? 'budget' : 'board-case')
    await official.getByRole('button', { name: 'Set official case', exact: true }).click()
    await finance.page.getByRole('table', { name: 'Scenarios', exact: true }).getByText(width === 1440 ? 'budget · Official budget' : 'budget · Official board-case', { exact: true }).waitFor()
    await shot(finance.page, official, `official-${width}`)
    await shot(finance.page, card(finance.page, 'Scenarios'), `finance-cases-${width}`)
   } finally { await finance.context.close() }
   // Removing the share takes effect on the viewer's next request.
   await sandboxCard.getByRole('button', { name: 'Remove board@dev.localhost', exact: true }).click()
   const viewer2 = await session(browser, root, server.origin, 'board', width)
   try { assert.equal((await viewer2.context.request.get(server.origin + `/api/easel/scenario/${sandbox.id}`)).status(), 404) }
   finally { await viewer2.context.close() }
   console.log(`CYCLE-004 ${width}: private creation, Plan edit, viewer read-only compare/Excel, copied proposal, promotion, official designation and revocation passed`)
  } finally { await planner.context.close() }
 }
} finally { await browser?.close(); await server?.close(); if (!existing) await rm(root, { recursive: true, force: true }) }
