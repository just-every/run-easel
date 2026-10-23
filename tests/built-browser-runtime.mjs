// Production Worker/assets on real D1, with optional network-edge providers.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
export async function builtBrowserRuntime(options = {}) {
 const directory = await mkdtemp(join(tmpdir(), 'easel-built-browser-')), port = await freePort(), origin = `http://127.0.0.1:${port}`
 const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = []
 async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
 await enumerate(workerDir)
 const bootstrap = 'synthetic-easel-bootstrap-token-01234567890123456789'
 const mf = new Miniflare({ ...convertV4MiniflareOptions({
  host: '127.0.0.1', port, inspectorPort: 0, modules: [entry, ...scripts.filter(p => p !== entry)].map(path => ({ type: 'ESModule', path })), modulesRoot: workerDir,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-built-browser' },
  bindings: { AUTH_ORIGIN: origin, AUTH_LOCAL: 'true', OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'synthetic-easel-session-secret-01234567890123456789', SETUP_TOKEN: bootstrap, MAIL_PROVIDER: 'development', MAIL_FROM: 'Easel <easel@example.test>', ...(typeof options.bindings === 'function' ? options.bindings(origin) : options.bindings) },
  assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
  ...(options.outbound ? { outboundService: options.outbound } : {}),
 }), resourcePersistencePath: directory })
 try {
  await mf.ready
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`, 'utf8')).map(sql => db.prepare(sql)))
  return { mf, db, origin, bootstrap, async close() { await mf.dispose(); await rm(directory, { recursive: true, force: true }) } }
 } catch (error) { await mf.dispose(); await rm(directory, { recursive: true, force: true }); throw error }
}
