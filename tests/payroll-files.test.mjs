import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { harness } from './harness.mjs'

test('PEOPLE-007 CSV roster and XLSX payroll register keep provider mappings, reconcile positions and ledger, filter pay and undo exact journal effects', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const engineering=await h.command('department',{name:'Engineering'}),sales=await h.command('department',{name:'Sales'})
 const payroll=await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true})
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const create=(title,salary,department=engineering.id)=>h.command('position',{scenario,title,holder:`Private ${title}`,line:payroll.id,department,annualSalary:String(salary),start:'2026-01'})
 const alice=await create('Engineer',120000),bob=await create('Designer',96000),vacancy=await create('Open engineer',84000)
 await create('Sales lead',180000,sales.id)
 const board=await h.person('board@example.test','viewer'), analyst=await h.person('analyst@example.test','finance',[],false)
 const head=await h.person('head@example.test','contributor',[engineering.id]),salesHead=await h.person('sales@example.test','contributor',[sales.id])
 const query=cookie=>h.get(`/api/easel/payroll/${scenario}`,cookie)
 const roster={kind:'roster',provider:'Justworks',scenario,asOf:'2026-01-31',filename:'justworks-roster.csv',csv:'Worker,Full name,Team,Job,Tax,Annual,Hourly,Hired,Left\nA,Private Alice,Engineering,Engineer,W-2,120000,,01/01/2025,\nB,Private Bob,Engineering,Designer,W-2,108000,,01/15/2026,\nC,Private Carol,Engineering,Analyst,1099,72000,,01/01/2026,\n',dateFormat:'MM/DD/YYYY',columns:{employeeId:'Worker',name:'Full name',department:'Team',title:'Job',employmentType:'Tax',salary:'Annual',hourlyRate:'Hourly',start:'Hired',termination:'Left'},departmentMap:{Engineering:engineering.id},positionMap:{A:alice.originId,B:bob.originId}}
 const before=await query(),activity=await h.get('/api/easel/activity')
 const preview=await h.kit('payroll','preview',roster)
 assert.deepEqual(await query(),before,'Preview leaves the public read model unchanged')
 assert.deepEqual(await h.get('/api/easel/activity'),activity,'Preview appends no Activity')
 assert.deepEqual(Object.fromEntries(Object.entries(preview.reconciliation).map(([key,rows])=>[key,rows.length])),{matched:1,unplanned:1,changedSalary:1,plannedNotHired:2})
 assert.equal(preview.rows[0].row,2);assert.equal(preview.rows[0].start,'2025-01-01')
 assert.equal(preview.reconciliation.changedSalary[0].plannedSalaryCents,9600000)
 await h.kit('payroll','preview',roster,board,403)
 await h.kit('payroll','preview',roster,analyst,403)
 await h.kit('payroll','preview',roster,head,403)
 await h.kit('payroll','commit',{...roster,fingerprint:'stale'},h.owner,409)
 assert.deepEqual(await query(),before)
 // A changed planned salary invalidates the reviewed matching result.
 await h.command('position',{scenario,id:alice.id,title:'Engineer',holder:'Private Engineer',line:payroll.id,department:engineering.id,annualSalary:'121000',start:'2026-01'})
 await h.kit('payroll','commit',{...roster,fingerprint:preview.fingerprint},h.owner,409)
 await h.command('position',{scenario,id:alice.id,title:'Engineer',holder:'Private Engineer',line:payroll.id,department:engineering.id,annualSalary:'120000',start:'2026-01'})
 const accepted=await h.kit('payroll','commit',{...roster,fingerprint:(await h.kit('payroll','preview',roster)).fingerprint})
 assert.equal(accepted.import.status,'imported')
 let view=await query()
 assert.deepEqual(view.counts,{matched:1,unplanned:1,changedSalary:1,plannedNotHired:2})
 assert.equal(view.buckets.plannedNotHired.find(p=>p.id===vacancy.id).title,'Open engineer')
 assert.equal(view.departments.find(d=>d.department===engineering.id).headcount,3)
 // Reuse exact saved provider mapping, date convention and explicit position links.
 const next={kind:'roster',provider:'Justworks',scenario,asOf:'2026-02-28',filename:'justworks-february.csv',csv:roster.csv.replace('01/15/2026','02/15/2026')}
 const nextPreview=await h.kit('payroll','preview',next)
 assert.equal(nextPreview.rows[1].start,'2026-02-15');assert.equal(nextPreview.rows[0].positionOrigin,alice.originId)
 assert.equal(nextPreview.reconciliation.matched.length,1)
 const nextImport=await h.kit('payroll','commit',{...next,fingerprint:nextPreview.fingerprint})
 assert.equal((await query()).roster[1].start,'2026-02-15')
 await h.kit('payroll','undo',{id:nextImport.import.id})
 assert.equal((await query()).roster.find(r=>r.employeeId==='B').start,'2026-01-15','Undo restores the prior observation without copying or editing it')
 // Register has real .xlsx dates and all four cost components.
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Register')
 sheet.addRow(['Worker','Team','Paid','Gross','Taxes','Benefits','Fees'])
 sheet.addRow(['A','Engineering',new Date('2026-01-31T00:00:00Z'),10000,765,1000,50])
 sheet.addRow(['B','Engineering',new Date('2026-01-31T00:00:00Z'),9000,688.50,800,50])
 sheet.addRow(['C','Engineering',new Date('2026-01-31T00:00:00Z'),6000,459,600,50])
 const bytes=Buffer.from(await book.xlsx.writeBuffer())
 const register={kind:'register',provider:'Justworks',scenario,line:payroll.id,filename:'january-register.xlsx',base64:bytes.toString('base64'),sheet:'Register',columns:{employeeId:'Worker',department:'Team',payDate:'Paid',grossWages:'Gross',employerTaxes:'Taxes',benefits:'Benefits',fees:'Fees'},departmentMap:{Engineering:engineering.id}}
 const registerPreview=await h.kit('payroll','preview',register)
 assert.equal(registerPreview.totalCents,2946250)
 assert.equal(registerPreview.rows[0].payDate,'2026-01-31')
 assert.equal((await query()).runs.length,0)
 const imported=await h.kit('payroll','commit',{...register,fingerprint:registerPreview.fingerprint})
 assert.equal((await query()).reconciliation[0].status,'missing-ledger')
 await h.command('account-map',{account:'5000',target:payroll.id});await h.command('department-map',{source:'Engineering',department:engineering.id})
 const gl={filename:'ledger.csv',csv:'Date,Account,Department,Amount\n2026-01-31,5000,Engineering,29462.00\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 await h.kit('actuals','commit',{...gl,fingerprint:(await h.kit('actuals','preview',gl)).fingerprint})
 assert.equal((await query()).reconciliation[0].differenceCents,50)
 assert.equal((await query()).reconciliation[0].status,'difference')
 const correction={...gl,filename:'payroll-correction.csv',csv:'Date,Account,Department,Amount\n2026-01-31,5000,Engineering,0.50\n'}
 await h.kit('actuals','commit',{...correction,fingerprint:(await h.kit('actuals','preview',correction)).fingerprint})
 view=await query()
 assert.deepEqual(view.reconciliation.map(r=>[r.month,r.totalCents,r.ledgerCents,r.differenceCents,r.status]),[['2026-01',2946250,2946250,0,'reconciled']])
 assert.equal(view.reconciliation[0].grossWagesCents,2500000)
 assert.equal(view.reconciliation[0].employerTaxesCents,191250)
 assert.equal(view.reconciliation[0].benefitsCents,240000)
 assert.equal(view.reconciliation[0].feesCents,15000)
 const safe=result=>{const body=JSON.stringify(result);assert.doesNotMatch(body,/Private Alice|Private Bob|Private Carol|12000000|10800000/);assert.deepEqual(result.roster,[]);assert.deepEqual(result.runs,[]);assert.equal(result.reconciliation[0].totalCents,2946250);assert.equal(result.departments.find(d=>d.department===engineering.id).headcount,3)}
 for(const cookie of[board,analyst,salesHead])safe(await query(cookie))
 assert.equal((await query(head)).roster.length,3)
 await h.command('pay-detail',{email:'head@example.test',granted:false})
 safe(await query(head))
 // Masked grants also hold for the API-token door.
 await h.stepUp(analyst)
 const token=(await h.send('/api/easel/tokens/issue',{label:'Payroll totals',kind:'personal',scope:'read'},analyst)).value.token
 const tokenView=await h.mf.dispatchFetch(h.origin+`/api/easel/payroll/${scenario}`,{headers:{authorization:`Bearer ${token}`}})
 assert.equal(tokenView.status,200);safe(await tokenView.json())
 // Saved register mapping needs no choices on the next pay run.
 sheet.getCell('C2').value=new Date('2026-02-15T00:00:00Z');sheet.getCell('C3').value=new Date('2026-02-15T00:00:00Z');sheet.getCell('C4').value=new Date('2026-02-15T00:00:00Z')
 const following={kind:'register',provider:'Justworks',scenario,filename:'february-register.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')}
 assert.equal((await h.kit('payroll','preview',following)).rows[0].payDate,'2026-02-15')
 // Both file formats work for both kinds, retaining the same mapping.
 const csvRegister={kind:'register',provider:'Justworks',scenario,filename:'march-register.csv',csv:'Worker,Team,Paid,Gross,Taxes,Benefits,Fees\nA,Engineering,2026-03-15,10000,765,1000,50\n'}
 const csvPreview=await h.kit('payroll','preview',csvRegister)
 assert.equal(csvPreview.rows[0].totalCents,1181500)
 const csvImport=await h.kit('payroll','commit',{...csvRegister,fingerprint:csvPreview.fingerprint})
 await h.kit('payroll','undo',{id:csvImport.import.id})
 const rosterBook=new ExcelJS.Workbook(),rosterSheet=rosterBook.addWorksheet('Roster')
 rosterSheet.addRow(['Worker','Full name','Team','Job','Tax','Annual','Hourly','Hired','Left'])
 rosterSheet.addRow(['D','Private Dana','Engineering','Contractor','1099',null,40,new Date('2026-03-01T00:00:00Z'),null])
 const xlsxRoster={kind:'roster',provider:'Justworks',scenario,asOf:'2026-03-31',filename:'march-roster.xlsx',base64:Buffer.from(await rosterBook.xlsx.writeBuffer()).toString('base64')}
 const xlsxPreview=await h.kit('payroll','preview',xlsxRoster)
 assert.equal(xlsxPreview.rows[0].hourlyRateCents,4000);assert.equal(xlsxPreview.rows[0].salaryCents,null)
 const xlsxImport=await h.kit('payroll','commit',{...xlsxRoster,fingerprint:xlsxPreview.fingerprint})
 await h.kit('payroll','undo',{id:xlsxImport.import.id})
 // Exact original bytes remain available in the complete owner export.
 const response=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}})
 assert.equal(response.status,200)
 const zip=await JSZip.loadAsync(await response.arrayBuffer()),manifest=JSON.parse(await zip.file('manifest.json').async('string'))
 const originals=await Promise.all(manifest.originals.filter(o=>o.status==='retained').map(o=>zip.file(o.path).async('nodebuffer')))
 assert.ok(originals.some(b=>b.equals(bytes)));assert.ok(originals.some(b=>b.toString()===roster.csv))
 // Invalid and duplicate inputs change no observations or totals.
 const stable=await query()
 await h.kit('payroll','commit',{...register,fingerprint:registerPreview.fingerprint},h.owner,409)
 for(const csv of[roster.csv.replace('120000','120000.001'),roster.csv.replace('01/01/2025','02/30/2025'),roster.csv.replace(',W-2,',',W2,'),roster.csv+'A,Duplicate,Engineering,Engineer,W-2,120000,,01/01/2025,\n'])await h.kit('payroll','preview',{...roster,asOf:'2026-03-31',csv},h.owner,400)
 await h.kit('payroll','preview',{...roster,asOf:'2026-99-99'},h.owner,400)
 assert.deepEqual(await query(),stable)
 // Undo register removes just its pay runs; ledger and roster remain.
 await h.kit('payroll','undo',{id:imported.import.id})
 view=await query();assert.deepEqual(view.runs,[]);assert.deepEqual(view.reconciliation,[]);assert.equal(view.roster.length,3)
 assert.equal((await h.get('/api/easel/actuals')).months[0].costs,2946250)
 const status=await h.kit('payroll','status',{id:imported.import.id})
 assert.equal(status.job.state,'undone')
 await h.kit('payroll','undo',{id:accepted.import.id})
 assert.equal((await query()).roster.length,0)
 assert.ok((await h.get('/api/easel/activity')).some(a=>a.action==='payroll-undone'))
})
