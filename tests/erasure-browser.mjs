// ERASE-001 public API action, followed by real finance screens at desktop and phone width.
import assert from 'node:assert/strict'
import { fileRecords } from '@runeditrun/rer/modules/portability/files'
import { mkdir } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { command, freePort, start } from './browser-runtime.mjs'
import { api, session,noOverflow } from './browser-journey.mjs'
const {chromium}=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const root=process.cwd(),evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/erasure')
await mkdir(evidence,{recursive:true})
let server,browser
const nav=(page,name)=>page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name,exact:true}).click()
const card=(page,name)=>page.locator('section.card').filter({has:page.getByRole('heading',{name,exact:true})})
try {
 const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)])
 server=await start(root,port);browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const owner=await session(browser,root,server.origin,'owner',1440)
 const cmd=(op,b)=>api(owner.context,server.origin,`command/${op}`,b)
 const initial=await api(owner.context,server.origin,'state')
 const dept=await cmd('department',{name:'Customer success'})
 const line=await cmd('line',{name:'Success payroll',type:'operating-expense',payroll:true})
 const budget=initial.scenarios.find(s=>s.kind==='budget'&&s.status==='working')
 await cmd('member',{email:'engineering@dev.localhost',name:'Morgan Ellis',role:'contributor',departments:[dept.id]})
 await cmd('pay-detail',{email:'engineering@dev.localhost',granted:true})
 await cmd('position',{scenario:budget.id,department:dept.id,line:line.id,title:'Customer success lead',holder:'Morgan Ellis',annualSalary:'120000',start:'2026-01'})
 const contributor=await session(browser,root,server.origin,'engineering',1440)
 await cmd('request-submissions',{scenario:budget.id,departments:[dept.id]})
 await api(contributor.context,server.origin,'command/comment',{scenario:budget.id,department:dept.id,text:'Morgan Ellis prepared the customer success hiring plan.'})
 await api(contributor.context,server.origin,'command/submit',{scenario:budget.id,department:dept.id,note:'Morgan Ellis submitted this plan.'})
 const approved=await cmd('approve-budget',{scenario:budget.id,revision:(await api(owner.context,server.origin,`scenario/${budget.id}`)).scenario.revision})
 const snapshots=(await api(owner.context,server.origin,'state')).snapshots
 const before=new Map(await Promise.all(snapshots.map(async sn=>[sn.id,(await api(owner.context,server.origin,`snapshot/${sn.id}`)).sha256])))
 await cmd('member',{email:'engineering@dev.localhost',name:'Morgan Ellis',role:'contributor',departments:[dept.id],active:false})
 const receipt=await cmd('person-erase',{email:'engineering@dev.localhost'})
 const archive=join(evidence,'erased-installation.rer')
 await command(root,['export','--output',archive])
 let manifest
 for await(const record of fileRecords(archive)) {
  const content=JSON.stringify(record)
  assert.ok(!content.includes('Morgan Ellis'),'Erased name absent from entire native archive')
  assert.ok(!content.includes('engineering@dev.localhost'),'Erased email absent from entire native archive')
  if(record.kind==='manifest')manifest=record
 }
 assert.ok(manifest.transforms.some(transform=>transform.receiptIds.includes(receipt.receiptId)))
 assert.equal((await contributor.context.request.get(server.origin+'/api/easel/state')).status(),401)
 await contributor.context.close();await owner.context.close()
 for(const width of [1440,390]) {
  const finance=await session(browser,root,server.origin,'owner',width)
  try {
   for(const [tab,heading] of [['Cycle','Comments'],['Settings','People'],['Plan','Positions']]) {
    await nav(finance.page,tab)
    if(tab==='Plan') await finance.page.getByLabel('Scenario',{exact:true}).selectOption(approved.forecast.id)
    const scope=card(finance.page,heading)
    await scope.waitFor();await scope.scrollIntoViewIfNeeded()
    if(tab!=='Settings') await scope.getByText(receipt.pseudonym,{exact:false}).first().waitFor()
    assert.ok(!(await finance.page.locator('body').innerText()).includes('Morgan Ellis'))
    assert.ok(!(await finance.page.locator('body').innerText()).includes('engineering@dev.localhost'))
    await noOverflow(finance.page,`ERASE-001 ${tab} ${width}`)
    await scope.screenshot({path:join(evidence,`${tab.toLowerCase()}-${width}.png`)})
   }
   for(const sn of snapshots) {const current=await api(finance.context,server.origin,`snapshot/${sn.id}`);assert.equal(current.sha256,before.get(sn.id));assert.ok(!JSON.stringify(current).includes('Morgan Ellis'))}
   console.log(`ERASE-001 ${width}: submitted/commented member pseudonym, anonymous frozen plan, people removed, unchanged digests and revoked session passed`)
  }finally{await finance.context.close()}
 }
}finally{await browser?.close();await server?.close()}
