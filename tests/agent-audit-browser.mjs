// Native audit filtering and complete downloads from the built application.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow } from './browser-journey.mjs'
import { allAgentAudit, seedAgentAudit } from './agent-audit-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-audit')
await mkdir(evidence, { recursive: true })
const messages = [], runtime = await builtBrowserRuntime({ https: true,
 bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1' },
 outbound: async request => { assert.equal(new URL(request.url).hostname, 'api.resend.com'); messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) },
})
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
 const send = async (path, body, who = owner, method = body === undefined ? 'GET' : 'POST', expected = 200) => {
  const response = await who.request.fetch(runtime.origin + path, { method, headers: { origin: runtime.origin, 'mcp-protocol-version': '2025-11-25' }, ...(body === undefined ? {} : { data: body }), maxRedirects: 0 })
  assert.equal(response.status(), expected, `${path}: ${await response.text()}`)
  return expected === 200 ? response.json() : null
 }
 const get = path => send(path), command = (op, data) => send('/api/easel/command/' + op, data)
 await send('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Fran Finance' }, owner, 'POST', 303)
 const person = async (email, role, departments) => {
  await command('member', { email, name: email.split('@')[0], role, departments })
  await command('pay-detail', { email, granted: true })
  await send('/api/easel/invite', { email })
  const invitation = messages.find(message => message.to.includes(email)); assert.ok(invitation)
  const token = new URL(invitation.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  await send('/auth/confirm', { token }, context, 'POST', 303)
  return context
 }
 const policy = disposition => send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: disposition, class: '*', do: disposition, ...(disposition === 'approval' ? { approver: ['role:owner'], wait: 'P1D' } : {}) }], spend: { none: true } } }, owner, 'PUT')
 let id = 0
 const rpc = async (name, args, who) => {
  const body = await send('/mcp', { jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args, _meta: { traceparent: 'synthetic-easel-audit-trace' } } }, who)
  assert.ok(!body.error, JSON.stringify(body)); return body.result
 }
 const fixture = await seedAgentAudit({ get, command, person, rpc, policy, owner, approve: (path, data, who, expected) => send(path + '/approve', data, who, 'POST', expected) })
 const snapshots = (await runtime.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
 assert.ok(snapshots.length > 0)
 page = await owner.newPage()
 await page.goto(runtime.origin + '/setup')
 await page.getByLabel('I confirm this owner account is ready to use.', { exact: true }).check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.goto(runtime.origin + '/app?tab=review')
 await page.getByRole('link', { name: 'Browse agent audit', exact: true }).click()
 await page.getByRole('heading', { name: 'Agent audit', exact: true }).waitFor()
 const status = page.getByRole('status'), items = page.locator('[data-audit-id]')
 await page.getByRole('button', { name: 'Download JSON', exact: true }).waitFor({ state: 'visible' })
 await page.waitForFunction(() => !document.getElementById('download').disabled)
 assert.equal(await items.count(), 200)
 await page.getByRole('button', { name: 'Load more actions', exact: true }).click()
 await page.waitForFunction(n => document.querySelectorAll('[data-audit-id]').length === n, fixture.rows.length)
 const filter = async (agent, cls, expected, complete = true) => {
  await page.getByLabel('Agent ID', { exact: true }).fill(agent)
  await page.getByLabel('Class', { exact: true }).fill(cls)
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await page.waitForFunction(() => !document.getElementById('download').disabled)
  while (complete && await page.getByRole('button', { name: 'Load more actions', exact: true }).isVisible()) {
   await page.getByRole('button', { name: 'Load more actions', exact: true }).click()
   await page.waitForFunction(() => !document.getElementById('download').disabled)
  }
  assert.deepEqual(await items.evaluateAll(elements => elements.map(element => element.dataset.auditId)), expected.map(row => row.id))
 }
 const byAgent = fixture.rows.filter(row => row.agent.id === fixture.agent)
 const sensitive = fixture.rows.filter(row => row.classes.some(item => item.class === 'sensitive'))
 const combined = sensitive.filter(row => row.agent.id === fixture.agent)
 await filter(fixture.agent, '', byAgent)
 await filter('', 'sensitive', sensitive)
 await filter(fixture.agent, 'sensitive', combined)
 assert.ok(combined.length > 4)
 assert.ok((await items.allTextContents()).every(text => text.includes('MCP client for synthetic-easel-planner')))
 const download = async filename => {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
  const file = await pending, path = join(evidence, filename); await file.saveAs(path)
  assert.equal(await file.failure(), null)
  await page.waitForFunction(() => !document.getElementById('download').disabled)
  return JSON.parse(await readFile(path, 'utf8'))
 }
 const exported = await download('filtered-audit.json')
 assert.deepEqual(exported, combined, 'Every audit field survives the complete JSON download')
 const held = exported.find(row => row.approval?.id === fixture.approval && row.outcome === 'done')
 assert.ok(held); assert.equal(held.sponsor.name, 'synthetic-easel-planner')
 const nativeOwner = (await get('/auth/session')).operator
 assert.deepEqual(held.approval.by, [nativeOwner.id])
 assert.notEqual(held.sponsor.id, nativeOwner.id)
 assert.ok(exported.some(row => row.trace === 'synthetic-easel-audit-trace'))
 await items.filter({ has: page.getByRole('heading', { name: 'easel.proposals.create', exact: true }) }).last().getByText('All audit fields', { exact: true }).click()
 await page.evaluate(await readFile(import.meta.resolve('axe-core/axe.min.js').replace('file://', ''), 'utf8'))
 const axe = await page.evaluate(async () => (await axe.run(document)).violations.filter(v => ['serious', 'critical'].includes(v.impact)))
 assert.deepEqual(axe.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), [], 'No serious or critical accessibility findings')
 assert.ok(await page.locator('main p, main button, main input, main pre, main summary').evaluateAll(elements => elements.filter(element => element.getClientRects().length).every(element => parseFloat(getComputedStyle(element).fontSize) >= 13)))
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 }); await noOverflow(page, `Agent audit ${width}`)
  await page.screenshot({ path: join(evidence, `agent-audit-${width}.png`), fullPage: true })
 }
 await page.setViewportSize({ width: 1440, height: 1000 })
 await filter('synthetic-easel-missing', '', [])
 assert.equal(await status.innerText(), 'No matching actions.')
 assert.deepEqual(await download('empty-audit.json'), [])
 await filter('', '', fixture.rows.slice(0, 200), false)
 assert.deepEqual(await download('complete-audit.json'), fixture.rows, 'An unfiltered download includes rows beyond the displayed page')
 assert.deepEqual(await allAgentAudit(get), fixture.rows)
 assert.deepEqual((await runtime.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results, snapshots)
 const editor = await person(['synthetic-easel-editor', 'example.test'].join('@'), 'finance', [])
 assert.equal((await editor.request.get(runtime.origin + '/agents/api/audit')).status(), 200)
 const editorPage = await editor.newPage()
 await editorPage.goto(runtime.origin + '/agents/audit')
 await editorPage.waitForFunction(() => !document.getElementById('download').disabled)
 const editorId = (await send('/auth/session', undefined, editor)).operator.id
 await send('/auth/operator/role', { operatorId: editorId, role: 'member' })
 await editorPage.getByRole('button', { name: 'Apply filters', exact: true }).click()
 await editorPage.getByText('Your session or audit permission is unavailable.', { exact: false }).waitFor()
 assert.equal(await editorPage.locator('[data-audit-id]').count(), 0)
 assert.equal(await editorPage.getByRole('button', { name: 'Download JSON', exact: true }).isDisabled(), true)
 await editorPage.close()
 // Losing authority during a multi-page export discards even its collected first page.
 let reads = 0, downloads = 0
 page.on('download', () => downloads++)
 await page.route('**/agents/api/audit?*', async route => {
  if (++reads === 2) {
   await send('/auth/signout', {}, owner, 'POST', 204)
  }
  await route.continue()
 })
 await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
 await page.getByText('Your session or audit permission is unavailable.', { exact: false }).waitFor()
 assert.ok(reads >= 2); assert.equal(downloads, 0)
 assert.equal(await items.count(), 0)
 assert.equal(await page.getByRole('button', { name: 'Download JSON', exact: true }).isDisabled(), true)
 assert.equal(await page.getByRole('button', { name: 'Load more actions', exact: true }).isVisible(), false)
 await page.unroute('**/agents/api/audit?*')
 assert.equal((await owner.request.get(runtime.origin + '/agents/audit')).status(), 401)
 assert.equal((await fixture.planner.request.get(runtime.origin + '/agents/audit')).status(), 403)
 console.log(`PROBE BASE-AGENT-009 point5 browser: /agents/audit with ${fixture.rows.length} interleaved calls -> exact filters across empty matching page, complete downloaded fields and named approvals, authorization loss clears rows and prevents download`)
 console.log('PROBE BASE-AGENT-009 point7 slice: Agent audit at 1440 and 390 -> no horizontal overflow; axe serious=0 critical=0 at 1440; text at least 13px; no icon-only controls')
} catch (error) { await page?.screenshot({ path: join(evidence, 'failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
