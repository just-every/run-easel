// FIN-006: native API tax configuration, then actual Plan and Overview doors.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium }=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const root=await fresh(),evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-taxes')
await mkdir(evidence,{recursive:true})
let browser,server
const amount=n=>`${n<0?'-':''}$${(Math.abs(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
try {
 const port=await freePort()
 await command(root,['setup','--owner-email','owner@example.test','--port',String(port)])
 server=await start(root,port)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const setup=await session(browser,root,server.origin,'owner',1440),call=(path,body)=>api(setup.context,server.origin,path,body)
 await call('command/workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('command/department',{name:'Engineering'}),line=await call('command/line',{name:'Payroll',type:'operating-expense',payroll:true}),tax=await call('command/line',{name:'Income tax estimate',type:'operating-expense'}),revenue=await call('command/line',{name:'Subscription revenue',type:'revenue'})
 const scenario=(await call('state')).scenarios[0].id
 await call('command/scenario-cash',{scenario,basis:'estimate',opening:'500000',collectionLag:0,paymentLag:0})
 await call('command/revenue',{scenario,line:revenue.id,department:department.id,name:'Annual subscription',kind:'contract',start:'2026-01',startDate:'2026-01-01',termMonths:'12',contractValue:'120000',billingCadence:'annual',dsoDays:'0'})
 await call('command/tax-policy',{scenario,line:tax.id,department:department.id,sutaPercent:'2.7',sutaBase:'9000',stateIncomePercent:'5',salesTaxPercent:'10'})
 await call('command/member',{email:'board@dev.localhost',name:'Board member',role:'viewer'})
 await setup.context.close()
 for(const width of[1440,390]) {
  const owner=await session(browser,root,server.origin,'owner',width),page=owner.page
  try {
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Plan',exact:true}).click()
   const positions=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Positions',exact:true})})
   await positions.getByLabel('Position title',{exact:true}).fill(`Engineer ${width}`)
   await positions.getByLabel('Person',{exact:true}).fill(`Morgan Lee ${width}`)
   await positions.getByLabel('Department',{exact:true}).selectOption(department.id)
   await positions.getByLabel('Salary line',{exact:true}).selectOption(line.id)
   await positions.getByLabel('Start month',{exact:true}).fill('2026-01')
   await positions.getByLabel('Annual salary',{exact:true}).fill('180000')
   await positions.getByLabel('Employment type',{exact:true}).selectOption('1099')
   await positions.getByLabel('On-costs %',{exact:true}).fill('0')
   await positions.getByRole('button',{name:'Add position',exact:true}).click()
   const row=positions.getByRole('row').filter({hasText:`Engineer ${width}`})
   await row.waitFor()
   let view=await api(owner.context,server.origin,`scenario/${scenario}`),p=view.inputs.position.find(p=>p.title===`Engineer ${width}`)
   assert.ok(view.calculation.taxes.payrollRows.filter(r=>r.originId===p.originId).every(r=>r.totalCents===0))
   await row.getByRole('button',{name:'Edit',exact:true}).click()
   assert.equal(await positions.getByLabel('Employment type',{exact:true}).inputValue(),'1099')
   await positions.getByLabel('Employment type',{exact:true}).selectOption('W-2')
   await positions.getByLabel('Prior year-to-date taxable wages',{exact:true}).fill('0')
   await positions.getByRole('button',{name:'Save position',exact:true}).click()
   await page.waitForResponse(r=>r.url().endsWith(`/api/easel/scenario/${scenario}`)&&r.ok())
   view=await api(owner.context,server.origin,`scenario/${scenario}`)
   assert.equal(view.inputs.position.find(q=>q.id===p.id).employmentType,'W-2')
   assert.ok(view.calculation.taxes.payrollRows.some(r=>r.originId===p.originId&&r.totalCents>0))
   await noOverflow(page,`FIN-006 Plan ${width}`)
   await positions.screenshot({path:join(evidence,`positions-${width}.png`)})
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
   await page.getByText(/US tax planning estimates/).waitFor()
   for(const[heading,key,label,field]of[['Balance sheet','balanceSheet','Sales tax payable','salesTaxPayable'],['Indirect cash flow','cashFlow','Sales tax payable change','salesTaxPayableChange']]) {
    const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:heading,exact:true})})
    const values=await section.getByRole('row').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).getByRole('cell').allInnerTexts()
    assert.deepEqual(values,view.calculation[key].map(r=>amount(r[field])))
    const check=section.getByRole('button',{name:new RegExp(`^${heading} reconciliation for`)}).first()
    await check.click()
    await section.getByRole('region',{name:`${heading} reconciliation details`,exact:true}).waitFor()
    await noOverflow(page,`FIN-006 ${heading} ${width}`)
    await section.screenshot({path:join(evidence,`${key}-owner-${width}.png`)})
   }
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download Excel',exact:true}).click()])
   assert.equal(await download.failure(),null);proveFormulas(await readWorkbook(await readFile(await download.path())))
   const viewer=await session(browser,root,server.origin,'board',width)
   try {
    const safe=await api(viewer.context,server.origin,`scenario/${scenario}`)
    assert.deepEqual(safe.calculation.taxes.payrollRows,[])
    assert.ok(!JSON.stringify(safe).includes('Morgan Lee'))
    await viewer.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
    await viewer.page.getByText(/US tax planning estimates/).waitFor()
    const statement=viewer.page.locator('section.card').filter({has:viewer.page.getByRole('heading',{name:'Balance sheet',exact:true})})
    await statement.getByRole('rowheader',{name:'Sales tax payable',exact:true}).waitFor()
    await noOverflow(viewer.page,`FIN-006 viewer ${width}`)
    await statement.screenshot({path:join(evidence,`balanceSheet-viewer-${width}.png`)})
   } finally {await viewer.context.close()}
   await api(owner.context,server.origin,'command/input-delete',{kind:'position',id:p.id})
   console.log(`FIN-006 ${width}: native policy, 1099 to W-2 edit and persisted YTD, salary tax result, statement equality/reconciliation, filtered viewer and formula Excel passed`)
  } finally {await owner.context.close()}
 }
} finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true})}
