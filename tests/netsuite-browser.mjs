// One native journey. Product data travels through HTTP and the built UI;
// only NetSuite and mail are replaced at their outbound network edges.
import assert from 'node:assert/strict'
import { mkdir,readFile } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command as rerCommand } from './browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { netsuiteProvider,netsuiteFixture,netsuiteGrant,acceptNetSuite } from './netsuite-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-netsuite');await mkdir(evidence,{recursive:true})
if(!process.argv.includes('--existing-build'))await rerCommand(process.cwd(),['build'])
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox']})
const provider=netsuiteProvider();provider.largeMonth='2026-01';provider.splits=12
const messages=[],errors=[];let runtime,context,viewer
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
async function capture(page,scope,name){for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await settle(page);await noOverflow(page,`${name} at ${width}`);await scope.screenshot({path:join(evidence,`${name}-${width}.png`)})}await page.setViewportSize({width:1440,height:1000})}
async function action(page,suffix,click){const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');await click();const r=await response;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
try{
 runtime=await builtBrowserRuntime({https:true,now:()=> '2026-04-15T12:00:00.000Z',bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-easel-mail-key'},outbound:async request=>{if(new URL(request.url).hostname==='api.resend.com'){messages.push(await request.json());return Response.json({id:crypto.randomUUID()})}return provider.outbound(request)}})
 context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
 const send=async(path,body,status=200)=>{const r=await context.request[body===undefined?'get':'post'](runtime.origin+path,{headers:{origin:runtime.origin},...(body===undefined?{}:{data:body}),maxRedirects:0});assert.equal(r.status(),status,await r.text());return status===200?r.json():null}
 const h={get:(path,_cookie,status=200)=>send(path,undefined,status),command:(op,b,_cookie,status=200)=>send('/api/easel/command/'+op,b,status),kit:(kit,op,b,_cookie,status=200)=>send(`/api/easel/import/${kit}/${op}`,b,status)}
 await send('/auth/bootstrap',{token:runtime.bootstrap,displayName:'Fran Finance'},303)
 const page=await context.newPage();track(page);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(runtime.origin+'/setup');await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL('**/app')
 const f=await netsuiteFixture(h,{connect:false})
 await page.goto(runtime.origin+'/app?tab=settings')
 const connection=card(page,'NetSuite connection');await connection.getByText('Connect a NetSuite token',{exact:true}).click();await capture(page,connection,'connection-form')
 for(const [label,key]of[['NetSuite account realm','realm'],['Declared read-only role','role'],['Consumer key','consumerKey'],['Consumer secret','consumerSecret'],['Token ID','tokenId'],['Token secret','tokenSecret']])await connection.getByLabel(label,{exact:true}).fill(netsuiteGrant[key])
 await connection.getByLabel('I approve read-only NetSuite accounting access',{exact:true}).check();await action(page,'/connections/netsuite/connect',()=>connection.getByRole('button',{name:'Connect NetSuite',exact:true}).click())
 assert.ok(!(await connection.innerText()).includes(netsuiteGrant.tokenSecret))
 await connection.getByText('Map a subsidiary to an entity',{exact:true}).click()
 for(let i=0;i<2;i++){
  await connection.getByLabel('NetSuite subsidiary',{exact:true}).selectOption(String(i+1));await connection.getByLabel('NetSuite accounting book',{exact:true}).selectOption('1');await connection.getByLabel('Easel entity',{exact:true}).selectOption(f.entities[i].id)
  await action(page,'/connections/netsuite/map-subsidiary',()=>connection.getByRole('button',{name:'Save NetSuite subsidiary mapping',exact:true}).click())
 }
 const status=await h.get('/api/easel/connections/netsuite')
 for(const p of status.inventory.periods.filter(p=>p.isyear==='F'&&p.isquarter==='F'&&p.id!=='26'))await send('/api/easel/connections/netsuite/map-period',{book:'1',period:p.id,month:p.enddate.slice(0,7)})
 await connection.getByText('Map source accounting periods',{exact:true}).click();await connection.getByLabel('Period accounting book',{exact:true}).selectOption('1');await connection.getByLabel('Source accounting period',{exact:true}).selectOption('26');await connection.getByLabel('Easel actuals month',{exact:true}).fill('2026-01')
 await action(page,'/connections/netsuite/map-period',()=>connection.getByRole('button',{name:'Save NetSuite period mapping',exact:true}).click());await capture(page,connection,'connected-mappings')
 for(let i=0;i<12;i++)for(const b of status.bindings)await acceptNetSuite(h,{binding:b.id,month:'2025-'+String(i+1).padStart(2,'0'),includeOpening:i===0})
 const forecasts=[]
 for(const e of f.entities){const b=await h.command('budget-from-actuals',{entity:e.id,name:e.name+' native review',growth:{}});forecasts.push((await h.command('approve-budget',{scenario:b.id,revision:b.revision})).forecast)}
 await page.goto(runtime.origin+'/app?tab=actuals');const importer=card(page,'NetSuite actuals');await importer.getByText('Pull a NetSuite month',{exact:true}).click()
 for(let i=0;i<2;i++){
  await importer.getByLabel('Subsidiary entity and book',{exact:true}).selectOption(status.bindings.find(b=>b.entity===f.entities[i].id).id);await importer.getByLabel('NetSuite month',{exact:true}).fill('2026-01')
  const preview=await action(page,'/import/netsuite/preview',()=>importer.getByRole('button',{name:'Preview NetSuite month',exact:true}).click());assert.equal(preview.source.trialBalance.balanced,true)
  if(i===0)await capture(page,importer,'review-source-month')
  await action(page,'/import/netsuite/stage',()=>importer.getByRole('button',{name:'Stage NetSuite source review',exact:true}).click())
  await action(page,'/import/netsuite/commit',()=>importer.getByRole('button',{name:'Accept reviewed NetSuite month',exact:true}).click())
 }
 await page.getByLabel('Actuals ledger',{exact:true}).selectOption(f.entities[0].id);await settle(page);await capture(page,card(page,'Reconciliation'),'entity-reconciliation')
 await page.goto(runtime.origin+'/app?tab=review')
 for(let i=0;i<forecasts.length;i++){
  await page.getByLabel('Review forecast',{exact:true}).selectOption(forecasts[i].id)
  await action(page,'/command/close-month',()=>page.getByRole('button',{name:'Close Jan 2026',exact:true}).click())
  await page.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor();await page.locator('summary.variance-summary').filter({hasText:f.line.name}).first().click()
  const rows=page.getByRole('table',{name:'Accepted rows',exact:true}).first(),sourceFrame=page.locator('.scroll-frame').filter({has:rows})
  assert.equal(await rows.locator('tbody tr').count(),12,'Every authorized accepted revenue row is shown')
  const expected='https://1234567-sb1.app.netsuite.com/app/accounting/transactions/journal.nl?id=1026'
  assert.ok((await rows.getByRole('link').evaluateAll(links=>links.map(a=>a.href))).every(url=>url===expected))
  await context.route(expected,route=>{assert.equal(route.request().url(),expected);return route.fulfill({contentType:'text/html',body:'<h1>Recorded NetSuite transaction 1026</h1>'})})
  const link=rows.getByRole('link').first()
  for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await settle(page);await noOverflow(page,'Entity variance');await link.scrollIntoViewIfNeeded();await link.focus();await sourceFrame.screenshot({path:join(evidence,`entity-${i+1}-variance-${width}.png`)});const popup=await Promise.all([context.waitForEvent('page'),link.click()]).then(([p])=>p);await popup.getByRole('heading',{name:'Recorded NetSuite transaction 1026',exact:true}).waitFor();await popup.close()}
  await page.setViewportSize({width:1440,height:1000})
  await action(page,'/command/pack-create',()=>page.getByRole('button',{name:'Start the Jan 2026 pack',exact:true}).click())
  await page.getByText('The numbers are current.',{exact:true}).waitFor()
  const pack=await action(page,'/command/pack-publish',()=>page.getByRole('button',{name:'Publish pack',exact:true}).click())
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download pack (HTML)',exact:true}).click()
  const path=join(evidence,`entity-${i+1}-pack.html`);await(await download).saveAs(path)
  const html=await readFile(path,'utf8'),amount=f.entities[i].currency+' '+(i===0?'100.00':'80.00')
  assert.ok(html.includes(amount));assert.ok(!html.includes('USD'))
  const captureBody=await send('/api/easel/snapshot/'+pack.snapshot);assert.equal(captureBody.body.currency,f.entities[i].currency)
  const exported=await context.newPage();track(exported);try{await exported.setContent(html);await exported.setViewportSize({width:1440,height:1000});assert.ok((await exported.locator('body').innerText()).includes(amount));await capture(exported,exported.locator('body'),`entity-${i+1}-published-pack`)}finally{await exported.close()}
 }
 await send('/api/easel/command/member',{email:'netsuite-viewer@example.test',name:'Canada board reader',role:'viewer',departments:[],dimensionMembers:{[f.entities[0].dimension]:[f.entities[0].member]}});await send('/api/easel/invite',{email:'netsuite-viewer@example.test'})
 const mail=messages.find(m=>m.to.includes('netsuite-viewer@example.test')),token=new URL(mail.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 viewer=await browser.newContext({ignoreHTTPSErrors:true});const confirmation=await viewer.request.post(runtime.origin+'/auth/confirm',{headers:{origin:runtime.origin},data:{token},maxRedirects:0});assert.equal(confirmation.status(),303)
 const vp=await viewer.newPage();track(vp);vp.on('pageerror',e=>errors.push(e.message));await vp.setViewportSize({width:1440,height:1000});await vp.goto(runtime.origin+'/app?tab=review');await vp.getByLabel('Review forecast',{exact:true}).selectOption(forecasts[0].id);await vp.getByRole('heading',{name:'Variances, Jan 2026',exact:true}).waitFor()
 const visibleRow=vp.locator('summary.variance-summary').filter({hasText:f.line.name}).first();await visibleRow.click()
 assert.match(await visibleRow.innerText(),/CAD 100\.00/);assert.equal(await vp.getByRole('table',{name:'Accepted rows',exact:true}).count(),0)
 assert.ok(!(await vp.locator('main.shell').innerText()).includes('Recorded accounting observation'));assert.equal(await vp.getByLabel('Review forecast',{exact:true}).locator(`option[value="${forecasts[1].id}"]`).count(),0)
 const forbidden=await viewer.request.get(runtime.origin+'/api/easel/variance/2026-01?forecast='+forecasts[1].id);assert.equal(forbidden.status(),404)
 const permitted=await viewer.request.get(runtime.origin+'/api/easel/variance/2026-01?forecast='+forecasts[0].id),permittedRows=(await permitted.json()).rows
 assert.equal(permittedRows.find(r=>r.line===f.line.id).actual,10000);assert.ok(permittedRows.every(r=>r.citations.length===0&&r.planSources.length===0&&r.hypotheses.length===0))
 await capture(vp,card(vp,'Variances, Jan 2026'),'entity-viewer-amounts')
 // Continue the same entities into an explicitly reviewed provider-backed consolidation.
 const expense=await h.command('line',{name:'Intercompany service expense',type:'operating-expense'})
 for(const [account,target]of[['1100','bs:receivables'],['2000','bs:payables'],['5000',expense.id]])await h.command('account-map',{account,target})
 provider.intercompany=true
 for(let i=0;i<2;i++){
  await acceptNetSuite(h,{binding:status.bindings.find(b=>b.entity===f.entities[i].id).id,month:'2026-02',includeOpening:false})
  await h.command('close-month',{scenario:forecasts[i].id,month:'2026-02'})
  await h.command('entity-rate',{entity:f.entities[i].id,month:'2025-12',monthEnd:'1'})
  for(const month of['2026-01','2026-02'])await h.command('entity-rate',{entity:f.entities[i].id,month,average:'1',budget:'1',monthEnd:'1'})
 }
 await page.goto(runtime.origin+'/app?tab=settings')
 const entities=card(page,'Entities'),ledger=entities.locator('details').filter({has:page.getByText('Review elimination from accepted entity ledger evidence',{exact:true})})
 await ledger.locator('summary').click()
 await ledger.getByLabel('Ledger revenue entity',{exact:true}).selectOption(f.entities[0].id);await ledger.getByLabel('Ledger expense entity',{exact:true}).selectOption(f.entities[1].id)
 await ledger.getByLabel('Ledger evidence month',{exact:true}).fill('2026-02');await ledger.getByLabel('Ledger revenue line',{exact:true}).selectOption(f.line.id);await ledger.getByLabel('Ledger expense line',{exact:true}).selectOption(expense.id)
 await ledger.getByLabel('Ledger elimination name',{exact:true}).fill('Recorded management service and settlement')
 for(const [label,transaction,amount]of[['Revenue charge','6001','100'],['Expense charge','6002','100'],['Receivable balance','6001','75'],['Payable balance','6002','75'],['Cash received','6003','25'],['Cash paid','6004','25']]){
  await ledger.getByRole('group',{name:label,exact:true}).getByRole('checkbox',{name:new RegExp('transaction '+transaction+'$')}).check()
  await ledger.getByLabel('Eliminate local '+label.toLowerCase(),{exact:true}).fill(amount)
 }
 await ledger.getByLabel('I reviewed the selected actual ledger evidence',{exact:true}).check();await capture(page,ledger,'review-ledger-elimination')
 await action(page,'/command/entity-elimination-save',()=>ledger.getByRole('button',{name:'Save reviewed ledger elimination',exact:true}).click())
 const consolidation=page.getByRole('region',{name:'Management consolidation',exact:true}),revenue=consolidation.getByRole('table',{name:'Profit and loss in USD',exact:true}).getByRole('row').filter({hasText:'Feb 2026'}).filter({has:page.getByRole('cell',{name:'Revenue',exact:true})})
 assert.match(await revenue.getByRole('cell').last().innerText(),/180\.00/)
 const result=(await h.get('/api/easel/consolidation/'+f.root.id)).consolidated.find(m=>m.month==='2026-02');assert.equal(result.profit.revenue,18000);assert.equal(result.profit.operatingExpenses,0);assert.equal(result.balanceSheet.receivables,0);assert.equal(result.balanceSheet.payables,0);assert.equal(result.cash.difference,0)
 await capture(page,consolidation,'provider-consolidation')
 await connection.getByText('Accepted NetSuite source periods',{exact:true}).click();await capture(page,connection,'accepted-source-status')
 provider.revocation=503;await action(page,'/connections/netsuite/disconnect',()=>connection.getByRole('button',{name:'Disconnect NetSuite',exact:true}).click());await connection.getByRole('alert').filter({hasText:'Access Tokens'}).waitFor();await capture(page,connection,'unconfirmed-revocation')
 assert.deepEqual(errors,[],'No browser application failures')
 console.log('NetSuite native journey passed; browser evidence: '+evidence)
}finally{await viewer?.close();await context?.close();await runtime?.close();await browser.close()}
