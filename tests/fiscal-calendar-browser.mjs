// MODEL-001: native setup, horizon edits and exact fiscal totals at desktop/phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/fiscal-calendar')
await mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
const tab=(page,name)=>page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name,exact:true}).click()
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
const wait=page=>page.waitForLoadState('networkidle')
const shot=async(page,name)=>{await wait(page);await noOverflow(page,`MODEL-001 ${name}`);await page.screenshot({path:join(evidence,`${name}.png`),fullPage:false})}
try {
 for(const calendar of ['calendar-month','4-4-5','5-4-4']){
  const root=await fresh();let server,finance
  try{
   server=await start(root,await freePort())
   finance=await session(browser,root,server.origin,'owner',1440)
   const {page,context}=finance,call=(path,body)=>api(context,server.origin,path,body),cmd=(op,body)=>call(`command/${op}`,body)
   await page.getByLabel('Company name',{exact:true}).fill(calendar==='calendar-month'?'Ridgeline Advisory':'Tallgrass Retail')
   await page.getByLabel('Fiscal year starts in month',{exact:true}).selectOption('10')
   await page.getByLabel('First plan month',{exact:true}).fill('2026-10')
   await page.getByLabel('Plan horizon (months)',{exact:true}).fill('36')
   await page.getByLabel('Accounting calendar',{exact:true}).selectOption(calendar)
   if(calendar!=='calendar-month')await page.getByLabel('First retail period starts',{exact:true}).fill('2026-10-05')
   for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shot(page,`${calendar}-setup-${width}`)}
   await page.getByRole('button',{name:'Create the plan',exact:true}).click();await page.getByRole('navigation',{name:'Easel'}).waitFor()
   let state=await call('state');assert.equal(state.workspace.horizon,36);assert.equal(state.workspace.calendar,calendar)
   const d=await cmd('department',{name:'Advisory'}),other=await cmd('department',{name:'Stores'}),rev=await cmd('line',{name:'Services',type:'revenue'}),cost=await cmd('line',{name:'Office',type:'operating-expense'})
   const budget=state.scenarios[0]
   await cmd('revenue',{scenario:budget.id,name:'Retainers',kind:'volume',line:rev.id,department:d.id,start:'2026-10',startVolume:'10',rate:'1000.01',collectionLag:0})
   await cmd('expense',{scenario:budget.id,name:'Office rent',kind:'recurring',line:cost.id,department:d.id,start:'2026-10',amount:'1500.03'})
   await cmd('revenue',{scenario:budget.id,name:'Store sales',kind:'volume',line:rev.id,department:other.id,start:'2026-10',startVolume:'2',rate:'200.01',collectionLag:0})
   await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor()
   const v=await call(`scenario/${budget.id}`)
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await tab(page,'Overview')
    const fiscal=card(page,'Fiscal summaries');await fiscal.getByRole('table',{name:'Fiscal totals',exact:true}).waitFor()
    await fiscal.scrollIntoViewIfNeeded()
    assert.equal(await fiscal.getByRole('table',{name:'Fiscal totals',exact:true}).locator('tbody tr').count(),12)
    const money=n=>`$${(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
    assert.ok((await fiscal.innerText()).includes(money(v.fiscal.quarters[0].profit)))
    await shot(page,`${calendar}-quarters-${width}`)
    await fiscal.getByLabel('Roll-up',{exact:true}).selectOption('years')
    assert.equal(await fiscal.getByRole('table',{name:'Fiscal totals',exact:true}).locator('tbody tr').count(),3)
    assert.ok((await fiscal.innerText()).includes(money(v.fiscal.years[0].profit)))
    const chart=page.locator('figure.cc').first()
    const labels=await chart.locator('.cc-axis > span').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right}}).sort((a,b)=>a.left-b.left))
    assert.ok(labels.length>=2)
    for(let i=1;i<labels.length;i++)assert.ok(labels[i].left>=labels[i-1].right,`MODEL-001 chart labels do not overlap at ${width}`)
    assert.equal(await chart.locator('tbody tr').count(),36,'Every monthly value remains in the accessible chart table')
    await shot(page,`${calendar}-years-${width}`)
    await fiscal.locator('summary').click();await fiscal.getByRole('table',{name:'Accounting periods',exact:true}).waitFor()
    assert.equal(await fiscal.getByRole('table',{name:'Accounting periods',exact:true}).locator('tbody tr').count(),36)
    assert.ok((await fiscal.innerText()).includes(v.fiscal.periods[0].fromDate))
    await fiscal.locator('summary').scrollIntoViewIfNeeded();await shot(page,`${calendar}-periods-${width}`)
    await tab(page,'Settings');await page.getByLabel('Plan horizon (months)',{exact:true}).waitFor();assert.equal(await page.getByLabel('Plan horizon (months)',{exact:true}).inputValue(),'36')
    await shot(page,`${calendar}-settings-${width}`)
   }
   await page.getByLabel('Plan horizon (months)',{exact:true}).fill('24');await page.getByRole('button',{name:'Save plan settings',exact:true}).click();await wait(page)
   await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor();await tab(page,'Overview')
   const changed=await call(`scenario/${budget.id}`);assert.equal(changed.calculation.months.length,24)
   const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download Excel',exact:true}).click()
   const file=join(evidence,`${calendar}-24-month.xlsx`);await(await download).saveAs(file)
   const fs=await import('node:fs/promises');const book=await readWorkbook(await fs.readFile(file));proveFormulas(book)
   assert.equal(book.getWorksheet('Accounting periods').rowCount,26)
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});const fiscal=card(page,'Fiscal summaries');await fiscal.getByRole('table',{name:'Fiscal totals',exact:true}).waitFor();await fiscal.getByLabel('Roll-up',{exact:true}).selectOption('years');assert.equal(await fiscal.getByRole('table',{name:'Fiscal totals',exact:true}).locator('tbody tr').count(),2);await fiscal.scrollIntoViewIfNeeded();await shot(page,`${calendar}-persisted-24-${width}`)
   }
   console.log(`MODEL-001 ${calendar}: native 36-month setup, populated quarter/year/period tables, settings and persisted 24-month edit plus formula Excel at 1440/390 passed`)
  } catch(error){await finance?.page.screenshot({path:join(evidence,`${calendar}-failed.png`),fullPage:true}).catch(()=>{});throw error}
  finally{await finance?.context.close();await server?.close();await rm(root,{recursive:true,force:true})}
 }
}finally{await browser.close()}
