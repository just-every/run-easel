// The human journey through the built page: real dev-identity sessions for
// finance, contributors and a viewer, driving only what a person can click.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDevKey, signInAs } from '../src/modules/operator-auth/dev/sign-in-as.mjs'

const fixtures = new URL('../fixtures/', import.meta.url).pathname

export async function session(browser, root, origin, as, width, pages) {
 const key = await readDevKey(root)
 const login = await signInAs({ origin, key, as, returnTo: '/app' })
 const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true })
 await context.addCookies(login.cookies.map(c => ({ ...c, url: origin })))
 const page = await context.newPage()
 track(page)
 pages?.push([as, page])
 page.on('dialog', d => d.accept())
 await page.goto(origin + '/app')
 if (page.url().endsWith('/setup')) { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup' }).click(); await page.waitForURL(/\/app/) }
 await page.locator('h1').first().waitFor()
 return { context, page }
}

export async function api(context, origin, path, body) {
 const response = body === undefined ? await context.request.get(`${origin}/api/easel/${path}`) : await context.request.post(`${origin}/api/easel/${path}`, { headers: { origin }, data: body })
 const value = await response.json()
 assert.equal(response.status(), 200, `${path}: ${JSON.stringify(value)}`)
 return value
}

const tab = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const card = (page, heading) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
const fill = (scope, label, value) => scope.getByLabel(label, { exact: true }).fill(String(value))
const pick = (scope, label, value) => scope.getByLabel(label, { exact: true }).selectOption(value)
const press = (scope, name) => scope.getByRole('button', { name, exact: true }).click()
/** Waits until the page has no Easel API request in flight for a moment. */
const settle = async page => { for (let quiet = 0; quiet < 3;) { await page.waitForTimeout(100); quiet = page.inflight() === 0 ? quiet + 1 : 0 } }
function track(page) {
 let n = 0
 const mine = r => r.url().includes('/api/easel/')
 page.on('request', r => { if (mine(r)) n++ })
 for (const event of ['requestfinished', 'requestfailed']) page.on(event, r => { if (mine(r)) n-- })
 page.inflight = () => n
}

/** No page may scroll sideways at this width; tables scroll inside their own box. */
export async function noOverflow(page, label) {
 const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
 assert.ok(scroll <= client, `${label}: page is ${scroll}px wide in a ${client}px viewport`)
}

/** Keeps a screenshot of every open page when a journey fails, for diagnosis. */
async function onFailure(evidence, name, run) {
 const pages = []
 try { return await run(pages) } catch (error) {
  for (const [as, page] of pages) await page.screenshot({ path: join(evidence, `failed-${name}-${as}.png`), fullPage: true }).catch(() => {})
  throw error
 }
}

async function shoot(page, evidence, name) { await settle(page); await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true }) }

async function everyTab(page, evidence, who, width) {
 for (const name of await page.getByRole('navigation', { name: 'Easel' }).getByRole('button').allInnerTexts()) {
  await tab(page, name)
  await settle(page)
  await noOverflow(page, `${who} ${name} at ${width}`)
  await shoot(page, evidence, `${width}-${who}-${name.toLowerCase().replace(/\s+/g, '-')}`)
 }
}

