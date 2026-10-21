// SHEET-003 through native workbook upload, report, Plan drivers and board totals.
import assert from 'node:assert/strict'
import {mkdir,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {command,fresh,freePort,start} from './browser-runtime.mjs'
import {api,session,noOverflow} from './browser-journey.mjs'
import {formulaSetup,formulaWorkbook} from './formula-import-fixture.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root=await fresh(),evidence=resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-formula-import')
await mkdir(evidence,{recursive:true})
let server,browser
try {
 const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);server=await start(root,port)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const setup=await session(browser,root,server.origin,'owner',1440),call=(path,body)=>api(setup.context,server.origin,path,body)
 const f=await formulaSetup(call)
 await call('command/member',{email:'board@dev.localhost',name:'Board member',role:'viewer'})
 await setup.context.close()
 for(const width of[1440,390]) {
  const owner=await session(browser,root,server.origin,'owner',width),page=owner.page
  try {
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Actuals',exact:true}).click()
   const upload=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Move in a planning workbook (.xlsx)',exact:true})})
   await upload.locator('input[type=file]').setInputFiles({name:`finance-model-${width}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await formulaWorkbook({tag:String(width)})})
   await upload.getByRole('button',{name:'Preview workbook',exact:true}).click()
   await upload.getByRole('region',{name:'Formula translation',exact:true}).waitFor()
   const unsupported=upload.getByRole('row').filter({hasText:'Unsupported function: PMT'})
   assert.equal(await unsupported.count(),1);await unsupported.getByRole('cell',{name:'C4',exact:true}).waitFor()
   const reconciliation=upload.getByRole('region',{name:'Workbook total reconciliation',exact:true})
   assert.equal(await reconciliation.getByRole('cell',{name:'reconciled',exact:true}).count(),3)
   await noOverflow(page,`SHEET-003 report ${width}`);await upload.screenshot({path:join(evidence,`report-${width}.png`)})
   await upload.getByRole('button',{name:'Import as a new scenario',exact:true}).click()
   await upload.getByRole('region',{name:'Formula translation',exact:true}).waitFor({state:'detached'})
   const state=await api(owner.context,server.origin,'state'),imp=state.workbooks.find(w=>w.file===`finance-model-${width}.xlsx`),scenario=imp.scenario
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Plan',exact:true}).click()
   await page.getByLabel('Scenario',{exact:true}).selectOption(scenario)
   const drivers=page.locator('section.card').filter({has:page.getByRole('heading',{name:`Workbook drivers: finance-model-${width}.xlsx`,exact:true})})
   await drivers.getByLabel('Source driver',{exact:true}).selectOption('Assumptions!B2')
   await drivers.getByLabel('Driver value',{exact:true}).fill('20000')
   await drivers.getByRole('button',{name:'Save workbook driver',exact:true}).click()
   await page.waitForResponse(r=>r.url().endsWith(`/api/easel/scenario/${scenario}`)&&r.ok())
   assert.equal(await drivers.getByLabel('Driver value',{exact:true}).inputValue(),'20000')
   const result=await api(owner.context,server.origin,`scenario/${scenario}`)
   assert.equal(result.calculation.lineTotals[f.revenue.id]['2026-02'],2200000)
   assert.equal(result.calculation.lineTotals[f.hosting.id]['2026-03'],420000)
   await noOverflow(page,`SHEET-003 drivers ${width}`);await drivers.screenshot({path:join(evidence,`drivers-${width}.png`)})
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
   await page.getByLabel('Scenario',{exact:true}).selectOption(scenario)
   const pl=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Profit and loss',exact:true})})
   await pl.getByRole('button',{name:'Revenue Feb 2026: how it was calculated',exact:true}).waitFor()
   assert.ok((await pl.innerText()).includes('$22,000.00'))
   await noOverflow(page,`SHEET-003 recalculation ${width}`);await pl.screenshot({path:join(evidence,`recalculated-${width}.png`)})
   const board=await session(browser,root,server.origin,'board',width)
   try {
    await board.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Overview',exact:true}).click()
    await board.page.getByLabel('Scenario',{exact:true}).selectOption(scenario)
    const safe=await api(board.context,server.origin,`scenario/${scenario}`)
    assert.deepEqual(safe.inputs['workbook-model'],[]);assert.ok(!JSON.stringify(safe).includes('987654.32'))
    const pl=board.page.locator('section.card').filter({has:board.page.getByRole('heading',{name:'Profit and loss',exact:true})})
    await pl.getByRole('button',{name:'Revenue Feb 2026: how it was calculated',exact:true}).waitFor()
    await noOverflow(board.page,`SHEET-003 board ${width}`);await pl.screenshot({path:join(evidence,`board-${width}.png`)})
   } finally {await board.context.close()}
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Actuals',exact:true}).click()
   const row=upload.getByRole('row').filter({hasText:`finance-model-${width}.xlsx`})
   await row.getByRole('button',{name:'Undo workbook import',exact:true}).click()
   await row.getByRole('cell',{name:'undone',exact:true}).waitFor()
   assert.deepEqual((await api(owner.context,server.origin,`scenario/${scenario}`)).inputs.schedule,[])
   await noOverflow(page,`SHEET-003 undo ${width}`);await upload.screenshot({path:join(evidence,`undo-${width}.png`)})
   console.log(`SHEET-003 ${width}: upload, explicit unsupported-cell report, reconciled source totals, persisted source driver, live formula totals, filtered board and journal undo passed`)
  } finally {await owner.context.close()}
 }
} finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true})}
