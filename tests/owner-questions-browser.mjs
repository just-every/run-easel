// AGENT-003's native date slice: real built Worker, D1, native owner session,
// structured answers, sourced draft proposals and unanswered escalation.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { sheetBrowserRuntime } from './sheet-browser-runtime.mjs'
import { api, noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-owner-questions')
await mkdir(evidence, { recursive: true })
const runtime = await sheetBrowserRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' })
 const call = (path, body) => api(context, runtime.origin, path, body), cmd = (op, body) => call(`command/${op}`, body)
 const claimed = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 })
 assert.equal(claimed.status(), 303)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 24 })
 const department = await cmd('department', { name: 'Sales' }), line = await cmd('line', { name: 'Contract revenue', type: 'revenue' })
 const initial = await call('state'), budget = initial.scenarios[0], owner = initial.me.email
 for (const width of [1440, 390]) await cmd('revenue', { scenario: budget.id, name: `Acme agreement ${width}`, kind: 'contract', line: line.id, department: department.id, start: '2026-12', startDate: '2026-12-01', termMonths: '1', contractValue: '12000', billingCadence: 'monthly', dsoDays: '0' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await call(`scenario/${budget.id}`)).scenario.revision }), forecast = approved.forecast.id
 const original = await call(`scenario/${forecast}`)
 page = await context.newPage(); track(page)
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = () => page.getByRole('region', { name: 'Owner questions', exact: true })
 const press = (scope, name) => scope.getByRole('button', { name, exact: true }).click()
 const fill = (scope, name, value) => scope.getByLabel(name, { exact: true }).fill(value)
 const action = async (op, click) => {
  const pending = page.waitForResponse(r => r.url().endsWith(`/api/easel/command/${op}`) && r.request().method() === 'POST')
  await click(); const response = await pending
  assert.equal(response.status(), 200, await response.text()); const result = await response.json(); await settle(page); return result
 }
 const readQuestions = () => call(`owner-questions?scenario=${forecast}`)
 const openReview = async () => {
  await page.goto(`${runtime.origin}/app?tab=review`)
  await page.getByRole('navigation', { name: 'Easel' }).waitFor()
  await panel().getByRole('heading', { name: 'Owner questions', exact: true }).waitFor()
  await panel().getByText(/Owner questions are/).waitFor(); await settle(page)
 }
 const ask = async (name, question, source, dueAt) => {
  const details = panel().locator('details').filter({ has: page.locator('summary', { hasText: /^Ask an input owner$/ }) })
  if (await details.getAttribute('open') === null) await details.locator('summary').click()
  const inputs = await panel().getByLabel('Uncertain input', { exact: true }).locator('option').evaluateAll(options => options.map(o => ({ value: o.value, text: o.textContent })))
  const input = inputs.find(o => o.text.startsWith(`${name} —`)); assert.ok(input, `Dated input ${name} is offered`)
  await panel().getByLabel('Uncertain input', { exact: true }).selectOption(input.value)
  await panel().getByLabel('Input owner', { exact: true }).selectOption(owner)
  await fill(panel(), 'Source reference', source); await fill(panel(), 'Question for the owner', question)
  // The browser context is UTC, so datetime-local preserves this exact instant.
  await fill(panel(), 'Answer deadline', dueAt.slice(0, 19))
  await action('owner-question-ask', () => press(panel(), 'Ask owner'))
  return panel().getByRole('article', { name: question, exact: true })
 }

 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await openReview()
  if (width === 1440) {
   assert.equal((await readQuestions()).enabled, false)
   await panel().getByLabel('Enable owner questions', { exact: true }).check()
   await action('owner-question-settings', () => press(panel(), 'Save question settings'))
   assert.equal((await readQuestions()).enabled, true)
  }
  const question = `Will Acme agreement ${width} start on 1 December?`, source = `Reviewed Acme agreement ${width}; sales planning owner confirmed`
  let item = await ask(`Acme agreement ${width}`, question, source, new Date(Date.now() + 86400000).toISOString())
  await item.waitFor(); assert.match(await item.innerText(), /Source: Reviewed Acme/)
  await item.getByLabel('My answer', { exact: true }).selectOption('new-date')
  await fill(item, 'My new date', '2027-01-15')
  await noOverflow(page, `Owner question answer ${width}`)
  await item.screenshot({ path: join(evidence, `owner-question-answer-${width}.png`) })
  await action('owner-question-answer', () => press(item, 'Record my answer'))
  item = panel().getByRole('article', { name: question, exact: true })
  await item.getByRole('button', { name: 'Create date proposal', exact: true }).waitFor()
  const answered = (await readQuestions()).questions.find(q => q.question === question)
  assert.equal(answered.answer.choice, 'new-date'); assert.equal(answered.answer.date, '2027-01-15')
  assert.equal(answered.answer.by, owner); assert.ok(answered.answer.at); assert.equal(answered.source, source)
  assert.deepEqual((await call(`scenario/${forecast}`)).inputs, original.inputs, 'Recording the answer preserves official forecast inputs')
  const override = item.locator('details').filter({ has: page.locator('summary', { hasText: /^Override with a finance note$/ }) })
  await override.locator('summary').click()
  await override.getByLabel('Finance answer', { exact: true }).selectOption('new-date')
  await fill(override, 'Finance replacement date', '2027-01-15')
  await fill(override, 'Reason for finance override', `Confirmed at the finance review ${width}`)
  await action('owner-question-override', () => press(override, 'Save finance override'))
  const overridden = (await readQuestions()).questions.find(q => q.question === question)
  assert.equal(overridden.status, 'overridden'); assert.equal(overridden.answer.note, `Confirmed at the finance review ${width}`)
  assert.equal(overridden.answer.by, owner); assert.equal(overridden.answer.date, '2027-01-15')
  await action('owner-question-propose', () => press(item, 'Create date proposal'))
  await panel().getByRole('status').filter({ hasText: 'Draft proposal' }).waitFor()
  const sourced = (await readQuestions()).questions.find(q => q.question === question)
  assert.ok(sourced.answer.proposal, 'The sourced answer identifies its proposal')
  const proposal = await call(`scenario/${sourced.answer.proposal}`)
  assert.equal(proposal.scenario.proposalStatus, 'draft')
  assert.equal(proposal.inputs.revenue.find(r => r.name === `Acme agreement ${width}`).startDate, '2027-01-15')
  assert.equal(proposal.inputs.revenue.find(r => r.name === `Acme agreement ${width}`).start, '2027-01')
  const contractRows = proposal.calculation.contracts.rows.filter(r => r.name === `Acme agreement ${width}`)
  assert.equal(contractRows.find(r => r.month === '2026-12').revenue, 0)
  assert.equal(contractRows.find(r => r.month === '2027-01').bookings, 1200000)
  assert.ok(contractRows.find(r => r.month === '2027-01').revenue > 0)
  const official = await call(`scenario/${forecast}`)
  assert.equal(official.scenario.revision, original.scenario.revision); assert.deepEqual(official.inputs, original.inputs); assert.deepEqual(official.calculation, original.calculation)
  await noOverflow(page, `Owner question sourced proposal ${width}`)
  await panel().screenshot({ path: join(evidence, `owner-question-proposal-${width}.png`) })

  // An overdue question has no implicit yes/no/date and cannot alter any input.
  const unanswered = `Please confirm the vendor checkpoint for Acme ${width}`
  const deadline = new Date(Date.now() + 12000).toISOString()
  await ask(`Acme agreement ${width}`, unanswered, `Reviewed checkpoint request ${width}`, deadline)
  const due = (await readQuestions()).questions.find(q => q.question === unanswered)
  await page.waitForTimeout(Math.max(0, Date.parse(due.dueAt) - Date.now() + 100))
  item = panel().getByRole('article', { name: unanswered, exact: true })
  await action('owner-question-escalate', () => press(item, 'Check unanswered escalation'))
  await item.getByText(/Escalated to finance at/).waitFor()
  const escalated = (await readQuestions()).questions.find(q => q.id === due.id)
  assert.ok(escalated.escalatedAt); assert.ok(!escalated.answer); assert.equal(escalated.status, 'open'); assert.equal(escalated.expectedDate, due.expectedDate)
  assert.deepEqual((await call(`scenario/${forecast}`)).inputs, original.inputs)
  await noOverflow(page, `Owner question unanswered escalation ${width}`)
  await item.screenshot({ path: join(evidence, `owner-question-escalated-${width}.png`) })
  console.log(`Owner questions ${width}: structured native answer with source/person/time, recalculated draft proposal, unchanged official forecast and unanswered escalation`)
 }
} catch (error) {
 if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'owner-questions-failed.png'), fullPage: true }).catch(() => {})
 throw error
} finally { await browser?.close(); await runtime.close() }
