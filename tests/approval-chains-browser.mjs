// CYCLE-007: emitted production Worker, real D1 and native sign-in. Mail alone
// is a network-edge fake; every configuration and decision uses the built UI.
import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-approval-chains')
await mkdir(evidence, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'easel-approval-browser-')), port = await freePort(), origin = `https://127.0.0.1:${port}`
const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = [], messages = []
async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
await enumerate(workerDir)
const mf = new Miniflare({ ...convertV4MiniflareOptions({
 host: '127.0.0.1', port, https: true, inspectorPort: 0, modules: [entry, ...scripts.filter(p => p !== entry)].map(path => ({ type: 'ESModule', path })), modulesRoot: workerDir,
 compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-approval-browser' },
 bindings: { AUTH_ORIGIN: origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'synthetic-easel-session-01234567890123456789', SETUP_TOKEN: 'synthetic-easel-bootstrap-01234567890123456789', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1', MAIL_FROM: 'Easel <easel@example.test>' },
 assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
 outboundService: async request => { assert.equal(new URL(request.url).hostname, 'api.resend.com'); messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) },
}), resourcePersistencePath: scratch })
let browser
const sessions = []
try {
 await mf.ready
 const db = await mf.getD1Database('DB')
 for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const make = async () => { const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage(); track(page); page.on('dialog', d => d.accept()); const session = { context, page }; sessions.push(session); return session }
 const owner = await make()
 const post = async (session, path, body, status = 200) => { const r = await session.context.request.post(origin + path, { headers: { origin }, data: body, maxRedirects: 0 }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return status === 200 ? r.json() : null }
 const cmd = (op, body, session = owner) => post(session, `/api/easel/command/${op}`, body)
 const get = async (session, path) => { const r = await session.context.request.get(origin + '/api/easel/' + path); assert.equal(r.status(), 200); return r.json() }
 await post(owner, '/auth/bootstrap', { token: 'synthetic-easel-bootstrap-01234567890123456789', displayName: 'Fran Finance' }, 303)
 await cmd('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' }), eng = await cmd('department', { name: 'Engineering' }), line = await cmd('line', { name: 'Services', type: 'revenue' })
 const budget = (await get(owner, 'state')).scenarios[0]
 await cmd('revenue', { scenario: budget.id, department: sales.id, line: line.id, name: 'Service retainers', kind: 'volume', start: '2026-01', startVolume: '10', rate: '250' })
 const member = async (email, name, role, departments) => {
  await cmd('member', { email, name, role, departments }); const before = messages.length
  await post(owner, '/api/easel/invite', { email })
  const message = messages.slice(before).find(m => m.to.includes(email)); assert.ok(message, 'Invitation reaches the mail boundary')
  const token = new URL(message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
  const session = await make(); await post(session, '/auth/confirm', { token }, 303); return session
 }
 const submitter = await member('submitter@example.test', 'Sam Sales', 'contributor', [sales.id])
 const head = await member('head@example.test', 'Dana Department Head', 'contributor', [sales.id])
 const planner = await member('planner@example.test', 'Pat Planner', 'finance', [])
 await cmd('member', { email: 'head@example.test', name: 'Dana Department Head', role: 'contributor', departments: [], groupOnly: true })
 const group = await cmd('group-save', { name: 'Department heads', members: ['head@example.test'], departments: { read: [sales.id] } })
 await owner.page.goto(origin + '/setup'); await owner.page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check(); await owner.page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 const open = async session => { await session.page.goto(origin + '/app?tab=cycle'); await session.page.getByRole('heading', { name: 'Department approval chains', exact: true }).waitFor(); await settle(session.page) }
 const panel = session => session.page.getByRole('article', { name: 'Sales approval chain', exact: true })
 const action = async (session, op, click) => { const response = session.page.waitForResponse(r => r.url().endsWith(`/command/${op}`)); await click(); const r = await response; assert.equal(r.status(), 200, await r.text()); await settle(session.page); return r.json() }
 const shoot = async (session, name, width) => { await noOverflow(session.page, `${name} ${width}`); await panel(session).screenshot({ path: join(evidence, `${name}-${width}.png`) }) }
 const submit = async () => { await open(submitter); await action(submitter, 'submit', () => submitter.page.getByRole('button', { name: 'Submit Sales', exact: true }).click()) }
 const headApprove = async () => { await open(head); await action(head, 'approval-step', () => panel(head).getByRole('button', { name: 'Approve Sales: Department head', exact: true }).click()) }
 for (const width of [1440, 390]) {
  for (const s of sessions) await s.page.setViewportSize({ width, height: 1000 })
  await open(owner)
  await panel(owner).getByText('Configure Sales approval chain', { exact: true }).click()
  await panel(owner).getByLabel('Step 1 name', { exact: true }).fill('Department head')
  await panel(owner).getByLabel('Step 1 groups', { exact: true }).selectOption(group.id)
  if (width === 1440) await panel(owner).getByRole('button', { name: 'Add review step', exact: true }).click()
  await panel(owner).getByLabel('Step 2 name', { exact: true }).fill('Finance planner')
  await panel(owner).getByLabel('Step 2 people', { exact: true }).selectOption('planner@example.test')
  await shoot(owner, 'configure', width)
  await action(owner, 'approval-chain-save', () => panel(owner).getByRole('button', { name: 'Save Sales chain', exact: true }).click())
  if (width === 1440) {
   await owner.page.getByLabel('Departments', { exact: true }).selectOption(sales.id)
   await action(owner, 'request-submissions', () => owner.page.getByRole('button', { name: 'Request submissions', exact: true }).click())
  }
  await submit(); await open(head); await shoot(head, 'waiting-first-step', width)
  await open(planner); assert.equal(await panel(planner).getByRole('button', { name: 'Approve Sales: Finance planner', exact: true }).count(), 0)
  await headApprove(); await open(planner)
  await panel(planner).getByLabel('Reason to return Sales', { exact: true }).fill(`Review the assumptions at ${width}`)
  await action(planner, 'return-submission', () => panel(planner).getByRole('button', { name: 'Return Sales', exact: true }).click())
  await panel(planner).getByText('Sales review history', { exact: true }).click(); await shoot(planner, 'returned-history', width)
  assert.match(await panel(planner).innerText(), /prior decision\(s\) voided/)
  await submit(); await headApprove(); await open(planner)
  await action(planner, 'approval-step', () => panel(planner).getByRole('button', { name: 'Approve Sales: Finance planner', exact: true }).click())
  await shoot(planner, 'completed', width)
  const result = (await get(owner, `approval-chains/${budget.id}`)).departments.find(d => d.department === sales.id)
  assert.equal(result.submission.status, 'submitted'); assert.equal(result.submission.review.decisions.length, 2)
  if (width === 1440) await cmd('return-submission', { scenario: budget.id, department: sales.id, reason: 'Next planning review' })
  console.log(`CYCLE-007 ${width}: native finance configuration, ordered review, return, resubmission, retained history and no page overflow passed`)
 }
} catch (error) {
 for (let i = 0; i < sessions.length; i++) await sessions[i].page.screenshot({ path: join(evidence, `failed-${i}.png`), fullPage: true }).catch(() => {})
 throw error
} finally { await browser?.close(); await mf.dispose(); await rm(scratch, { recursive: true, force: true }) }
