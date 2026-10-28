// Built application and native authentication; only provider and mail HTTP are replaced.
import assert from 'node:assert/strict'
import { mkdir,mkdtemp,cp,symlink,writeFile,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { freePort } from './browser-runtime.mjs'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { settle,noOverflow,track } from './browser-journey.mjs'
import { intacctProvider,intacctGrant,intacctFixture,acceptIntacct } from './intacct-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
assert.ok(process.argv.includes('--existing-build'),'Use the current working build')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/intacct-browser');await mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox']})
const provider=intacctProvider(),messages=[]
let runtime,context,reader,portableRoot,runtimeOptions
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
async function capture(page,scope,name){for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await settle(page);if(width===1440)await noOverflow(page,`${name} ${width}`);await scope.screenshot({path:join(evidence,`${name}-${width}.png`)})}await page.setViewportSize({width:1440,height:1000})}
try{
 portableRoot=await mkdtemp(join(tmpdir(),'easel-intacct-cli-'))
 const checkout=process.cwd(),excluded=new Set(['.git','node_modules','.wrangler','.rer','.seed','.tanstack','.output','test-results','.cache','.dev.vars','exports','dist'])
 await cp(checkout,portableRoot,{recursive:true,filter:source=>{const part=source.slice(checkout.length+1).split('/')[0];return !excluded.has(part)&&!part.startsWith('.env')&&!part.startsWith('.dev.vars')}})
 await symlink(join(checkout,'node_modules'),join(portableRoot,'node_modules'),'dir')
 const cli=async(args)=>{const child=spawn('pnpm',args,{cwd:portableRoot,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const status=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});if(status!==0)throw Error(`CLI ${args.join(' ')} exited ${status}: ${output}`);return output}
 await cli(['exec','wrangler','d1','migrations','apply','easel','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc'])
 const port=await freePort()
 runtimeOptions={https:true,port,persistencePath:join(portableRoot,'.wrangler/state/v3'),databaseId:'local-easel-only',skipMigrations:true,now:()=> '2026-05-15T12:00:00.000Z',bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-mail-boundary'},outbound:async request=>{if(new URL(request.url).hostname==='api.resend.com'){messages.push(await request.json());return Response.json({id:crypto.randomUUID()})}return provider.outbound(request)}}
 runtime=await builtBrowserRuntime(runtimeOptions)
 await writeFile(join(portableRoot,'.dev.vars'),`OWNER_EMAIL=owner@example.test\nSESSION_SECRET=synthetic-easel-session-secret-01234567890123456789\nSETUP_TOKEN=${runtime.bootstrap}\nAUTH_ORIGIN=${runtime.origin}\nAUTH_LOCAL=false\nMAIL_PROVIDER=development\nMAIL_FROM=Easel <easel@example.test>\n`)
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
 const location=f.dimensions.find(d=>d.source==='L2'),oldRule=(await h.get('/api/easel/state')).dimensionMaps.find(r=>r.sourceKind==='location'&&r.source==='L2')
 await h.command('dimension-map-delete',{id:oldRule.id});await page.reload()
 const dimensions=card(page,'Dimensions and account hierarchy');await dimensions.getByLabel('Manage dimension').selectOption(location.dimension.id)
 await dimensions.getByLabel('Source dimension kind',{exact:true}).fill('location');await dimensions.getByLabel('Source member value',{exact:true}).fill('L2');await dimensions.getByLabel('Mapped member',{exact:true}).selectOption(location.member.id)
 await dimensions.getByRole('button',{name:'Save source dimension rule',exact:true}).click();await settle(page)
 assert.ok((await h.get('/api/easel/state')).dimensionMaps.some(r=>r.sourceKind==='location'&&r.source==='L2'))
 await capture(page,dimensions,'intacct-native-mapping')

 await page.goto(runtime.origin+'/app?tab=actuals');const actuals=card(page,'Sage Intacct actuals');await actuals.getByLabel('Intacct review entity').waitFor();await actuals.getByLabel('Intacct review entity').selectOption('CA')
 await actuals.getByText('Backfill Intacct history',{exact:true}).click();assert.equal(await actuals.getByLabel('Intacct history months',{exact:true}).inputValue(),'24')
 await actuals.getByLabel('Intacct history months',{exact:true}).fill('11');await actuals.getByLabel('Intacct last closed month',{exact:true}).fill('2025-12');await actuals.getByRole('button',{name:'Review Intacct history',exact:true}).click();await actuals.getByText('Choose 12–36 completed months',{exact:true}).waitFor()
 await actuals.getByLabel('Intacct history months',{exact:true}).fill('24');await actuals.getByRole('button',{name:'Review Intacct history',exact:true}).click();await actuals.getByRole('table',{name:'Intacct source trial balance'}).waitFor()
 assert.match(await actuals.innerText(),/Canadian Services.*2024-01.*CAD/)
 await capture(page,actuals,'intacct-history-review')
 await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await actuals.getByRole('button',{name:'Review next Intacct history month',exact:true}).waitFor()
 for(const sourceEntity of ['CA','EU'])for(let i=sourceEntity==='CA'?1:0;i<26;i++){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;await acceptIntacct(h,{sourceEntity,month,includeOpening:i===0})}
 provider.corrections['2025-12']=100
 await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-01');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click()
 await actuals.getByText(/Review prior Intacct periods 2024-01 through 2025-12/).waitFor()
 assert.equal(await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).count(),0)
 const differences=actuals.getByRole('table',{name:'Easel ledger reconciliation differences'})
 assert.match(await differences.innerText(),/1000/);assert.match(await differences.innerText(),/2,801/)
 await capture(page,actuals,'intacct-prior-period-difference')
 await actuals.getByLabel('Intacct month',{exact:true}).fill('2025-12');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await differences.waitFor({state:'hidden'})
 await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-01');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await differences.waitFor({state:'hidden'})
 const reconciled=(await h.get('/api/easel/connections/intacct')).months.find(m=>m.entity===f.ca.id&&m.month==='2026-01')
 assert.equal(reconciled.trialBalance.ledger.balanced,true)
 provider.corrections={};await acceptIntacct(h,{sourceEntity:'CA',month:'2025-12',includeOpening:false});await acceptIntacct(h,{sourceEntity:'CA',month:'2026-01',includeOpening:false})
 provider.change=true
 await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-02');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByText(/1 changed transactions · 2 journal deltas/).waitFor()
 await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await settle(page)
 provider.extraAmount=2500
 await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByText(/1 changed transactions · 2 journal deltas/).waitFor()
 await actuals.getByRole('button',{name:'Accept reviewed Intacct month',exact:true}).click();await settle(page)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.ca.id)).months.find(m=>m.period==='2026-02').revenue,15000)
 await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByText(/0 changed transactions · 0 journal deltas/).waitFor()
 await capture(page,actuals,'intacct-successive-correction')
 provider.extraAmount=0;await acceptIntacct(h,{sourceEntity:'CA',month:'2026-02',includeOpening:false})
 await actuals.getByLabel('Intacct review entity').selectOption('EU');await actuals.getByLabel('Intacct month',{exact:true}).fill('2026-02');await actuals.getByRole('button',{name:'Preview Intacct month',exact:true}).click();await actuals.getByRole('table',{name:'Intacct source trial balance'}).waitFor();assert.match(await actuals.innerText(),/European Services.*2026-02.*EUR/)
 await capture(page,actuals,'intacct-entity-trial')
 const storedSecret=await runtime.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='intacct'").first()
 await runtime.close();runtime=undefined
 await cli(['exec','rer','export','--output','exports/intacct-custody.rer'])
 const archive=await readFile(join(portableRoot,'exports/intacct-custody.rer'),'utf8'),manifest=JSON.parse(archive.split('\n')[0])
 assert.ok(!manifest.tables.some(t=>t.name==='e_connection_secrets'))
 for(const value of [intacctGrant.senderPassword,intacctGrant.userPassword,storedSecret.sealed])assert.ok(!archive.includes(value),'Actual rer export excludes provider plaintext and ciphertext')
 await cp(join(portableRoot,'exports/intacct-custody.rer'),join(evidence,'intacct-custody.rer'))
 runtime=await builtBrowserRuntime(runtimeOptions)
 assert.equal((await h.get('/api/easel/connections/intacct')).connected,true,'Restart opens the same installation and sealed credential')

 const root=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.first.id),approved=await h.command('approve-budget',{scenario:root.id,revision:root.revision});await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 await page.goto(runtime.origin+'/app?tab=review&reviewMonth=2026-01');await page.getByRole('heading',{name:/Variances,/}).waitFor()
 const source=page.locator('details.card-row').filter({has:page.getByText('Management revenue',{exact:true})}).first();await source.locator('summary').click();await source.getByRole('table',{name:'Accepted rows'}).waitFor()
 const projection=await h.get('/api/easel/variance/2026-01?scenario='+approved.forecast.id),rows=projection.rows.find(r=>r.line===f.revenue.id&&r.department===f.department.id).citations
 assert.equal(await source.getByRole('table',{name:'Accepted rows'}).locator('tbody tr').count(),rows.length)
 const url=rows[0].providerUrl;await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<h1>Recorded Intacct entry</h1>'}))
 const popup=page.waitForEvent('popup');await source.getByRole('link').first().click();const entry=await popup;track(entry);await entry.getByRole('heading',{name:'Recorded Intacct entry'}).waitFor();assert.equal(entry.url(),url);await capture(entry,entry.locator('body'),'intacct-entry');await entry.close()
 await capture(page,source,'intacct-variance-source')
 const euRoot=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.second.id),euApproved=await h.command('approve-budget',{scenario:euRoot.id,revision:euRoot.revision})
 await h.command('close-month',{scenario:euApproved.forecast.id,month:'2026-01'})
 for(const [entity,average,end]of [[f.ca,'0.8','0.9'],[f.eu,'1','1.125']]){await h.command('entity-rate',{entity:entity.id,month:'2025-12',monthEnd:average});await h.command('entity-rate',{entity:entity.id,month:'2026-01',average,monthEnd:end,budget:average})}
 const ledger=(await h.get('/api/easel/entities')).ledgerSources
 const pick=(entity,target,period,opening=false)=>ledger[entity.id].filter(r=>r.target===target&&r.period===period&&r.opening===opening).map(r=>r.id)
 await page.goto(runtime.origin+'/app?tab=settings');const entities=card(page,'Entities');await entities.getByText('Eliminate accepted ledger sources',{exact:true}).click()
 await entities.getByLabel('Accepted-ledger elimination name',{exact:true}).fill('Recorded provider fee and balance')
 await entities.getByLabel('Accepted-ledger elimination month',{exact:true}).fill('2026-01')
 for(const [label,ids]of [['Accepted revenue charges',pick(f.ca,f.revenue.id,'2026-01')],['Accepted expense charges',pick(f.eu,f.expense.id,'2026-01')],['Accepted receivable balances',pick(f.ca,'bs:receivables','2023-12',true)],['Accepted payable balances',pick(f.eu,'bs:payables','2023-12',true)],['Accepted cash receipts',pick(f.ca,'cash','2026-01')],['Accepted cash payments',pick(f.eu,'cash','2026-01')]])await entities.getByLabel(label,{exact:true}).selectOption(ids)
 for(const [label,value]of [['Revenue','100'],['Expense','80'],['Receivable','100'],['Payable','80'],['Received','100'],['Paid','80']])await entities.getByLabel(label+' local amount to eliminate',{exact:true}).fill(value)
 await entities.getByLabel('I reviewed the selected accepted ledger sources',{exact:true}).check();await entities.getByRole('button',{name:'Save accepted-ledger elimination',exact:true}).click();await settle(page)
 const consolidated=(await h.get('/api/easel/consolidation/'+f.first.id)).consolidated[0];assert.deepEqual(consolidated.unavailable,[]);assert.equal(consolidated.before.profit.revenue-consolidated.profit.revenue,8000)
 await capture(page,card(page,'Management consolidation · USD'),'intacct-consolidation')

 await h.command('member',{email:'board-intacct@example.test',name:'Board reader',role:'viewer',departments:[]});await send('/api/easel/invite',{email:'board-intacct@example.test'})
 const message=messages.find(m=>m.to.includes('board-intacct@example.test')),token=new URL(message.text.match(/https?:\/\/\S+\/auth\/confirm\?token=\S+/)[0]).searchParams.get('token')
 reader=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});assert.equal((await reader.request.post(runtime.origin+'/auth/confirm',{headers:{origin:runtime.origin},data:{token},maxRedirects:0})).status(),303)
 const board=await reader.newPage();track(board);await board.goto(runtime.origin+'/app?tab=review&reviewMonth=2026-01&reviewScenario='+approved.forecast.id);await board.getByRole('heading',{name:/Variances,/}).waitFor()
 if(await board.getByLabel('Review entity forecast',{exact:true}).count()&&await board.getByLabel('Review entity forecast',{exact:true}).inputValue()!==approved.forecast.id)await board.getByLabel('Review entity forecast',{exact:true}).selectOption(approved.forecast.id)
 const boardVariance=await reader.request.get(runtime.origin+'/api/easel/variance/2026-01?scenario='+approved.forecast.id);assert.equal(boardVariance.status(),200);assert.equal((await boardVariance.json()).rows.find(r=>r.line===f.revenue.id).actual,10000)
 const boardSource=board.locator('details.card-row').filter({has:board.getByText('Management revenue',{exact:true})}).first();await boardSource.locator('summary').click();assert.equal(await boardSource.getByRole('table',{name:'Accepted rows'}).count(),0);assert.equal(await boardSource.getByRole('link').count(),0)
 await capture(board,boardSource,'intacct-viewer')
 await h.command('member',{email:'board-intacct@example.test',name:'Canadian reader',role:'viewer',dimensionMembers:{[f.ca.dimension]:[f.ca.member]},departments:[f.department.id]})
 await board.reload();await board.getByRole('heading',{name:/Variances,/}).waitFor();const scopedSource=board.locator('details.card-row').filter({has:board.getByText('Management revenue',{exact:true})}).first();await scopedSource.locator('summary').click();assert.equal(await scopedSource.getByRole('table',{name:'Accepted rows'}).count(),0);assert.equal(await scopedSource.getByRole('link').count(),0);await capture(board,card(board,'Monthly review'),'intacct-scoped-reader')
 await page.goto(runtime.origin+'/app?tab=settings');await connection.getByRole('button',{name:'Disconnect Intacct',exact:true}).waitFor();await connection.getByRole('button',{name:'Disconnect Intacct',exact:true}).click();await connection.getByText(/Provider revocation: unsupported/).waitFor()
 assert.equal((await h.get('/api/easel/connections/intacct')).connected,false);await capture(page,connection,'intacct-disconnected')
 console.log('Intacct native browser journey passed; 1440 assertions and 1440/390 screen evidence at '+evidence)
}finally{await reader?.close();await context?.close();await runtime?.close();await browser.close();if(portableRoot)await rm(portableRoot,{recursive:true,force:true})}
