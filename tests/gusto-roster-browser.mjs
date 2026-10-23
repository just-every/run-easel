// Built production UI + native owner session + real D1. Only Gusto's external
// HTTP edge is replaced; no application rows or session cookies are injected.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow,settle,track } from './browser-journey.mjs'
import { employeeIds,gustoFixture,gustoGrant,gustoProvider } from './gusto-roster-flow.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-gusto')
await mkdir(evidence,{recursive:true})
const today=new Date().toISOString().slice(0,10),current=today.slice(0,7),day=Number(today.slice(8)),previousEnd=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1,0)).toISOString().slice(0,10),previous=previousEnd.slice(0,7)
const shifted=value=>{
 if(Array.isArray(value))return value.map(shifted)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shifted(v)]))
 if(typeof value!=='string')return value
 if(value==='2026-01')return previous
 if(value==='2026-02')return current
 if(value==='2026-01-31')return previousEnd
 if(value==='2026-02-28')return today
 if(value.startsWith('2026-01-'))return previous+value.slice(7)
 if(value.startsWith('2026-02-'))return `${current}-${String(Math.min(Number(value.slice(8)),day)).padStart(2,'0')}`
 return value
}
const provider=gustoProvider({date:shifted})
const runtime=await builtBrowserRuntime({outbound:provider.outbound})
let browser,page
try{
 browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext(),call=async(path,body)=>{
  const response=body===undefined?await context.request.get(`${runtime.origin}/api/easel/${path}`):await context.request.post(`${runtime.origin}/api/easel/${path}`,{headers:{origin:runtime.origin},data:shifted(body)})
  assert.equal(response.status(),200,await response.text());return response.json()
 }
 const claimed=await context.request.post(`${runtime.origin}/auth/bootstrap`,{headers:{origin:runtime.origin},data:{token:runtime.bootstrap,displayName:'Fran Finance'},maxRedirects:0});assert.equal(claimed.status(),303)
 const f=await gustoFixture(call)
 const before=await call(`scenario/${f.scenario}`)
 page=await context.newPage();track(page);page.on('dialog',dialog=>dialog.accept())
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check()
 await page.getByRole('button',{name:'Finish setup',exact:true}).click()
 await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const card=()=>page.getByRole('region',{name:'Gusto payroll connection',exact:true})
 const action=async(path,run)=>{const pending=page.waitForResponse(r=>r.url().endsWith(path));await run();const response=await pending;assert.equal(response.status(),200,await response.text());await settle(page);return response.json()}
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(`${runtime.origin}/app?tab=settings`)
  await card().getByRole('button',{name:'Connect Gusto',exact:true}).waitFor()
  await noOverflow(page,`Gusto token form ${width}`);await card().screenshot({path:join(evidence,`gusto-connect-${width}.png`)})
  await card().getByLabel('Gusto company ID',{exact:true}).fill(gustoGrant.companyId)
  await card().getByLabel('Gusto company access token',{exact:true}).fill(gustoGrant.accessToken)
  await card().getByLabel('I approve read-only employee, compensation and payroll access for this company',{exact:true}).check()
  await action('/connections/gusto/connect',()=>card().getByRole('button',{name:'Connect Gusto',exact:true}).click())
  await card().getByLabel('Gusto target scenario',{exact:true}).selectOption(f.scenario)
  await card().getByLabel('Gusto payroll line',{exact:true}).selectOption(f.line.id)
  await card().getByLabel('Payroll check-date window start',{exact:true}).fill(`${previous}-01`)
  await card().getByLabel('Payroll check-date window end',{exact:true}).fill(today)
  await card().getByLabel('Gusto payroll history boundary',{exact:true}).fill('2025-01-01')
  const preview=await action('/import/gusto/preview',()=>card().getByRole('button',{name:'Pull Gusto preview',exact:true}).click())
  assert.equal(preview.unmapped.length,3)
  assert.equal(await card().getByRole('button',{name:'Accept reviewed Gusto observations',exact:true}).count(),0)
  for(const [i,id] of employeeIds.entries()){
   await card().getByLabel(`Gusto department ${id}`,{exact:true}).selectOption(f.department.id)
   await card().getByLabel(`Gusto position ${id}`,{exact:true}).selectOption([f.departing,f.late,f.backfill][i].originId)
  }
  const reviewed=await action('/import/gusto/preview',()=>card().getByRole('button',{name:'Review Gusto mapping',exact:true}).click())
  assert.deepEqual(reviewed.unmapped,[]);assert.equal(reviewed.totalCents,2875000)
  await noOverflow(page,`Gusto mapping and payroll review ${width}`);await card().screenshot({path:join(evidence,`gusto-review-${width}.png`)})
  const accepted=await action('/import/gusto/commit',()=>card().getByRole('button',{name:'Accept reviewed Gusto observations',exact:true}).click())
  assert.equal(accepted.import.status,'imported')
  await card().getByRole('region',{name:'Gusto accepted history',exact:true}).waitFor()
  await noOverflow(page,`Gusto accepted history ${width}`);await card().screenshot({path:join(evidence,`gusto-history-${width}.png`)})
  await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
  const headcount=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Headcount plan against actual',exact:true})})
  await headcount.getByLabel('Headcount month',{exact:true}).selectOption(current)
  const view=await call(`headcount/${f.scenario}`),month=view.months.find(row=>row.month===current&&row.department===f.department.id)
  assert.equal(month.actualHeadcount,2);assert.equal(month.actualHires,2);assert.equal(month.actualDepartures,1);assert.equal(month.backfills,1);assert.equal(month.actualCostCents,1785000)
  const slip=(Date.parse(`${current}-${String(Math.min(13,day)).padStart(2,'0')}`)-Date.parse(`${previous}-10`))/86400000
  await headcount.getByRole('cell',{name:`${slip} days`,exact:true}).waitFor()
  await noOverflow(page,`Gusto connected headcount ${width}`);await headcount.screenshot({path:join(evidence,`gusto-headcount-${width}.png`)})
  assert.deepEqual(await call(`scenario/${f.scenario}`),before)
  await page.goto(`${runtime.origin}/app?tab=settings`)
  await action('/import/gusto/undo',()=>card().getByRole('button',{name:`Undo Gusto pull ${today}`,exact:true}).click())
  await action('/connections/gusto/disconnect',()=>card().getByRole('button',{name:'Disconnect Gusto',exact:true}).click())
  await card().getByRole('button',{name:'Connect Gusto',exact:true}).waitFor()
  await noOverflow(page,`Gusto disconnected ${width}`);await card().screenshot({path:join(evidence,`gusto-disconnected-${width}.png`)})
  console.log(`Gusto ${width}: native token custody, explicit reviewed mapping, complete provider payroll, headcount/slippage/departure/backfill/cost, journal undo and disconnect passed`)
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:join(evidence,'gusto-failed.png'),fullPage:true}).catch(()=>{});throw error}
finally{await browser?.close();await runtime.close()}