/** At 1440: set up the plan, move in July's actuals, build the budget with two departments, approve it and close July. */
export const planningJourney = (browser, root, origin, evidence) => onFailure(evidence, 'planning', pages => planning(browser, root, origin, evidence, pages))
async function planning(browser, root, origin, evidence, pages) {
 const width = 1440
 const finance = await session(browser, root, origin, 'owner', width, pages)
 const p = finance.page
 await fill(p, 'Company name', 'Harbour Analytics (fixture)')
 await fill(p, 'First plan month', '2026-07')
 await press(p, 'Create the plan')
 await p.getByRole('navigation', { name: 'Easel' }).waitFor()

 await tab(p, 'Settings')
 const depts = card(p, 'Departments')
 for (const [name, shared] of [['Sales'], ['Engineering'], ['Marketing'], ['Operations', true]]) {
  await fill(depts, 'Department name', name)
  if (shared) await depts.getByLabel('Shared costs department (allocated to others)').check()
  await press(depts, 'Add department')
  await depts.getByRole('cell', { name, exact: true }).waitFor()
 }
 const lines = card(p, 'Planning lines')
 for (const [name, type, payroll] of [['Subscription revenue', 'revenue'], ['Services revenue', 'revenue'], ['Cloud hosting', 'cost-of-sales'], ['Salaries', 'operating-expense', true], ['Software', 'operating-expense'], ['Rent', 'operating-expense'], ['Advertising', 'operating-expense'], ['Travel', 'operating-expense']]) {
  await fill(lines, 'Line name', name)
  await pick(lines, 'Type', type)
  if (payroll) await lines.getByLabel('Payroll line (paid in its month, pay detail private)').check()
  await press(lines, 'Add line')
  await lines.getByRole('cell', { name, exact: true }).waitFor()
 }
 const people = card(p, 'People')
 for (const [email, role, dept] of [['sales@dev.localhost', 'contributor', 'Sales'], ['engineering@dev.localhost', 'contributor', 'Engineering'], ['board@dev.localhost', 'viewer']]) {
  await fill(people, 'Name', email.split('@')[0])
  await fill(people, 'Email', email)
  await pick(people, 'Role', role)
  if (dept) await people.getByLabel('Departments (contributors)').selectOption({ label: dept })
  await press(people, 'Add person')
  await people.getByRole('cell', { name: email, exact: true }).waitFor()
 }

 // July actuals: preview shows the repeat and the malformed row; map, then accept without them.
 await tab(p, 'Actuals')
 const upload = card(p, 'Upload actuals (CSV)')
 await upload.getByLabel('Actuals file').setInputFiles(join(fixtures, 'gl-detail-2026-07.csv'))
 await press(upload, 'Preview')
 await upload.getByText('16 rows read · 14 can be accepted · 2 rejected').waitFor()
 await upload.getByRole('cell', { name: 'repeats line 13 exactly' }).waitFor()
 const map = { '090': 'cash', '200': 'Subscription revenue', '210': 'Services revenue', '310': 'Cloud hosting', '400': 'Advertising', '461': 'Software', '469': 'Rent', '477': 'Salaries', '478': 'Salaries', '493': 'Travel', '610': 'excluded' }
 for (const [account, target] of Object.entries(map)) await upload.getByLabel(`Map account ${account}`).selectOption(target === 'cash' || target === 'excluded' ? target : { label: target })
 for (const d of ['Engineering', 'Marketing', 'Operations', 'Sales']) await upload.getByLabel(`Map department ${d}`).selectOption({ label: d })
 await upload.getByLabel('Map department (blank)').selectOption({ label: 'No department' })
 await upload.getByText('Every account and department is mapped.').waitFor()
 await upload.getByLabel('Leave the 2 rejected rows out').check()
 await press(upload, 'Accept 14 rows')
 await card(p, 'Imports').getByRole('cell', { name: 'accepted', exact: true }).waitFor()
 await card(p, 'Reconciliation').getByRole('cell', { name: 'Jul 2026', exact: true }).waitFor()
 await shoot(p, evidence, `${width}-finance-actuals-accepted`)

 // The budget: imported opening cash, drivers, positions, expenses and an allocation.
 await tab(p, 'Plan')
 const cash = card(p, 'Opening cash and timing')
 await pick(cash, 'Opening cash basis', 'imported')
 await fill(cash, 'Opening receivables', '50000')
 await fill(cash, 'Opening payables', '20000')
 await press(cash, 'Save cash settings')
 await cash.getByText(/imported from 1 accepted actuals rows/).waitFor()
 const revenue = card(p, 'Revenue drivers')
 await fill(revenue, 'Revenue model name', 'Subscriptions'); await pick(revenue, 'Revenue line', { label: 'Subscription revenue' }); await pick(revenue, 'Department', { label: 'Sales' }); await fill(revenue, 'Start month', '2026-07')
 await fill(revenue, 'Starting customers', '80'); await fill(revenue, 'New customers per month', '1'); await fill(revenue, 'New customers per ramped hire', '1.5'); await pick(revenue, 'Hiring department', { label: 'Sales' }); await fill(revenue, 'Ramp months', '3'); await fill(revenue, 'Monthly churn %', '2'); await fill(revenue, 'Monthly revenue per customer', '1200')
 await press(revenue, 'Add revenue model')
 await revenue.getByRole('cell', { name: 'Subscriptions', exact: true }).waitFor()
 await revenue.getByLabel('Driver').selectOption('volume')
 await fill(revenue, 'Revenue model name', 'Implementation services'); await pick(revenue, 'Revenue line', { label: 'Services revenue' }); await pick(revenue, 'Department', { label: 'Sales' }); await fill(revenue, 'Start month', '2026-07')
 await fill(revenue, 'Starting volume', '1'); await fill(revenue, 'Rate per unit', '12000')
 await press(revenue, 'Add revenue model')
 await revenue.getByRole('cell', { name: 'Implementation services', exact: true }).waitFor()
 const positions = card(p, 'Positions')
 for (const [title, holder, dept, start, salary] of [['Account executive', 'Sam', 'Sales', '2026-07', '120000'], ['Account executive', '', 'Sales', '2026-09', '110000'], ['Senior engineer', 'Eli', 'Engineering', '2026-07', '180000'], ['Engineer', '', 'Engineering', '2026-10', '150000']]) {
  await fill(positions, 'Position title', title); await fill(positions, 'Person', holder); await pick(positions, 'Department', { label: dept }); await fill(positions, 'Start month', start); await fill(positions, 'Annual salary', salary)
  await press(positions, 'Add position')
  await positions.getByRole('row').filter({ hasText: salary.replace(/(\d{3})$/, ',$1') }).first().waitFor()
 }
 const expenses = card(p, 'Expenses')
 for (const [name, line, dept, kind, amount, start] of [['AWS', 'Cloud hosting', 'Engineering', 'recurring', '15000', '2026-07'], ['Tooling', 'Software', 'Engineering', 'recurring', '2400', '2026-07'], ['Office rent', 'Rent', 'Operations', 'recurring', '9000', '2026-07'], ['Campaigns', 'Advertising', 'Marketing', 'recurring', '7500', '2026-07'], ['Conference sponsorship', 'Advertising', 'Marketing', 'one-off', '7500', '2026-09'], ['Client travel', 'Travel', 'Sales', 'recurring', '1500', '2026-07']]) {
  await fill(expenses, 'Expense name', name); await pick(expenses, 'Expense line', { label: line }); await pick(expenses, 'Department', { label: dept }); await pick(expenses, 'Kind', kind); await fill(expenses, 'Amount', amount); await fill(expenses, 'Start month', start)
  await press(expenses, 'Add expense')
  await expenses.getByRole('cell', { name, exact: true }).waitFor()
 }
 const allocation = card(p, 'Shared-cost allocation')
 await fill(allocation, 'Allocation name', 'Office by headcount'); await pick(allocation, 'Shared department', { label: 'Operations' }); await pick(allocation, 'Basis', 'headcount')
 await allocation.getByLabel('Receiving departments').selectOption([{ label: 'Sales' }, { label: 'Engineering' }, { label: 'Marketing' }])
 await press(allocation, 'Add allocation')
 await allocation.getByRole('cell', { name: 'Office by headcount', exact: true }).waitFor()
 await shoot(p, evidence, `${width}-finance-plan`)

 // Submissions: each contributor revises and submits only their own department.
 await tab(p, 'Budget cycle')
 const cycle = p.locator('section.card').first()
 await cycle.getByLabel('Departments').selectOption([{ label: 'Sales' }, { label: 'Engineering' }])
 await press(cycle, 'Request submissions')
 await cycle.getByRole('cell', { name: 'Engineering', exact: true }).waitFor()
 const sales = await session(browser, root, origin, 'sales', width, pages)
 await tab(sales.page, 'Plan')
 const salesExpenses = card(sales.page, 'Expenses')
 await fill(salesExpenses, 'Expense name', 'Customer summit travel'); await pick(salesExpenses, 'Expense line', { label: 'Travel' }); await pick(salesExpenses, 'Department', { label: 'Sales' }); await pick(salesExpenses, 'Kind', 'one-off'); await fill(salesExpenses, 'Amount', '3200'); await fill(salesExpenses, 'Start month', '2026-11')
 await press(salesExpenses, 'Add expense')
 await salesExpenses.getByRole('cell', { name: 'Customer summit travel', exact: true }).waitFor()
 assert.equal(await card(sales.page, 'Positions').getByRole('cell', { name: 'Eli', exact: true }).count(), 0, 'Sales cannot see Engineering pay')
 await tab(sales.page, 'Budget cycle')
 const comments = card(sales.page, 'Comments')
 await pick(comments, 'Department', { label: 'Sales' }); await fill(comments, 'Comment', 'Summit travel assumes two people.')
 await press(comments, 'Add comment')
 await comments.getByText('Summit travel assumes two people.').waitFor()
 await press(sales.page, 'Submit Sales')
 await sales.page.getByRole('row').filter({ hasText: 'Sales' }).getByText('submitted', { exact: true }).waitFor()
 await shoot(sales.page, evidence, `${width}-sales-submitted`)
 await everyTab(sales.page, evidence, 'sales', width)
 const engineering = await session(browser, root, origin, 'engineering', width, pages)
 await tab(engineering.page, 'Budget cycle')
 await press(engineering.page, 'Submit Engineering')
 await engineering.page.getByRole('row').filter({ hasText: 'Engineering' }).getByText('submitted', { exact: true }).waitFor()

 await p.reload(); await tab(p, 'Budget cycle')
 const approve = p.getByRole('button', { name: /^Approve and freeze revision \d+$/ })
 const reviewedRevision = Number((await approve.innerText()).match(/\d+$/)[0])
 await approve.click()
 await p.getByText(/Approved by .+ at .+revision \d+/).waitFor()
 const approvedState = await api(finance.context, origin, 'state')
 const approvedBudget = approvedState.scenarios.find(s => s.kind === 'budget')
 assert.equal(approvedBudget.status, 'frozen')
 assert.equal(approvedBudget.approval.revision, reviewedRevision)
 const approvedSnapshot = await api(finance.context, origin, `snapshot/${approvedBudget.approval.snapshot}`)
 assert.equal(approvedSnapshot.kind, 'approval')
 assert.equal(approvedSnapshot.body.revision, reviewedRevision)
 await shoot(p, evidence, `${width}-finance-approved`)

 // Close July: actuals replace the plan, the prior forecast is kept.
 await tab(p, 'Review')
 await press(p, 'Close Jul 2026')
 await p.getByText(/actuals through Jul 2026/).waitFor()
 await tab(p, 'Overview')
 await p.getByRole('button', { name: 'Subscription revenue Jul 2026: how it was calculated' }).click()
 await p.getByText(/from 1 accepted row/).waitFor()
 await tab(p, 'Overview')
 await p.getByRole('button', { name: 'Subscription revenue Dec 2026: how it was calculated' }).click()
 await p.getByText(/per customer =/).waitFor()
 await p.getByRole('button', { name: 'Services revenue Dec 2026: how it was calculated' }).click()
 await p.getByText(/volume 1\.00 \(prior month × \(1 \+ 0\.00%\)\) × rate \$12,000\.00 = \$12,000\.00/).waitFor()
 await shoot(p, evidence, `${width}-finance-overview-trace`)
 await everyTab(p, evidence, 'finance', width)
 const board = await session(browser, root, origin, 'board', width, pages)
 assert.equal(await board.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Plan', exact: true }).count(), 0)
 await everyTab(board.page, evidence, 'board', width)
 for (const s of [finance, sales, engineering, board]) await s.context.close()
 return { width, steps: ['setup', 'settings', 'july-actuals', 'budget', 'submissions', 'approval', 'close-july', 'trace', 'viewer'] }
}

/** At 390: August actuals, close, explain, publish the pack, branch a downside, a contributor proposal, and the workbook move-in. */
export const reviewJourney = (browser, root, origin, evidence) => onFailure(evidence, 'review', pages => review(browser, root, origin, evidence, pages))
async function review(browser, root, origin, evidence, pages) {
 const width = 390
 const finance = await session(browser, root, origin, 'finance', width, pages)
 const p = finance.page
 await tab(p, 'Actuals')
 const upload = card(p, 'Upload actuals (CSV)')
 await upload.getByLabel('Actuals file').setInputFiles(join(fixtures, 'gl-detail-2026-08.csv'))
 await press(upload, 'Preview')
 await upload.getByText('11 rows read · 11 can be accepted · 0 rejected').waitFor()
 await press(upload, 'Accept 11 rows')
 await card(p, 'Reconciliation').getByRole('cell', { name: 'Aug 2026', exact: true }).waitFor()
 await noOverflow(p, 'actuals at 390')

 await tab(p, 'Review')
 await press(p, 'Close Aug 2026')
 await p.getByText(/actuals through Aug 2026/).waitFor()
 const ads = p.locator('details').filter({ hasText: 'Advertising · Marketing' })
 await ads.locator('summary').click()
 await ads.getByText(/Possibly timing: Conference sponsorship/).waitFor()
 await ads.getByRole('cell', { name: 'Conference sponsorship deposit' }).waitFor()
 await fill(ads, 'Explanation for Advertising · Marketing', 'Conference sponsorship deposit paid in August, budgeted in September.')
 await press(ads, 'Save explanation')
 await p.locator('details').filter({ hasText: 'Advertising · Marketing' }).getByRole('button', { name: 'Confirm explanation' }).click()
 await p.getByText(/explanation confirmed/).first().waitFor()
 await noOverflow(p, 'review at 390')
 await shoot(p, evidence, `${width}-finance-variances`)

 const sales = await session(browser, root, origin, 'sales', width, pages)
 await tab(sales.page, 'Review')
 const travel = sales.page.locator('details').filter({ hasText: 'Travel · Sales' })
 await travel.locator('summary').click()
 await fill(travel, 'Explanation for Travel · Sales', 'Fewer client visits in August.')
 await press(travel, 'Save explanation')
 await sales.page.locator('details').filter({ hasText: 'Travel · Sales' }).getByRole('button', { name: 'Confirm explanation' }).click()
 const adsForSales = sales.page.locator('details').filter({ hasText: 'Advertising · Marketing' })
 await adsForSales.locator('summary').click()
 await adsForSales.getByText(/restricted to finance and this department/).waitFor()
 await shoot(sales.page, evidence, `${width}-sales-variances`)

 await p.reload(); await tab(p, 'Review')
 await press(p, 'Start the Aug 2026 pack')
 const packs = card(p, 'Review packs')
 await fill(packs, 'Decision or action', 'Hold September conference spend pending pipeline review')
 await fill(packs, 'Owner', 'Marketing lead')
 await press(packs, 'Record decision')
 await packs.getByText(/Hold September conference spend/).waitFor()
 await press(packs, 'Publish pack')
 const download = p.waitForEvent('download')
 await packs.getByRole('link', { name: 'Download pack (HTML)' }).click()
 const file = await download
 await file.saveAs(join(evidence, 'review-pack-2026-08.html'))
 const html = await readFile(join(evidence, 'review-pack-2026-08.html'), 'utf8')
 assert.match(html, /Hold September conference spend/)
 assert.match(html, /budgeted in September/)
 assert.match(html, /gl-detail-2026-08\.csv/)
 await shoot(p, evidence, `${width}-finance-pack`)

 // A downside branch and its comparison.
 await tab(p, 'Scenarios')
 const scen = card(p, 'Scenarios')
 await pick(scen, 'Branch from', { label: 'FY2027 forecast' })
 await fill(scen, 'Scenario name', 'Downside: slower hiring')
 await press(scen, 'Branch scenario')
 await scen.getByRole('cell', { name: 'Downside: slower hiring', exact: true }).waitFor()
 await tab(p, 'Plan')
 await p.getByLabel('Scenario').selectOption({ label: 'Downside: slower hiring · scenario' })
 await settle(p)
 const pos = card(p, 'Positions')
 await pos.getByRole('row').filter({ hasText: 'Engineer' }).filter({ hasText: 'To be hired' }).getByRole('button', { name: 'Edit' }).click()
 await fill(pos, 'Start month', '2027-01')
 await press(pos, 'Save position')
 await pos.getByRole('cell', { name: 'Jan 2027', exact: true }).waitFor()
 await tab(p, 'Scenarios')
 const compare = card(p, 'Compare')
 await compare.getByLabel('From').selectOption({ label: 'FY2027 forecast · forecast' })
 await compare.getByLabel('To').selectOption({ label: 'Downside: slower hiring · scenario' })
 const changedHire = compare.locator('li').filter({ hasText: /Engineer/ })
 await changedHire.filter({ hasText: /Oct 2026.*→.*Jan 2027/ }).waitFor()
 const from = await compare.getByLabel('From').inputValue(), to = await compare.getByLabel('To').inputValue()
 const comparison = await api(finance.context, origin, `compare?a=${from}&b=${to}`)
 const hireChange = comparison.changedInputs.find(c => c.kind === 'position' && c.name === 'Engineer')
 assert.equal(hireChange.before.start, '2026-10')
 assert.equal(hireChange.after.start, '2027-01')
 await noOverflow(p, 'compare at 390')
 await shoot(p, evidence, `${width}-finance-compare`)

 // A contributor's proposal, promoted by finance at its exact revision.
 await sales.page.reload(); await tab(sales.page, 'Scenarios')
 const props = card(sales.page, 'Proposals')
 const forecastOption = (await props.getByLabel('Change which plan', { exact: true }).locator('option').allInnerTexts()).find(t => t.startsWith('FY2027 forecast'))
 await pick(props, 'Change which plan', { label: forecastOption })
 await fill(props, 'Proposal name', 'Delay the new account executive')
 await fill(props, 'What should change', 'Delay the second sales hire until January')
 await press(props, 'Start a proposal')
 await props.getByRole('cell', { name: 'Delay the new account executive', exact: true }).waitFor()
 await tab(sales.page, 'Plan')
 await sales.page.getByLabel('Scenario').selectOption({ label: 'Delay the new account executive · proposal' })
 await settle(sales.page)
 const salesPos = card(sales.page, 'Positions')
 await salesPos.getByRole('row').filter({ hasText: 'To be hired' }).getByRole('button', { name: 'Edit' }).click()
 await fill(salesPos, 'Start month', '2027-01')
 await press(salesPos, 'Save position')
 await salesPos.getByRole('cell', { name: 'Jan 2027', exact: true }).waitFor()
 await tab(sales.page, 'Scenarios')
 await press(sales.page, 'Submit for approval')
 await sales.page.getByRole('cell', { name: 'submitted', exact: true }).waitFor()
 await p.reload(); await tab(p, 'Scenarios')
 await p.getByRole('button', { name: /^Promote revision \d+$/ }).click()
 await p.getByRole('cell', { name: 'promoted', exact: true }).waitFor()
 await shoot(p, evidence, `${width}-finance-proposal-promoted`)

 // The Excel planning workbook moves in as its own scenario.
 await tab(p, 'Actuals')
 const wb = card(p, 'Move in a planning workbook (.xlsx)')
 await wb.getByLabel('Planning workbook').setInputFiles(join(fixtures, 'fy27-budget.xlsx'))
 await press(wb, 'Preview workbook')
 await wb.getByText(/11 formulas kept as values/).waitFor()
 await wb.getByLabel('Workbook line Hosting').selectOption({ label: 'Cloud hosting' })
 await wb.getByRole('cell', { name: 'Hosting', exact: true }).waitFor()
 await wb.getByText('Match these workbook names to Easel:').waitFor({ state: 'detached' })
 await press(wb, 'Import as a new scenario')
 await wb.getByRole('cell', { name: 'imported', exact: true }).waitFor()
 await noOverflow(p, 'workbook at 390')
 await shoot(p, evidence, `${width}-finance-workbook`)
 await everyTab(p, evidence, 'finance', width)
 const board = await session(browser, root, origin, 'board', width, pages)
 await tab(board.page, 'Review')
 await card(board.page, 'Review packs').getByRole('link', { name: 'Download pack (HTML)' }).waitFor()
 await everyTab(board.page, evidence, 'board', width)
 for (const s of [finance, sales, board]) await s.context.close()
 return { width, steps: ['august-actuals', 'close-august', 'explanations', 'pack', 'downside', 'proposal', 'workbook', 'viewer'] }
}
