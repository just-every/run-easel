// A real Worker on real local D1 (Miniflare/workerd) with every migration
// applied, real owner claim and real email-link sign-in through the
// provider boundary. Only the mail provider is replaced in this test runtime.
import assert from 'node:assert/strict'
import { builtinModules } from 'node:module'
import { createServer } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

const freePort = async () => { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p }

export async function harness(options = {}) {
 const port = await freePort(), origin = `http://127.0.0.1:${port}`
 const dir = await mkdtemp(join(tmpdir(), 'easel-test-'))
 const messages = []
 const mailProvider = { name: 'test-mail-provider', setup(build) {
  build.onLoad({ filter: /easel\/time\.ts$/ }, () => ({ contents: `export async function currentTime(env) { return (await env.TEST_CLOCK.fetch('https://clock/')).text() }`, loader: 'js' }))
  build.onLoad({ filter: /mail\.server\.mjs$/ }, () => ({
   contents: `import { createMailSender } from './modules/mail/index.mjs';
    export function operatorMail(env) {
     return createMailSender({ provider: 'resend', mode: 'production', apiKey: 'test-resend-provider-key' },
      { fetch: (...args) => env.TEST_MAIL.fetch(...args) });
    }`,
   resolveDir: join(process.cwd(), 'src'), loader: 'js',
  }))
 } }
 // Match Workers' nodejs_compat resolution for CommonJS protocol libraries.
 const nodeBuiltins = { name: 'workers-node-builtins', setup(build) {
  const names = new Set(builtinModules.map(n => n.replace(/^node:/, '')))
  build.onResolve({ filter: /^[a-z][a-z0-9_/-]*$/i }, args => names.has(args.path) ? { path: args.path, namespace: 'worker-builtin' } : undefined)
  build.onLoad({ filter: /.*/, namespace: 'worker-builtin' }, args => ({ contents: `import value from 'node:${args.path}'; module.exports = value;`, loader: 'js' }))
 } }
 const bundle = await build({ plugins: [mailProvider, nodeBuiltins], entryPoints: ['tests/easel-worker.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], conditions: ['workerd', 'worker', 'browser'], external: ['node:*'], target: 'es2023', loader: { '.json': 'json' } })
 const mf = new Miniflare({
  ...convertV4MiniflareOptions({
   host: '127.0.0.1', port, modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
   d1Databases: { DB: 'easel' }, ...(options.outbound ? { outboundService: options.outbound } : {}),
   serviceBindings: { ...options.serviceBindings, TEST_CLOCK: async () => new Response(options.now?.() ?? new Date().toISOString()), TEST_MAIL: async request => { const message = await request.json(); messages.push(message); return options.mailResponse ? options.mailResponse(message, request) : Response.json({ id: crypto.randomUUID() }) } },
   bindings: { ...options.bindings, AUTH_ORIGIN: origin, AUTH_LOCAL: 'true', OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'local-test-secret-not-production-0123456789', SETUP_TOKEN: 'synthetic-local-test-bootstrap-token-0123456789', MAIL_PROVIDER: 'development', MAIL_FROM: 'Easel <easel@example.test>' },
  }),
  resourcePersistencePath: dir,
 })
 try {
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))

  const send = async (path, body, cookie = '', method) => {
   const r = await mf.dispatchFetch(origin + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { host: new URL(origin).host, origin, 'content-type': 'application/json', cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
   const text = await r.text()
   let value; try { value = JSON.parse(text) } catch { value = text }
   return { status: r.status, value, text, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers }
  }
  const boot = await send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'Fran Finance' })
  assert.equal(boot.status, 303, JSON.stringify(boot.value))
  const owner = boot.cookie

  const expect = async (r, status, label) => { assert.equal(r.status, status, `${label}: ${JSON.stringify(r.value)}`); return r.value }
  const command = async (op, body, cookie = owner, status = 200) => expect(await send(`/api/easel/command/${op}`, body, cookie), status, op)
  const kit = async (name, op, body, cookie = owner, status = 200) => expect(await send(`/api/easel/import/${name}/${op}`, body, cookie), status, `${name} ${op}`)
  const get = async (path, cookie = owner, status = 200) => expect(await send(path, undefined, cookie), status, path)
  /** Adds a person to the plan, invites them through Base, and signs them in from the provider’s invitation link. */
  const person = async (email, role, departments = [], payDetail = true) => {
   await command('member', { email, name: email.split('@')[0], role, departments })
   if (payDetail && role !== 'viewer') await command('pay-detail', { email, granted: true })
   await expect(await send('/api/easel/invite', { email }, owner), 200, `invite ${email}`)
   const message = messages.find(m => m.to.includes(email))
   assert.ok(message, `invitation mail for ${email}`)
   const token = new URL(message.text.match(/http:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
   const confirmed = await send('/auth/confirm', { token })
   assert.equal(confirmed.status, 303, JSON.stringify(confirmed.value))
   return confirmed.cookie
  }
  const stepUp = async (cookie = owner) => {
   const prior = messages.length
   await expect(await send('/auth/step-up', { action: 'credentials:mint', returnTo: '/app' }, cookie), 202, 'step-up request')
   const message = messages.slice(prior).at(-1)
   assert.ok(message, 'Step-up confirmation was delivered to the mail boundary')
   const token = new URL(message.text.match(/http:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
   const confirmed = await send('/auth/confirm', { token }, cookie)
   assert.equal(confirmed.status, 303, 'Step-up confirmation completes in its original session')
  }
  return { db, mf, origin, owner, send, command, kit, get, person, stepUp, messages, async close() { await mf.dispose(); await rm(dir, { recursive: true, force: true }) } }
 } catch (error) {
  await mf.dispose(); await rm(dir, { recursive: true, force: true })
  throw error
 }
}
