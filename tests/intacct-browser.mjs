// Native built screens, real sessions and D1; only provider HTTP edges are faked.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command } from './browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { intacctProvider,intacctGrant,intacctFixture,intacctCall,acceptIntacct } from './intacct-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-intacct')
await mkdir(evidence,{recursive:true})
if(!process.argv.includes('--existing-build'))await command(process.cwd(),['build'])
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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
 const provider=intacctProvider(),{h,page,send}=await native(provider),f=await intacctFixture(h)
 await page.setViewportSize({width:1440,height:1000})
 await page.goto(runtime.origin+'/app?tab=settings');await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const connection=card(page,'Sage Intacct connection')
 await connection.getByText('Connect a read-only Web Services user',{exact:true}).click()
 await capture(page,connection,'intacct-connect')
 for(const[label,value]of[['Intacct company ID',intacctGrant.companyId],['Web Services sender ID',intacctGrant.senderId],['Sender password',intacctGrant.senderPassword],['Web Services user ID',intacctGrant.userId],['Web Services password',intacctGrant.password]])await connection.getByLabel(label,{exact:true}).fill(value)
 await connection.getByLabel('I approve read-only Intacct access',{exact:true}).check()
 await action(page,'/connections/intacct/connect',()=>connection.getByRole('button',{name:'Connect Sage Intacct',exact:true}).click())
 for(const[source,entity]of[['US',f.us],['CA',f.ca]]){
  await connection.getByLabel('Source Intacct entity',{exact:true}).selectOption(source)
  await connection.getByLabel('Easel entity plan',{exact:true}).selectOption(entity.id)
  await action(page,'/connections/intacct/entity-map',()=>connection.getByRole('button',{name:'Map Intacct entity',exact:true}).click())
 }
 await capture(page,connection,'intacct-mapped')
 for(let i=0;i<24;i++)for(const sourceEntity of['US','CA'])await acceptIntacct(h,{sourceEntity,month:(2024+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0'),includeOpening:i===0})
 await page.goto(runtime.origin+'/app?tab=actuals')
 const importer=card(page,'Intacct actuals')
 await importer.getByText('Backfill reviewed history',{exact:true}).click()
 assert.equal(await importer.getByLabel('History months',{exact:true}).inputValue(),'24')
 await importer.getByText('Pull a ledger month',{exact:true}).click()
 const monthForm=importer.locator('form').filter({has:page.getByRole('button',{name:'Preview Intacct month',exact:true})})
 await monthForm.getByLabel('Intacct entity',{exact:true}).selectOption('US')
 await monthForm.getByLabel('Intacct month',{exact:true}).fill('2026-01')
 await action(page,'/import/intacct/preview',()=>monthForm.getByRole('button',{name:'Preview Intacct month',exact:true}).click())
 await capture(page,importer,'intacct-month-review')
 await action(page,'/import/intacct/commit',()=>importer.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click())
 await acceptIntacct(h,{sourceEntity:'CA',month:'2026-01',includeOpening:false})
 await page.goto(runtime.origin+'/app?tab=settings')
 for(const entity of[f.us,f.ca])await action(page,'/command/approve-budget',()=>connection.getByRole('button',{name:'Start forecast for '+entity.name,exact:true}).click())
 const forecasts=(await h.get('/api/easel/state')).scenarios.filter(s=>s.kind==='forecast'),us=forecasts.find(s=>s.entity===f.us.id),ca=forecasts.find(s=>s.entity===f.ca.id)
 await h.command('close-month',{scenario:ca.id,month:'2026-01'})
 await page.goto(runtime.origin+'/app?tab=review')
 await page.getByLabel('Review forecast',{exact:true}).selectOption(us.id)
 await action(page,'/command/close-month',()=>page.getByRole('button',{name:'Close Jan 2026',exact:true}).click())
 await page.locator('summary.variance-summary').filter({hasText:f.revenue.name}).first().click()
 const rows=page.getByRole('table',{name:'Accepted rows',exact:true}).first(),frame=page.locator('.scroll-frame').filter({has:rows})
 const link=rows.getByRole('link').first()
 assert.match(await link.getAttribute('href'),/www.intacct.com\/ia\/acct\/glentry.phtml\?recordno=2026-01-fee-2/)
 await capture(page,frame,'intacct-variance-rows',()=>link.scrollIntoViewIfNeeded())
 await context.route('https://www.intacct.com/ia/acct/glentry.phtml?*',route=>route.fulfill({contentType:'text/html',body:'<h1>Recorded Intacct entry</h1>'}))
 const sourcePage=await Promise.all([context.waitForEvent('page'),link.click()]).then(([p])=>p);await sourcePage.getByRole('heading',{name:'Recorded Intacct entry',exact:true}).waitFor();await sourcePage.close()
 const reader=await board(send)
 try{
  const bp=await reader.newPage();track(bp);await bp.goto(runtime.origin+'/app?tab=review')
  await bp.getByLabel('Review forecast',{exact:true}).selectOption(us.id)
  await bp.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor()
  assert.equal(await bp.getByRole('table',{name:'Accepted rows',exact:true}).count(),0)
  await bp.getByText('$100.00',{exact:true}).first().waitFor()
  await capture(bp,bp.locator('main.shell'),'intacct-viewer')
 }finally{await reader.close()}
 await page.goto(runtime.origin+'/app?tab=actuals')
 await page.getByLabel('Ledger entity',{exact:true}).selectOption(f.ca.id)
 await capture(page,card(page,'Reconciliation'),'intacct-entity-reconciliation')
 await page.goto(runtime.origin+'/app?tab=settings')
 await connection.getByText('Accepted Intacct source months',{exact:true}).click()
 await capture(page,connection,'intacct-source-months')
 await action(page,'/connections/intacct/disconnect',()=>connection.getByRole('button',{name:'Disconnect Intacct',exact:true}).click())
 await capture(page,connection,'intacct-disconnected')
 assert.match(await connection.innerText(),/Disable the Web Services user/)
 console.log('Intacct native connection, entity mapping, reviewed monthly actuals, variance link, viewer filtering and truthful disconnect; browser proof at 1440 and 390.')
}finally{await context?.close();await browser.close();await runtime?.close()}
