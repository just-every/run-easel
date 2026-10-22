// Built Worker/D1 proof: native finance maps themselves, reviews exact identity,
// consents, receives a structured private question, answers and stops delivery.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { privateSlackRuntime } from './private-slack-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-private-slack')
await mkdir(evidence, { recursive: true })
const runtime = await privateSlackRuntime()
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' })
 const post = async (path, body) => { const r = await context.request.post(`${runtime.origin}/api/easel/${path}`, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 }); assert.equal(r.status(), 200, await r.text()); return r.json() }
 const cmd = (op, body) => post(`command/${op}`, body)
 const get = async path => { const r = await context.request.get(`${runtime.origin}/api/easel/${path}`); assert.equal(r.status(), 200, await r.text()); return r.json() }
 const claimed = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 }); assert.equal(claimed.status(), 303)
 await cmd('workspace', { name: 'Private delivery review', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 24 })
 const department = await cmd('department', { name: 'Sales' }), line = await cmd('line', { name: 'Contract revenue', type: 'revenue' }), budget = (await get('state')).scenarios[0]
 const contracts = new Map()
 for (const width of [1440, 390]) contracts.set(width, await cmd('revenue', { scenario: budget.id, name: `Acme agreement ${width}`, kind: 'contract', line: line.id, department: department.id, start: '2026-12', startDate: '2026-12-15', termMonths: 12, contractValue: '120000', billingCadence: 'monthly', dsoDays: 0 }))
 const { forecast } = await cmd('approve-budget', { scenario: budget.id, revision: (await get(`scenario/${budget.id}`)).scenario.revision })
 await cmd('owner-question-settings', { enabled: true })
 page = await context.newPage(); track(page)
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.getByRole('navigation', { name: 'Easel' }).waitFor()
 const panel = () => page.getByRole('region', { name: 'Private Slack delivery', exact: true })
 const questions = () => page.getByRole('region', { name: 'Owner questions', exact: true })
 const press = name => panel().getByRole('button', { name, exact: true }).click()
 const action = async (suffix, click) => { const pending = page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST'); await click(); const r = await pending; assert.equal(r.status(), 200, await r.text()); await settle(page); return r.json() }
 const open = async () => { await page.goto(`${runtime.origin}/app?tab=review`); await panel().getByRole('heading', { name: 'Private Slack delivery', exact: true }).waitFor(); await settle(page) }
 const screenshot = async name => { await settle(page); await noOverflow(page, name); await panel().screenshot({ path: join(evidence, `${name}.png`) }) }
 const ask = async (width, suffix) => cmd('owner-question-ask', { scenario: forecast.id, scenarioRevision: forecast.revision, kind: 'revenue', originId: contracts.get(width).originId, field: 'startDate', owner: 'owner@example.test', source: `Reviewed synthetic-easel-7 agreement ${width}`, question: `Will Acme ${width} start on 15 December? ${suffix}`, dueAt: new Date(Date.now() + 7 * 86400000).toISOString() })
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await open()
  if (width === 1440) {
   await panel().getByText('Connect workspace bot', { exact: true }).click()
   await panel().getByLabel('Slack bot key', { exact: true }).fill(runtime.provider.key)
   await panel().getByLabel('I consent to sealed storage of this bot key for private messages', { exact: true }).check()
   await action('/slack-private/connection/connect', () => press('Connect private Slack'))
  }
  await panel().getByText('Map a native member', { exact: true }).click()
  await panel().getByLabel('Native account', { exact: true }).selectOption('owner@example.test')
  await panel().getByLabel('Slack user ID', { exact: true }).fill('UOWNER')
  await action('/slack-private/bind', () => press('Verify Slack identity'))
  const identity = panel().getByRole('heading', { name: 'My private Slack identity', exact: true })
  await identity.waitFor()
  let mine = (await get('slack-private')).bindings.find(b => b.email === 'owner@example.test')
  assert.equal(mine.enabled, false); assert.equal(runtime.provider.posts.length, width === 1440 ? 0 : 1)
  await screenshot(`private-slack-awaiting-consent-${width}`)
  await panel().getByLabel('I consent to owner questions and cash alerts sent privately to UOWNER in T1', { exact: true }).check()
  await action('/slack-private/consent', () => press('Consent to my private Slack messages'))
  mine = (await get('slack-private')).bindings.find(b => b.email === 'owner@example.test'); assert.equal(mine.enabled, true)
  const question = await ask(width, 'Yes, No or a new date.')
  await open()
  const item = questions().getByRole('article', { name: question.question, exact: true })
  await item.waitFor(); assert.match(await item.innerText(), /Reviewed synthetic-easel-7/)
  assert.equal(runtime.provider.posts.length, width === 1440 ? 1 : 2)
  const sent = runtime.provider.posts.at(-1)
  assert.equal(sent.channel, 'DOWNER'); assert.ok(sent.text.includes(question.question)); assert.ok(sent.text.includes('2026-12-15')); assert.ok(sent.text.includes(`/app?tab=review&record=${question.id}`))
  await screenshot(`private-slack-consented-${width}`)
  await noOverflow(page, `Private owner question ${width}`)
  await item.screenshot({ path: join(evidence, `private-owner-question-${width}.png`) })
  await item.getByLabel('My answer', { exact: true }).selectOption('yes')
  await action('/command/owner-question-answer', () => item.getByRole('button', { name: 'Record my answer', exact: true }).click())
  const answered = (await get('owner-questions')).questions.find(q => q.id === question.id)
  assert.equal(answered.answer.by, 'owner@example.test'); assert.equal(answered.answer.choice, 'yes')
  await cmd('owner-question-escalate', { id: answered.id, revision: answered.revision })
  assert.equal(runtime.provider.posts.length, width === 1440 ? 1 : 2)
  await action('/slack-private/revoke', () => press('Stop my private Slack messages'))
  await screenshot(`private-slack-stopped-${width}`)
  const stopped = await ask(width, 'Stopped private routing check.')
  const notice = (await get('notifications')).notifications.find(n => n.record === stopped.id)
  assert.equal(notice.status, 'blocked'); assert.equal(runtime.provider.posts.length, width === 1440 ? 1 : 2)
  await cmd('owner-question-cancel', { id: stopped.id, revision: stopped.revision, reason: 'Finished stopped-delivery browser proof' })
  console.log(`Private Slack ${width}: native mapping, exact self-consent, one structured private question, native answer, stopped routing and no overflow`)
 }
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'private-slack-failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
