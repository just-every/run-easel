// PEOPLE-006: real installation, native session, populated Plan/Overview at both widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { command,fresh,freePort,start } from './browser-runtime.mjs'
import { api,session,noOverflow } from './browser-journey.mjs'
import { headcountFixture } from './headcount-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root=await fresh(),evidence=resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-headcount')
await mkdir(evidence,{recursive:true})
let browser,server
try {
 const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);server=await start(root,port)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const setup=await session(browser,root,server.origin,'owner',1440),call=(path,body)=>api(setup.context,server.origin,path,body)
 const f=await headcountFixture(call)
 await call('command/member',{email:'board@dev.localhost',name:'Board member',role:'viewer'})
 await setup.context.close()
 for(const width of[1440,390]) {
  const owner=await session(browser,root,server.origin,'owner',width),page=owner.page
  try {
   // Edit and persist the new position fields through the visible form.
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Plan',exact:true}).click()
   const positions=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Positions',exact:true})})
   const row=positions.getByRole('row').filter({hasText:'Late engineer'})
   await row.getByRole('button',{name:'Edit',exact:true}).click()
   assert.equal(await positions.getByLabel('Planned start date',{exact:true}).inputValue(),'2026-01-10')
   await positions.getByLabel('Monthly attrition assumption %',{exact:true}).fill('2.50')
   await positions.getByRole('button',{name:'Save position',exact:true}).click()
   await page.waitForResponse(r=>r.url().endsWith(`/api/easel/scenario/${f.scenario}`)&&r.ok())
   await row.getByRole('button',{name:'Edit',exact:true}).click()
   assert.equal(await positions.getByLabel('Monthly attrition assumption %',{exact:true}).inputValue(),'2.50')
   await noOverflow(page,`PEOPLE-006 Plan ${width}`)
   await positions.screenshot({path:join(evidence,`plan-${width}.png`)})
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
   const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Headcount plan against actual',exact:true})})
   await section.getByLabel('Headcount month').selectOption('2026-02')
   await section.getByRole('cell',{name:'34 days',exact:true}).waitFor()
   const apiView=await api(owner.context,server.origin,`headcount/${f.scenario}`)
   const feb=apiView.months.find(r=>r.month==='2026-02'&&r.department===f.engineering.id)
   assert.equal(feb.actualHeadcount,3);assert.equal(feb.actualDepartures,1);assert.equal(feb.backfills,1)
   assert.equal(feb.plannedCostCents,2700000);assert.equal(feb.actualCostCents,2600000)
   assert.equal(feb.expectedAttritionHundredths,4)
   const engineer=section.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Engineering',exact:true})})
   assert.deepEqual(await engineer.getByRole('cell').allInnerTexts(),['3','3','0','2','3','1','1','1','0.04 people','$27,000.00','$26,000.00','-$1,000.00'])
   const monthly=section.getByRole('row').filter({hasText:'Private Drew'})
   assert.equal(await monthly.getByRole('cell',{name:'Unavailable',exact:true}).count(),2)
   await noOverflow(page,`PEOPLE-006 populated comparison ${width}`)
   await section.screenshot({path:join(evidence,`comparison-${width}.png`)})
   await section.getByLabel('Headcount month').selectOption('2026-03')
   await section.getByText('No reviewed roster observation for this month',{exact:false}).waitFor()
   assert.equal(await section.getByRole('region',{name:'Hiring slippage history'}).count(),0)
   await section.screenshot({path:join(evidence,`unavailable-${width}.png`)})
   const viewer=await session(browser,root,server.origin,'board',width)
   try {
    const safe=await api(viewer.context,server.origin,`headcount/${f.scenario}`)
    assert.deepEqual(safe.history,[]);assert.deepEqual(safe.positions,[])
    assert.doesNotMatch(JSON.stringify(safe),/Private Morgan|Private Taylor|Private Drew/)
    await viewer.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
    const section=viewer.page.locator('section.card').filter({has:viewer.page.getByRole('heading',{name:'Headcount plan against actual',exact:true})})
    await section.getByLabel('Headcount month').selectOption('2026-02')
    await section.getByRole('cell',{name:'$26,000.00',exact:true}).waitFor()
    assert.equal(await section.getByRole('region',{name:'Hiring slippage history'}).count(),0)
    await noOverflow(viewer.page,`PEOPLE-006 board ${width}`)
    await section.screenshot({path:join(evidence,`viewer-${width}.png`)})
   } finally {await viewer.context.close()}
   console.log(`PEOPLE-006 ${width}: persisted date/attrition form, monthly hire/departure/backfill/cost, 34-day and unavailable slippage, missing-month and filtered board end states passed`)
  } finally {await owner.context.close()}
 }
} finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true})}
