import { pantryProvider, pantryGrant } from './pantry-provider.mjs'
// Pantry source import through the built Worker and existing native actuals and review screens.
// Only Pantry and mail are replaced at the network edge.
import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
import { noOverflow, settle, track } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-pantry')
await mkdir(evidence, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'easel-pantry-browser-')), port = await freePort(), origin = `https://127.0.0.1:${port}`
const configPath = resolve('dist/server/wrangler.json'), workerDir = dirname(configPath), config = JSON.parse(await readFile(configPath, 'utf8')), entry = resolve(workerDir, config.main), scripts = [], messages = []
async function enumerate(path) { for (const file of await readdir(path, { withFileTypes: true })) { const full = join(path, file.name); if (file.isDirectory()) await enumerate(full); else if (/\.m?js$/.test(file.name)) scripts.push(full) } }
await enumerate(workerDir)
const provider=pantryProvider()
const mf = new Miniflare({ ...convertV4MiniflareOptions({
 host: '127.0.0.1', port, https: true, inspectorPort: 0, modules: [entry, ...scripts.filter(p => p !== entry)].map(path => ({ type: 'ESModule', path })), modulesRoot: workerDir,
 compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, d1Databases: { DB: 'easel-approval-browser' },
 bindings: { PANTRY_ORIGIN:'https://pantry.example.test', AUTH_ORIGIN: origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: 'synthetic-easel-session-01234567890123456789', SETUP_TOKEN: 'synthetic-easel-bootstrap-01234567890123456789', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-easel-1', MAIL_FROM: 'Easel <easel@example.test>' },
 assets: { directory: resolve(workerDir, config.assets.directory), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: config.assets.html_handling, not_found_handling: config.assets.not_found_handling } },
 outboundService: async request => { if(new URL(request.url).hostname==='pantry.example.test')return provider.outbound(request);assert.equal(new URL(request.url).hostname, 'api.resend.com'); messages.push(await request.json()); return Response.json({ id: crypto.randomUUID() }) },
}), resourcePersistencePath: scratch })
let browser
try {
 await mf.ready
 const db=await mf.getD1Database('DB')
 for(const file of (await readdir('./migrations/core')).filter(f=>f.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`,'utf8')).map(sql=>db.prepare(sql)))
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage()
 track(page)
 const post=async(path,body,status=200)=>{const r=await context.request.post(origin+path,{headers:{origin},data:body,maxRedirects:0});assert.equal(r.status(),status,await r.text());return status===200?r.json():null}
 const cmd=(op,body)=>post('/api/easel/command/'+op,body)
 const get=async(path)=>{const r=await context.request.get(origin+'/api/easel/'+path);assert.equal(r.status(),200,await r.text());return r.json()}
 await post('/auth/bootstrap',{token:'synthetic-easel-bootstrap-01234567890123456789',displayName:'Fran Finance'},303)
 await cmd('workspace',{name:'Harbour Services',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await cmd('department',{name:'Operations'}),line=await cmd('line',{name:'Services',type:'revenue'})
 await cmd('department-map',{source:'Operations',department:department.id})
 await cmd('account-map',{account:'1000',target:'cash'})
 await cmd('account-rule',{match:'range',from:'4000',to:'4999',target:line.id})
 const budget=(await get('state')).scenarios[0]
 const approval=await cmd('approve-budget',{scenario:budget.id,revision:budget.revision})
 await post('/api/easel/connections/pantry/connect',pantryGrant)
 const input={from:'2026-01-01',to:'2026-01-31'},preview=await post('/api/easel/import/pantry/preview',input)
 assert.equal(preview.changedRows,2)
 const accepted=await post('/api/easel/import/pantry/commit',{...input,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint})
 assert.equal(accepted.batch.status,'accepted')
 assert.equal((await post('/api/easel/import/pantry/preview',input)).unchanged,true)
 await cmd('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 await page.goto(origin+'/setup')
 await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check()
 await page.getByRole('button',{name:'Finish setup',exact:true}).click()
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000})
  await page.goto(origin+'/app?tab=actuals')
  await page.getByRole('table',{name:'Actuals imports',exact:true}).getByText(accepted.batch.file,{exact:true}).waitFor()
  await noOverflow(page,`Pantry actuals ${width}`)
  await page.getByRole('heading',{name:'Imports',exact:true}).locator('..').screenshot({path:join(evidence,`pantry-actuals-${width}.png`)})
  await page.goto(origin+'/app?tab=review')
  await page.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor()
  await page.locator('summary.variance-summary').filter({hasText:'Services'}).first().click()
  const rows=page.getByRole('table',{name:'Accepted rows',exact:true}).first()
  await rows.getByText('Pantry synthetic-easel-4 line synthetic-easel-6 revision 1',{exact:true}).waitFor()
  await noOverflow(page,`Pantry variance ${width}`)
  await page.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).locator('..').screenshot({path:join(evidence,`pantry-variance-${width}.png`)})
  console.log(`Pantry ${width}: built native accepted import, exact variance and retained source reference passed; provider follow-link remains unbuilt`)
 }
 await context.close()
} finally {await browser?.close();await mf.dispose();await rm(scratch,{recursive:true,force:true})}
