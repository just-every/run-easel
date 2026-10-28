// One native UI sanity journey across all four sources, on the production build.
// Business assertions run at 1440. Each changed state is also shown at 390.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { noOverflow,settle,track } from './browser-journey.mjs'
import { grant,hrisFixture,hrisNames,hrisProvider,hrisProviders,ids } from './hris-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??join(tmpdir(),'easel-hris-proof'))
await mkdir(evidence,{recursive:true})
const edge=hrisProvider(),runtime=await builtBrowserRuntime({now:()=> '2026-02-28T12:00:00.000Z',outbound:edge.outbound,serviceBindings:{HRIS_ADP_MTLS:edge.outbound}})
let browser,page
try{
 browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),call=async(path,body)=>{
  const response=body===undefined?await context.request.get(`${runtime.origin}/api/easel/${path}`):await context.request.post(`${runtime.origin}/api/easel/${path}`,{headers:{origin:runtime.origin},data:body})
  assert.equal(response.status(),200,await response.text());return response.json()
 }
 const claimed=await context.request.post(`${runtime.origin}/auth/bootstrap`,{headers:{origin:runtime.origin},data:{token:runtime.bootstrap,displayName:'Fran Finance'},maxRedirects:0});assert.equal(claimed.status(),303)
 const f=await hrisFixture(call),before=await call(`scenario/${f.scenario}`)
 page=await context.newPage();track(page);page.on('dialog',dialog=>dialog.accept())
 await page.goto(`${runtime.origin}/setup`)
 await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const action=async(path,run)=>{const pending=page.waitForResponse(r=>r.url().endsWith(path));await run();const response=await pending;assert.equal(response.status(),200,await response.text());await settle(page);return response.json()}
 const show=async(scope,label)=>{
  for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await settle(page);await noOverflow(page,`${label} ${width}`);await scope.screenshot({path:join(evidence,`${label}-${width}.png`)})}
  await page.setViewportSize({width:1440,height:1000})
 }
 for(const id of hrisProviders){
  const name=hrisNames[id],key=grant(id)
  await page.goto(`${runtime.origin}/app?tab=settings`);await page.getByLabel('Roster provider',{exact:true}).selectOption(id)
  const card=page.getByRole('region',{name:`${name} roster connection`,exact:true})
  await card.getByRole('button',{name:`Connect ${name}`,exact:true}).waitFor()
  await show(card,`${id}-connect`)
  if(id==='adp'){await card.getByLabel('ADP client ID',{exact:true}).fill(key.clientId);await card.getByLabel('ADP client secret',{exact:true}).fill(key.clientSecret)}
  else{await card.getByLabel(`${name} company or origin`,{exact:true}).fill(key.tenant);await card.getByLabel(`${name} read-only credential`,{exact:true}).fill(key.credential)}
  if(id==='rippling')await card.getByLabel('Rippling API version',{exact:true}).fill(key.apiVersion)
  await card.getByLabel(`I approve read-only ${name} roster and compensation access`,{exact:true}).check()
  await action(`/connections/hris/${id}/connect`,()=>card.getByRole('button',{name:`Connect ${name}`,exact:true}).click())
  await card.getByLabel(`${name} target scenario`,{exact:true}).selectOption(f.scenario);await card.getByLabel(`${name} observation date`,{exact:true}).fill('2026-02-28')
  const preview=await action(`/import/${id}/preview`,()=>card.getByRole('button',{name:`Pull ${name} preview`,exact:true}).click())
  assert.equal(preview.unmapped.length,4);assert.equal(await card.getByRole('button',{name:`Accept reviewed ${name} matches`,exact:true}).count(),0)
  await card.getByRole('cell',{name:/customFavouriteColour/}).waitFor()
  for(const [i,employee] of ids.entries()){
   await card.getByLabel(`${name} department ${employee}`,{exact:true}).selectOption(f.department.id)
   await card.getByLabel(`${name} position ${employee}`,{exact:true}).selectOption([f.departing.originId,f.late.originId,'__unplanned',f.backfill.originId][i])
   await card.getByLabel(`${name} employment type ${employee}`,{exact:true}).selectOption(i===2?'1099':'W-2')
  }
  const reviewed=await action(`/import/${id}/preview`,()=>card.getByRole('button',{name:`Review ${name} mapping`,exact:true}).click())
  assert.deepEqual(reviewed.unmapped,[]);assert.deepEqual(Object.fromEntries(Object.entries(reviewed.reconciliation).map(([k,v])=>[k,v.length])),{matched:2,unplanned:1,changedSalary:1,plannedNotHired:1})
  await show(card,`${id}-review`)
  const accepted=await action(`/import/${id}/commit`,()=>card.getByRole('button',{name:`Accept reviewed ${name} matches`,exact:true}).click())
  assert.equal(accepted.import.status,'imported');await card.getByRole('region',{name:`${name} accepted history`,exact:true}).waitFor();await show(card,`${id}-accepted`)
  await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click();await settle(page)
  const headcount=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Headcount plan against actual',exact:true})})
  await headcount.getByLabel('Headcount month',{exact:true}).selectOption('2026-02')
  await headcount.getByRole('cell',{name:'34 days',exact:true}).waitFor()
  const read=await call(`headcount/${f.scenario}`),month=read.months.find(r=>r.month==='2026-02'&&r.department===f.department.id)
  assert.equal(month.actualHeadcount,3);assert.equal(month.actualDepartures,1);assert.equal(month.actualHires,3);assert.equal(month.actualCostCents,null)
  await show(headcount,`${id}-headcount`)
  assert.deepEqual(await call(`scenario/${f.scenario}`),before)
  await page.goto(`${runtime.origin}/app?tab=settings`);await page.getByLabel('Roster provider',{exact:true}).selectOption(id)
  await action(`/import/${id}/undo`,()=>card.getByRole('button',{name:'Undo '+name+' roster 2026-02-28',exact:true}).click())
  await action(`/connections/hris/${id}/disconnect`,()=>card.getByRole('button',{name:`Disconnect ${name}`,exact:true}).click())
  await card.getByText('Local credential deleted. Provider revocation requires the owner action above.',{exact:true}).waitFor();await show(card,`${id}-disconnected`)
  console.log(`${name}: native connect, complete custom-field review, explicit matches, retained dates/headcount, undo and truthful disconnect; 1440/390 proof passed`)
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:join(evidence,'hris-failed.png'),fullPage:true}).catch(()=>{});throw error}
finally{await browser?.close();await runtime.close()}
