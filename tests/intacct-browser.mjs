// Built application and native authentication; only provider and mail HTTP are replaced.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { intacctProvider,intacctGrant,intacctFixture,acceptIntacct } from './intacct-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
assert.ok(process.argv.includes('--existing-build'),'Use the current working build')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/intacct-browser');await mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.EASEL_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']})
const provider=intacctProvider(),messages=[]
let runtime,context,reader
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
async function capture(page,scope,name){for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await settle(page);await noOverflow(page,`${name} ${width}`);await scope.screenshot({path:join(evidence,`${name}-${width}.png`)})}await page.setViewportSize({width:1440,height:1000})}
try{
 runtime=await builtBrowserRuntime({https:true,now:()=> '2026-05-15T12:00:00.000Z',bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-mail-boundary'},outbound:async request=>{if(new URL(request.url).hostname==='api.resend.com'){messages.push(await request.json());return Response.json({id:crypto.randomUUID()})}return provider.outbound(request)}})
 context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
 const send=async(path,body,status=200)=>{const r=await context.request[body===undefined?'get':'post'](runtime.origin+path,{headers:{origin:runtime.origin},...(body===undefined?{}:{data:body}),maxRedirects:0});assert.equal(r.status(),status,await r.text());return status===200?r.json():null}
 const h={get:path=>send(path),command:(op,b)=>send('/api/easel/command/'+op,b),kit:(kit,op,b)=>send(`/api/easel/import/${kit}/${op}`,b)}
 await send('/auth/bootstrap',{token:runtime.bootstrap,displayName:'Fran Finance'},303)
 const page=await context.newPage();track(page);page.on('dialog',d=>d.accept())
 await page.goto(runtime.origin+'/setup');await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL('**/app')
 const f=await intacctFixture(h,{connect:false})
 await page.goto(runtime.origin+'/app?tab=settings');await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const connection=card(page,'Sage Intacct connection');await connection.getByRole('button',{name:'Connect Sage Intacct',exact:true}).waitFor()
 for(const [label,key]of [['Intacct company ID','companyId'],['Web Services sender ID','senderId'],['Sender password','senderPassword'],['Dedicated read-only Web Services user','userId'],['Web Services user password','userPassword']])await connection.getByLabel(label,{exact:true}).fill(intacctGrant[key])
 await connection.getByLabel('I approve read-only Intacct access',{exact:true}).check()
 await connection.getByRole('button',{name:'Connect Sage Intacct',exact:true}).focus();await page.keyboard.press('Enter')
 await connection.getByText('Connected · user credential ending 5678',{exact:true}).waitFor()
 assert.equal(await connection.locator('input[type=password]').count(),0)
 for(const [source,entity]of [['CA',f.ca],['EU',f.eu]]){await connection.getByLabel('Intacct legal entity',{exact:true}).selectOption(source);await connection.getByLabel('Easel entity source plan',{exact:true}).selectOption(entity.id);await connection.getByRole('button',{name:'Bind Intacct entity',exact:true}).click();await settle(page)}
 assert.equal((await h.get('/api/easel/connections/intacct')).bindings.length,2)
 await capture(page,connection,'intacct-connected')
 await page.goto(runtime.origin+'/app?tab=actuals');const actuals=card(page,'Sage Intacct actuals');await actuals.getByLabel('Intacct review entity').waitFor();await actuals.getByLabel('Intacct review entity').selectOption('CA')
 await actuals.getByText('Backfill Intacct history',{exact:true}).click();assert.equal(await actuals.getByLabel('Intacct history months',{exact:true}).inputValue(),'24')
 await actuals.getByLabel('Intacct history months',{exact:true}).fill('11');await actuals.getByLabel('Intacct last closed month',{exact:true}).fill('2025-12');await actuals.getByRole('button',{name:'Review Intacct history',exact:true}).click();await actuals.getByText('Choose 12–36 completed months',{exact:true}).waitFor()
 await actuals.getByLabel('Intacct history months',{exact:true}).fill('24');await actuals.getByRole('button',{name:'Review Intacct history',exact:true}).click();await actuals.getByRole('table',{name:'Intacct source trial balance'}).waitFor()
 assert.match(await actuals.innerText(),/Canadian Services.*2024-01.*CAD/)
 await capture(page,actuals,'intacct-history-review')
 await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await actuals.getByRole('button',{name:'Review next Intacct history month',exact:true}).waitFor()
 for(const sourceEntity of ['CA','EU'])for(let i=sourceEntity==='CA'?1:0;i<26;i++){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;await acceptIntacct(h,{sourceEntity,month,includeOpening:i===0})}
 provider.change=true
 await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-02');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByText(/1 changed transactions · 2 journal deltas/).waitFor()
 await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await settle(page)
 await actuals.getByLabel('Intacct review entity').selectOption('EU');await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-02');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByRole('table',{name:'Intacct source trial balance'}).waitFor();assert.match(await actuals.innerText(),/European Services.*2026-02.*EUR/)
 await capture(page,actuals,'intacct-entity-trial')
 const root=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.first.id),approved=await h.command('approve-budget',{scenario:root.id,revision:root.revision});await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 await page.goto(runtime.origin+'/app?tab=review&reviewMonth=2026-01');await page.getByRole('heading',{name:/Variances,/}).waitFor()
 const source=page.locator('details.card-row').filter({has:page.getByText('Management revenue',{exact:true})}).first();await source.locator('summary').click();await source.getByRole('table',{name:'Accepted rows'}).waitFor()
 const projection=await h.get('/api/easel/variance/2026-01?scenario='+approved.forecast.id),rows=projection.rows.find(r=>r.line===f.revenue.id&&r.department===f.department.id).citations
 assert.equal(await source.getByRole('table',{name:'Accepted rows'}).locator('tbody tr').count(),rows.length)
 const url=rows[0].providerUrl;await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<h1>Recorded Intacct entry</h1>'}))
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const popup=page.waitForEvent('popup');await source.getByRole('link').first().click();const entry=await popup;await entry.getByRole('heading',{name:'Recorded Intacct entry'}).waitFor();assert.equal(entry.url(),url);await entry.screenshot({path:join(evidence,`intacct-entry-${width}.png`)});await entry.close()}
 await capture(page,source,'intacct-variance-source')
 await h.command('member',{email:'board-intacct@example.test',name:'Board reader',role:'viewer',departments:[]});await send('/api/easel/invite',{email:'board-intacct@example.test'})
 const message=messages.find(m=>m.to.includes('board-intacct@example.test')),token=new URL(message.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 reader=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});assert.equal((await reader.request.post(runtime.origin+'/auth/confirm',{headers:{origin:runtime.origin},data:{token},maxRedirects:0})).status(),303)
 const board=await reader.newPage();track(board);await board.goto(runtime.origin+'/app?tab=review&reviewMonth=2026-01');await board.getByRole('heading',{name:/Variances,/}).waitFor()
 const boardSource=board.locator('details.card-row').filter({has:board.getByText('Management revenue',{exact:true})}).first();await boardSource.locator('summary').click();assert.equal(await boardSource.getByRole('table',{name:'Accepted rows'}).count(),0);assert.equal(await boardSource.getByRole('link').count(),0)
 await capture(board,boardSource,'intacct-viewer')
 await h.command('member',{email:'board-intacct@example.test',name:'Canadian reader',role:'viewer',dimensionMembers:{[f.ca.dimension]:[f.ca.member]},departments:[f.department.id]})
 await board.reload();await board.getByRole('heading',{name:/Variances,/}).waitFor();await capture(board,card(board,'Monthly review'),'intacct-scoped-reader')
 await page.goto(runtime.origin+'/app?tab=settings');await connection.getByRole('button',{name:'Disconnect Intacct',exact:true}).waitFor();await connection.getByRole('button',{name:'Disconnect Intacct',exact:true}).click();await connection.getByText(/Provider revocation: unsupported/).waitFor()
 assert.equal((await h.get('/api/easel/connections/intacct')).connected,false);await capture(page,connection,'intacct-disconnected')
 console.log('Intacct native browser journey passed; 1440 assertions and 1440/390 screen evidence at '+evidence)
}finally{await reader?.close();await context?.close();await runtime?.close();await browser.close()}
