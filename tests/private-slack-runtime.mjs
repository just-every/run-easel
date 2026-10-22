// Real production Worker/assets, D1 and native authentication. Only Slack's
// fixed-host network boundary is synthetic; this helper never replaces app code.
import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'

export function privateSlackProvider() {
 const provider = { key: 'synthetic-easel-1', calls: [], posts: [], shared: [], userOverride: {}, authOverride: {}, imOverride: {}, sendMode: 'accepted', revokeConfirmed: true }
 provider.fetch = async request => {
  const url = new URL(request.url)
  if (url.href === 'https://chat.example.test/synthetic-easel-2') { provider.shared.push(await request.json()); return new Response('ok') }
  assert.equal(url.origin, 'https://slack.com')
  const method = url.pathname.replace('/api/', '')
  assert.ok(['auth.test', 'auth.revoke', 'users.info', 'conversations.open', 'conversations.info', 'chat.postMessage'].includes(method))
  assert.equal(request.headers.get('authorization'), `Bearer ${provider.key}`)
  const body = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json()
  assert.ok(!JSON.stringify(body).includes(provider.key)); provider.calls.push({ method, body })
  if (method === 'auth.test') return Response.json({ ok: true, team_id: 'T1', bot_id: 'B1', user_id: 'UBOT', ...provider.authOverride })
  if (method === 'auth.revoke') return Response.json({ ok: true, revoked: provider.revokeConfirmed })
  if (method === 'users.info') return Response.json({ ok: true, user: { id: body.user, team_id: 'T1', deleted: false, is_bot: false, is_app_user: false, is_restricted: false, is_ultra_restricted: false, profile: { email: body.user === 'UOWNER' ? 'owner@example.test' : 'sales@example.test' }, ...provider.userOverride } })
  if (method === 'conversations.open') { assert.ok(['USALES', 'UOWNER'].includes(body.users)); assert.equal(body.return_im, true); return Response.json({ ok: true, channel: { id: body.users === 'UOWNER' ? 'DOWNER' : 'DSALES' } }) }
  if (method === 'conversations.info') return Response.json({ ok: true, channel: { id: body.channel, is_im: true, user: body.channel === 'DOWNER' ? 'UOWNER' : 'USALES', ...provider.imOverride } })
  provider.posts.push(body)
  if (provider.sendMode === 'refused') return Response.json({ ok: false, error: 'channel_not_found' })
  if (provider.sendMode === 'unknown') return Response.json({ ok: false, error: 'internal_error' })
  if (provider.sendMode === 'redirect') return new Response('', { status: 307, headers: { location: 'https://redirect.example.test/synthetic-easel-3' } })
  return Response.json({ ok: true, channel: body.channel, ts: '1.000001' })
 }
 return provider
}

export async function privateSlackRuntime() {
 const directory = await mkdtemp(join(tmpdir(), 'easel-private-slack-')), port = await freePort(), origin = `http://127.0.0.1:${port}`
 const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = []
 async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
 await enumerate(workerDir)
 const provider = privateSlackProvider(), bootstrap = 'synthetic-easel-40000000000000000000000000000000'
 const mf = new Miniflare({ ...convertV4MiniflareOptions({
  host: '127.0.0.1', port, inspectorPort: 0, modules: [entry, ...scripts.filter(p => p !== entry)].map(path => ({ type: 'ESModule', path })), modulesRoot: workerDir,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-private-slack-browser' },
  bindings: { AUTH_ORIGIN: origin, AUTH_LOCAL: 'true', OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'synthetic-easel-60000000000000000000000000000000', SETUP_TOKEN: bootstrap, MAIL_PROVIDER: 'development', MAIL_FROM: 'Easel <easel@example.test>' },
  assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
  outboundService: provider.fetch,
 }), resourcePersistencePath: directory })
 try {
  await mf.ready
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))
  return { mf, origin, provider, bootstrap, async close() { await mf.dispose(); await rm(directory, { recursive: true, force: true }) } }
 } catch (error) { await mf.dispose(); await rm(directory, { recursive: true, force: true }); throw error }
}
