// Live HOST-001 qualification. Run only with explicitly injected sandbox access.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { api, cli, environment, evidence, finishSetup, owner, picture, record, screens } from './hosted-runtime.mjs'
import { acceptHostedInvite } from './hosted-mail.mjs'
import { hostedPlan, sourceTime } from './hosted-source.mjs'
import { deployHosted, removeHosted } from './hosted-deploy.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = process.cwd(), source = resolve(process.env.EASEL_GAUGE_ROOT)
let browser, key, gauge, finance, restored
try {
 if (process.argv.includes('--deploy')) await deployHosted()
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 gauge = await owner(browser, source)
 key = await sourceTime(gauge.context, gauge.origin)
 const sourceRead = await fetch(gauge.origin + '/api/gauge/state?from=2026-10-01&to=2026-10-31', { headers: { authorization: `Bearer ${key}` } })
 assert.equal(sourceRead.status, 200)
 const aggregate = await sourceRead.json()
 assert.equal(aggregate.approvedBillableSeconds, 3600)
 assert.equal(aggregate.missingCalendarDays, 0)

 finance = await owner(browser, root)
 const health = await fetch(finance.origin + '/health')
 assert.equal(health.status, 200)
 const deployed = await health.json()
 assert.equal(deployed.ok, true)
 assert.ok(deployed.deployment.sourceSha && deployed.deployment.versionId)
 console.log(`Hosted health: origin=${finance.origin} source=${deployed.deployment.sourceSha} version=${deployed.deployment.versionId}`)
 assert.equal((await fetch(finance.origin + '/api/easel/state')).status, 401)
 await screens(finance.page, 'hosted', { setup: '/setup' })
 await finishSetup(finance.page)
 await hostedPlan(finance.context, finance.origin)
 const invitation = await acceptHostedInvite(browser, finance.context, finance.origin)
 await screens(invitation.page, 'invite', { application: '/app', signin: '/signin' })
 await invitation.context.close()

 await api(finance.context, finance.origin, '/api/easel/connections/gauge/connect', { key })
 await api(finance.context, finance.origin, '/api/easel/connections/gauge/schedule', { cadence: 'hourly', month: '2026-10', consent: true })
 const before = await picture(finance.context, finance.origin)
 assert.equal(Object.keys(before.packs).length, 1)
 assert.ok(Object.keys(before.snapshots).length >= 3)
 console.log('Hosted health, native owner session, delivered invitation, model, approval and published pack passed')
 // Only the provider’s real cron may set lastRefresh. No direct scheduled invocation.
 const deadline = Date.now() + 125 * 60000
 let observation
 while (Date.now() < deadline) {
  const row = await api(finance.context, finance.origin, '/api/easel/connections/gauge')
  if (row.lastRefresh) { observation = row; break }
  console.log('Waiting for the Cloudflare cron to persist the scheduled observation')
  await new Promise(resolve => setTimeout(resolve, 60000))
 }
 assert.ok(observation, 'A real scheduled refresh completed')
 assert.equal(observation.error, null)
 assert.equal(observation.observation.approvedBillableSeconds, 3600)
 assert.equal(observation.observation.availableSeconds, aggregate.availableSeconds)
 assert.equal(observation.checkedMonth, '2026-10')
 const activity = await api(finance.context, finance.origin, '/api/easel/activity')
 assert.ok(activity.some(event => event.action === 'gauge-connection-checked' && event.detail.authority?.type === 'scheduler' && event.detail.confirmed), 'Persisted refresh is attributed to the scheduler')
 assert.deepEqual((await picture(finance.context, finance.origin)).snapshots, before.snapshots, 'A scheduled observation leaves every frozen value unchanged')
 await screens(finance.page, 'hosted', { settings: '/app?tab=settings', plan: '/app?tab=plan', approvals: '/app?tab=cycle', packs: '/app?tab=review' })
 console.log(`Real scheduled refresh persisted: scheduledAt=${observation.scheduledAt} lastRefresh=${observation.lastRefresh} approvedSeconds=${observation.observation.approvedBillableSeconds}`)

 // CONNECT-010 distinguishes confirmed revocation from its explicit warning.
 const disconnected = await api(finance.context, finance.origin, '/api/easel/connections/gauge/disconnect', {})
 console.log(`Gauge disconnect: outcome=${disconnected.providerRevocation?.status} httpStatus=${disconnected.providerRevocation?.httpStatus}`)
 assert.equal(disconnected.connected, false)
 if (disconnected.providerRevocation?.status === 'confirmed') {
  assert.equal((await fetch(gauge.origin + '/api/gauge/state?from=2026-10-01&to=2026-10-31', { headers: { authorization: `Bearer ${key}` } })).status, 401)
  key = undefined
 } else {
  assert.equal(disconnected.providerRevocation?.status, 'not-confirmed')
  assert.ok(disconnected.error, 'Unconfirmed revocation retains its owner warning')
  // Keep custody of the test key for explicit source-side cleanup below.
 }
 const beforeRestore = await picture(finance.context, finance.origin)
 await mkdir(resolve(root, 'exports'), { recursive: true })
 const path = 'exports/hosted.rer'
 await cli(root, ['export', '--target', 'remote', '--origin', finance.origin, '--output', path])
 const records = (await readFile(resolve(root, path), 'utf8')).trim().split('\n').map(JSON.parse)
 assert.ok(records[0].tables.every(table => !/^(oa_|oc_)/.test(table.name) && table.name !== 'e_connection_secrets'), 'Native credentials and connector secrets are excluded')
 const destination = (await record(root, environment + '-restore')).receipt.origin
 await cli(root, ['import', '--target', 'remote', '--origin', finance.origin, '--input', path, '--yes'], {}, 4)
 const corrupt = 'exports/hosted-corrupt.rer'
 await writeFile(resolve(root, corrupt), (await readFile(resolve(root, path))).subarray(0, 200), { mode: 0o600 })
 await cli(root, ['import', '--target', 'remote', '--origin', destination, '--input', corrupt, '--yes'], {}, 2)
 await cli(root, ['import', '--target', 'remote', '--origin', destination, '--input', path, '--yes'])
 restored = await owner(browser, root, environment + '-restore')
 await finishSetup(restored.page)
 assert.deepEqual(await picture(restored.context, restored.origin), beforeRestore, 'The clean hosted restore preserves the model, approvals, calculations, actuals, immutable snapshots and published packs')
 await screens(restored.page, 'restored', { plan: '/app?tab=plan', approvals: '/app?tab=cycle', packs: '/app?tab=review', settings: '/app?tab=settings' })
 console.log('HOST-001: all five live acceptance points passed, including exact hosted restore through rer and the native app')
} finally {
 try {
  if (key && gauge) {
   const revoked = await fetch(gauge.origin + '/api/gauge/keys/revoke', { method: 'POST', headers: { authorization: `Bearer ${key}` } })
   assert.equal(revoked.status, 200)
   assert.equal((await fetch(gauge.origin + '/api/gauge/state?from=2026-10-01&to=2026-10-31', { headers: { authorization: `Bearer ${key}` } })).status, 401)
  }
 } finally {
  await browser?.close()
  if (process.argv.includes('--deploy')) await removeHosted()
 }
}
