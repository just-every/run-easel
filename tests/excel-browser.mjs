// Excel write-back read in the production Plan grid; Office qualification is
// separately required and is never inferred from this native browser proof.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { api, noOverflow } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-excel')
await mkdir(evidence, { recursive: true })
const messages = []
let server, browser
try {
 server = await builtBrowserRuntime({ https: true, bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1' }, outbound: async request => {
  if (new URL(request.url).hostname === 'api.resend.com') { messages.push(await request.json()); return Response.json({ id: 'synthetic-easel-2' }) }
  return new Response('Unexpected provider', { status: 502 })
 } })
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 assert.equal((await owner.request.post(`${server.origin}/auth/bootstrap`, { headers: { origin: server.origin }, data: { token: server.bootstrap, displayName: 'Finance' }, maxRedirects: 0 })).status(), 303)
 const cmd = (op, body) => api(owner, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'synthetic-easel-1', currency: 'USD', planStart: '2026-01' })
 const dept = await cmd('department', { name: 'Sales' }), line = await cmd('line', { name: 'Revenue', type: 'revenue' })
 const scenario = (await api(owner, server.origin, 'state')).scenarios[0].id
 const row = await cmd('schedule', { scenario, name: 'Excel revenue', department: dept.id, line: line.id, values: { '2026-01': '100' } })
 await cmd('member', { email: 'excel@example.test', name: 'Excel contributor', role: 'contributor', departments: [dept.id] })
 await api(owner, server.origin, 'invite', { email: 'excel@example.test' })
 const message = messages.find(m => m.to.includes('excel@example.test'))
 assert.ok(message)
 const token = new URL(message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const contributor = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 assert.equal((await contributor.request.post(`${server.origin}/auth/confirm`, { headers: { origin: server.origin }, data: { token }, maxRedirects: 0 })).status(), 303)
 const setup = await owner.newPage(); await setup.goto(`${server.origin}/setup`); await setup.getByRole('checkbox').check(); await setup.getByRole('button', { name: 'Finish setup' }).click(); await setup.close()
 await cmd('request-submissions', { scenario, departments: [dept.id] })
 const before = await api(contributor, server.origin, `scenario/${scenario}`)
 const direct = await api(contributor, server.origin, 'command/excel-write', { scenario, revision: before.scenario.revision, schedule: row.id, month: '2026-01', value: '150' })
 assert.equal(direct.scenario.revision, before.scenario.revision + 1)
 const page = await contributor.newPage()
 await page.goto(`${server.origin}/app?tab=plan`)
 const grid = page.getByRole('region', { name: 'Planning grid', exact: true })
 const input = grid.getByLabel('Excel revenue Jan 2026 grid amount', { exact: true })
 await input.waitFor(); assert.equal(await input.inputValue(), '150.00')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await noOverflow(page, `Excel direct entry ${width}`)
  await grid.screenshot({ path: join(evidence, `excel-entry-${width}.png`) })
 }
 console.log('Excel write-back: contributor next-revision entry reads as 150.00 in native Plan; 1440 and 390 proof captured')
} finally { await browser?.close(); await server?.close() }
