// Native built screens, real sessions and D1; only provider HTTP edges are faked.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command } from './browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { billingProvider,billingGrant,billingFixture } from './billing-fixture.mjs'
import { qboProvider,qboGrant,qboFixture,acceptQbo } from './qbo-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-connectors')
await mkdir(evidence,{recursive:true})
if(!process.argv.includes('--existing-build'))await command(process.cwd(),['build'])
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
let runtime,context,messages=[]
async function native(provider){
 messages=[]
 runtime=await builtBrowserRuntime({https:true,bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-easel-900000001'},outbound:async request=>{
  if(new URL(request.url).hostname==='api.resend.com'){messages.push(await request.json());return Response.json({id:crypto.randomUUID()})}
  return provider.outbound(request)
 }});context=await browser.newContext({ignoreHTTPSErrors:true})
 const send=async(path,body,status=200)=>{const response=await context.request[body===undefined?'get':'post'](runtime.origin+path,{headers:{origin:runtime.origin},...(body===undefined?{}:{data:body}),maxRedirects:0});assert.equal(response.status(),status,await response.text());return status===200?response.json():null}
 const h={command:(op,b)=>send('/api/easel/command/'+op,b),get:path=>send(path),kit:(kit,op,b)=>send(`/api/easel/import/${kit}/${op}`,b)}
 await send('/auth/bootstrap',{token:runtime.bootstrap,displayName:'Fran Finance'},303)
 const page=await context.newPage();track(page);page.on('dialog',dialog=>dialog.accept())
 await page.goto(runtime.origin+'/setup');await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL('**/app')
 return{h,page,send}
}
async function board(send){
 const email='board@example.test'
 await send('/api/easel/command/member',{email,name:'Board reader',role:'viewer',departments:[]})
 await send('/api/easel/invite',{email})
 const message=messages.find(m=>m.to.includes(email));assert.ok(message,'Native invitation reached the mail edge')
 const token=new URL(message.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const reader=await browser.newContext({ignoreHTTPSErrors:true})
 const confirmed=await reader.request.post(runtime.origin+'/auth/confirm',{headers:{origin:runtime.origin},data:{token},maxRedirects:0});assert.equal(confirmed.status(),303)
 return reader
}
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
async function capture(page,scope,name,prepare=async()=>{}){
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:1000});await settle(page);await prepare();await noOverflow(page,`${name} ${width}`)
  for(const button of await scope.getByRole('button').all()){
   if((await button.innerText()).trim())continue
   await button.focus();assert.ok(await page.getByRole('tooltip').isVisible(),'Icon controls show a tooltip on keyboard focus')
  }
  await scope.screenshot({path:join(evidence,`${name}-${width}.png`)})
 }
}
const action=async(page,suffix,run)=>{const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');await run();const r=await response;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
try{
 const provider=billingProvider(),{h,page,send}=await native(provider),f=await billingFixture(h)
 await page.goto(runtime.origin+'/app?tab=settings');await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const connection=card(page,'Subscription billing connection')
 await capture(page,connection,'stripe-connect')
 await connection.getByLabel('Stripe restricted read-only key',{exact:true}).fill(billingGrant.key);await connection.getByLabel('I approve read-only subscription billing access',{exact:true}).check()
 await action(page,'/connections/stripe/connect',()=>connection.getByRole('button',{name:'Connect Stripe Billing',exact:true}).click())
 await capture(page,connection,'stripe-connected')
 await page.goto(runtime.origin+'/app?tab=plan')
 await page.getByLabel('Scenario',{exact:true}).selectOption(f.scenario)
 const importer=card(page,'Subscription actuals')
 await importer.getByText('Import Stripe Billing',{exact:true}).click()
 await importer.getByLabel('Subscription driver',{exact:true}).selectOption(f.driver.id);await importer.getByLabel('Billing from month',{exact:true}).fill('2026-01');await importer.getByLabel('Billing through month',{exact:true}).fill('2026-03')
 const preview=await action(page,'/billing/preview',()=>importer.getByRole('button',{name:'Preview subscription actuals',exact:true}).click())
 assert.deepEqual(preview.bridge.map(r=>r.arrCents),[420000,300000,204000])
 await capture(page,importer,'billing-review')
 await action(page,'/billing/accept',()=>importer.getByRole('button',{name:'Accept subscription actuals',exact:true}).click())
 await importer.getByText('2026-01 through 2026-03 · accepted subscription review',{exact:true}).click()
 await capture(page,importer,'billing-accepted')
 const dashboard=await h.command('dashboard-save',{name:'Subscription ARR',scenario:f.scenario,audience:'board',widgets:[{metric:'arr',display:'table'}]})
 await page.goto(runtime.origin+'/app?tab=dashboards');await page.getByLabel('Dashboard',{exact:true}).selectOption(dashboard.id)
 await page.getByRole('cell',{name:'$2,040.00',exact:true}).first().waitFor()
 await capture(page,page.locator('main.shell'),'billing-dashboard')
 const billingBoard=await board(send)
 try{const bp=await billingBoard.newPage();track(bp);await bp.goto(runtime.origin+'/app?tab=dashboards');await bp.getByLabel('Dashboard',{exact:true}).selectOption(dashboard.id);await bp.getByRole('cell',{name:'$2,040.00',exact:true}).first().waitFor();await capture(bp,bp.locator('main.shell'),'billing-board-dashboard')}finally{await billingBoard.close()}
 await page.goto(runtime.origin+'/app?tab=settings');await action(page,'/connections/stripe/disconnect',()=>connection.getByRole('button',{name:'Disconnect Stripe Billing',exact:true}).click())
 await capture(page,connection,'stripe-disconnected')
 await context.close();context=undefined;await runtime.close();runtime=undefined

 const qbo=qboProvider(),q=await native(qbo),qp=q.page,fixture=await qboFixture(q.h)
 await qp.goto(runtime.origin+'/app?tab=settings');await qp.getByRole('navigation',{name:'Easel'}).waitFor()
 const qc=card(qp,'QuickBooks Online connection')
 await qc.getByText('Connect an existing OAuth company grant',{exact:true}).click();await capture(qp,qc,'qbo-connect')
 const form=qc.locator('form').filter({has:qp.getByRole('button',{name:'Connect QuickBooks grant',exact:true})})
 for(const[label,value]of[['Intuit client ID',qboGrant.clientId],['Intuit client secret',qboGrant.clientSecret],['QuickBooks company realm',qboGrant.realmId],['Intuit refresh token',qboGrant.refreshToken]])await form.getByLabel(label,{exact:true}).fill(value)
 await form.getByLabel('I approve read-only QuickBooks accounting access',{exact:true}).check()
 await action(qp,'/connections/qbo/connect',()=>form.getByRole('button',{name:'Connect QuickBooks grant',exact:true}).click())
 await capture(qp,qc,'qbo-connected')
 for(let i=0;i<26;i++)await acceptQbo(q.h,{month:`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,includeOpening:i===0})
 const sc=(await q.h.get('/api/easel/state')).scenarios[0]
 const approval=await q.h.command('approve-budget',{scenario:sc.id,revision:sc.revision})
 await qp.goto(runtime.origin+'/app?tab=actuals')
 const qi=card(qp,'QuickBooks actuals')
 await qi.getByText('Pull a ledger month',{exact:true}).click();await qi.getByLabel('QuickBooks month',{exact:true}).fill('2026-02')
 await action(qp,'/import/qbo/preview',()=>qi.getByRole('button',{name:'Preview QuickBooks month',exact:true}).click())
 assert.equal(await qi.getByRole('button',{name:'Accept reviewed QuickBooks month',exact:true}).count(),0)
 await capture(qp,qi,'qbo-nonposting-review')
 await qi.getByLabel('I reviewed these nonposting observations and confirm they stay out of ledger amounts',{exact:true}).check()
 await action(qp,'/import/qbo/commit',()=>qi.getByRole('button',{name:'Accept reviewed QuickBooks month',exact:true}).click())
 await qi.getByLabel('QuickBooks month',{exact:true}).fill('2026-03')
 await action(qp,'/import/qbo/preview',()=>qi.getByRole('button',{name:'Preview QuickBooks month',exact:true}).click())
 await capture(qp,qi,'qbo-reviewed-month')
 await action(qp,'/import/qbo/commit',()=>qi.getByRole('button',{name:'Accept reviewed QuickBooks month',exact:true}).click())
 await action(qp,'/import/qbo/preview',()=>qi.getByRole('button',{name:'Preview QuickBooks month',exact:true}).click())
 await capture(qp,qi,'qbo-unchanged')
 qbo.transactionType='synthetic-easel-777'
 await action(qp,'/import/qbo/preview',()=>qi.getByRole('button',{name:'Preview QuickBooks month',exact:true}).click())
 assert.equal(await qi.getByRole('button',{name:'Accept reviewed QuickBooks month',exact:true}).count(),0)
 await capture(qp,qi,'qbo-unsupported-source')
 qbo.transactionType='Journal Entry'
 await action(qp,'/import/qbo/preview',()=>qi.getByRole('button',{name:'Preview QuickBooks month',exact:true}).click())
 await q.h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 await qp.goto(runtime.origin+'/app?tab=review')
 await qp.locator('summary.variance-summary').filter({hasText:fixture.line.name}).first().click()
 const rows=qp.getByRole('table',{name:'Accepted rows',exact:true}).first()
 const sourceFrame=qp.locator('.scroll-frame').filter({has:rows})
 await capture(qp,sourceFrame,'qbo-variance-source')
 await context.route('https://app.sandbox.qbo.intuit.com/app/journal?*',route=>route.fulfill({contentType:'text/html',body:'<h1>Source journal</h1>'}))
 const link=rows.getByRole('link').first();await link.focus();await capture(qp,sourceFrame,'qbo-variance-link',()=>link.scrollIntoViewIfNeeded());assert.match(await link.getAttribute('href'),/txnId=synthetic-easel-transaction-2026-01/)
 const sourcePage=await Promise.all([context.waitForEvent('page'),link.click()]).then(([p])=>p);await sourcePage.getByRole('heading',{name:'Source journal',exact:true}).waitFor();await sourcePage.close()
 const qboBoard=await board(q.send)
 try{const bp=await qboBoard.newPage();track(bp);await bp.goto(runtime.origin+'/app?tab=review');await bp.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor();assert.equal(await bp.getByRole('table',{name:'Accepted rows',exact:true}).count(),0);await bp.getByRole('cell',{name:'$100.00',exact:true}).first().waitFor();await capture(bp,bp.locator('main.shell'),'qbo-viewer-variance')}finally{await qboBoard.close()}
 await qp.goto(runtime.origin+'/app?tab=settings');await qc.getByText('Accepted source months',{exact:true}).click();await capture(qp,qc,'qbo-accepted-months')
 await action(qp,'/connections/qbo/disconnect',()=>qc.getByRole('button',{name:'Disconnect QuickBooks',exact:true}).click());await capture(qp,qc,'qbo-disconnected')
 console.log('Native billing, imported ARR and QuickBooks source review, idempotent pull, source link and disconnect passed at 1440 and 390')
}finally{await context?.close();await browser.close();await runtime?.close()}
