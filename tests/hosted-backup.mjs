// Live hosted archive phase; the scheduled refresh is exercised by hosted.mjs.
// Inject controlled EASEL_OWNER_EMAIL and EASEL_INVITE_EMAIL sandbox addresses.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cli, environment, finishSetup, owner, picture, record, screens } from './hosted-runtime.mjs'
import { hostedPlan } from './hosted-source.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = process.cwd(), selected = [environment, environment + '-restore']
let browser
assert.ok(process.env.EASEL_OWNER_EMAIL && process.env.EASEL_INVITE_EMAIL, 'Inject both controlled sandbox addresses before deploying')
try {
 await cli(root, ['setup', '--owner-email', process.env.EASEL_OWNER_EMAIL])
 for (const name of selected) {
  await cli(root, ['deploy', '--environment', name, '--owner-name', 'Hosted finance'], { MAIL_PROVIDER: 'sendgrid' })
  console.log(`Deployed disposable ${name} installation`)
 }
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const finance = await owner(browser, root)
 await finishSetup(finance.page)
 await hostedPlan(finance.context, finance.origin)
 const before = await picture(finance.context, finance.origin)
 assert.equal(Object.keys(before.packs).length, 1)
 assert.ok(Object.keys(before.snapshots).length >= 3)
 await mkdir(resolve(root, 'exports'), { recursive: true })
 const path = 'exports/hosted.rer', corrupt = 'exports/hosted-corrupt.rer'
 await rm(resolve(root, path), { force: true })
 await rm(resolve(root, corrupt), { force: true })
 await cli(root, ['export', '--target', 'remote', '--origin', finance.origin, '--output', path])
 const records = (await readFile(resolve(root, path), 'utf8')).trim().split('\n').map(JSON.parse)
 assert.ok(records[0].tables.every(table => !/^(oa_|oc_)/.test(table.name) && table.name !== 'e_connection_secrets'))
 const destination = (await record(root, environment + '-restore')).receipt.origin
 await cli(root, ['import', '--target', 'remote', '--origin', finance.origin, '--input', path, '--yes'], {}, 4)
 assert.deepEqual(await picture(finance.context, finance.origin), before, 'A refused restore leaves the populated installation unchanged')
 await writeFile(resolve(root, corrupt), (await readFile(resolve(root, path))).subarray(0, 200), { mode: 0o600 })
 await cli(root, ['import', '--target', 'remote', '--origin', destination, '--input', corrupt, '--yes'], {}, 2)
 await cli(root, ['import', '--target', 'remote', '--origin', destination, '--input', path, '--yes'])
 const restored = await owner(browser, root, environment + '-restore')
 await finishSetup(restored.page)
 assert.deepEqual(await picture(restored.context, restored.origin), before, 'The clean hosted restore preserves models, approvals, calculations, actuals, snapshots and published packs')
 await screens(restored.page, 'restored', { plan: '/app?tab=plan', approvals: '/app?tab=cycle', packs: '/app?tab=review', settings: '/app?tab=settings' })
 console.log('Hosted backup and restore passed: exact native application comparison; populated destination and malformed archive refused')
} finally {
 await browser?.close()
 const errors = []
 for (const name of selected.reverse()) {
  try {
   const held = await record(root, name)
   await cli(root, ['deploy', '--environment', name, '--remove', '--yes'], { MAIL_PROVIDER: 'sendgrid' })
   for (const path of [`/workers/scripts/${held.worker}`, ...Object.values(held.owned.d1).filter(row => row.id).map(row => `/d1/database/${row.id}`)]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } })
    assert.equal(response.status, 404)
   }
   console.log(`Removed ${name}; Worker and database absence confirmed`)
  } catch (error) { errors.push(error) }
 }
 if (errors.length) throw new AggregateError(errors, 'Disposable deployment cleanup failed')
}
