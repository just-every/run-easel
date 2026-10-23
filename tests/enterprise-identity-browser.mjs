// The production Worker completes a signed IdP round-trip over HTTPS. Only
// the external identity provider is a fake; native cookies/D1 stay real.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { fakeIdentityProvider } from './enterprise-idp.mjs'
import { noOverflow, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-enterprise-identity')
await mkdir(evidence, { recursive: true })
const idp = fakeIdentityProvider(), binding = JSON.parse(idp.bindings.EASEL_SAML_CONFIG)
binding.subjectEmails = { 'synthetic-easel-2': 'owner@example.test' }
const runtime = await builtBrowserRuntime({ https: true, bindings: { EASEL_SAML_CONFIG: JSON.stringify(binding) } })
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ ignoreHTTPSErrors: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.1' } })
 const boot = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'Fran Finance' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const workspace = await context.request.post(`${runtime.origin}/api/easel/command/workspace`, { headers: { origin: runtime.origin }, data: { name: 'Harbor Services', currency: 'USD', planStart: '2026-01' } })
 assert.equal(workspace.status(), 200)
 const setup = await context.newPage()
 await setup.goto(`${runtime.origin}/setup`); await setup.getByRole('checkbox').check(); await setup.getByRole('button', { name: 'Finish setup' }).click(); await setup.close()
 const enabled = await context.request.post(`${runtime.origin}/auth/settings/identity`, { headers: { origin: runtime.origin }, data: { idpSignIn: true } })
 assert.equal(enabled.status(), 200)
 let requests = 0
 await context.route(`${binding.idpSsoUrl}**`, async route => {
  const response = await idp.provider(new Request(route.request().url()))
  const content = (await response.text()).replace('</form>', '<button type="submit">Return to Easel</button></form>')
  requests++
  await route.fulfill({ status: response.status, contentType: 'text/html', body: content })
 })
 page = await context.newPage(); track(page)
 page.on('requestfailed', request => { if (request.isNavigationRequest()) console.error('Navigation failed:', new URL(request.url()).pathname, request.failure()?.errorText) })
 page.on('response', response => { if (response.request().isNavigationRequest()) console.log('Navigation:', response.status(), new URL(response.url()).origin, new URL(response.url()).pathname) })
 for (const width of [1440, 390]) {
  const signedOut = await context.request.post(`${runtime.origin}/auth/signout`, { headers: { origin: runtime.origin }, data: {}, maxRedirects: 0 })
  assert.equal(signedOut.status(), 204)
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`${runtime.origin}/signin`)
  const link = page.getByRole('link', { name: 'Company SAML sign-in', exact: true })
  await link.waitFor(); await noOverflow(page, `Enterprise native sign-in ${width}`)
  await page.screenshot({ path: join(evidence, `enterprise-signin-${width}.png`), fullPage: true })
  await link.click(); await page.getByRole('heading', { name: 'Company sign-in', exact: true }).waitFor()
  await noOverflow(page, `SAML confirmation ${width}`)
  assert.doesNotMatch(await page.content(), /BEGIN CERTIFICATE|subjectEmails|PRIVATE KEY/)
  await page.screenshot({ path: join(evidence, `enterprise-saml-${width}.png`), fullPage: true })
  await page.getByRole('button', { name: 'Continue with SAML', exact: true }).click()
  await page.getByRole('button', { name: 'Return to Easel', exact: true }).click()
  await page.waitForURL(`${runtime.origin}/app`)
  await page.getByRole('navigation', { name: 'Easel', exact: true }).waitFor()
  const session = await (await context.request.get(`${runtime.origin}/auth/session`)).json()
  assert.equal(session.operator.email, 'owner@example.test'); assert.equal(session.kind, 'oidc')
  await noOverflow(page, `SAML signed-in app ${width}`)
  await page.screenshot({ path: join(evidence, `enterprise-signedin-${width}.png`) })
  console.log(`ACCESS-002 ${width}: native sign-in, HTTPS signed SAML round-trip and authenticated app passed`)
 }
 assert.equal(requests, 2)
} catch (error) { if (page && !page.isClosed()) console.error('Last page:', new URL(page.url()).origin, new URL(page.url()).pathname, (await page.locator('body').innerText().catch(() => '')).slice(0, 200)); if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'enterprise-failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
