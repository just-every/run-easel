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
 await page.goto(origin+'/setup')
 await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check()
 await page.getByRole('button',{name:'Finish setup',exact:true}).click()
 const action=async(path,run)=>{const response=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');await run();const r=await response;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
 const connection=()=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Pantry connection',exact:true})})
 const importer=()=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Pull Pantry actuals',exact:true})})
 await context.route('https://pantry.example.test/app/search?*',async route=>{
  const url=new URL(route.request().url());assert.equal(url.searchParams.get('type'),'journal');assert.equal(url.searchParams.get('record'),'synthetic-easel-4')
  await route.fulfill({contentType:['text','html'].join('/'),body:'<h1>Pantry journal synthetic-easel-4</h1>'})
 })
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000})
  await page.goto(origin+'/app?tab=settings')
  await connection().getByLabel('Pantry read credential',{exact:true}).fill(pantryGrant.key)
  await connection().getByLabel('Allow read-only Pantry accounts, periods, posted journals and financial reports',{exact:true}).check()
  await action('/connections/pantry/connect',()=>connection().getByRole('button',{name:'Connect Pantry',exact:true}).click())
  await connection().getByText('••••el-1',{exact:true}).waitFor()
  assert.equal(await connection().locator('input[type=password]').count(),0)
  await noOverflow(page,`Pantry connection ${width}`)
  await connection().screenshot({path:join(evidence,`pantry-connection-${width}.png`)})
  if(width===390){provider.amount=15000;provider.revision=2}
  await page.goto(origin+'/app?tab=actuals')
  await importer().getByLabel('Pantry from date',{exact:true}).fill('2026-01-01')
  await importer().getByLabel('Pantry through date',{exact:true}).fill('2026-01-31')
  const preview=await action('/import/pantry/preview',()=>importer().getByRole('button',{name:'Preview Pantry actuals',exact:true}).click())
  assert.equal(preview.changedRows,2);assert.equal(preview.source.trialBalance.balanced,true)
  await importer().getByRole('table',{name:'Pantry account review',exact:true}).getByText('Automatic rule',{exact:true}).waitFor()
  await noOverflow(page,`Pantry reviewed source ${width}`)
  await importer().screenshot({path:join(evidence,`pantry-review-${width}.png`)})
  const accepted=await action('/import/pantry/commit',()=>importer().getByRole('button',{name:'Accept reviewed Pantry rows',exact:true}).click())
  assert.equal(accepted.batch.status,'accepted')
  const unchanged=await action('/import/pantry/preview',()=>importer().getByRole('button',{name:'Preview Pantry actuals',exact:true}).click())
  assert.equal(unchanged.unchanged,true)
  await importer().getByText('Pantry is unchanged; no rows to accept.',{exact:true}).waitFor()
  await importer().screenshot({path:join(evidence,`pantry-unchanged-${width}.png`)})
  if(width===1440)await cmd('close-month',{scenario:approval.forecast.id,month:'2026-01'})
  await page.goto(origin+'/app?tab=review')
  await page.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor()
  await page.locator('summary.variance-summary').filter({hasText:'Services'}).first().click()
  const rows=page.getByRole('table',{name:'Accepted rows',exact:true}).first(),links=rows.getByRole('link')
  assert.equal(await links.count(),width===1440?1:2)
  const popup=context.waitForEvent('page');await links.first().click();const transaction=await popup
  await transaction.getByRole('heading',{name:'Pantry journal synthetic-easel-4',exact:true}).waitFor();await transaction.close()
  await noOverflow(page,`Pantry variance ${width}`)
  await page.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).locator('..').screenshot({path:join(evidence,`pantry-variance-${width}.png`)})
  await page.goto(origin+'/app?tab=settings')
  await action('/connections/pantry/disconnect',()=>connection().getByRole('button',{name:'Disconnect Pantry',exact:true}).click())
  await connection().getByText('Disconnected',{exact:true}).waitFor()
  await connection().getByText('Revoke this credential in Pantry People & settings → Integration credentials; Easel only deletes its local copy',{exact:true}).waitFor()
  await connection().screenshot({path:join(evidence,`pantry-disconnect-${width}.png`)})
  const iconOnly=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent.trim()&&!b.disabled).map(b=>b.getAttribute('aria-label')))
  assert.deepEqual(iconOnly,[],'Touched settings controls have visible text; no icon-only buttons need a tooltip')
  console.log(`Pantry ${width}: native connect, reviewed acceptance, unchanged refresh, exact provider follow-link and truthful disconnect passed`)
 }
 const email='pantry-viewer@example.test'
 await cmd('member',{email,name:'Board viewer',role:'viewer',departments:[]})
 await post('/api/easel/invite',{email})
 const message=messages.find(m=>m.to.includes(email)),token=new URL(message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const viewer=await browser.newContext({ignoreHTTPSErrors:true}),response=await viewer.request.post(origin+'/auth/confirm',{headers:{origin},data:{token},maxRedirects:0})
 assert.equal(response.status(),303,await response.text())
 const viewerState=await viewer.request.get(origin+'/api/easel/state');assert.equal(viewerState.status(),200,await viewerState.text());assert.equal((await viewerState.json()).me.role,'viewer')
 const viewerVariance=await viewer.request.get(origin+'/api/easel/variance/2026-01');assert.equal(viewerVariance.status(),200,await viewerVariance.text());assert.equal((await viewerVariance.json()).rows.find(r=>r.line===line.id).actual,15000)
 const board=await viewer.newPage()
 for(const width of [1440,390]){
  await board.setViewportSize({width,height:1000});await board.goto(origin+'/app?tab=review')
  const variance=board.locator('section.card').filter({has:board.getByRole('heading',{name:'Variances, Jan 2026',exact:true})})
  await variance.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor()
  const summary=variance.locator('summary.variance-summary').filter({hasText:'Services'}).first()
  assert.equal((await summary.locator('.variance-number').first().textContent()).replace(/\s/g,''),'Actual$150.00')
  await summary.click()
  assert.equal(await variance.locator('a[href^="https://pantry.example.test"]').count(),0)
  assert.equal(await variance.getByRole('table',{name:'Accepted rows',exact:true}).count(),0)
  await noOverflow(board,`Pantry viewer ${width}`);await variance.screenshot({path:join(evidence,`pantry-viewer-${width}.png`)})
 }
 await viewer.close()
 await context.close()
} finally {await browser?.close();await mf.dispose();await rm(scratch,{recursive:true,force:true})}
