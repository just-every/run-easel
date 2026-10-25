import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { nativeMobileFixture } from './native-mobile-fixture.mjs'

const value = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const platform = value('platform'), width = Number(value('width') ?? 390)
assert.equal(platform, 'android', 'This candidate ships the Android client; iOS native proof is pending')
assert.ok([390, 1440].includes(width), 'Use a required viewport width')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/native-proof', `${platform}-${width}`)
await mkdir(evidence, { recursive: true })
const fixture = await nativeMobileFixture()
const privateValues = [fixture.token, fixture.signInLink, fixture.viewer.token, fixture.viewer.link]
const clean = text => privateValues.reduce((s, secret) => s.replaceAll(secret, '[private sign-in omitted]'), String(text))
const run = (cmd, args, options = {}) => new Promise((resolveRun, reject) => {
 const child = spawn(cmd, args, { ...options, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] })
 let output = ''
 child.stdout.on('data', b => { output += b })
 child.stderr.on('data', b => { output += b })
 child.once('error', reject)
 child.once('exit', code => {
  if (code !== 0) reject(new Error(`${cmd} exited ${code}:\n${clean(output).slice(-14000)}`))
  else resolveRun(output)
 })
})
let pushDelivered = false
const edge = createServer(async (request, response) => {
 try {
  assert.equal(request.url, `/push?platform=${platform}`)
  assert.equal(pushDelivered, false, 'Each native journey receives exactly one push')
  const payload = await fixture.cashPush(platform)
  pushDelivered = true
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(payload))
 } catch (error) {
  response.writeHead(500); response.end('Native push journey failed')
  console.error(clean(error.stack))
 }
})
await new Promise(resolveListen => edge.listen(0, '127.0.0.1', resolveListen))
const edgePort = edge.address().port, appPort = new URL(fixture.h.origin).port
try {
  const serial = value('device')
  const adb = join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library', 'Android', 'sdk'), './platform-tools/adb')
  const prefix = serial ? ['-s', serial] : []
  await run(adb, [...prefix, 'reverse', `tcp:${appPort}`, `tcp:${appPort}`])
  await run(adb, [...prefix, 'reverse', `tcp:${edgePort}`, `tcp:${edgePort}`])
  try {
   const output = await run('bash', ['./native/android/instrument.sh'], { env: {
    ANDROID_SERIAL: serial ?? '', EASEL_ORIGIN: fixture.h.origin, EASEL_TOKEN: fixture.token,
    EASEL_VIEWER_TOKEN: fixture.viewer.token,
    EASEL_PROPOSAL: fixture.proposal.id, EASEL_DEPARTMENT: fixture.department.id,
    EASEL_EDGE_ORIGIN: `http://127.0.0.1:${edgePort}`, EASEL_WIDTH: String(width),
   } })
   await writeFile(join(evidence, 'journey.log'), clean(output))
   const screens = join(evidence, 'screens')
   await mkdir(screens, { recursive: true })
   const source = resolve('./native/android/evidence', String(width))
   for (const name of await readdir(source)) if (name.startsWith(`${width}-`) && name.endsWith('.png'))
    await copyFile(join(source, name), join(screens, name))
   console.log(clean(output))
  } finally {
   await run(adb, [...prefix, 'reverse', '--remove', `tcp:${appPort}`])
   await run(adb, [...prefix, 'reverse', '--remove', `tcp:${edgePort}`])
  }
 assert.equal(pushDelivered, true, 'A cash alert must cross the native push edge')
 await fixture.proveEndState()
 console.log(`MOBILE-002 ${platform} ${width}: real sign-in, dashboards, alerts, tasks, comments, push, exact reviewed promotion and sign-out proved`)
} finally {
 edge.closeAllConnections(); await new Promise(resolveClose => edge.close(resolveClose))
 await fixture.close()
}
