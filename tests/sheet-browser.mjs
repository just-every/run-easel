import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { sheetBrowserRuntime } from './sheet-browser-runtime.mjs'
import { noOverflow,settle,track } from './browser-journey.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-sheet')
await mkdir(evidence,{recursive:true})
const runtime=await sheetBrowserRuntime()
let browser,page
try{
 browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext(),post=async(path,body)=>{
  const response=await context.request.post(`${runtime.origin}${path}`,{headers:{origin:runtime.origin},data:body,maxRedirects:0});assert.equal(response.status(),200,await response.text());return response.json()
 }
 const claimed=await context.request.post(`${runtime.origin}/auth/bootstrap`,{headers:{origin:runtime.origin},data:{token:runtime.bootstrap,displayName:'Fran Finance'},maxRedirects:0});assert.equal(claimed.status(),303)
 await post('/api/easel/command/workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await post('/api/easel/command/department',{name:'Sales'}),line=await post('/api/easel/command/line',{name:'Capacity',type:'operating-expense'})
 const state=await(await context.request.get(`${runtime.origin}/api/easel/state`)).json(),scenario=state.scenarios[0]
 const schedule=await post('/api/easel/command/schedule',{scenario:scenario.id,name:'Sales capacity',department:department.id,line:line.id,values:{'2026-02':'100','2026-03':'200'}})
 const original=await(await context.request.get(`${runtime.origin}/api/easel/scenario/${scenario.id}`)).json()
 page=await context.newPage();track(page);page.on('dialog',d=>d.accept())
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check()
 await page.getByRole('button',{name:'Finish setup',exact:true}).click()
 await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const panel=()=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Google Sheets',exact:true})})
 const action=async(path,click)=>{const pending=page.waitForResponse(r=>r.url().endsWith(path));await click();const r=await pending;assert.equal(r.status(),200,await r.text());await settle(page);return r.json()}
 const settings=async()=>{await page.goto(`${runtime.origin}/app?tab=settings`);await page.getByRole('navigation',{name:'Easel'}).waitFor();await panel().getByRole('button',{name:'Connect Google Sheets',exact:true}).waitFor()}
 for(const width of[1440,390]){
  runtime.provider.values=[100,200];runtime.provider.columns=3
  await page.setViewportSize({width,height:1000});await settings()
  await panel().getByLabel('OAuth client ID',{exact:true}).fill(runtime.credentials.clientId);await panel().getByLabel('OAuth client secret',{exact:true}).fill(runtime.credentials.clientSecret);await panel().getByLabel('Offline refresh token',{exact:true}).fill(runtime.credentials.refreshToken)
  await action('/connections/sheets/connect',()=>panel().getByRole('button',{name:'Connect Google Sheets',exact:true}).click())
  await panel().getByRole('button',{name:'Choose target rows',exact:true}).waitFor();await noOverflow(page,`Sheets connected ${width}`);await panel().screenshot({path:join(evidence,`sheet-connected-${width}.png`)})
  const name=`Sales capacity ${width}`
  await panel().getByLabel('Link name',{exact:true}).fill(name);await panel().getByLabel('Spreadsheet ID',{exact:true}).fill('synthetic-easel-5');await panel().getByLabel('Sheet and A1 rectangle',{exact:true}).fill('Capacity!B2:C2');await panel().getByLabel('Working target scenario',{exact:true}).selectOption(scenario.id);await panel().getByLabel('First target month',{exact:true}).fill('2026-02');await panel().getByLabel('Pull schedule',{exact:true}).selectOption('hourly')
  await panel().getByRole('button',{name:'Choose target rows',exact:true}).click();await panel().getByLabel('Source row 2 target schedule',{exact:true}).selectOption(schedule.id)
  await action('/sheet-links/preview',()=>panel().getByRole('button',{name:'Preview source baseline',exact:true}).click())
  await panel().getByRole('button',{name:'Save baseline and enable schedule',exact:true}).waitFor();await noOverflow(page,`Sheets baseline ${width}`);await panel().screenshot({path:join(evidence,`sheet-baseline-${width}.png`)})
  await action('/sheet-links/save',()=>panel().getByRole('button',{name:'Save baseline and enable schedule',exact:true}).click())
  const linked=()=>panel().locator('article').filter({has:page.getByRole('heading',{name,exact:true})})
  await linked().getByRole('button',{name:`Pull now · ${name}`,exact:true}).waitFor()
  runtime.provider.values=[125.25,235.75]
  const result=await action('/sheet-links/pull',()=>linked().getByRole('button',{name:`Pull now · ${name}`,exact:true}).click());assert.equal(result.cells.length,2)
  await linked().getByText('Latest source changes (2)',{exact:true}).click();await noOverflow(page,`Sheets proposal ${width}`);await linked().screenshot({path:join(evidence,`sheet-proposal-${width}.png`)})
  await linked().getByRole('link',{name:'Review changed cells and proposal',exact:true}).click();await page.getByRole('heading',{name:'Changed cells (2)',exact:true}).waitFor();await noOverflow(page,`Sheets native comparison ${width}`)
  await page.locator('section.card').filter({has:page.getByRole('heading',{name:'Compare',exact:true})}).screenshot({path:join(evidence,`sheet-comparison-${width}.png`)})
  await page.goto(`${runtime.origin}/app?tab=settings`);await linked().getByRole('button',{name:`Pull now · ${name}`,exact:true}).waitFor()
  runtime.provider.columns=2
  const failed=await action('/sheet-links/pull',()=>linked().getByRole('button',{name:`Pull now · ${name}`,exact:true}).click());assert.match(failed.error,/shape/i)
  await linked().getByRole('alert').first().waitFor();await noOverflow(page,`Sheets shape error ${width}`);await linked().screenshot({path:join(evidence,`sheet-shape-error-${width}.png`)})
  const target=await(await context.request.get(`${runtime.origin}/api/easel/scenario/${scenario.id}`)).json();assert.deepEqual(target,original)
  await action('/connections/sheets/disconnect',()=>panel().getByRole('button',{name:'Disconnect Google Sheets',exact:true}).click())
  await panel().getByRole('button',{name:'Connect Google Sheets',exact:true}).waitFor();await noOverflow(page,`Sheets disconnected ${width}`);await panel().screenshot({path:join(evidence,`sheet-disconnected-${width}.png`)})
  console.log(`Sheets ${width}: native custody, reviewed mapping, separate changed-cell proposal/comparison, shape refusal and truthful disconnect passed`)
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:join(evidence,'sheet-failed.png'),fullPage:true}).catch(()=>{});throw error}
finally{await browser?.close();await runtime.close()}
