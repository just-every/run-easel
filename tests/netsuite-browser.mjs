// Native built screens, real sessions and D1; only provider HTTP edges are faked.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command } from './browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { billingProvider,billingGrant,billingFixture } from './billing-fixture.mjs'
import { netsuiteProvider,netsuiteGrant,netsuiteFixture,acceptNetsuite } from './netsuite-fixture.mjs'
import { qboProvider,qboGrant,qboFixture,acceptQbo } from './qbo-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-netsuite')
await mkdir(evidence,{recursive:true})
if(!process.argv.includes('--existing-build'))await command(process.cwd(),['build'])
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
let runtime,context,messages=[]
async function native(provider){
 messages=[]
 runtime=await builtBrowserRuntime({https:true,now:()=> '2026-04-15T12:00:00.000Z',bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-easel-900000001'},outbound:async request=>{
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
 await page.setViewportSize({width:1440,height:1000})
}
const action=async(page,suffix,run)=>{const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');await run();const r=await response;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
try{
 const provider=netsuiteProvider(),q=await native(provider),page=q.page,f=await netsuiteFixture(q.h)
 await page.setViewportSize({width:1440,height:1000})
 await page.goto(runtime.origin+'/app?tab=settings');await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const connection=card(page,'NetSuite connection')
 await connection.getByText('Connect a read-only NetSuite role',{exact:true}).click()
 const form=connection.locator('form').filter({has:page.getByRole('button',{name:'Connect NetSuite',exact:true})})
 for(const[label,key]of[['NetSuite account ID','realmId'],['Read-only role ID','roleId'],['Consumer key','consumerKey'],['Consumer secret','consumerSecret'],['Token ID','tokenId'],['Token secret','tokenSecret']])await form.getByLabel(label,{exact:true}).fill(netsuiteGrant[key])
 await form.getByLabel('I confirm this token uses a read-only NetSuite role',{exact:true}).check()
 await form.getByLabel('I approve read-only NetSuite accounting access',{exact:true}).check()
 await capture(page,connection,'netsuite-consent')
 await action(page,'/connections/netsuite/connect',()=>form.getByRole('button',{name:'Connect NetSuite',exact:true}).click())
 const mapping=connection.locator('form').filter({has:page.getByRole('button',{name:'Map NetSuite subsidiary',exact:true})})
 for(const[sub,entity]of[['1',f.entities.first],['2',f.entities.second]]){
  await mapping.getByLabel('Subsidiary',{exact:true}).selectOption(sub);await mapping.getByLabel('Entity',{exact:true}).selectOption(entity.id)
  await action(page,'/connections/netsuite/map',()=>mapping.getByRole('button',{name:'Map NetSuite subsidiary',exact:true}).click())
 }
 await capture(page,connection,'netsuite-connected-subsidiaries')
 for(const subsidiaryId of ['1','2'])for(let i=0;i<26;i++)await acceptNetsuite(q.h,{month:`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,includeOpening:i===0,subsidiaryId})
 const sc=(await q.h.get('/api/easel/state')).scenarios.find(s=>s.id===f.scenario.id)
 const approval=await q.h.command('approve-budget',{scenario:sc.id,revision:sc.revision})
 await page.goto(runtime.origin+'/app?tab=actuals')
 const importer=card(page,'NetSuite actuals')
 await importer.getByText('Backfill reviewed history',{exact:true}).click()
 await capture(page,importer,'netsuite-history-controls')
 await importer.getByText('Backfill reviewed history',{exact:true}).click()
 await importer.getByText('Pull a ledger month',{exact:true}).click()
 const monthForm=importer.locator('form').filter({has:page.getByRole('button',{name:'Preview NetSuite month',exact:true})})
 await monthForm.getByLabel('NetSuite subsidiary',{exact:true}).selectOption('1')
 await monthForm.getByLabel('NetSuite month',{exact:true}).fill('2026-03')
 await action(page,'/import/netsuite/preview',()=>monthForm.getByRole('button',{name:'Preview NetSuite month',exact:true}).click())
 await capture(page,importer,'netsuite-reviewed-trial-balance')
 await action(page,'/import/netsuite/commit',()=>importer.getByRole('button',{name:'Accept reviewed NetSuite month',exact:true}).click())
 await action(page,'/import/netsuite/preview',()=>monthForm.getByRole('button',{name:'Preview NetSuite month',exact:true}).click())
 await importer.getByText('No changed posted amounts.',{exact:true}).waitFor()
 await capture(page,importer,'netsuite-idempotent-month')
 provider.extra='both'
 await importer.getByText('Check for source changes',{exact:true}).click()
 const checkForm=importer.locator('form').filter({has:page.getByRole('button',{name:'Check NetSuite source',exact:true})})
 await checkForm.getByLabel('NetSuite subsidiary',{exact:true}).selectOption('1');await checkForm.getByLabel('Source month',{exact:true}).fill('2026-03')
 await action(page,'/import/netsuite/observe',()=>checkForm.getByRole('button',{name:'Check NetSuite source',exact:true}).click())
 await importer.getByRole('table',{name:'NetSuite source review issues',exact:true}).getByText('No reviewed account mapping',{exact:false}).waitFor()
 await importer.getByText('Affected working conclusions and captures',{exact:true}).click()
 await capture(page,importer,'netsuite-source-changes-and-impacts')
 await page.goto(runtime.origin+'/app?tab=settings')
 const accountMapping=card(page,'Account mappings').locator('form')
 await accountMapping.getByLabel('Source account',{exact:true}).fill('9999');await accountMapping.getByLabel('Maps to',{exact:true}).selectOption(f.line.id)
 await action(page,'/command/account-map',()=>accountMapping.getByRole('button',{name:'Save mapping',exact:true}).click())
 await page.goto(runtime.origin+'/app?tab=actuals');await importer.getByText('Pull a ledger month',{exact:true}).click()
 await monthForm.getByLabel('NetSuite subsidiary',{exact:true}).selectOption('1');await monthForm.getByLabel('NetSuite month',{exact:true}).fill('2026-03')
 await action(page,'/import/netsuite/preview',()=>monthForm.getByRole('button',{name:'Preview NetSuite month',exact:true}).click())
 await action(page,'/import/netsuite/commit',()=>importer.getByRole('button',{name:'Accept reviewed NetSuite month',exact:true}).click())
 await q.h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 await page.goto(runtime.origin+'/app?tab=review')
 await page.locator('summary.variance-summary').filter({hasText:f.line.name}).first().click()
 const rows=page.getByRole('table',{name:'Accepted rows',exact:true}).first(),frame=page.locator('.scroll-frame').filter({has:rows})
 assert.equal(await rows.locator('tbody tr').count(),1)
 await context.route('https://1234567-sb1.app.netsuite.com/app/accounting/transactions/transaction.nl?*',route=>route.fulfill({contentType:'text/html',body:'<h1>NetSuite source transaction</h1>'}))
 const link=rows.getByRole('link').first();assert.equal(await link.getAttribute('href'),'https://1234567-sb1.app.netsuite.com/app/accounting/transactions/transaction.nl?id=100025')
 await capture(page,frame,'netsuite-variance-accepted-row',async()=>{await link.scrollIntoViewIfNeeded();await link.focus()})
 const sourcePage=await Promise.all([context.waitForEvent('page'),link.click()]).then(([p])=>p);await sourcePage.getByRole('heading',{name:'NetSuite source transaction',exact:true}).waitFor();await sourcePage.close()
 const reader=await board(q.send)
 try{const bp=await reader.newPage();track(bp);await bp.goto(runtime.origin+'/app?tab=review');await bp.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor();assert.equal(await bp.getByRole('table',{name:'Accepted rows',exact:true}).count(),0);await bp.getByRole('cell',{name:'$100.00',exact:true}).first().waitFor();await capture(bp,bp.locator('main.shell'),'netsuite-viewer-amounts')}finally{await reader.close()}
 await page.goto(runtime.origin+'/app?tab=settings');await connection.getByText('Accepted NetSuite source months',{exact:true}).click();await capture(page,connection,'netsuite-accepted-source-months')
 await action(page,'/connections/netsuite/disconnect',()=>connection.getByRole('button',{name:'Disconnect NetSuite',exact:true}).click())
 await connection.getByRole('alert').filter({hasText:'Access Tokens'}).waitFor();await capture(page,connection,'netsuite-disconnect-owner-action')
 console.log('CONNECT-003 native consent, two subsidiary mappings, backfill, reviewed month, idempotency, entity-filtered variance, followed source link, viewer amounts and truthful disconnect passed; screens inspected at 1440 and 390')
}finally{await context?.close();await browser.close();await runtime?.close()}
