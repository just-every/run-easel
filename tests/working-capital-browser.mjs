// FIN-002: native entry of collections, vendor terms, prepaids and earned/pay schedules.
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/working-capital');await mkdir(evidence,{recursive:true})
const root=await mkdtemp(join(tmpdir(),'easel-working-capital-'))
const excluded=new Set(['.git','node_modules','.rer','.seed','.wrangler','.cache','.tanstack','dist','.output','exports','test-results'])
for(const name of await readdir(process.cwd())){if(excluded.has(name)||name.startsWith('.dev.vars')||name.startsWith('.env')||name.endsWith('.tsbuildinfo'))continue;await cp(join(process.cwd(),name),join(root,name),{recursive:true})}
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
let server,finance,board
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
const settle=page=>page.waitForLoadState('networkidle')
const tab=async(page,name)=>{await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name,exact:true}).click();await settle(page)}
const shoot=async(page,target,name)=>{await target.scrollIntoViewIfNeeded();await settle(page);await noOverflow(page,`FIN-002 ${name}`);await page.screenshot({path:join(evidence,`${name}.png`)})}
const fill=async(scope,values)=>{for(const [label,value]of Object.entries(values))await scope.getByLabel(label,{exact:true}).fill(String(value))}
const pick=(scope,label,value)=>scope.getByLabel(label,{exact:true}).selectOption(value)
const money=n=>`${n<0?'-':''}$${(Math.abs(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const balanced=v=>{for(const [i,b]of v.calculation.balanceSheet.entries()){assert.equal(b.assets,b.liabilities+b.equity);assert.equal(b.balanceDifference,0);assert.equal(v.calculation.cashFlow[i].closing,v.calculation.cash[i].closing);assert.equal(v.calculation.cashFlow[i].difference,0)}}
try {
 const port=await freePort();server=await start(root,port)
 finance=await session(browser,root,server.origin,'owner',1440)
 const {page,context}=finance,call=(path,body)=>api(context,server.origin,path,body),cmd=(op,body)=>call(`command/${op}`,body)
 await fill(page,{'Company name':'Ridgeline Services','First plan month':'2026-01'});await page.getByRole('button',{name:'Create the plan',exact:true}).click();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const dept=await cmd('department',{name:'Operations'})
 const line=async(name,type='operating-expense',extra={})=>cmd('line',{name,type,...extra})
 const sales=await line('Monthly services','revenue'),annual=await line('Annual subscriptions','revenue'),vendor=await line('Supplier'),insurance=await line('Insurance'),payroll=await line('Payroll','operating-expense',{payroll:true}),bonus=await line('Bonuses','operating-expense',{payroll:true})
 const budget=(await call('state')).scenarios[0]
 await cmd('scenario-cash',{scenario:budget.id,basis:'estimate',opening:'100000'})
 await cmd('revenue',{scenario:budget.id,name:'Annual subscription',kind:'contract',line:annual.id,department:dept.id,start:'2026-01',startDate:'2026-01-01',contractValue:'120000',termMonths:12,billingCadence:'annual',dsoDays:0})
 await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor();await tab(page,'Plan')
 const save=async(scope,op,label)=>{const pending=page.waitForResponse(r=>r.url().endsWith(`/command/${op}`)&&r.request().method()==='POST');await scope.getByRole('button',{name:label,exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());await settle(page);return response.json()}
 const revenue=card(page,'Revenue drivers')
 await pick(revenue,'Driver','volume');await fill(revenue,{'Revenue model name':'Monthly client work','Start month':'2026-01','Starting volume':'1','Monthly growth %':'0','Rate per unit':'10000'})
 await pick(revenue,'Revenue line',sales.id);await pick(revenue,'Department',dept.id);await pick(revenue,'Collection timing','dso');await fill(revenue,{'DSO (days)':'45'})
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,revenue,`dso-entry-${width}`)}
 await page.setViewportSize({width:1440,height:1000});const monthly=await save(revenue,'revenue','Add revenue model')
 const expenses=card(page,'Expenses')
 async function expense(name,kind,target,amount,extra){await pick(expenses,'Kind',kind);await fill(expenses,{'Expense name':name,'Amount':amount,'Start month':'2026-01'});await pick(expenses,'Expense line',target);await pick(expenses,'Department',dept.id);if(kind==='recurring'){await pick(expenses,'Vendor payment timing','terms')}await fill(expenses,extra);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,expenses,`${kind}-entry-${width}`)}await page.setViewportSize({width:1440,height:1000});return save(expenses,'expense','Add expense')}
 await expense('Vendor invoice','recurring',vendor.id,'3000',{'Vendor term days':'30'})
 await expense('Private annual insurance','prepaid',insurance.id,'24000',{'Amortization months':'12','Prepayment month':'2026-01'})
 await expense('Quarterly performance bonus','bonus',bonus.id,'9000',{'First bonus pay month':'2026-04'})
 const positions=card(page,'Positions')
 await fill(positions,{'Position title':'Operations lead','Person':'Private payroll holder','Start month':'2026-01','Annual salary':'12000','On-costs %':'0'})
 await pick(positions,'Department',dept.id);await pick(positions,'Salary line',payroll.id);await pick(positions,'Payroll cash timing','date');await fill(positions,{'Payroll pay day':'5'});await pick(positions,'Payroll pay month offset','1')
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,positions,`payroll-entry-${width}`)}await page.setViewportSize({width:1440,height:1000});await save(positions,'position','Add position')
 let view=await call(`scenario/${budget.id}`);balanced(view)
 assert.deepEqual(view.calculation.balanceSheet.slice(0,3).map(b=>[b.receivables,b.payables,b.prepaid,b.accruedLiabilities,b.deferredRevenue]),[[1000000,300000,2200000,400000,11000000],[2000000,600000,2000000,700000,10000000],[2000000,300000,1800000,1000000,9000000]])
 assert.equal(view.calculation.cash[0].closing,19600000)
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await tab(page,'Overview');for(const name of ['Prepaids and accrued liabilities','Balance sheet','Indirect cash flow']){await card(page,name).waitFor();await shoot(page,card(page,name),`${name.toLowerCase().replaceAll(' ','-')}-${width}`)}assert.ok((await card(page,'Prepaids and accrued liabilities').innerText()).includes('$22,000.00'));await card(page,'Prepaids and accrued liabilities').getByText('Visible payment and recognition traces',{exact:true}).click();await shoot(page,card(page,'Prepaids and accrued liabilities'),`source-traces-${width}`);await card(page,'Prepaids and accrued liabilities').getByText('Visible payment and recognition traces',{exact:true}).click()}
 await page.setViewportSize({width:1440,height:1000});await tab(page,'Plan')
 const row=revenue.getByRole('row').filter({has:page.getByRole('cell',{name:'Monthly client work',exact:true})});await row.getByRole('button',{name:'Edit',exact:true}).click();await pick(revenue,'Collection timing','curve');await fill(revenue,{'Collection 1 days':'0','Collection 1 percent':'50','Collection 2 days':'60','Collection 2 percent':'50'})
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,revenue,`curve-entry-${width}`)}await save(revenue,'revenue','Save revenue model')
 const curve=await call(`scenario/${budget.id}`);balanced(curve);assert.equal(curve.calculation.balanceSheet[0].receivables,500000);assert.equal(curve.calculation.cash[0].closing-view.calculation.cash[0].closing,500000)
 const approved=await cmd('approve-budget',{scenario:budget.id,revision:curve.scenario.revision});const frozen=await call(`scenario/${budget.id}`)
 await cmd('reforecast-save',{from:approved.forecast.id,revision:approved.forecast.revision,name:'Working capital baseline'})
 for(const [account,target]of [['400',sales.id],['410',annual.id],['500',vendor.id],['510',insurance.id],['600',payroll.id],['610',bonus.id]])await cmd('account-map',{account,target})
 await cmd('department-map',{source:'Operations',department:dept.id})
 const actuals={filename:'january-recognition.csv',csv:'Date,Account,Department,Amount\n01/31/2026,400,Operations,-10000\n01/31/2026,410,Operations,-10000\n01/31/2026,500,Operations,3000\n01/31/2026,510,Operations,2000\n01/31/2026,600,Operations,1000\n01/31/2026,610,Operations,3000\n'}
 const preview=await call('import/actuals/preview',actuals);await call('import/actuals/commit',{...actuals,fingerprint:preview.fingerprint});await cmd('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const closed=await call(`scenario/${approved.forecast.id}`);balanced(closed);assert.equal(closed.calculation.workingCapital.issues.length,0)
 const pack=await cmd('pack-create',{month:'2026-01'});await cmd('pack-publish',{pack:pack.id});await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor();await tab(page,'Review')
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,card(page,'Review packs'),`published-pack-${width}`)}
 assert.deepEqual((await call(`scenario/${budget.id}`)).calculation,frozen.calculation)
 await cmd('member',{email:'board@dev.localhost',name:'Board reader',role:'viewer'})
 board=await session(browser,root,server.origin,'board',1440)
 const restricted=await api(board.context,server.origin,`scenario/${approved.forecast.id}`);assert.equal(restricted.calculation.workingCapital.rows.length,0);assert.doesNotMatch(JSON.stringify(restricted),/Private payroll holder|Private annual insurance/)
 for(const width of [1440,390]){await board.page.setViewportSize({width,height:1000});await tab(board.page,'Overview');await shoot(board.page,card(board.page,'Prepaids and accrued liabilities'),`board-aggregates-${width}`);assert.equal(await board.page.getByText('Visible payment and recognition traces',{exact:true}).count(),0);const downloading=board.page.waitForEvent('download');await board.page.getByRole('link',{name:'Download Excel',exact:true}).click();const download=await downloading,file=join(evidence,`board-${width}.xlsx`);await download.saveAs(file);const book=await readWorkbook(await readFile(file));proveFormulas(book);assert.doesNotMatch(JSON.stringify(book.worksheets.map(s=>s.getSheetValues())),/Private payroll holder|Private annual insurance/)}
 console.log('FIN-002: native DSO/curve/vendor/prepaid/payroll/bonus entry, exact linked statements, closed recognition, frozen captures, published pack and filtered Excel passed at 1440/390')
} catch(error){await finance?.page.screenshot({path:join(evidence,'failed.png'),fullPage:true}).catch(()=>{});throw error}
finally{await finance?.context.close();await board?.context.close();await browser.close();await server?.close();await rm(root,{recursive:true,force:true})}
