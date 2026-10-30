// Built application and native sessions; only invitation mail is faked at its network edge.
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-attribution')
await mkdir(evidence, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'easel-attribution-')), port = await freePort(), origin = `https://127.0.0.1:${port}`
const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = [], messages = []
const ownerEmail = ['synthetic-easel-owner', 'example.test'].join('@'), plannerEmail = ['synthetic-easel-planner', 'example.test'].join('@')
const bootstrap = 'synthetic-easel-bootstrap-01234567890123456789'
async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
await enumerate(workerDir)
const mf = new Miniflare({ ...convertV4MiniflareOptions({
 host: '127.0.0.1', port, https: true, inspectorPort: 0, modules: [entry, ...scripts.filter(p => p !== entry)].map(path => ({ type: 'ESModule', path })), modulesRoot: workerDir,
 compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-agent-attribution' },
 bindings: { AUTH_ORIGIN: origin, OWNER_EMAIL: ownerEmail, SESSION_SECRET: 'synthetic-easel-session-01234567890123456789', SETUP_TOKEN: bootstrap, MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1', MAIL_FROM: `Easel <${ownerEmail}>` },
 assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
 outboundService: async request => { assert.equal(new URL(request.url).hostname, 'api.resend.com'); messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) },
}), resourcePersistencePath: scratch })
let browser, page
try {
 await mf.ready
 const db = await mf.getD1Database('DB')
 for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
 const planner = await browser.newContext({ ignoreHTTPSErrors: true })
 const post = async (context, path, data, status = 200, method = 'POST') => {
  const r = await context.request.fetch(origin + path, { method, headers: { origin }, data, maxRedirects: 0 })
  assert.equal(r.status(), status, `${path}: ${await r.text()}`)
  return status === 200 ? r.json() : null
 }
 const get = async path => { const r = await owner.request.get(origin + path); assert.equal(r.status(), 200, await r.text()); return r.json() }
 const command = (op, data) => post(owner, `/api/easel/command/${op}`, data)
 await post(owner, '/auth/bootstrap', { token: bootstrap, displayName: 'Fran Finance' }, 303)
 await command('workspace', { name: 'Synthetic attribution studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Sales' })
 const budget = (await get('/api/easel/state')).scenarios[0]
 const forecast = (await command('approve-budget', { scenario: budget.id, revision: (await get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 const frozen = (await db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
 assert.ok(frozen.length > 0, 'There is an approved snapshot whose bytes must stay fixed')
 await command('member', { email: plannerEmail, name: 'Pat Planner', role: 'contributor', departments: [department.id] })
 await post(owner, '/api/easel/invite', { email: plannerEmail })
 const mail = messages.find(message => message.to.includes(plannerEmail)); assert.ok(mail)
 const token = new URL(mail.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 await post(planner, '/auth/confirm', { token }, 303)
 const policy = disposition => post(owner, '/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: disposition, class: '*', do: disposition, ...(disposition === 'approval' ? { approver: ['role:owner'], wait: 'P1D' } : {}) }], spend: { none: true } } }, 200, 'PUT')
 const prepare = args => async () => {
  const response = await planner.request.post(origin + '/mcp', { headers: { origin, 'mcp-protocol-version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'easel.proposals.create', arguments: args } } })
  assert.equal(response.status(), 200, await response.text())
  return (await response.json()).result
 }
 await policy('autonomous')
 const autonomous = await prepare({ from: forecast.id, name: 'Autonomous cost alternative', request: 'Prepare a planning alternative', idempotency_key: 'synthetic-easel-auto-1' })()
 assert.equal(autonomous.isError, false, JSON.stringify(autonomous))
 await policy('approval')
 const heldCall = prepare({ from: forecast.id, name: 'Reviewed cost alternative', request: 'Prepare a reviewed planning alternative', idempotency_key: 'synthetic-easel-held-1' })
 const pending = await heldCall(), handle = pending._meta['com.runeditrun/error'].approval
 assert.ok(handle.id)
 const approvalPath = `/agents/api/approvals/${handle.id}`, approval = (await get(approvalPath)).approval
 const approvalEvidence = { revision: approval.revision, summary_sha256: approval.summary_sha256 }
 const before = (await get('/api/easel/state')).scenarios
 await post(planner, `${approvalPath}/approve`, approvalEvidence, 403)
 assert.deepEqual((await get('/api/easel/state')).scenarios, before)
 page = await owner.newPage(); track(page)
 await page.goto(handle.url)
 await page.getByText('MCP client for Pat Planner', { exact: true }).waitFor()
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await noOverflow(page, `Approval ${width}`)
  await page.screenshot({ path: join(evidence, `approval-${width}.png`), fullPage: true })
 }
 await page.setViewportSize({ width: 1440, height: 1000 })
 const completion = page.waitForResponse(r => r.url().endsWith(`${approvalPath}/approve`) && r.request().method() === 'POST')
 await page.getByRole('button', { name: 'Approve', exact: true }).click()
 const completed = await completion; assert.equal(completed.status(), 200)
 assert.equal((await get(approvalPath)).approval.state, 'executed')
 const held = (await heldCall()).structuredContent; assert.ok(held.id)
 const filtered = await get(`/api/easel/activity?actor=${encodeURIComponent(plannerEmail)}`)
 assert.ok(filtered.length >= 4)
 assert.ok(filtered.every(row => row.actor === plannerEmail && row.detail.authority.label === 'MCP client for Pat Planner'))
 const prepared = filtered.filter(row => row.action === 'proposal-create')
 assert.equal(prepared.length, 2, 'A completed-key replay adds no native effect')
 const reviewed = prepared.find(row => row.record === held.id)
 assert.deepEqual(reviewed.detail.authority.approvers.map(person => person.name), ['Fran Finance'])
 assert.notEqual(reviewed.detail.authority.approvers[0].id, reviewed.detail.authority.for.id)
 await page.goto(origin + '/setup')
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.goto(origin + '/app?tab=activity')
 await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor(); await settle(page)
 await page.getByLabel('Person email', { exact: true }).fill(plannerEmail)
 const filtering = page.waitForResponse(r => new URL(r.url()).pathname === '/api/easel/activity' && new URL(r.url()).searchParams.get('actor') === plannerEmail)
 await page.getByRole('button', { name: 'Filter activity', exact: true }).click(); await filtering; await settle(page)
 const who = await page.locator('.activity-log tbody [data-label="Who"]').allTextContents()
 assert.equal(who.length, filtered.length)
 assert.ok(who.every(text => text.startsWith('MCP client for Pat Planner')))
 assert.ok(who.some(text => text.includes('Approved by Fran Finance')))
 assert.ok(who.some(text => !text.includes('Approved by')))
 const download = async (label, filename) => {
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: label, exact: true }).click()
  const file = await pending, path = join(evidence, filename); await file.saveAs(path)
  assert.equal(await file.failure(), null); return readFile(path)
 }
 const csvBytes = await download('Export filtered activity as CSV', 'activity.csv')
 const csvBook = new ExcelJS.Workbook(), csv = await csvBook.csv.read(Readable.from([csvBytes]))
 const book = new ExcelJS.Workbook(); await book.xlsx.load(await download('Download activity (Excel)', 'activity.xlsx'))
 const sheet = book.getWorksheet('Activity')
 const csvHeaders = csv.getRow(1).values
 const nativeColumn = csvHeaders.indexOf('Actor'), labelColumn = csvHeaders.indexOf('Attribution')
 assert.ok(nativeColumn > 0 && labelColumn > 0)
 assert.equal(csv.rowCount - 1, filtered.length)
 for (let row = 2; row <= csv.rowCount; row++) {
  assert.equal(csv.getRow(row).getCell(nativeColumn).value, plannerEmail)
  assert.equal(csv.getRow(row).getCell(labelColumn).value, 'MCP client for Pat Planner')
 }
 assert.equal(sheet.rowCount - 3, filtered.length)
 for (let row = 3; row < sheet.rowCount; row++) {
  assert.equal(sheet.getRow(row).getCell(3).value, plannerEmail)
  assert.equal(sheet.getRow(row).getCell(4).value, 'MCP client for Pat Planner')
 }
 const exported = sheet.getRows(3, filtered.length).find(row => row.getCell(1).value === reviewed.seq)
 assert.equal(JSON.parse(exported.getCell(10).value).authority.approvers[0].name, 'Fran Finance')
 assert.ok(csvBytes.toString().includes('Fran Finance'))
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await settle(page); await noOverflow(page, `Activity ${width}`)
  await page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Activity', exact: true }) }).screenshot({ path: join(evidence, `activity-${width}.png`) })
 }
 await page.setViewportSize({ width: 1440, height: 1000 })
 assert.ok(await page.locator('.activity-log').evaluate(node => [...node.querySelectorAll('td, th')].every(cell => parseFloat(getComputedStyle(cell).fontSize) >= 13)))
 assert.deepEqual((await db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results, frozen)
 const persisted = (await db.prepare('SELECT * FROM e_activity WHERE seq=?').bind(reviewed.seq).first())
 await command('member', { email: plannerEmail, name: 'Pat Planner', role: 'contributor', departments: [department.id], active: false })
 const erased = await command('person-erase', { email: plannerEmail })
 const erasedRows = await get(`/api/easel/activity?record=${held.id}`)
 assert.ok(!JSON.stringify(erasedRows).includes('Pat Planner'))
 assert.ok(!JSON.stringify(erasedRows).includes(plannerEmail))
 assert.ok(JSON.stringify(erasedRows).includes(`MCP client for ${erased.pseudonym}`))
 await page.reload(); await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor(); await settle(page)
 assert.ok(!(await page.locator('.activity-log').textContent()).includes('Pat Planner'))
 assert.deepEqual(await db.prepare('SELECT * FROM e_activity WHERE seq=?').bind(reviewed.seq).first(), persisted)
 assert.deepEqual((await db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results, frozen)
 console.log('PROBE BASE-AGENT-008 point6: /mcp autonomous and held proposals, native owner approval, Activity and downloaded CSV and XLSX -> agent for person, separate approver, preserved filters and snapshots; screens 1440 and 390')
} catch (error) { if (page) await page.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await mf.dispose(); await rm(scratch, { recursive: true, force: true }) }
