// A second real installation for REV-003's sibling integration journey.
// It bundles current Gauge source and exercises its public auth/command doors.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { freePort } from './browser-runtime.mjs'

export async function gaugeProvider() {
 const scratch = await mkdtemp(join(tmpdir(), 'easel-gauge-source-')), supplied = process.env.EASEL_GAUGE_ROOT
 const root = supplied ? resolve(supplied) : join(scratch, 'gauge')
 let mf
 const caller = process.cwd()
 try {
  if (!supplied) {
   await promisify(execFile)('git', ['clone', '--quiet', '--filter=blob:none', '--depth', '1', 'https://github.com/just-every/run-gauge.git', root])
   await symlink(resolve('node_modules'), join(root, 'node_modules'))
  }
  const bundle = await build({ stdin: { contents: `import {authResponse} from './src/auth.server'; import {gaugeResponse} from './src/gauge/http'; export default {async fetch(request,env){return await authResponse(request,env) ?? await gaugeResponse(request,env) ?? new Response('Not found',{status:404})}}`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], external: ['node:*'], target: 'es2023', loader: { '.json': 'json' } })
  const port = await freePort(), origin = `http://127.0.0.1:${port}`, bootstrap = randomUUID()
  process.chdir(root)
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: '127.0.0.1', port, modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'gauge' }, bindings: { AUTH_ORIGIN: origin, AUTH_LOCAL: 'true', OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: randomUUID(), SETUP_TOKEN: bootstrap, MAIL_PROVIDER: 'development', MAIL_FROM: 'Gauge <gauge@example.test>' } }), resourcePersistencePath: join(scratch, 'db') })
  console.log('Gauge runtime ready; applying native schema')
  const db = await mf.getD1Database('DB')
  process.chdir(caller)
  console.log('Gauge D1 binding acquired')
  for (const file of (await readdir(join(root, 'migrations/core'))).filter(f => f.endsWith('.sql')).sort()) {
   const statements = unstable_splitSqlQuery(await readFile(join(root, 'migrations/core', file), 'utf8')).map(sql => db.prepare(sql))
   if (statements.length) await db.batch(statements)
  }
  console.log('Gauge schema applied; claiming local owner')
  const request = (path, body, cookie = '', type = 'application/json') => mf.dispatchFetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, cookie, 'content-type': type }, ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }), redirect: 'manual' })
  const boot = await request('/auth/bootstrap', { token: bootstrap, displayName: 'Gauge agency owner' })
  assert.equal(boot.status, 303, await boot.text()); const owner = boot.headers.get('set-cookie').split(';')[0]
  const setup = await request('/setup', new URLSearchParams({ confirm: 'yes', currency: 'USD', timezone: 'America/New_York' }).toString(), owner, 'application/x-www-form-urlencoded')
  assert.equal(setup.status, 303, await setup.text())
  const cmd = async (action, input = {}) => { const r = await request('/api/gauge/command', { key: randomUUID(), action, ...input }, owner), value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value }
  console.log('Gauge native owner setup complete; entering delivery fixtures')
  const client = await cmd('save:clients', { name: 'Cardinal Manufacturing' })
  const person = await cmd('save:people', { name: 'Private consultant', timezone: 'America/New_York' })
  const calendar = await cmd('save:calendars', { personId: person.id, from: '2026-01-01', to: '2026-02-28', dailySeconds: 28800, weekdays: '1,2,3,4,5', timezone: 'America/New_York' })
  const engagement = await cmd('save:engagements', { name: 'Board advisory', clientId: client.id, leadId: person.id, members: [person.id], scope: 'Advisory', timezone: 'America/New_York' })
  const task = await cmd('save:tasks', { engagementId: engagement.id, name: 'Delivery', remainingSeconds: 0 })
  const terms = await cmd('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 1000000, effortSeconds: 144000, roundingSeconds: 60, reason: 'Signed advisory scope' })
  await cmd('budget:approve', terms)
  await cmd('save:rates', { personId: person.id, service: '*', effective: '2026-01-01', costMinor: 8000, billMinor: 15000 })
  const entry = await cmd('time:save', { engagementId: engagement.id, taskId: task.id, personId: person.id, service: 'Advisory', billable: true, timezone: 'America/New_York', start: '2026-01-05T09:00:00-05:00', end: '2026-01-05T17:00:00-05:00', notes: 'Approved operational actuals' })
  await cmd('time:approve', await cmd('time:submit', entry))
  const credential = await cmd('apikey:create', { label: 'Easel utilization read' })
  return { origin, token: credential.token, cmd, calendar, person, async close() { await mf.dispose(); await rm(scratch, { recursive: true, force: true }) } }
 } catch (error) { process.chdir(caller); await mf?.dispose(); await rm(scratch, { recursive: true, force: true }); throw error }
}
