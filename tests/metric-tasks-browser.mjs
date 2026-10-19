// CYCLE-002: create real rules and complete the resulting assigned work through
// the finance and contributor pages at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { seedParallelMonth } from './parallel-month-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-metric-tasks')
await mkdir(evidence, { recursive: true })
let server, browser, finance, fixture
const cycle = page => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Budget cycle', exact: true }).click()
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
async function createRule(reader, width, department) {
 const page = reader.page
 await page.reload(); await cycle(page)
 const section = card(page, 'Metric rules')
 await section.getByLabel('Rule name', { exact: true }).fill(`Investigate overspend ${width}`)
 await section.getByLabel('Department', { exact: true }).selectOption(department.id)
 await section.getByLabel('Overspend percent', { exact: true }).fill('10')
 await section.getByLabel('Overspend amount (USD)', { exact: true }).fill('5')
 await section.getByLabel('Task owner', { exact: true }).selectOption('sales@dev.localhost')
 await section.getByLabel('Due days after trigger', { exact: true }).fill('3')
 await noOverflow(page, `CYCLE-002 rule form ${width}`)
 await section.screenshot({ path: join(evidence, `metric-rule-form-${width}.png`) })
 await section.getByRole('button', { name: 'Add metric rule', exact: true }).click()
 await section.getByRole('cell', { name: `Investigate overspend ${width} Revision 1`, exact: true }).waitFor()
}
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 finance = await session(browser, root, server.origin, 'owner', 1440)
 const call = (p, b) => api(finance.context, server.origin, p, b)
 fixture = await seedParallelMonth((op, b) => call(`command/${op}`, b), p => call(p), (op, b) => call(`import/actuals/${op}`, b), {
  beforeActuals: async ({ department }) => {
   await call('command/member', { email: 'sales@dev.localhost', name: 'Delivery planner', role: 'contributor', departments: [department.id] })
   const contributor = await session(browser, root, server.origin, 'sales', 1440)
   await contributor.context.close()
   await call('command/member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
   await createRule(finance, 1440, department)
  },
 })
 for (const width of [1440, 390]) {
  if (width === 390) { await finance.context.close(); finance = await session(browser, root, server.origin, 'owner', width); await createRule(finance, width, fixture.department) }
  const page = finance.page
  await page.reload(); await cycle(page)
  const rules = card(page, 'Metric rules'), tasks = card(page, 'Metric tasks')
  const taskItem = tasks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `Investigate overspend ${width} open`, exact: true }) })
  await taskItem.waitFor()
  assert.match(await taskItem.innerText(), /450.00.*400.00.*50.00/)
  await taskItem.getByText('Evidence sources', { exact: true }).click()
  assert.ok((await taskItem.innerText()).includes('closed-january.csv'))
  await rules.getByRole('button', { name: 'Check metric rules', exact: true }).click()
  await rules.getByText('0 tasks created.', { exact: true }).waitFor()
  const list = await call('metric-tasks'), rule = list.rules.find(r => r.name === `Investigate overspend ${width}`)
  assert.equal(list.tasks.filter(t => t.rule === rule.id).length, 1)
  await noOverflow(page, `CYCLE-002 finance evidence ${width}`)
  await tasks.screenshot({ path: join(evidence, `metric-finance-task-${width}.png`) })
  await rules.screenshot({ path: join(evidence, `metric-rules-${width}.png`) })
  const region = rules.getByRole('region', { name: 'Metric rules', exact: true })
  await region.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await rules.screenshot({ path: join(evidence, `metric-rules-final-columns-${width}.png`) })
  // Disable without discarding the task; the assignee still completes its work.
  await ruleRow(rules, page, rule.name).getByRole('button', { name: 'Edit rule', exact: true }).click()
  await rules.getByLabel('Enabled', { exact: true }).uncheck()
  await rules.getByRole('button', { name: 'Save metric rule', exact: true }).click()
  await rules.getByRole('heading', { name: 'New metric rule', exact: true }).waitFor()
  const planner = await session(browser, root, server.origin, 'sales', width)
  try {
   await cycle(planner.page)
   assert.equal(await planner.page.getByRole('heading', { name: 'Metric rules', exact: true }).count(), 0)
   const mine = card(planner.page, 'Metric tasks')
   const item = mine.getByRole('listitem').filter({ has: planner.page.getByRole('heading', { name: `Investigate overspend ${width} open`, exact: true }) })
   await item.waitFor(); await item.getByText('Evidence sources', { exact: true }).click()
   await noOverflow(planner.page, `CYCLE-002 contributor evidence ${width}`)
   await mine.screenshot({ path: join(evidence, `metric-assignee-open-${width}.png`) })
   await item.getByRole('button', { name: 'Mark complete', exact: true }).click()
   await mine.getByRole('heading', { name: `Investigate overspend ${width} done`, exact: true }).waitFor()
   const view = await api(planner.context, server.origin, 'metric-tasks')
   const done = view.tasks.find(t => t.rule === rule.id)
   assert.equal(done.status, 'done'); assert.equal(done.completedBy, 'sales@dev.localhost')
   await planner.page.reload(); await cycle(planner.page)
   await mine.getByRole('heading', { name: `Investigate overspend ${width} done`, exact: true }).waitFor()
   await noOverflow(planner.page, `CYCLE-002 completed ${width}`)
   await mine.screenshot({ path: join(evidence, `metric-assignee-done-${width}.png`) })
  } finally { await planner.context.close() }
  // The runway rule is a distinct form state and uses the same real task door.
  await page.reload(); await cycle(page)
  await rules.getByLabel('Rule name', { exact: true }).fill(`Review runway ${width}`)
  await rules.getByLabel('Metric', { exact: true }).selectOption('runway')
  await rules.getByLabel('Runway threshold (months)', { exact: true }).fill('12')
  await rules.getByLabel('Due days after trigger', { exact: true }).fill('1')
  await noOverflow(page, `CYCLE-002 runway form ${width}`)
  await rules.screenshot({ path: join(evidence, `metric-runway-form-${width}.png`) })
  await rules.getByRole('button', { name: 'Add metric rule', exact: true }).click()
  await rules.getByRole('cell', { name: `Review runway ${width} Revision 1`, exact: true }).waitFor()
  await call('command/revenue', { ...fixture.driver, id: fixture.input.id, scenario: fixture.forecast.id, rate: '0' })
  await call('command/scenario-cash', { scenario: fixture.forecast.id, basis: 'estimate', opening: '100', collectionLag: 0, paymentLag: 0 })
  await rules.getByRole('button', { name: 'Check metric rules', exact: true }).click()
  const runwayItem = tasks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `Review runway ${width} open`, exact: true }) })
  await runwayItem.waitFor()
  assert.match(await runwayItem.innerText(), /closing cash.*net burn.*below/)
  await runwayItem.getByText('Evidence sources', { exact: true }).click()
  await noOverflow(page, `CYCLE-002 runway evidence ${width}`)
  await tasks.screenshot({ path: join(evidence, `metric-runway-task-${width}.png`) })
  await ruleRow(rules, page, `Review runway ${width}`).getByRole('button', { name: 'Edit rule', exact: true }).click()
  await rules.getByLabel('Enabled', { exact: true }).uncheck()
  await rules.getByRole('button', { name: 'Save metric rule', exact: true }).click()
  await rules.getByRole('heading', { name: 'New metric rule', exact: true }).waitFor()
  await runwayItem.getByRole('button', { name: 'Mark complete', exact: true }).click()
  await tasks.getByRole('heading', { name: `Review runway ${width} done`, exact: true }).waitFor()
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await cycle(board.page)
   assert.equal(await board.page.getByRole('heading', { name: 'Metric tasks', exact: true }).count(), 0)
   assert.equal(await board.page.getByRole('heading', { name: 'Metric rules', exact: true }).count(), 0)
  } finally { await board.context.close() }
  console.log(`CYCLE-002 ${width}: rule form, refresh dedup, finance evidence and assignee completion persisted without overflow`)
 }
} finally {
 await finance?.context.close()
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
function ruleRow(section, page, name) { return section.getByRole('row').filter({ has: page.getByRole('cell', { name: `${name} Revision 1`, exact: true }) }) }
