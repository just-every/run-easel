// Native production interface, real D1 and session. Only Harvest is faked.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {builtBrowserRuntime} from './built-browser-runtime.mjs'
import {noOverflow,settle,track} from './browser-journey.mjs'
import {greenhouseProvider,greenhouseGrant,greenhouseFixture} from './greenhouse-flow.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/easel-greenhouse');await mkdir(evidence,{recursive:true})
const provider=greenhouseProvider(),runtime=await builtBrowserRuntime({outbound:provider.outbound})
let browser,page
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.EASEL_CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']})
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  // One native owner session per isolated scenario, no injected cookies or records.
  {const r=await context.request.post(`${runtime.origin}/auth/bootstrap`,{headers:{origin:runtime.origin},data:{token:runtime.bootstrap,displayName:'Fran Finance'},maxRedirects:0});assert.equal(r.status(),303)}
  const call=async(path,body)=>{path=path.replace(/^\//,'');const r=body===undefined?await context.request.get(`${runtime.origin}/api/easel/${path}`):await context.request.post(`${runtime.origin}/api/easel/${path}`,{headers:{origin:runtime.origin},data:body});assert.equal(r.status(),200,await r.text());return r.json()}
  const f=await greenhouseFixture(call)
  page=await context.newPage();track(page);page.on('dialog',d=>d.accept());await page.goto(`${runtime.origin}/setup`)
  await page.getByLabel('I confirm this owner account is ready to use.',{exact:true}).check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('navigation',{name:'Easel'}).waitFor()
  const card=()=>page.getByRole('region',{name:'Greenhouse recruiting connection',exact:true})
  const action=async(path,run)=>{const pending=page.waitForResponse(r=>r.url().endsWith(path));await run();const response=await pending;assert.equal(response.status(),200,await response.text());await settle(page);return response.json()}
  const shot=async(name,w)=>{await noOverflow(page,`${name} ${w}`);await card().screenshot({path:join(evidence,`${name}-${w}.png`)})}
  for(const w of[1440,390]){
   await page.setViewportSize({width:w,height:1000})
   // Each width uses a fresh working branch, so both exercise all plan transitions.
   const target=w===1440?f.scenario:(await call('/command/branch',{from:f.scenario,name:'Mobile hiring plan'})).id
   if(w===390){const existing=await call(`scenario/${target}`);for(const p of existing.inputs.position)await call('/command/input-delete',{kind:'position',id:p.id})}
   provider.status='open'
   await page.goto(`${runtime.origin}/app?tab=settings`)
   await card().getByRole('button',{name:'Connect Greenhouse',exact:true}).waitFor()
   await shot('greenhouse-connect',w)
   await card().getByLabel('Greenhouse Harvest API key',{exact:true}).fill(greenhouseGrant.apiKey)
   await card().getByLabel('I approve manual read-only ATS observations',{exact:true}).check()
   await action('/connections/greenhouse/connect',()=>card().getByRole('button',{name:'Connect Greenhouse',exact:true}).click())
   provider.failure=429
   await action('/connections/greenhouse/check',()=>card().getByRole('button',{name:'Check Greenhouse connection',exact:true}).click())
   assert.match(await card().innerText(),/HTTP 429/);await shot('greenhouse-rate-limit',w)
   provider.failure=200
   await action('/connections/greenhouse/check',()=>card().getByRole('button',{name:'Check Greenhouse connection',exact:true}).click())
   assert.equal(await card().getByRole('alert').count(),0)
   const preview=async()=>{
    await card().getByLabel('Greenhouse target plan',{exact:true}).selectOption(target)
    await card().getByLabel('Greenhouse job ID',{exact:true}).fill('820')
    await card().getByLabel('Greenhouse mapped department',{exact:true}).selectOption(f.department.id)
    await card().getByLabel('Greenhouse payroll line',{exact:true}).selectOption(f.line.id)
    return action('/greenhouse/preview',()=>card().getByRole('button',{name:'Preview Greenhouse requisition',exact:true}).click())
   }
   const promote=async()=>{
    const {proposal}=await action('/greenhouse/propose',()=>card().getByRole('button',{name:'Create reviewed ATS proposal',exact:true}).click())
    await action('/command/proposal-submit',()=>card().getByRole('button',{name:'Submit ATS proposal for finance',exact:true}).click())
    await card().getByRole('link',{name:'Review ATS proposal and costs',exact:true}).click()
    await page.getByRole('heading',{name:'Proposals',exact:true}).waitFor()
    await page.getByRole('region',{name:'Changed cells',exact:true}).waitFor()
    await noOverflow(page,`ATS cost comparison ${w}`)
    await page.screenshot({path:join(evidence,`greenhouse-compare-${provider.status}-${w}.png`),fullPage:true})
    const row=page.getByRole('region',{name:'Proposals',exact:true}).getByRole('row').filter({has:page.getByRole('button',{name:`Promote revision ${proposal.revision}`,exact:true})})
    await action('/command/proposal-promote',()=>row.getByRole('button',{name:`Promote revision ${proposal.revision}`,exact:true}).click())
    await page.goto(`${runtime.origin}/app?tab=settings`);await card().getByRole('button',{name:'Preview Greenhouse requisition',exact:true}).waitFor()
    return proposal
   }
   const before=await call(`scenario/${target}`),opened=await preview();assert.equal(opened.action,'add');await shot('greenhouse-open-review',w);assert.deepEqual(await call(`scenario/${target}`),before)
   await promote()
   provider.status='accepted';const accepted=await preview();assert.equal(accepted.source.start,'2026-04-15');assert.equal(accepted.source.annualSalary,'120000.00');await shot('greenhouse-offer-review',w)
   await promote()
   const planned=await call(`scenario/${target}`);assert.equal(planned.inputs.position[0].holder,'Private Morgan Green');assert.equal(planned.inputs.position[0].start,'2026-04');assert.equal(planned.inputs.position[0].annualSalaryCents,12000000)
   provider.status='closed';assert.equal((await preview()).action,'remove');await shot('greenhouse-closed-review',w);await promote();assert.deepEqual((await call(`scenario/${target}`)).inputs.position,[])
   await action('/connections/greenhouse/disconnect',()=>card().getByRole('button',{name:'Disconnect Greenhouse',exact:true}).click())
   await card().getByRole('button',{name:'Connect Greenhouse',exact:true}).waitFor();await shot('greenhouse-disconnected',w)
   assert.match(await card().innerText(),/Delete the Harvest API key/)
   // All controls in the changed Settings surface use visible text labels.
   assert.equal(await card().locator('button').filter({hasText:/^\s*$/}).count(),0)
   console.log(`Greenhouse ${w}: native connect, requisition, accepted offer, cost comparison, explicit finance promotions, closed removal and honest disconnect passed`)
  }
  await context.close()
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:join(evidence,'greenhouse-failed.png'),fullPage:true}).catch(()=>{});throw error}
finally{await browser?.close();await runtime.close()}
