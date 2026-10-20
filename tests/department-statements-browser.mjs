// REPORT-005 close, department statement, explanation confirmation and email state.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium }=await import(process.env.EASEL_PLAYWRIGHT_MODULE??'@playwright/test')
const existing=process.argv.includes('--existing'),root=existing?process.cwd():await fresh(),evidence=resolve(process.env.EASEL_EVIDENCE??'.cache/department-statements')
await mkdir(evidence,{recursive:true})
const settle=page=>page.waitForLoadState('networkidle',{timeout:15000})
const saved=async(page,operation,click)=>{const response=page.waitForResponse(r=>r.url().endsWith(`/api/easel/command/${operation}`)&&r.request().method()==='POST');await click();assert.equal((await response).status(),200);await settle(page)}
let server,browser
try {
 const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)])
 server=await start(root,port)
 browser=await chromium.launch({headless:true,...(process.env.EASEL_CHROMIUM_PATH?{executablePath:process.env.EASEL_CHROMIUM_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']})
 const owner=await session(browser,root,server.origin,'owner',1440),cmd=(op,b)=>api(owner.context,server.origin,`command/${op}`,b)
 await cmd('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const eng=await cmd('department',{name:'Engineering'}),sales=await cmd('department',{name:'Sales'})
 const line=await cmd('line',{name:'Cloud and software',type:'operating-expense'})
 for(const [as,role,departments]of[['engineering','contributor',[eng.id]],['sales','contributor',[sales.id]],['board','viewer',[]]]) {
  await cmd('member',{email:`${as}@dev.localhost`,name:as,role,departments})
  const native=await session(browser,root,server.origin,as,1440);await native.context.close()
 }
 const budget=(await api(owner.context,server.origin,'state')).scenarios[0]
 for(const [department,amount]of[[eng.id,'10000'],[sales.id,'20000']])await cmd('expense',{scenario:budget.id,name:department===eng.id?'Engineering hosting':'Private sales campaign',kind:'recurring',line:line.id,department,start:'2026-01',amount})
 const bv=await api(owner.context,server.origin,`scenario/${budget.id}`)
 await cmd('approve-budget',{scenario:budget.id,revision:bv.scenario.revision})
 await cmd('metric-rule-save',{kind:'overspend',name:'Review engineering hosting',department:eng.id,owner:'engineering@dev.localhost',percent:'10',amount:'0',dueDays:3})
 await cmd('account-map',{account:'500',target:line.id})
 for(const d of[eng,sales])await cmd('department-map',{source:d.name,department:d.id})
 const body={filename:'january.csv',csv:'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,13000,Engineering accepted invoice\n2026-01-31,500,Sales,26000,Private sales supplier\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',description:'Description'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 const preview=await api(owner.context,server.origin,'import/actuals/preview',body)
 await api(owner.context,server.origin,'import/actuals/commit',{...body,fingerprint:preview.fingerprint})
 await owner.page.reload()
 await owner.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Review',exact:true}).click()
 await owner.page.getByRole('button',{name:'Close Jan 2026',exact:true}).click()
 await owner.page.getByRole('heading',{name:'Department statements',exact:true}).waitFor()
 const record=(await api(owner.context,server.origin,'department-statements')).find(s=>s.department===eng.id)
 assert.ok(record)
 const money=n=>`${n<0?'-':''}$${(Math.abs(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
 for(const width of[1440,390]) {
  await owner.page.setViewportSize({width,height:1000})
  await cmd('pack-create',{month:'2026-01'})
  await owner.page.reload()
  await owner.page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Review',exact:true}).click()
  const draft=owner.page.locator('.pack').filter({has:owner.page.getByRole('button',{name:'Publish pack',exact:true})})
  const actionText=`Review engineering capacity ${width}`
  await draft.getByLabel('Decision or action',{exact:true}).fill(actionText)
  await draft.getByLabel('Owner',{exact:true}).fill('engineering@dev.localhost')
  await draft.getByLabel('Due',{exact:true}).fill('2026-02-10')
  await draft.getByLabel('Department',{exact:true}).selectOption('')
  await settle(owner.page)
  await noOverflow(owner.page,`REPORT-005 action form ${width}`)
  await draft.locator('form').screenshot({path:join(evidence,`action-form-${width}.png`)})
  await saved(owner.page,'pack-decision',()=>draft.getByRole('button',{name:'Record decision',exact:true}).click())
  await draft.getByLabel('Decision or action',{exact:true}).fill(`Private sales action ${width}`)
  await draft.getByLabel('Department',{exact:true}).selectOption(sales.id)
  await draft.getByLabel('Owner',{exact:true}).fill('sales@dev.localhost')
  await draft.getByLabel('Due',{exact:true}).fill('2026-02-10')
  await saved(owner.page,'pack-decision',()=>draft.getByRole('button',{name:'Record decision',exact:true}).click())
  await saved(owner.page,'pack-publish',()=>draft.getByRole('button',{name:'Publish pack',exact:true}).click())
  const publishedState=await api(owner.context,server.origin,'state'),latestPack=publishedState.packs.find(p=>p.decisions.some(d=>d.text===actionText))
  assert.ok(latestPack.decisions.some(d=>d.text===`Private sales action ${width}`&&d.department===sales.id))
  const published=owner.page.locator('.pack').filter({hasText:actionText})
  await published.getByText('This unclassified action stays in the company pack and stays out of department statements until finance assigns a department.',{exact:true}).waitFor()
  await published.screenshot({path:join(evidence,`unclassified-action-${width}.png`)})
  const assignment=published.locator('form').filter({has:owner.page.getByLabel(`Department for action: ${actionText}`,{exact:true})})
  await assignment.getByLabel(`Department for action: ${actionText}`,{exact:true}).selectOption(eng.id)
  await saved(owner.page,'pack-action-department',()=>assignment.getByRole('button',{name:'Save action department',exact:true}).click())
  const classified=await api(owner.context,server.origin,'state'),classifiedPack=classified.packs.find(p=>p.decisions.some(d=>d.text===actionText)),classifiedDecision=classifiedPack.decisions.find(d=>d.text===actionText)
  assert.ok(classified.actionDepartments.some(a=>a.pack===classifiedPack.id&&a.decision===classifiedDecision.id&&a.department===eng.id))
  await noOverflow(owner.page,`REPORT-005 action assignment ${width}`)
  await published.screenshot({path:join(evidence,`classified-action-${width}.png`)})
  await cmd('explanation',{month:'2026-01',line:line.id,department:eng.id,text:`Capacity expansion review ${width}`})
  for(const as of['engineering','owner']) {
   const reader=await session(browser,root,server.origin,as,width),page=reader.page
   try {
    await page.goto(`${server.origin}/app?departmentStatement=${record.id}`)
    await page.getByRole('navigation',{name:'Easel'}).getByRole('button',{name:'Review',exact:true}).waitFor({state:'visible'})
    const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Department statements',exact:true})})
    await section.getByRole('table',{name:'Department statement amounts',exact:true}).waitFor()
    await section.getByLabel('Department statement',{exact:true}).selectOption(record.id)
    const v=await api(reader.context,server.origin,`department-statements/${record.id}`)
    const values=await section.getByRole('table',{name:'Department statement amounts',exact:true}).getByRole('row').nth(1).getByRole('cell').allInnerTexts()
    assert.deepEqual(values,[money(v.rows[0].actual),money(v.rows[0].budget),money(v.rows[0].variance)])
    if(as==='engineering')assert.doesNotMatch(await section.innerText(),/Private sales|Sales|sales@dev.localhost/)
    const source=section.locator('details').first()
    if(await source.getAttribute('open')===null)await source.locator('summary').click()
    assert.ok((await source.innerText()).includes('Engineering accepted invoice'))
    assert.ok((await section.innerText()).includes('Review engineering hosting'))
    await settle(page)
    await noOverflow(page,`REPORT-005 ${as} ${width}`)
    await section.screenshot({path:join(evidence,`department-${as}-${width}.png`)})
    for(const region of await section.getByRole('region').all())await region.evaluate(el=>{el.scrollLeft=el.scrollWidth})
    await section.screenshot({path:join(evidence,`department-final-${as}-${width}.png`)})
    if(as==='engineering') {
     await section.getByLabel('Statement explanation for Cloud and software · Engineering',{exact:true}).fill(`Additional engineering capacity ${width}`)
     await saved(page,'explanation',()=>section.getByRole('button',{name:'Save explanation',exact:true}).click())
     await saved(page,'explanation-confirm',()=>section.getByRole('button',{name:'Confirm explanation',exact:true}).click())
     await section.getByText('No explanations need confirmation.',{exact:true}).waitFor()
     assert.equal((await api(reader.context,server.origin,`department-statements/${record.id}`)).rows[0].explanation.status,'confirmed')
     await section.screenshot({path:join(evidence,`confirmed-${width}.png`)})
    } else {
     const before=v.deliveries[0].attempts
     await saved(page,'department-statement-retry',()=>section.getByRole('button',{name:'Retry pending email',exact:true}).click())
     const after=await api(reader.context,server.origin,`department-statements/${record.id}`)
     assert.ok(after.deliveries[0].attempts>before);assert.equal(after.deliveries[0].status,'suppressed')
     await section.getByText('Email suppressed in local development',{exact:true}).waitFor()
     assert.ok((await section.innerText()).includes('Email suppressed in local development'))
     await section.screenshot({path:join(evidence,`email-status-${width}.png`)})
    }
    const [download]=await Promise.all([page.waitForEvent('download'),section.getByRole('link',{name:'Download department statement (Excel)',exact:true}).click()])
    assert.equal(await download.failure(),null)
    const book=await readWorkbook(await readFile(await download.path()));proveFormulas(book)
    assert.doesNotMatch(JSON.stringify(book.model),/Private sales|sales@dev.localhost|Sales/)
    await noOverflow(page,`REPORT-005 end state ${as} ${width}`)
    console.log(`REPORT-005 ${as} ${width}: deep link, department amounts/sources/tasks, explanation, Excel and honest mail status passed`)
   } finally {await reader.context.close()}
  }
 }
 const board=await session(browser,root,server.origin,'board',390)
 await board.page.goto(`${server.origin}/app?departmentStatement=${record.id}`)
 assert.equal(await board.page.getByRole('heading',{name:'Department statements',exact:true}).count(),0)
 await board.context.close();await owner.context.close()
} catch(error) {console.error(error);throw error} finally {await browser?.close();await server?.close();if(!existing)await rm(root,{recursive:true,force:true})}
