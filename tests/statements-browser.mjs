// FIN-001 real Overview reads, reconciliation disclosures and Excel downloads.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing=process.argv.includes('--existing'),root=existing?process.cwd():await fresh()
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/statements')
await mkdir(evidence,{recursive:true})
let server,browser
try {
 const port=await freePort()
 await command(root,['setup','--owner-email','owner@example.test','--port',String(port)])
 server=await start(root,port)
 browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
 const owner=await session(browser,root,server.origin,'owner',1440)
 const cmd=(op,body)=>api(owner.context,server.origin,`command/${op}`,body)
 await cmd('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const dept=await cmd('department',{name:'Engineering'})
 const revenue=await cmd('line',{name:'Services revenue',type:'revenue'})
 const costs=await cmd('line',{name:'Operating costs',type:'operating-expense'})
 const depreciation=await cmd('line',{name:'Depreciation',type:'operating-expense',nonCash:true})
 const budget=(await api(owner.context,server.origin,'state')).scenarios[0]
 await cmd('scenario-cash',{scenario:budget.id,basis:'estimate',opening:'250000',receivables:'15000',payables:'9000',collectionLag:1,paymentLag:1})
 await cmd('revenue',{scenario:budget.id,name:'Retained contracts',kind:'volume',line:revenue.id,department:dept.id,start:'2026-01',startVolume:'100',rate:'1000',collectionLag:1})
 await cmd('expense',{scenario:budget.id,name:'Delivery operations',kind:'recurring',line:costs.id,department:dept.id,start:'2026-01',amount:'60000'})
 const category=await cmd('asset-category',{scenario:budget.id,name:'Equipment',usefulLifeMonths:60})
 await cmd('asset',{scenario:budget.id,name:'Production equipment',category:category.originId,line:depreciation.id,department:dept.id,kind:'purchase',start:'2026-01',cost:'120000',paymentMonth:'2026-03'})
 let view=await api(owner.context,server.origin,`scenario/${budget.id}`)
 const approved=await cmd('approve-budget',{scenario:budget.id,revision:view.scenario.revision})
 await cmd('forecast-window',{scenario:approved.forecast.id,revision:1,months:24})
 await cmd('member',{email:'board@dev.localhost',name:'Board',role:'viewer'})
 const amount=n=>`${n<0?'-':''}$${(Math.abs(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
 for(const width of [1440,390])for(const as of ['owner','board']) {
  const reader=await session(browser,root,server.origin,as,width),page=reader.page
  try {
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
   view=await api(reader.context,server.origin,`scenario/${approved.forecast.id}`)
   for(const [heading,field,rows] of [['Balance sheet','balanceSheet',[['Cash','cash'],['Total assets','assets'],['Total equity','equity'],['Retained earnings','retainedEarnings']]],['Indirect cash flow','cashFlow',[['Net income','netIncome'],['Net operating cash flow','operating'],['Capital expenditure','capex'],['Closing cash','closing']]]]) {
    const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:heading,exact:true})})
    await section.getByRole('table').waitFor()
    for(const [label,key]of rows) {
     const values=await section.getByRole('row').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).getByRole('cell').allInnerTexts()
     assert.deepEqual(values,view.calculation[field].map(r=>amount(r[key])))
    }
    const check=section.getByRole('button',{name:new RegExp(`^${heading} reconciliation for`)}).first();await check.click()
    assert.ok((await section.getByRole('region',{name:`${heading} reconciliation details`,exact:true}).innerText()).includes(view.calculation[field][0].trace))
    await noOverflow(page,`FIN-001 ${heading} ${as} ${width}`)
    await section.screenshot({path:join(evidence,`${field}-${as}-${width}.png`)})
    await check.click()
    const region=section.getByRole('region',{name:heading==='Balance sheet'?'Balance sheet by month':'Indirect cash flow by month',exact:true});await region.evaluate(el=>{el.scrollLeft=el.scrollWidth})
    await section.screenshot({path:join(evidence,`${field}-final-${as}-${width}.png`)})
   }
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download Excel',exact:true}).click()])
   assert.equal(await download.failure(),null)
   const book=await readWorkbook(await readFile(await download.path()));proveFormulas(book)
   assert.equal(book.getWorksheet('Balance sheet').rowCount,26)
   assert.equal(book.getWorksheet('Indirect cash flow').rowCount,26)
   console.log(`FIN-001 ${as} ${width}: 24 months, API equality, trace disclosure, Excel and overflow passed`)
  } finally {await reader.context.close()}
 }
 for(const [account,target]of [['400',revenue.id],['500',costs.id],['700',depreciation.id]])await cmd('account-map',{account,target})
 await cmd('department-map',{source:'Engineering',department:dept.id})
 const body={filename:'january.csv',csv:'Date,Account,Department,Amount\n2026-01-31,400,Engineering,-100000\n2026-01-31,500,Engineering,60000\n2026-01-31,700,Engineering,2500\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 const preview=await api(owner.context,server.origin,'import/actuals/preview',body)
 await api(owner.context,server.origin,'import/actuals/commit',{...body,fingerprint:preview.fingerprint})
 await cmd('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 for(const width of [1440,390]) {
  const reader=await session(browser,root,server.origin,'owner',width),page=reader.page
  try {
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
   const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Balance sheet',exact:true})})
   const check=section.getByLabel('Balance sheet reconciliation for Jan 2026: Imbalance',{exact:true})
   await check.click()
   view=await api(reader.context,server.origin,`scenario/${approved.forecast.id}`)
   assert.equal(view.calculation.balanceSheet[0].balanceDifference,50000)
   const details=await section.getByRole('region',{name:'Balance sheet reconciliation details',exact:true}).innerText()
   for(const cause of view.calculation.balanceSheet[0].causes)assert.ok(details.includes(cause))
   await noOverflow(page,`FIN-001 imbalance ${width}`)
   await section.screenshot({path:join(evidence,`imbalance-${width}.png`)})
   console.log(`FIN-001 ${width}: inconsistent closed depreciation shows exact difference and source cause`)
  } finally {await reader.context.close()}
 }
 await owner.context.close()
} finally {
 await browser?.close();await server?.close()
 if(!existing)await rm(root,{recursive:true,force:true})
}
