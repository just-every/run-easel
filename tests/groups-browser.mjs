import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = await fresh(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-groups')
await mkdir(evidence, { recursive: true })
let server, browser, finance, planner
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const tab = async (page, name) => { await page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click(); await settle(page) }
const saved = async (page, op, click) => { const pending = page.waitForResponse(r => r.url().endsWith(`/command/${op}`)); await click(); const result = await pending; assert.equal(result.status(), 200, await result.text()); await settle(page); return result.json() }
try {
 const port = await freePort(); await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)]); server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, b) => api(finance.context, server.origin, `command/${op}`, b)
 await cmd('workspace', { name: 'Ridgeline Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' }), engineering = await cmd('department', { name: 'Engineering' })
 const line = await cmd('line', { name: 'Service retainers', type: 'revenue' })
 const dimension = await cmd('dimension', { name: 'Region' }), east = await cmd('dimension-member', { dimension: dimension.id, name: 'East' }), west = await cmd('dimension-member', { dimension: dimension.id, name: 'West' })
 const budget = (await api(finance.context, server.origin, 'state')).scenarios[0]
 const input = { scenario: budget.id, name: 'Eastern retainers', line: line.id, department: sales.id, start: '2026-01', kind: 'volume', startVolume: '10', rate: '250', dimensions: { [dimension.id]: east.id } }
 await cmd('revenue', input); await cmd('revenue', { ...input, name: 'Western private contract', rate: '1950', dimensions: { [dimension.id]: west.id } })
 await cmd('revenue', { ...input, name: 'Engineering West services', department: engineering.id, rate: '100', dimensions: { [dimension.id]: west.id } })
 const sandbox = await cmd('sandbox-create', { from: budget.id, name: 'Commercial outlook' })
 await cmd('member', { email: 'sales@dev.localhost', name: 'Sam Sales', role: 'contributor', departments: [sales.id] })
 planner = await session(browser, root, server.origin, 'sales', 1440)
 await cmd('member', { email: 'sales@dev.localhost', name: 'Sam Sales', role: 'contributor', departments: [], groupOnly: true })
 await cmd('group-save', { name: 'Western engineering', members: ['sales@dev.localhost'], departments: { edit: [engineering.id] }, dimensions: { [dimension.id]: { edit: [west.id] } } })
 await finance.page.reload(); await finance.page.getByRole('navigation', { name: 'Easel' }).waitFor()
 let group
 for (const width of [1440, 390]) {
  for (const s of [finance, planner]) await s.page.setViewportSize({ width, height: 1000 })
  await tab(finance.page, 'Settings')
  const groups = card(finance.page, 'Groups and access report')
  if (group) await groups.getByLabel('Edit group', { exact: true }).selectOption(group.id)
  await groups.getByLabel('Group name', { exact: true }).fill('Commercial planning team')
  await groups.getByLabel('Group people', { exact: true }).selectOption(['sales@dev.localhost'])
  await groups.getByLabel('Departments: edit', { exact: true }).selectOption([sales.id, engineering.id])
  await groups.getByLabel('Statement owner departments', { exact: true }).selectOption([sales.id, engineering.id])
  await groups.getByLabel('Region: scope', { exact: true }).selectOption('restricted')
  await groups.getByLabel('Region: edit members', { exact: true }).selectOption([east.id])
  group = await saved(finance.page, 'group-save', () => groups.getByRole('button', { name: 'Save group grants', exact: true }).click())
  const row = groups.getByRole('row').filter({ has: finance.page.getByRole('rowheader', { name: /sales@dev.localhost/ }) })
  assert.ok((await row.innerText()).includes('No pay detail'))
  assert.ok((await row.innerText()).includes('Sales, Engineering') || (await row.innerText()).includes('Engineering, Sales'))
  await noOverflow(finance.page, `Groups ${width}`); await groups.screenshot({ path: join(evidence, `groups-${width}.png`) })
  await tab(finance.page, 'Scenarios')
  const sharing = finance.page.getByRole('article', { name: 'Sandbox Commercial outlook', exact: true })
  await sharing.getByLabel('Share Commercial outlook with group', { exact: true }).selectOption(group.id)
  await sharing.getByLabel('Group access to Commercial outlook', { exact: true }).selectOption('edit')
  await saved(finance.page, 'scenario-share', () => sharing.getByRole('button', { name: 'Save group sharing', exact: true }).click())
  await noOverflow(finance.page, `Group sharing ${width}`); await sharing.screenshot({ path: join(evidence, `group-sharing-${width}.png`) })
  await planner.page.reload(); await planner.page.getByRole('navigation', { name: 'Easel' }).waitFor(); await tab(planner.page, 'Plan')
  await planner.page.getByLabel('Scenario', { exact: true }).selectOption(sandbox.id); await settle(planner.page)
  const inputScope = card(planner.page, 'Dimensions for new inputs')
  await inputScope.getByLabel('Dimension: Region', { exact: true }).selectOption(east.id)
  await inputScope.getByRole('button', { name: 'Use these input dimensions', exact: true }).click(); await settle(planner.page)
  const models = card(planner.page, 'Revenue drivers')
  await models.getByRole('cell', { name: 'Eastern retainers', exact: true }).waitFor()
  assert.equal(await models.getByRole('cell', { name: 'Western private contract', exact: true }).count(), 0)
  await models.getByRole('cell', { name: 'Engineering West services', exact: true }).waitFor()
  await models.getByLabel('Revenue model name', { exact: true }).fill(`Engineering expansion ${width}`)
  await models.getByLabel('Revenue line', { exact: true }).selectOption(line.id)
  await models.getByLabel('Department', { exact: true }).selectOption(engineering.id)
  await models.getByLabel('Start month', { exact: true }).fill('2026-01')
  await models.getByLabel('Starting customers', { exact: true }).fill('2')
  await models.getByLabel('Monthly revenue per customer', { exact: true }).fill('100')
  await saved(planner.page, 'revenue', () => models.getByRole('button', { name: 'Add revenue model', exact: true }).click())
  const changed = await api(planner.context, server.origin, `scenario/${sandbox.id}`)
  assert.equal(changed.inputs.revenue.find(r => r.name === `Engineering expansion ${width}`).dimensions[dimension.id], east.id)
  await inputScope.screenshot({ path: join(evidence, `group-input-scope-${width}.png`) })

  await noOverflow(planner.page, `Group scoped plan ${width}`); await models.screenshot({ path: join(evidence, `group-plan-${width}.png`) })
  const response = await planner.context.request.get(`${server.origin}/api/easel/scenario/${sandbox.id}/document.xlsx`)
  assert.equal(response.status(), 200)
  console.log(`Group grants ${width}: two departments, East-only planning, no compensation, access report, group scenario sharing and Excel passed`)
 }
 await tab(finance.page, 'Settings')
 const groups = card(finance.page, 'Groups and access report')
 await groups.getByLabel('Edit group', { exact: true }).selectOption(group.id)
 await groups.getByLabel('Group people', { exact: true }).selectOption([])
 await saved(finance.page, 'group-save', () => groups.getByRole('button', { name: 'Save group grants', exact: true }).click())
 assert.equal((await planner.context.request.get(`${server.origin}/api/easel/scenario/${sandbox.id}`)).status(), 404)
} catch (error) { if (finance?.page && !finance.page.isClosed()) await finance.page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }) }
