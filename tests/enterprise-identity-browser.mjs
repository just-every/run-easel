// Production-built native sign-in pages at both contract widths. The external
// IdP navigation is the only fake; all setup and owner sessions use HTTP doors.
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inflateRawSync } from 'node:zlib'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-enterprise-identity')
await mkdir(evidence, { recursive: true })
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
const cert = execFileSync('openssl', ['req', '-new', '-x509', '-key', '/dev/stdin', '-subj', '/CN=synthetic-easel-1', '-days', '1', '-sha256'], { input: key, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
const endpoint = 'https://synthetic-easel-1.example.test/saml/sso'
const runtime = await builtBrowserRuntime({ bindings: { EASEL_SAML_CONFIG: JSON.stringify({ id: 'synthetic-easel-1', issuer: 'https://synthetic-easel-1.example.test/saml', idpSsoUrl: endpoint, idpCert: cert, spEntityId: 'synthetic-easel-1:sp', subjectEmails: { 'synthetic-easel-2': 'owner@example.test' } }) } })
let browser, page
try {
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const context = await browser.newContext({ extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.1' } })
 const boot = await context.request.post(`${runtime.origin}/auth/bootstrap`, { headers: { origin: runtime.origin }, data: { token: runtime.bootstrap, displayName: 'synthetic-easel-1' }, maxRedirects: 0 })
 assert.equal(boot.status(), 303)
 const enabled = await context.request.post(`${runtime.origin}/auth/settings/identity`, { headers: { origin: runtime.origin }, data: { idpSignIn: true } })
 assert.equal(enabled.status(), 200)
 const signedOut = await context.request.post(`${runtime.origin}/auth/signout`, { headers: { origin: runtime.origin }, maxRedirects: 0 })
 assert.equal(signedOut.status(), 303)
 let requests = 0
 await context.route(`${endpoint}**`, async route => {
  const url = new URL(route.request().url()), request = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'), 'base64')).toString('utf8')
  assert.ok(url.searchParams.get('RelayState'))
  assert.match(request, /synthetic-easel-1:sp/)
  assert.ok(request.includes(`${runtime.origin}/auth/saml/synthetic-easel-1/callback`))
  requests++
  await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company identity provider</title><main style="max-width:420px;margin:12vh auto;padding:24px;font:18px system-ui"><h1>Company identity provider</h1><p>The company received a SAML authentication request from Easel.</p></main></html>' })
 })
 page = await context.newPage(); track(page)
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${runtime.origin}/signin`)
  const link = page.getByRole('link', { name: 'Company SAML sign-in', exact: true })
  await link.waitFor(); await noOverflow(page, `Enterprise native sign-in ${width}`)
  await page.screenshot({ path: join(evidence, `enterprise-signin-${width}.png`), fullPage: true })
  await link.click()
  await page.getByRole('heading', { name: 'Company sign-in', exact: true }).waitFor()
  await noOverflow(page, `SAML confirmation ${width}`)
  assert.doesNotMatch(await page.content(), /BEGIN CERTIFICATE|subjectEmails|PRIVATE KEY/)
  await page.screenshot({ path: join(evidence, `enterprise-saml-${width}.png`), fullPage: true })
  await page.getByRole('button', { name: 'Continue with SAML', exact: true }).click()
  await page.getByRole('heading', { name: 'Company identity provider', exact: true }).waitFor()
  assert.equal(new URL(page.url()).origin, new URL(endpoint).origin)
  console.log(`ACCESS-002 ${width}: native SAML sign-in link, responsive confirmation and actual AuthnRequest navigation passed`)
 }
 assert.equal(requests, 2)
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'enterprise-failed.png'), fullPage: true }).catch(() => {}); throw error }
finally { await browser?.close(); await runtime.close() }
