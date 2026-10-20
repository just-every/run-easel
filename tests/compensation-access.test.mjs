import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'

// The Excel/Sheets client uses the same authenticated public workbook pull as the app.
const workbookText = async (h, path, cookie) => {
 const response = await h.mf.dispatchFetch(h.origin + path, { headers: { cookie } })
 assert.equal(response.status, 200)
 const zip = await JSZip.loadAsync(await response.arrayBuffer())
 return (await Promise.all(Object.values(zip.files).filter(f => !f.dir).map(f => f.async('string')))).join('\n')
}
const privateName = 'Salary Sentinel'; const annual = '17342100'
const safe = value => { const text = typeof value === 'string' ? value : JSON.stringify(value); assert.ok(!text.includes(privateName), 'Individual identity stays private'); assert.ok(!text.includes(annual), 'Annual salary stays private') }

test('PEOPLE-005 separate owner pay grants filter plans, frozen reads, Excel pulls, tokens, MCP and REPORT-005 dispatch immediately', async t => {
 const h = await harness({ mailResponse: message => message.subject.includes('Monthly statement') && message.to.includes('granted@example.test') ? Response.json({error:'refused'}, {status:400}) : Response.json({id:crypto.randomUUID()}) }); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', planStart: '2026-01', fiscalYearStart: 1 })
 const sales = await h.command('department', { name: 'Sales' }), eng = await h.command('department', { name: 'Engineering' })
 const payroll = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('position', { scenario: budget.id, department: sales.id, line: payroll.id, title: 'Sales director', holder: privateName, annualSalary: '173421', start: '2026-01', payDay:'15', payMonthOffset:'1' })
 await h.command('position', { scenario: budget.id, department: eng.id, line: payroll.id, title: 'Engineer', holder: 'Other private employee', annualSalary: '998877', start: '2026-01' })
 const analyst = await h.person('analyst@example.test', 'finance', [], false)
 const head = await h.person('head@example.test', 'contributor', [sales.id], false)
 const viewer = await h.person('viewer@example.test', 'viewer', [], false)
 const grantedHead = await h.person('granted@example.test', 'contributor', [sales.id])
 for (const cookie of [analyst, head, viewer]) {
  const view = await h.get(`/api/easel/scenario/${budget.id}`, cookie); safe(view); assert.equal(view.inputs.position.length, 0)
  assert.equal(view.calculation.cells.find(c => c.department === sales.id && c.month === '2026-01').amount, 1445175)
  safe(await workbookText(h, `/api/easel/scenario/${budget.id}/document.xlsx`, cookie))
  safe(await h.get(`/api/easel/scenario/${budget.id}/document.csv`, cookie))
  safe(await h.get('/api/easel/state', cookie))
 }
 await h.get('/api/easel/export', analyst, 403); await h.get('/api/easel/activity', analyst, 403)
 await h.command('pay-detail', { email:'head@example.test',granted:true }, analyst, 403)
 await h.command('pay-detail', { email:'viewer@example.test',granted:true }, h.owner, 409)
 await h.command('position', { scenario:budget.id, department:sales.id,line:payroll.id,title:'No grant',annualSalary:'123',start:'2026-01' }, analyst, 403)
 await h.command('line', {id:payroll.id,name:payroll.name,type:payroll.type,payroll:false}, analyst, 403)
 const privateSchedule=await h.command('schedule',{scenario:budget.id,department:sales.id,line:payroll.id,name:privateName,values:{'2026-02':'1'}})
 const publicLine=await h.command('line',{name:'Software',type:'operating-expense'})
 await h.command('schedule',{scenario:budget.id,id:privateSchedule.id,department:sales.id,line:publicLine.id,name:'Moved schedule',values:{'2026-02':'1'}},analyst,403)
 const granted = await h.get(`/api/easel/scenario/${budget.id}`, grantedHead)
 assert.equal(granted.inputs.position.length, 1); assert.equal(granted.inputs.position[0].holder, privateName); assert.ok(!JSON.stringify(granted).includes('Other private employee'))
 await h.stepUp(analyst)
 const token = (await h.send('/api/easel/tokens/issue', { label:'Excel client',kind:'personal',scope:'read' }, analyst)).value
 assert.ok(token.token)
 const tokenRead = async () => {
  const response = await h.mf.dispatchFetch(h.origin + `/api/easel/scenario/${budget.id}`, {headers:{authorization:`Bearer ${token.token}`}})
  assert.equal(response.status,200); return response.json()
 }
 safe(await tokenRead())
 await h.command('pay-detail', { email:'analyst@example.test',granted:true })
 assert.equal((await h.get(`/api/easel/scenario/${budget.id}`, analyst)).inputs.position.length, 2)
 safe(await tokenRead()) // old credentials cannot acquire later permission
 await h.stepUp(analyst)
 const payToken = (await h.send('/api/easel/tokens/issue', { label:'Pay client',kind:'service',scope:'read' }, analyst)).value
 await h.command('pay-detail', { email:'analyst@example.test',granted:false })
 const revoked = await h.mf.dispatchFetch(h.origin + `/api/easel/scenario/${budget.id}`, {headers:{authorization:`Bearer ${payToken.token}`}})
 safe(await revoked.json())
 const rpc = await h.send('/api/easel/mcp', {jsonrpc:'2.0', id:1,method:'tools/call',params:{name:'scenario',arguments:{scenario:budget.id}}}, analyst)
 assert.equal(rpc.status,200); safe(rpc.value)
 const approved = await h.command('approve-budget', {scenario:budget.id,revision:(await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision})
 const approval = (await h.get('/api/easel/state')).snapshots.find(sn=>sn.kind==='approval')
 for (const cookie of [analyst, head, viewer]) safe(await h.get(`/api/easel/snapshot/${approval.id}`,cookie))
 await h.command('account-map',{account:'5000',target:payroll.id}); await h.command('department-map',{source:'Sales',department:sales.id})
 const input={filename:'payroll.csv',csv:`Date,Account,Department,Amount,Description\n2026-01-31,5000,Sales,14000.00,${privateName}\n`,columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',description:'Description'},amountMode:'debit-positive',dateFormat:'YYYY-MM-DD'}
 const preview=await h.kit('actuals','preview',input); await h.kit('actuals','commit',{...input,fingerprint:preview.fingerprint})
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const statement=(await h.get('/api/easel/department-statements',head)).find(s=>s.department===sales.id)
 for (const cookie of [analyst,head]) { const view=await h.get(`/api/easel/department-statements/${statement.id}`,cookie); safe(view); assert.equal(view.rows[0].actual,1400000); assert.equal(view.rows[0].citations.length,0); safe(await workbookText(h,`/api/easel/department-statements/${statement.id}/document.xlsx`,cookie)) }
 const emails=h.messages.filter(m=>m.subject.includes('Monthly statement'))
 safe(emails.find(m=>m.to.includes('head@example.test')).text)
 assert.ok(emails.find(m=>m.to.includes('granted@example.test')).text.includes(privateName))
 await h.command('pay-detail',{email:'granted@example.test',granted:false})
 safe(await h.get(`/api/easel/department-statements/${statement.id}`,grantedHead))
 const count=h.messages.length
 await h.command('department-statement-retry',{id:statement.id})
 assert.equal(h.messages.length,count,'Changed pay audience cannot resend a stored sensitive body')
 const blocked=await h.get(`/api/easel/department-statements/${statement.id}`)
 assert.equal(blocked.deliveries.find(d=>d.recipient==='granted@example.test').status,'blocked')
 safe(await h.get('/api/easel/variance/2026-01',head))
 const pack=await h.command('pack-create',{month:'2026-01',title:'January review'})
 const published=await h.command('pack-publish',{pack:pack.id})
 for (const ext of ['html','csv']) safe(await h.get(`/api/easel/pack/${pack.id}/document.${ext}`,viewer))
 safe(await workbookText(h,`/api/easel/pack/${pack.id}/document.xlsx`,viewer))
 assert.ok(published.snapshot)
})
