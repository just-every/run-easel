import { fileURLToPath as __rerTestEntryPath } from 'node:url';
const __rerTestEntry = __rerTestEntryPath(import.meta.resolve('@runeditrun/rer/internal/global/rer.mjs'));
const __rerTestEntryArgs = args => args[1] === 'dev' && !args.some(arg => ['--foreground', '--detach', '--stop', '--help'].includes(arg)) ? [...args, '--foreground'] : args;
// Fresh clones and the real rer commands for the browser journey.
import { promisify } from 'node:util'
import { execFile, spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const source = resolve(new URL('..', import.meta.url).pathname)
const excluded = new Set(['.git', 'node_modules', '.wrangler', '.rer', '.seed', '.cache', '.tanstack', 'dist', '.output', 'exports', 'test-results'])

/** A genuine clone of committed HEAD (or, before the first commit, a clean copy) with no dependencies, settings or data. */
export async function fresh() {
 const root = await mkdtemp(join(tmpdir(), 'easel-installation-'))
 let committed = false
 try { await promisify(execFile)('git', ['rev-parse', '--verify', 'HEAD'], { cwd: source }); committed = true } catch {}
 if (committed) { await promisify(execFile)('git', ['clone', '--no-hardlinks', '--quiet', source, root]); return root }
 for (const name of await readdir(source)) {
  if (excluded.has(name) || name.startsWith('.dev.vars') || name.startsWith('.env') || name.endsWith('.tsbuildinfo')) continue
  await cp(join(source, name), join(root, name), { recursive: true })
 }
 return root
}

export async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p }

const clean = s => s.replace(/^RER_OPEN .*$/gm, 'RER_OPEN [private sign-in URL omitted]').replace(/([?&#]token=)[^\s&]+/g, '$1[redacted]').replace(/rer-dev=[^\s&]+/g, 'rer-dev=[redacted]')
const env = () => ({ ...process.env, WRANGLER_SEND_METRICS: 'false', RER_SERVER_JOURNEY: '1' })

export async function command(root, args, { expected = 0 } = {}) {
 const child = spawn(process.execPath, __rerTestEntryArgs([__rerTestEntry, ...args]), { cwd: root, env: env(), stdio: ['ignore', 'pipe', 'pipe'] })
 let log = ''
 for (const stream of [child.stdout, child.stderr]) stream.on('data', c => { log += c })
 const code = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res) })
 if (code !== expected) throw new Error(`rer ${args[0]} exited ${code}:\n${clean(log).slice(-6000)}`)
 console.log(`rer ${args.join(' ')}: exit ${code}`)
 return clean(log)
}

export async function start(root, port, mode = 'dev') {
 const child = spawn(process.execPath, __rerTestEntryArgs([__rerTestEntry, mode, '--port', String(port)]), { cwd: root, env: env(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
 let output = ''
 for (const stream of [child.stdout, child.stderr]) stream.on('data', c => { output += c })
 const deadline = Date.now() + 20 * 60 * 1000
 const ready = () => output.includes('RER_READY') && (mode !== 'dev' || /^RER_OPEN \S+/m.test(output))
 while (!ready() && Date.now() < deadline) {
  if (child.exitCode !== null) {
   try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
   throw new Error(`${mode} exited: ${clean(output).slice(-4000)}`)
  }
  await new Promise(r => setTimeout(r, 250))
 }
 if (!ready()) { process.kill(-child.pid, 'SIGTERM'); throw new Error(`${mode} readiness timed out`) }
 return {
  origin: `http://127.0.0.1:${port}`,
  // Only the browser consumes this credential; never include it in logs or reports.
  openUrl: output.match(/^RER_OPEN (\S+)/m)?.[1],
  async close() {
   const exited = child.exitCode === null ? new Promise(r => child.once('exit', r)) : Promise.resolve()
   const signal = name => { try { process.kill(-child.pid, name) } catch (error) { if (error.code !== 'ESRCH') throw error } }
   const alive = () => { try { process.kill(-child.pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
   signal('SIGTERM'); await exited
   // The CLI may exit before its own Vite/workerd children finish persisting.
   // Only this spawned process group is ours; never remove its files mid-write.
   const deadline = Date.now() + 5000
   while (alive() && Date.now() < deadline) await new Promise(r => setTimeout(r, 50))
   if (alive()) { signal('SIGKILL'); await new Promise(r => setTimeout(r, 100)) }
  },
 }
}

export async function report(path, value) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'result.json'), JSON.stringify(value, null, 2) + '\n') }
