// One native sanity journey. Assertions run at 1440; the same changed screens
// are captured at 1440 and 390. Only the CRM and mail HTTP edges are faked.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {builtBrowserRuntime} from './built-browser-runtime.mjs'
import {settle,noOverflow,track} from './browser-journey.mjs'
import {pipelineProvider,pipelineFixture,pipelineInput,hubspotGrant,salesforceGrant} from './pipeline-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-pipeline');await mkdir(evidence,{recursive:true})
const edge=pipelineProvider(),messages=[],browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox']})
let runtime,context
try{
 runtime=await builtBrowserRuntime({https:true,bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-easel-pipeline-mail'},outbound:async request=>{if(new URL(request.url).hostname==='api.resend.com'){messages.push(await request.json());return Response.json({id:crypto.randomUUID()})}return edge.outbound(request)}})
 context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
 const send=async(path,body,status=200)=>{const response=await context.request[body===undefined?'get':'post'](runtime.origin+path,{headers:{origin:runtime.origin},...(body===undefined?{}:{data:body}),maxRedirects:0});assert.equal(response.status(),status,await response.text());return status===200?response.json():null}
 await send('/auth/bootstrap',{token:runtime.bootstrap,displayName:'Fran Finance'},303)
 const page=await context.newPage();track(page);page.on('dialog',d=>d.accept())
 await page.goto(runtime.origin+'/setup');await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL('**/app')
 const h={command:(op,b)=>send('/api/easel/command/'+op,b),get:path=>send(path),kit:(kit,op,b)=>send(`/api/easel/import/${kit}/${op}`,b)}
 const f=await pipelineFixture(h)
 const capture=async name=>{for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await settle(page);await noOverflow(page,name+' '+width);await page.locator('main.shell').screenshot({path:join(evidence,`${name}-${width}.png`)})}await page.setViewportSize({width:1440,height:1000})}
 const action=async(suffix,run)=>{const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');await run();const r=await response;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
 await page.goto(runtime.origin+'/app?tab=pipeline');await page.getByRole('heading',{name:'Pipeline connections',exact:true}).waitFor()
 await page.getByLabel('CRM client ID',{exact:true}).fill(hubspotGrant.clientId)
 await page.getByLabel('CRM client secret',{exact:true}).fill(hubspotGrant.clientSecret)
 await page.getByLabel('CRM OAuth refresh token',{exact:true}).fill(hubspotGrant.refreshToken)
 await page.getByLabel('I approve read-only CRM access',{exact:true}).check();await page.getByLabel('This provider grant has only read permission',{exact:true}).check()
 await action('/connections/pipeline/hubspot/connect',()=>page.getByRole('button',{name:'Connect HubSpot read-only',exact:true}).click())
 await capture('pipeline-connected')
 await action('/pipeline/observe',()=>page.getByRole('button',{name:'Read HubSpot deals',exact:true}).click())
 for(const[name,probability,days]of[['Qualified','50','0'],['Proposal','40','16'],['Won','100','0']]){
  await page.getByLabel(name+' probability source',{exact:true}).selectOption('override');await page.getByLabel(name+' probability percent',{exact:true}).fill(probability);await page.getByLabel(name+' slippage days',{exact:true}).fill(days)
 }
 await page.getByLabel('Product * revenue line',{exact:true}).selectOption(f.revenue.id);await page.getByLabel('Product * department',{exact:true}).selectOption(f.department.id)
 await page.getByLabel('Owner owner-1 commission position',{exact:true}).selectOption(f.position.originId)
 await page.getByLabel('Quarterly pipeline bookings target',{exact:true}).fill('1000')
 const preview=await action('/pipeline/preview',()=>page.getByRole('button',{name:'Preview weighted pipeline',exact:true}).click())
 assert.deepEqual(preview.bookings.map(b=>b.amountCents),[50000,96000,100000]);await capture('pipeline-preview')
 await action('/pipeline/stage',()=>page.getByRole('button',{name:'Stage source changes',exact:true}).click())
 await page.getByLabel('Finance source-review reason',{exact:true}).fill('Reviewed weighted deals, finance probabilities and CRM owner commission map')
 await action('/pipeline/accept',()=>page.getByRole('button',{name:'Accept reviewed pipeline',exact:true}).click())
 await page.getByRole('table',{name:'Accepted weighted pipeline',exact:true}).getByRole('row',{name:/Acme qualified/}).waitFor()
 await capture('pipeline-accepted')
 await page.getByLabel('CRM provider',{exact:true}).selectOption('salesforce');await page.getByLabel('Salesforce instance',{exact:true}).waitFor()
 for(const[label,value]of[['CRM client ID',salesforceGrant.clientId],['CRM client secret',salesforceGrant.clientSecret],['CRM OAuth refresh token',salesforceGrant.refreshToken],['Salesforce instance',salesforceGrant.instance]])await page.getByLabel(label,{exact:true}).fill(value)
 await page.getByLabel('I approve read-only CRM access',{exact:true}).check();await page.getByLabel('This provider grant has only read permission',{exact:true}).check()
 await action('/connections/pipeline/salesforce/connect',()=>page.getByRole('button',{name:'Connect Salesforce read-only',exact:true}).click())
 await action('/pipeline/observe',()=>page.getByRole('button',{name:'Read Salesforce deals',exact:true}).click())
 await page.getByLabel('Custom commit probability source',{exact:true}).selectOption('override');await page.getByLabel('Custom commit probability percent',{exact:true}).fill('40')
 for(const product of['setup','subscription']){
  await page.getByLabel(`Product ${product} revenue line`,{exact:true}).selectOption(product==='setup'?f.revenue.id:f.subscription.id)
  await page.getByLabel(`Product ${product} department`,{exact:true}).selectOption(f.department.id)
  await page.getByLabel(`Product ${product} term source`,{exact:true}).selectOption('crm')
  await page.getByLabel(`Product ${product} recognition rule`,{exact:true}).selectOption(product==='setup'?'one-time':'ratable')
 }
 await page.getByLabel('Owner sf-owner commission position',{exact:true}).selectOption(f.position.originId)
 const fiscal=await page.locator('input[name^="period-"]').all()
 for(const[i,input]of fiscal.entries())await input.fill(`${2026+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`)
 const sf=await action('/pipeline/preview',()=>page.getByRole('button',{name:'Preview weighted pipeline',exact:true}).click())
 assert.deepEqual(sf.bookings.map(b=>[b.product,b.month,b.amountCents]),[['setup','2026-06',4000],['subscription','2026-06',48000]])
 await capture('pipeline-salesforce-review')
 await action('/pipeline/stage',()=>page.getByRole('button',{name:'Stage source changes',exact:true}).click())
 await page.getByLabel('Finance source-review reason',{exact:true}).fill('Reviewed Salesforce stage override, product terms and custom fiscal periods')
 await action('/pipeline/accept',()=>page.getByRole('button',{name:'Accept reviewed pipeline',exact:true}).click());await capture('pipeline-salesforce-accepted')
 const approved=(await h.get('/api/easel/state')).scenarios[0],approval=await h.command('approve-budget',{scenario:approved.id,revision:approved.revision})
 const dashboard=await h.command('dashboard-save',{name:'Pipeline coverage',scenario:approval.forecast.id,audience:'leadership',widgets:[{metric:'pipelineCoverage',display:'table'}]})
 await page.goto(runtime.origin+'/app?tab=dashboards');await page.getByLabel('Dashboard',{exact:true}).selectOption(dashboard.id)
 await page.getByRole('heading',{name:'Pipeline coverage',exact:true}).first().waitFor();await capture('pipeline-dashboard')
 f.scenario=approval.forecast.id
 await h.command('member',{email:'sales@example.test',name:'Sales owner',role:'contributor',departments:[f.department.id]})
 await send('/api/easel/invite',{email:'sales@example.test'})
 const invite=messages.find(m=>m.to.includes('sales@example.test')),token=new URL(invite.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 const sales=await browser.newContext({ignoreHTTPSErrors:true})
 try{const signed=await sales.request.post(runtime.origin+'/auth/confirm',{headers:{origin:runtime.origin},data:{token},maxRedirects:0});assert.equal(signed.status(),303)}finally{await sales.close()}
 await page.goto(runtime.origin+'/app?tab=cycle');await page.getByLabel('Metric',{exact:true}).selectOption('pipeline-coverage')
 await page.getByLabel('Rule name',{exact:true}).fill('Sales coverage review');await page.getByLabel('Department',{exact:true}).last().selectOption(f.department.id)
 await page.getByLabel('Pipeline coverage threshold percent',{exact:true}).fill('300');await page.getByLabel('Task owner',{exact:true}).selectOption('sales@example.test');await page.getByLabel('Due days after trigger',{exact:true}).fill('3')
 await action('/command/metric-rule-save',()=>page.getByRole('button',{name:'Add metric rule',exact:true}).click());await capture('pipeline-coverage-tasks')
 await h.command('cash-constraints',{floor:'0',runwayMinimum:'0'})
 await page.goto(runtime.origin+'/app?tab=review');await page.getByLabel('Lever kind',{exact:true}).selectOption('pipeline-price')
 const native=await h.get(`/api/easel/scenario/${f.scenario}`),deal=native.inputs.revenue.find(r=>r.pipeline.deal==='deal-a')
 await page.getByLabel('Input',{exact:true}).selectOption(deal.originId);await page.getByLabel('Largest change',{exact:true}).fill('50')
 await action('/command/lever-save',()=>page.getByRole('button',{name:'Mark adjustable',exact:true}).click());await capture('pipeline-price-lever')
 // The same public doors create retained stage outcomes and six kept forecasts
 // so the changed learning screen shows a real basis-point backtest.
 const accept=async()=>{const revision=(await h.get(`/api/easel/scenario/${f.scenario}`)).scenario.revision,source=await send('/api/easel/pipeline/sources',{provider:'hubspot',scenario:f.scenario,revision}),body=pipelineInput(f,source,revision),p=await send('/api/easel/pipeline/preview',body);await send('/api/easel/pipeline/stage',body);await send('/api/easel/pipeline/accept',{...body,digest:p.digest,reason:'Reviewed CRM outcome evidence'})}
 edge.moved=true;edge.learning=true;await accept()
 const accounts=new Map((await h.get('/api/easel/state')).lines.map((l,i)=>[l.id,String(4200+i)]))
 for(const[line,account]of accounts)await h.command('account-map',{account,target:line})
 await h.command('department-map',{source:'Sales',department:f.department.id})
 const close=async month=>{const v=await h.get(`/api/easel/scenario/${f.scenario}`),types=new Map(v.lines.map(l=>[l.id,l.type])),date=new Date(Date.UTC(2026,Number(month.slice(5)),0)).toISOString().slice(0,10),csv='Date,Account,Department,Amount\n'+v.calculation.cells.filter(c=>c.month===month&&c.amount).map(c=>`${date},${accounts.get(c.line)},Sales,${((types.get(c.line)==='revenue'?-c.amount:c.amount)/100).toFixed(2)}`).join('\n')+'\n',body={filename:`synthetic-browser-${month}.csv`,csv,dateFormat:'YYYY-MM-DD',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'}},preview=await h.kit('actuals','preview',body);await h.kit('actuals','commit',{...body,fingerprint:preview.fingerprint});await h.command('close-month',{scenario:f.scenario,month})}
 await close('2026-01');edge.outcomes=true;await accept()
 for(const month of['2026-02','2026-03','2026-04','2026-05','2026-06'])await close(month)
 await page.goto(runtime.origin+'/app?tab=review');await page.getByRole('heading',{name:'Stage probability qualified: +5000 basis points',exact:true}).waitFor()
 const learning=page.getByRole('region',{name:'Forecast learning',exact:true})
 await action('/command/learning-propose',()=>learning.getByRole('button',{name:'Create proposal',exact:true}).click());await capture('pipeline-stage-learning')
 edge.restated=true
 await page.goto(runtime.origin+'/app?tab=pipeline');await page.getByLabel('Pipeline scenario',{exact:true}).selectOption(f.scenario)
 await action('/pipeline/observe',()=>page.getByRole('button',{name:'Read HubSpot deals',exact:true}).click())
 const correction=await action('/pipeline/preview',()=>page.getByRole('button',{name:'Preview weighted pipeline',exact:true}).click())
 assert.ok(correction.closedChangeOrigins.some(id=>id.includes('deal-b')))
 await action('/pipeline/stage',()=>page.getByRole('button',{name:'Stage source changes',exact:true}).click())
 await page.getByLabel('Finance source-review reason',{exact:true}).fill('Reviewed a closed CRM correction; accepted ledger amounts and frozen versions stay fixed')
 await page.getByLabel('I reviewed the closed-period changes and approve their future planning effects',{exact:true}).check()
 await capture('pipeline-closed-correction')
 await action('/pipeline/accept',()=>page.getByRole('button',{name:'Accept reviewed pipeline',exact:true}).click())
 await page.goto(runtime.origin+'/app?tab=pipeline');await action('/connections/pipeline/hubspot/disconnect',()=>page.getByRole('button',{name:'Disconnect HubSpot',exact:true}).click())
 await page.getByText('HubSpot disconnected',{exact:true}).waitFor();await capture('pipeline-disconnected')
 console.log('REV-001 native connection, mapped assumptions, weighted review, accepted plan, dashboard, coverage tasks, bounded price lever, learned stage proposal and truthful disconnect passed; changed screens captured at 1440 and 390')
}finally{await context?.close();await browser.close();await runtime?.close()}
