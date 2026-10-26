import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

export const environment = process.env.EASEL_HOST_ENV ?? 'sx-easel-c-i821'
export const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/hosted')

/** Capture one-time grants in memory; never send child output to a proof log. */
export async function cli(root, args, extra = {}, expected = 0) {
 const require = createRequire(resolve(root, 'package.json'))
 const entry = require.resolve('@runeditrun/rer/internal/global/rer.mjs')
 const flags = ['--json', '--non-interactive', ...(args[0] === 'signin' ? [] : ['--no-queue'])]
 const child = spawn(process.execPath, [entry, ...args, ...flags], {
  cwd: root, env: { ...process.env, ...extra, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
 })
 let output = ''
 for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
 const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
 const events = output.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
 if (code !== expected) {
  const secrets = Object.entries({ ...process.env, ...extra }).filter(([name, value]) => /SECRET|TOKEN|KEY|EMAIL|MAIL_FROM/.test(name) && value).map(([, value]) => value)
  const errors = events.filter(e => e.event === 'error').map(e => `${e.code}: ${e.message}`).join('\n')
  const safe = secrets.reduce((message, value) => message.replaceAll(value, '[redacted]'), errors).replace(/([?&]token=)[^\s&]+/g, '$1[redacted]')
  throw new Error(`rer ${args[0]} exited ${code}: ${safe}`)
 }
 console.log(`rer ${args[0]}: exit ${code}`)
 return events.findLast(event => event.event === 'result')
}

export async function record(root, selected = environment) {
 const value = JSON.parse(await readFile(resolve(root, '.rer/deploy', `${selected}.json`), 'utf8'))
 assert.equal(value.accountId, process.env.CLOUDFLARE_ACCOUNT_ID)
 return value
}

export async function owner(browser, root, selected = environment) {
 const grant = await cli(root, ['signin', '--environment', selected])
 assert.ok(grant.link, 'The native CLI issued a fresh one-time owner grant')
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const page = await context.newPage()
 await page.goto(grant.link)
 if (new URL(page.url()).pathname.startsWith('/auth/')) {
  await page.getByRole('button', { name: /Confirm|Sign in|Continue/i }).click()
 }
 await page.waitForURL(url => ['/setup', '/app'].includes(url.pathname))
 return { context, page, origin: new URL(grant.link).origin }
}

export async function finishSetup(page) {
 if (new URL(page.url()).pathname !== '/setup') return
 await page.getByRole('checkbox').check()
 await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
 await page.waitForURL(/\/app/)
}

export async function screens(page, name, paths) {
 await mkdir(evidence, { recursive: true })
 const origin = new URL(page.url()).origin
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  for (const [label, path] of Object.entries(paths)) {
   await page.goto(origin + path)
   await page.locator('h1').first().waitFor()
   await page.waitForLoadState('networkidle')
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${label} fits ${width}`)
   const icons = await page.getByRole('button').evaluateAll(nodes => nodes.filter(n => !n.textContent.trim() && n.getAttribute('aria-label')).map(n => ({ label: n.getAttribute('aria-label'), tip: n.getAttribute('aria-describedby'), title: n.getAttribute('title') })))
   assert.ok(icons.every(icon => icon.tip || icon.title), 'Every icon-only control exposes its tooltip')
   await page.screenshot({ path: resolve(evidence, `${name}-${label}-${width}.png`), fullPage: true })
  }
 }
}

export async function api(context, origin, path, body) {
 const response = body === undefined ? await context.request.get(origin + path) : await context.request.post(origin + path, { headers: { origin }, data: body })
 assert.equal(response.status(), 200, path)
 return response.json()
}

export async function picture(context, origin) {
 const get = async path => {
  const response = await context.request.get(origin + path)
  assert.equal(response.status(), 200)
  return response.json()
 }
 const { me, actorNames, ...state } = await get('/api/easel/state')
 const scenarios = {}, snapshots = {}, packs = {}
 for (const scenario of state.scenarios) scenarios[scenario.id] = await get(`/api/easel/scenario/${scenario.id}`)
 for (const snapshot of state.snapshots) snapshots[snapshot.id] = await get(`/api/easel/snapshot/${snapshot.id}`)
 for (const pack of state.packs.filter(pack => pack.status === 'published')) {
  const response = await context.request.get(`${origin}/api/easel/pack/${pack.id}/document.html`)
  assert.equal(response.status(), 200)
  packs[pack.id] = await response.text()
 }
 return { state, scenarios, snapshots, packs, actuals: await get('/api/easel/actuals') }
}
