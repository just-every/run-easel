// US-001: real first-run defaults and the date/currency surfaces they feed.
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { exportFixture } from './export-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/us-defaults')
await mkdir(evidence,{recursive:true})
const root=await mkdtemp(join(tmpdir(),'easel-us-defaults-'))
const excluded=new Set(['.git','node_modules','.rer','.seed','.wrangler','.cache','.tanstack','dist','.output','exports','test-results'])
for(const name of await readdir(process.cwd())) {
 if(excluded.has(name)||name.startsWith('.dev.vars')||name.startsWith('.env')||name.endsWith('.tsbuildinfo'))continue
 await cp(join(process.cwd(),name),join(root,name),{recursive:true})
}
const browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
let server,finance
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
const settle=page=>page.waitForLoadState('networkidle')
const shoot=async(page,name)=>{await settle(page);await noOverflow(page,`US-001 ${name}`);await page.screenshot({path:join(evidence,`${name}.png`),fullPage:false})}
try {
 const port=await freePort();server=await start(root,port)
 finance=await session(browser,root,server.origin,'owner',1440)
 const {page,context}=finance,call=(path,body)=>api(context,server.origin,path,body)
 await page.getByLabel('Company name',{exact:true}).fill('Ridgeline Advisory')
 assert.equal(await page.getByLabel('Reporting currency',{exact:true}).inputValue(),'USD')
 assert.equal(await page.getByLabel('Fiscal year starts in month',{exact:true}).inputValue(),'1')
 assert.equal(await page.getByLabel('Company time zone',{exact:true}).inputValue(),'America/New_York')
 assert.equal(await page.getByLabel('Language and region',{exact:true}).inputValue(),'en-US')
 assert.equal(await page.getByLabel('Date display',{exact:true}).inputValue(),'MM/DD/YYYY')
 assert.equal((await page.getByLabel('First plan month',{exact:true}).inputValue()).slice(5),'01')
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,`setup-${width}`)}
 await page.getByRole('button',{name:'Create the plan',exact:true}).click();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 let w=(await call('state')).workspace
 assert.equal(w.currency,'USD');assert.equal(w.fiscalYearStart,1);assert.equal(w.timeZone,'America/New_York');assert.equal(w.locale,'en-US')
 const h={get:path=>call(path.replace('/api/easel/','')),kit:(kit,op,body)=>call(`import/${kit}/${op}`,body),command:async(op,body)=>{
  if(op==='approve-budget') {
   const s=await call('state'),d=s.departments.find(d=>d.name==='Sales')
   await call('command/member',{email:'sales@dev.localhost',name:'Jordan Sales',role:'contributor',departments:[d.id]})
   const sales=await session(browser,root,server.origin,'sales',1440);await sales.context.close()
   await call('command/request-submissions',{scenario:body.scenario,departments:[d.id],due:'2026-02-06'})
   await call('command/comment',{scenario:body.scenario,department:d.id,text:'Review customer renewals before the February planning meeting.'})
   await call('command/submit',{scenario:body.scenario,department:d.id})
  }
  return call(`command/${op}`,body)
 }}
 const f=await exportFixture(h)
 await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  for(const name of ['Overview','Dashboards','Plan','Actuals','Budget cycle','Scenarios','Review','Settings','Activity']) {
   await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name,exact:true}).click();await settle(page)
   if(name==='Overview')assert.ok((await page.locator('main').innerText()).includes('$'))
   if(name==='Budget cycle')assert.ok((await page.getByRole('table',{name:'Department submissions',exact:true}).innerText()).includes('02/06/2026'))
   if(name==='Review')assert.ok((await page.locator('main').innerText()).includes('02/15/2026'))
   if(name==='Settings')assert.equal(await page.getByLabel('Company time zone',{exact:true}).inputValue(),'America/New_York')
   if(name==='Review'){await card(page,'Department statements').getByRole('table',{name:'Department statement amounts',exact:true}).waitFor();await shoot(page,`department-statement-${width}`);await card(page,'Review packs').scrollIntoViewIfNeeded()}
   await shoot(page,`${name.toLowerCase().replaceAll(' ','-')}-${width}`)
  }
 }
 await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Review',exact:true}).click();await settle(page)
 const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:'Download pack (HTML)',exact:true}).click()
 const file=join(evidence,'published-pack.html');await(await downloaded).saveAs(file)
 const document=await context.newPage();await document.goto(new URL(`file://${file}`).href)
 assert.ok((await document.locator('body').innerText()).includes('02/15/2026'))
 for(const width of [1440,390]){await document.setViewportSize({width,height:1000});await shoot(document,`downloaded-pack-${width}`)}
 await document.close()
 await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Actuals',exact:true}).click();await settle(page)
 const source='Date,Account,Department,Amount\n02/28/2026,400,Sales,"-$1,234.56"\n'
 await page.getByLabel('Actuals file',{exact:true}).setInputFiles({name:'US-formats.csv',mimeType:'text/csv',buffer:Buffer.from(source)})
 assert.equal(await page.getByLabel('Date format',{exact:true}).inputValue(),'MM/DD/YYYY')
 const before=await call('actuals')
 await card(page,'Upload actuals (CSV)').getByRole('button',{name:'Preview',exact:true}).click()
 await page.getByRole('button',{name:'Accept 1 rows',exact:true}).waitFor()
 assert.deepEqual(await call('actuals'),before)
 assert.ok((await card(page,'Upload actuals (CSV)').innerText()).includes('-$1,234.56'))
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await shoot(page,`us-csv-preview-${width}`)}
 await page.getByRole('button',{name:'Accept 1 rows',exact:true}).click();await settle(page)
 assert.equal((await call('actuals')).months.find(m=>m.period==='2026-02').revenue,123456)
 await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 assert.equal((await call('state')).workspace.timeZone,'America/New_York')
 await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Settings',exact:true}).click();await settle(page)
 const preferences=card(page,'Plan')
 await preferences.getByLabel('Language and region',{exact:true}).selectOption('en-GB')
 await preferences.getByLabel('Date display',{exact:true}).selectOption('DD/MM/YYYY')
 await preferences.getByLabel('Company time zone',{exact:true}).selectOption('America/Chicago')
 await preferences.getByRole('button',{name:'Save plan settings',exact:true}).click();await settle(page)
 await page.reload();await page.getByRole('navigation',{name:'Easel'}).waitFor()
 const changed=(await call('state')).workspace
 assert.equal(changed.locale,'en-GB');assert.equal(changed.dateFormat,'DD/MM/YYYY');assert.equal(changed.timeZone,'America/Chicago')
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Budget cycle',exact:true}).click();await settle(page);assert.ok((await page.getByRole('table',{name:'Department submissions',exact:true}).innerText()).includes('06/02/2026'));await shoot(page,`changed-date-display-${width}`);await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Settings',exact:true}).click();await settle(page);await shoot(page,`changed-preferences-${width}`)}
 console.log('US-001: native default setup, persistent USD/US dates/company zone, every date/currency screen at 1440/390, choice-free US file preview/commit passed')
} catch(error){await finance?.page.screenshot({path:join(evidence,'failed.png'),fullPage:true}).catch(()=>{});throw error}
finally {await finance?.context.close();await browser.close();await server?.close();await rm(root,{recursive:true,force:true})}
