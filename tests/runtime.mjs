import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:runtime');if(queued!==null)process.exit(queued);
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const state = await mkdtemp(join(tmpdir(), 'easel-runtime-'))
let worker
const origin = `http://127.0.0.1:${port}`
try {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, '--config', 'dist/server/wrangler.json'], { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' } })
  worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--inspector-port', '0', '--local', '--persist-to', state, '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json', '--port', String(port)], { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' } })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error('emitted Worker exited before becoming healthy')
    try { ready = (await fetch(`${origin}/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, 'emitted Worker became healthy')
  const health = await (await fetch(`${origin}/health`)).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.ok, true)
  assert.deepEqual(health.deployment, { sourceSha: null, fingerprint: null, versionId: null })
  const document = await fetch(origin)
  assert.equal(document.status, 200)
  const html = await document.text()
  assert.equal(document.headers.get('x-rer-document'), 'lobby')
  assert.match(html, /<html[^>]*data-state="unclaimed"/)
  assert.match(html, /href="\/setup"/)
  const branding = JSON.parse(await readFile(new URL('../src/branding.json', import.meta.url)))
  assert.ok(html.includes(branding.name))
  assert.deepEqual(await (await fetch(`${origin}/setup/state`)).json(), { state: 'unclaimed' })
  for (const path of ['/missing', '/health/extra', '/api', '/api/missing']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path)
  }
  console.log('HTTP-001 passed against emitted local Worker: health, unclaimed Lobby, HTTP and document 404s')
} finally {
  if (worker) {
    await new Promise(resolve => {
      if (worker.exitCode !== null || worker.signalCode !== null) return resolve()
      worker.once('exit', resolve)
      worker.once('error', resolve)
      worker.kill('SIGTERM')
    })
  }
  await rm(state, { recursive: true, force: true })
}
