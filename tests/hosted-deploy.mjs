import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { cli, environment, record } from './hosted-runtime.mjs'

const root = process.cwd(), source = resolve(process.env.EASEL_GAUGE_ROOT)
const mail = { MAIL_PROVIDER: 'sendgrid' }
export async function removeHosted() {
 const errors = []
 for (const [directory, selected] of [[root, environment + '-restore'], [root, environment], [source, environment]]) {
  try {
   let held
   try { held = await record(directory, selected) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
   await cli(directory, ['deploy', '--environment', selected, '--remove', '--yes'], mail)
   for (const path of [`/workers/scripts/${held.worker}`, ...Object.values(held.owned.d1).filter(row => row.id).map(row => `/d1/database/${row.id}`)]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } })
    assert.equal(response.status, 404, 'The disposable resource no longer exists')
   }
   console.log(`Removed disposable ${selected} deployment and confirmed its Worker and database are absent`)
  } catch (error) { errors.push(error) }
 }
 if (errors.length) throw new AggregateError(errors, 'Disposable deployment cleanup failed')
}
export async function deployHosted() {
 assert.ok(process.env.EASEL_OWNER_EMAIL && process.env.EASEL_INVITE_EMAIL, 'Inject controlled EASEL_OWNER_EMAIL and EASEL_INVITE_EMAIL sandbox addresses')
 await cli(source, ['setup', '--owner-email', process.env.EASEL_OWNER_EMAIL])
 await cli(source, ['deploy', '--environment', environment, '--owner-name', 'Hosted finance'])
 const provider = await record(source)
 await cli(root, ['setup', '--owner-email', process.env.EASEL_OWNER_EMAIL])
 for (const selected of [environment, environment + '-restore']) {
  await cli(root, ['deploy', '--environment', selected, '--owner-name', 'Hosted finance'], { ...mail, GAUGE_ORIGIN: provider.receipt.origin })
  console.log(`Deployed disposable ${selected} installation`)
 }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
 await (process.argv.includes('--remove') ? removeHosted() : deployHosted())
}
