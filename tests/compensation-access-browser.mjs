// PEOPLE-005: native owner/analyst/head/viewer sessions, rendered grant and plan doors.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session, noOverflow } from './browser-journey.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/compensation-access')
await mkdir(evidence, { recursive: true })
let server, browser
const card = (page, name) => page.locator('section.card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const shot = async (page, scope, name) => { await scope.scrollIntoViewIfNeeded(); await noOverflow(page, `PEOPLE-005 ${name}`); await scope.screenshot({ path: join(evidence, `${name}.png`) }) }
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless:true, args:['--use-mock-keychain','--password-store=basic'] })
 const owner = await session(browser,root,server.origin,'owner',1440)
 const cmd = (op,b) => api(owner.context,server.origin,`command/${op}`,b)
 await cmd('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const sales=await cmd('department',{name:'Sales'}),eng=await cmd('department',{name:'Engineering'})
 const payroll=await cmd('line',{name:'Payroll',type:'operating-expense',payroll:true})
 const budget=(await api(owner.context,server.origin,'state')).scenarios[0]
 await cmd('position',{scenario:budget.id,title:'Sales director',holder:'Jordan Reeves',line:payroll.id,department:sales.id,start:'2026-01',annualSalary:'173421',onCostPercent:'12'})
 for (const [email,role,departments] of [['finance@dev.localhost','finance',[]],['sales@dev.localhost','contributor',[sales.id]],['board@dev.localhost','viewer',[]]]) await cmd('member',{email,name:email.split('@')[0],role,departments})
 for (const as of ['finance','sales','board']) { const native=await session(browser,root,server.origin,as,1440); await native.context.close() }
 await owner.context.close()
 for (const width of [1440,390]) {
  const finance=await session(browser,root,server.origin,'owner',width)
  await nav(finance.page,'Settings')
  const people=card(finance.page,'People')
  const row=email=>people.getByRole('row').filter({has:finance.page.getByRole('cell',{name:email,exact:true})})
  await shot(finance.page,people,`owner-grants-${width}`)
  for (const as of ['finance','sales']) {
   const reader=await session(browser,root,server.origin,as,width)
   try {
    await nav(reader.page,'Plan')
    await card(reader.page,'Positions').getByText('Individual positions and pay require', {exact:false}).waitFor()
    assert.ok(!(await reader.page.locator('body').innerText()).includes('Jordan Reeves'))
    await shot(reader.page,card(reader.page,'Positions'),`${as}-restricted-${width}`)
    if(as==='finance') {
     await nav(reader.page,'Settings')
     assert.equal(await reader.page.getByRole('button',{name:/Grant pay detail/}).count(),0)
     assert.equal((await reader.context.request.get(server.origin+'/api/easel/export')).status(),403)
    }
    await row(`${as}@dev.localhost`).getByRole('button',{name:'Grant pay detail',exact:true}).click()
    await row(`${as}@dev.localhost`).getByRole('button',{name:'Revoke pay detail',exact:true}).waitFor()
    await reader.page.reload(); await nav(reader.page,'Plan')
    await card(reader.page,'Positions').getByRole('cell',{name:'Jordan Reeves',exact:true}).waitFor()
    await shot(reader.page,card(reader.page,'Positions'),`${as}-granted-${width}`)
    await row(`${as}@dev.localhost`).getByRole('button',{name:'Revoke pay detail',exact:true}).click()
    await row(`${as}@dev.localhost`).getByRole('button',{name:'Grant pay detail',exact:true}).waitFor()
    await reader.page.reload(); await nav(reader.page,'Plan')
    await card(reader.page,'Positions').getByText('Individual positions and pay require',{exact:false}).waitFor()
   } finally { await reader.context.close() }
  }
  await shot(finance.page,people,`owner-revoked-${width}`)
  await nav(finance.page,'Plan')
  await card(finance.page,'Positions').getByRole('cell',{name:'Jordan Reeves',exact:true}).waitFor()
  await shot(finance.page,card(finance.page,'Positions'),`owner-plan-${width}`)
  await finance.context.close()
  const viewer=await session(browser,root,server.origin,'board',width)
  try { await nav(viewer.page,'Overview'); await noOverflow(viewer.page,`PEOPLE-005 viewer ${width}`); assert.ok(!(await viewer.page.locator('body').innerText()).includes('Jordan Reeves')); await shot(viewer.page,card(viewer.page,'Profit and loss'),`viewer-totals-${width}`) } finally { await viewer.context.close() }
  console.log(`PEOPLE-005 ${width}: owner grants, finance/head restricted→granted→revoked, owner detail, viewer totals passed`)
 }
} finally { await browser?.close(); await server?.close(); if(!existing) await rm(root,{recursive:true,force:true}) }
