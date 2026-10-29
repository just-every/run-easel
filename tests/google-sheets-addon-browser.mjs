// Native finance approval, separate person confirmation and the shipped sidebar
// against the production Worker. Only mail and the Google RPC host are replaced.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { api, noOverflow } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-google-sheets')
await mkdir(evidence, { recursive: true })
let server, browser
console.log('SHEET-002 browser journey started')
async function photo(page, name) {
 // Capture the actual viewport, including on system Chromium in cloud. Avoid
 // surface capture's large-scrolled-page GPU path; the pixels remain browser output.
 const cdp = await page.context().newCDPSession(page)
 let timer
 try {
  const value = await Promise.race([
   cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false }),
   new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser capture timed out: ${name}`)), 30000) }),
  ])
  await writeFile(join(evidence, name), Buffer.from(value.data, 'base64'))
 } finally { clearTimeout(timer); await cdp.detach() }
}
const messages = []
try {
 server = await builtBrowserRuntime({ https: true, bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1' }, outbound: async request => {
  if (new URL(request.url).hostname === 'api.resend.com') { messages.push(await request.json()); return Response.json({ id: 'synthetic-easel-2' }) }
  return new Response('Unexpected provider', { status: 502 })
 } })
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-gpu'] })
 const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 owner.setDefaultTimeout(30000)
 assert.equal((await owner.request.post(`${server.origin}/auth/bootstrap`, { headers: { origin: server.origin }, data: { token: server.bootstrap, displayName: 'Finance' }, maxRedirects: 0 })).status(), 303)
 const cmd = (op, body) => api(owner, server.origin, `command/${op}`, body)
 await cmd('workspace', { name: 'Synthetic Sheets company', currency: 'USD', planStart: '2026-01' })
 const department = await cmd('department', { name: 'Sales' }), line = await cmd('line', { name: 'Revenue', type: 'revenue' })
 const scenario = (await api(owner, server.origin, 'state')).scenarios[0].id
 const row = await cmd('schedule', { scenario, name: 'Sheets revenue', department: department.id, line: line.id, values: { '2026-01': '100' } })
 await cmd('member', { email: 'sheets@example.test', name: 'Sales planner', role: 'contributor', departments: [department.id] })
 await api(owner, server.origin, 'invite', { email: 'sheets@example.test' })
 const message = messages.find(m => m.to.includes('sheets@example.test'))
 assert.ok(message)
 const token = new URL(message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const contributor = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
 contributor.setDefaultTimeout(30000)
 assert.equal((await contributor.request.post(`${server.origin}/auth/confirm`, { headers: { origin: server.origin }, data: { token }, maxRedirects: 0 })).status(), 303)
 const setup = await owner.newPage(); await setup.goto(server.origin + '/setup'); await setup.getByRole('checkbox').check(); await setup.getByRole('button', { name: 'Finish setup' }).click()
 // click() waits for navigation commit, not document load. Closing mid-load
 // can strand Chromium's target-close command on a slower runner.
 await setup.waitForURL(server.origin + '/app', { waitUntil: 'load', timeout: 30000 })
 await setup.close()
 const page = await owner.newPage(); await page.goto(server.origin + '/app?tab=settings')
 const card = page.getByRole('region', { name: 'Google Sheets add-on', exact: true })
 await card.getByLabel('Add-on connection name').fill('Sales planning sheet')
 await card.getByLabel('Easel person email').fill('sheets@example.test')
 await card.getByLabel('Google spreadsheet ID').fill('synthetic-google-spreadsheet')
 await card.getByLabel('Add-on refresh schedule').selectOption('hourly')
 await card.getByLabel('Allow reviewed input write-back').check()
 await card.getByRole('button', { name: 'Create spreadsheet connection', exact: true }).click()
 const confirmationPath = await card.getByRole('link', { name: 'sign in and confirm their spreadsheet connection' }).getAttribute('href')
 assert.match(await card.innerText(), /Waiting for the named person/)
 const confirmation = await contributor.newPage(); await confirmation.goto(server.origin + confirmationPath)
 await confirmation.getByRole('button', { name: 'Confirm and receive my private key' }).click()
 const privateKey = confirmation.getByLabel('Your new private connection key')
 await privateKey.waitFor(); const key = await privateKey.inputValue(); assert.match(key, /^easgs_/)
 await confirmation.getByRole('button', { name: 'Dismiss private key' }).click()
 await card.getByRole('button', { name: 'Refresh add-on status' }).click()
 await card.getByText('Connected', { exact: true }).waitFor()
 assert.doesNotMatch(await card.innerText(), new RegExp(key))
 const manifest = await owner.request.get(server.origin + '/google-sheets/appsscript.json')
 assert.equal(manifest.status(), 200); assert.ok((await manifest.json()).oauthScopes.includes('https://www.googleapis.com/auth/script.scriptapp'))
 const source = await owner.request.get(server.origin + '/google-sheets/Code.gs')
 assert.equal(source.status(), 200); assert.match(await source.text(), /function easelHourlyRefresh/)
 await cmd('request-submissions', { scenario, departments: [department.id] })
 const before = await api(contributor, server.origin, `scenario/${scenario}`)
 const written = await contributor.request.post(server.origin + '/api/easel/google-sheets/write', { headers: { 'X-Easel-Sheets-Key': key, 'X-Easel-Spreadsheet': 'synthetic-google-spreadsheet' }, data: { scenario, revision: before.scenario.revision, schedule: row.id, month: '2026-01', value: '150' } })
 assert.equal(written.status(), 200); const entry = await written.json(); assert.equal(entry.mode, 'entry'); assert.equal(entry.scenario.revision, before.scenario.revision + 1)
 const plan = await contributor.newPage(); await plan.goto(server.origin + '/app?tab=plan')
 const input = plan.getByRole('region', { name: 'Planning grid', exact: true }).getByLabel('Sheets revenue Jan 2026 grid amount', { exact: true })
 await input.waitFor(); assert.equal(await input.inputValue(), '150.00')
 await plan.close()
 function installRpc({ key, spreadsheet }) {
  window.google = { script: { run: { withSuccessHandler: success => ({ withFailureHandler: failure => new Proxy({}, { get(_target, operation) { return async () => {
   try {
    if (operation !== 'easelSettings') throw new Error('Unexpected Google RPC')
    const response = await fetch('/api/easel/google-sheets/session', { headers: { 'X-Easel-Sheets-Key': key, 'X-Easel-Spreadsheet': spreadsheet } })
    const value = await response.json(); if (!response.ok) throw new Error(value.error)
    success({ ...value, connected: true, origin: location.origin })
   } catch (error) { failure(error) }
  } } }) }) } } }
 }
 const sidebar = await contributor.newPage(); await sidebar.addInitScript(installRpc, { key, spreadsheet: 'synthetic-google-spreadsheet' })
 await sidebar.goto(server.origin + '/google-sheets/Sidebar.html')
 await sidebar.getByText('Connected. Refresh to read current Easel values.', { exact: true }).waitFor()
 await sidebar.getByText('Insert a live formula', { exact: true }).click(); await sidebar.getByText('Write an input for review', { exact: true }).click()
 // The Apps Script journeys exercise failure emission at the network edge.
 // Here the same public health door proves the production native status UI.
 const addonHeaders = { 'X-Easel-Sheets-Key': key, 'X-Easel-Spreadsheet': 'synthetic-google-spreadsheet' }
 const refresh = await contributor.request.post(server.origin + '/api/easel/google-sheets/refresh', { headers: addonHeaders, data: { reason: 'menu', bindings: [{ key: 'revenue', kind: 'value', scenario, line: line.id, department: department.id, month: '2026-01' }] } })
 assert.equal(refresh.status(), 200)
 const successful = (await api(owner, server.origin, 'connections/sheets-addon')).connections[0]
 assert.equal(successful.rowCount, 1); assert.ok(successful.lastRefresh)
 const failure = await contributor.request.post(server.origin + '/api/easel/google-sheets/health', { headers: addonHeaders, data: { reason: 'menu', failure: 'http', status: 429, retryAfter: 120, error: 'Untrusted provider body' } })
 assert.equal(failure.status(), 200)
 await card.getByRole('button', { name: 'Refresh add-on status' }).click()
 await card.getByRole('cell', { name: 'HTTP 429; retry after 120 seconds', exact: true }).waitFor()
 await card.getByRole('cell', { name: 'Add-on refresh refused (HTTP 429); cached values cleared', exact: true }).waitFor()
 assert.equal(await card.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Refreshed bindings', exact: true }) }).getByRole('cell').last().innerText(), '0')
 assert.equal((await api(owner, server.origin, 'connections/sheets-addon')).connections[0].lastRefresh, successful.lastRefresh)
 assert.doesNotMatch(await card.innerText(), /Untrusted provider body/)
 console.log('SHEET-002 native approval, claim, entry and persisted failure display passed')
 await noOverflow(page, 'Google Sheets connection desktop'); await noOverflow(sidebar, 'Google Sheets sidebar desktop'); await noOverflow(confirmation, 'Google Sheets confirmation desktop')
 // Each proof width starts in a fresh page, avoiding viewport-change state in
 // unrelated Settings panels. Assertions above use 1440 only.
 for (const width of [1440, 390]) {
  const native = await owner.newPage(); await native.setViewportSize({ width, height: 1000 }); await native.goto(server.origin + '/app?tab=settings')
  const panel = native.getByRole('region', { name: 'Google Sheets add-on', exact: true }); await panel.getByText('Connected', { exact: true }).waitFor()
  const panelHeight = await panel.evaluate(e => Math.ceil(e.getBoundingClientRect().height)); await native.setViewportSize({ width, height: panelHeight + 40 })
  await panel.evaluate(e => e.scrollIntoView({ block: 'start' })); await photo(native, `google-sheets-connections-${width}.png`); await native.close()
  const confirmPhoto = await contributor.newPage(); await confirmPhoto.setViewportSize({ width, height: 1100 }); await confirmPhoto.goto(server.origin + confirmationPath)
  await confirmPhoto.getByText('This key was already claimed. Ask finance for a new connection if it was lost.', { exact: true }).waitFor()
  await confirmPhoto.setViewportSize({ width, height: await confirmPhoto.evaluate(() => document.documentElement.scrollHeight + 20) })
  await photo(confirmPhoto, `google-sheets-confirmation-${width}.png`); await confirmPhoto.close()
  const sheet = await contributor.newPage(); await sheet.setViewportSize({ width, height: 1100 }); await sheet.addInitScript(installRpc, { key, spreadsheet: 'synthetic-google-spreadsheet' }); await sheet.goto(server.origin + '/google-sheets/Sidebar.html')
  await sheet.getByText('Connected. Refresh to read current Easel values.', { exact: true }).waitFor(); await sheet.getByText('Insert a live formula', { exact: true }).click(); await sheet.getByText('Write an input for review', { exact: true }).click()
  await sheet.setViewportSize({ width, height: await sheet.evaluate(() => document.documentElement.scrollHeight + 20) }); await sheet.evaluate(() => scrollTo(0, 0))
  await photo(sheet, `google-sheets-sidebar-${width}.png`); await sheet.close()
  console.log(`SHEET-002 ${width}: native Connections, confirmation and sidebar captured`)
 }
 const unreachable = await contributor.request.post(server.origin + '/api/easel/google-sheets/health', { headers: addonHeaders, data: { reason: 'trigger', failure: 'transport' } })
 assert.equal(unreachable.status(), 200)
 await card.getByRole('button', { name: 'Refresh add-on status' }).click()
 await card.getByRole('cell', { name: 'Add-on could not reach Easel; cached values cleared', exact: true }).waitFor()
 const recovered = await contributor.request.post(server.origin + '/api/easel/google-sheets/refresh', { headers: addonHeaders, data: { reason: 'menu', bindings: [{ key: 'revenue', kind: 'value', scenario, line: line.id, department: department.id, month: '2026-01' }] } })
 assert.equal(recovered.status(), 200)
 await card.getByRole('button', { name: 'Refresh add-on status' }).click()
 await card.getByRole('cell', { name: 'None recorded', exact: true }).first().waitFor()
 await card.getByRole('button', { name: 'Change refresh schedule · Sales planning sheet' }).click(); await card.getByRole('cell', { name: 'On demand and on open', exact: true }).waitFor()
 await card.getByRole('button', { name: 'Disconnect add-on · Sales planning sheet' }).click(); await card.getByText(/Easel confirmed revocation of this add-on key/).waitFor()
 const refused = await contributor.request.get(server.origin + '/api/easel/google-sheets/session', { headers: { 'X-Easel-Sheets-Key': key, 'X-Easel-Spreadsheet': 'synthetic-google-spreadsheet' } }); assert.equal(refused.status(), 401)
 console.log('SHEET-002 native approval, person-only claim, direct input in Plan, persisted rate/transport failure, recovery, schedule and revocation passed; changed screens captured at 1440/390')
} finally {
 try { await Promise.all((browser?.contexts() ?? []).map(context => context.close())) }
 finally { try { await browser?.close() } finally { await server?.close() } }
}
console.log('SHEET-002 browser journey teardown complete')
