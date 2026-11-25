// PEOPLE-007 is an HTTP import door. Exercise it in a real native installation,
// signed in through the same browser session as the app, at desktop/phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root=await fresh(), evidence=resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-payroll-files')
await mkdir(evidence,{recursive:true})
let server,browser
try {
 const port=await freePort(),origin=`http://127.0.0.1:${port}`
 await command(root,['setup','--owner-email','owner@example.test','--port',String(port)])
 server=await start(root,port)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const setup=await session(browser,root,origin,'owner',1440),call=(path,body)=>api(setup.context,origin,path,body)
 await call('command/workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('command/department',{name:'Engineering'}),line=await call('command/line',{name:'Payroll',type:'operating-expense',payroll:true})
 const scenario=(await call('state')).scenarios[0].id
 await call('command/position',{scenario,title:'Engineering lead',holder:'Morgan Lee',annualSalary:'144000',start:'2026-01',department:department.id,line:line.id})
 await call('command/member',{email:'board@dev.localhost',name:'Board member',role:'viewer'})
 await setup.context.close()
 for(const width of[1440,390]) {
  const owner=await session(browser,root,origin,'owner',width)
  try {
   const send=(path,body)=>api(owner.context,origin,path,body)
   const position=await send('command/position',{scenario,title:`Engineering lead ${width}`,holder:'Morgan Lee',annualSalary:'144000',start:'2026-01',department:department.id,line:line.id})
   const employeeId=`E104-${width}`
   const memberEmail=`former${width}@dev.localhost`
   await send('command/member',{email:memberEmail,name:`Planning Contributor ${width}`,role:'contributor',departments:[department.id]})
   const input={provider:'Justworks',kind:'roster',scenario,asOf:width===1440?'2026-01-31':'2026-02-28',filename:`roster-${width}.csv`,csv:`Employee ID,Name,Department,Title,Employment Type,Salary,Start\n${employeeId},Morgan Lee,Engineering,Engineering lead,W-2,144000,2026-01-12\n`,positionMap:{[employeeId]:position.originId},memberMap:{[employeeId]:memberEmail}}
   const before=await send(`payroll/${scenario}`)
   const preview=await send('import/payroll/preview',input)
   assert.deepEqual(await send(`payroll/${scenario}`),before)
   assert.equal(preview.reconciliation.matched.length,1)
   const imported=await send('import/payroll/commit',{...input,fingerprint:preview.fingerprint})
   let view=await send(`payroll/${scenario}`)
   assert.equal(view.roster[0].name,'Morgan Lee');assert.equal(view.departments[0].headcount,1)
   // Open the authenticated API door in the browser and inspect the actual response.
   const response=await owner.page.goto(`${origin}/api/easel/payroll/${scenario}`)
   assert.equal(response.status(),200)
   assert.equal((await response.json()).counts.matched,1)
   await owner.page.screenshot({path:join(evidence,`roster-response-${width}.png`),fullPage:true})
   await owner.page.goto(`${origin}/app`);await owner.page.locator('h1').first().waitFor()
   await noOverflow(owner.page,`PEOPLE-007 installation ${width}`)
   await owner.page.screenshot({path:join(evidence,`installation-${width}.png`),fullPage:true})
   const viewer=await session(browser,root,origin,'board',width)
   try {
    const safe=await api(viewer.context,origin,`payroll/${scenario}`)
    assert.equal(safe.departments[0].headcount,1);assert.deepEqual(safe.roster,[])
    assert.ok(!JSON.stringify(safe).includes('Morgan Lee'))
    const refused=await viewer.context.request.post(`${origin}/api/easel/import/payroll/preview`,{headers:{origin},data:input})
    assert.equal(refused.status(),403)
    await viewer.page.goto(`${origin}/api/easel/payroll/${scenario}`)
    await viewer.page.screenshot({path:join(evidence,`viewer-response-${width}.png`),fullPage:true})
   } finally {await viewer.context.close()}
   await send('command/member',{email:memberEmail,name:`Planning Contributor ${width}`,role:'contributor',departments:[department.id],active:false})
   const receipt=await send('command/person-erase',{email:memberEmail})
   const erased=await send(`payroll/${scenario}`)
   assert.equal(erased.roster[0].name,receipt.pseudonym);assert.equal(erased.roster[0].employeeId,receipt.pseudonym)
   assert.equal((await send(`scenario/${scenario}`)).inputs.position.find(p=>p.id===position.id).holder,receipt.pseudonym)
   await owner.page.goto(`${origin}/api/easel/payroll/${scenario}`)
   await owner.page.screenshot({path:join(evidence,`erased-response-${width}.png`),fullPage:true})
   await send('import/payroll/undo' ,{id:imported.import.id})
   view=await send(`payroll/${scenario}`);assert.deepEqual(view.roster,[])
   console.log(`PEOPLE-007 ${width}: real native preview/import/reload, scoped totals and exact undo passed`)
  } finally {await owner.context.close()}
 }
} finally {
 await browser?.close()
 await server?.close()
 await rm(root,{recursive:true,force:true})
}
