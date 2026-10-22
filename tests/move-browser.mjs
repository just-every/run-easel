import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session, settle } from './browser-journey.mjs'
import { moveFixture } from './move-fixtures.mjs'
const {chromium} = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence=resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-move')
await mkdir(evidence,{recursive:true})
const providers=(process.env.EASEL_MOVE_PROVIDERS ?? 'adaptive,planful,anaplan,runway,pigment').split(',')
for(const provider of providers) {
 const root=await fresh()
 let server,browser,finance,board
 try {
  const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);server=await start(root,port)
  browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
  finance=await session(browser,root,server.origin,'owner',1440)
  await api(finance.context,server.origin,'command/workspace',{name:'Ridgeline Studio',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
  await api(finance.context,server.origin,'command/member',{email:'board@dev.localhost',name:'Board Reader',role:'viewer',departments:[]})
  board=await session(browser,root,server.origin,'board',1440)
  const fixture=await moveFixture(provider)
  const recipe={provider,files:fixture.files.map(({text,base64,...meta})=>meta),options:fixture.options,mapping:fixture.mapping}
  const recipePath=join(root,`synthetic-easel-${provider}-mapping.json`);await writeFile(recipePath,JSON.stringify(recipe))
  const paths=[]
  for(const file of fixture.files){const path=join(root,file.name);await writeFile(path,Buffer.from(file.base64,'base64'));paths.push(path)}
  for(const width of [1440,390]) {
   for(const s of [finance,board])await s.page.setViewportSize({width,height:1000})
   await finance.page.reload();await finance.page.getByRole('navigation',{name:'Easel'}).waitFor()
   await finance.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Actuals',exact:true}).click();await settle(finance.page)
   const panel=finance.page.locator('section.card').filter({has:finance.page.getByRole('heading',{name:'Move in an existing planning model',exact:true})})
   await panel.getByLabel('Planning export provider',{exact:true}).selectOption(provider)
   await panel.getByLabel('Original planning exports',{exact:true}).setInputFiles(paths)
   await panel.getByLabel('Buyer mapping JSON',{exact:true}).setInputFiles(recipePath)
   const reviewed=finance.page.waitForResponse(r=>r.url().endsWith('/import/incumbent/preview'))
   await panel.getByRole('button',{name:'Preview planning model',exact:true}).click()
   const response=await reviewed;assert.equal(response.status(),200,await response.text());const preview=await response.json();assert.equal(preview.ready,true)
   await panel.getByRole('button',{name:'Accept reviewed planning model',exact:true}).waitFor();await settle(finance.page)
   await noOverflow(finance.page,`${provider} preview ${width}`)
   await panel.screenshot({path:join(evidence,`${provider}-preview-${width}.png`)})
   const accepted=finance.page.waitForResponse(r=>r.url().endsWith('/import/incumbent/commit'))
   await panel.getByRole('button',{name:'Accept reviewed planning model',exact:true}).click();const acceptedResponse=await accepted;assert.equal(acceptedResponse.status(),200,await acceptedResponse.text());const imported=await acceptedResponse.json();assert.equal(imported.import.status,'imported');await settle(finance.page)
   await panel.getByRole('button',{name:'Undo model import',exact:true}).waitFor()
   await panel.screenshot({path:join(evidence,`${provider}-accepted-${width}.png`)})
   await finance.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Plan',exact:true}).click();await settle(finance.page)
   await finance.page.getByLabel('Scenario',{exact:true}).selectOption(imported.import.scenarios[0]);await settle(finance.page)
   const people=finance.page.locator('section.card').filter({has:finance.page.getByRole('heading',{name:'Positions',exact:true})})
   await people.getByText('To be hired',{exact:false}).first().waitFor()
   const native=await api(finance.context,server.origin,`scenario/${imported.import.scenarios[0]}`)
   assert.equal(native.inputs.position.length,5);assert.equal(native.inputs.position.filter(p=>!p.holder).length,2)
   await noOverflow(finance.page,`${provider} native plan ${width}`);await people.screenshot({path:join(evidence,`${provider}-positions-${width}.png`)})
   await board.page.reload();await board.page.getByRole('navigation',{name:'Easel'}).waitFor();await board.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Plan',exact:true}).click();await settle(board.page)
   await board.page.getByLabel('Scenario',{exact:true}).selectOption(imported.import.scenarios[0]);await settle(board.page)
   for(const position of native.inputs.position.filter(p=>p.holder))assert.ok(!(await board.page.locator('body').innerText()).includes(position.holder))
   const boardView=await api(board.context,server.origin,`scenario/${imported.import.scenarios[0]}`);assert.deepEqual(boardView.inputs.position,[]);assert.deepEqual(boardView.calculation.cells.map(c=>c.amount),native.calculation.cells.map(c=>c.amount))
   await noOverflow(board.page,`${provider} viewer ${width}`);await board.page.screenshot({path:join(evidence,`${provider}-viewer-${width}.png`),fullPage:true})
   await finance.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Actuals',exact:true}).click();await settle(finance.page)
   const undone=finance.page.waitForResponse(r=>r.url().endsWith('/import/incumbent/undo'))
   await panel.getByRole('button',{name:'Undo model import',exact:true}).click();const undoResponse=await undone;assert.equal(undoResponse.status(),200,await undoResponse.text());assert.equal((await undoResponse.json()).import.status,'undone');await settle(finance.page)
   await noOverflow(finance.page,`${provider} undone ${width}`);await panel.screenshot({path:join(evidence,`${provider}-undone-${width}.png`)})
   console.log(`${provider} ${width}: original-file preview, reconciliation, five native positions, two to hire, viewer filtering and undo passed`)
  }
 } catch(error) {if(finance?.page&&!finance.page.isClosed())await finance.page.screenshot({path:join(evidence,`${provider}-failed.png`),fullPage:true}).catch(()=>{});throw error}
 finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true})}
}
