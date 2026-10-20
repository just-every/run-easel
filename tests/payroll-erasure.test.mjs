import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { exportArchive, importArchive, fileRecords } from '@runeditrun/rer/modules/portability/files'
import { createEaselExportService } from '../scripts/installer/erasure-export.mjs'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness } from './harness.mjs'

// One source ID is deliberately also an amount and another provider's ID.
// Associations are entered by finance; neither equal names nor equal IDs link people.
test('PEOPLE-007 ERASE-001 explicit finance association erases scoped employee identity in views, mappings, CSV/XLSX originals and portable journals, preserving amounts and exact undo', async t => {
 const h=await harness();t.after(()=>h.close())
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const d=await h.command('department',{name:'Engineering'}),line=await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true})
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const email='alex@example.test', nativeName='Alex Native', legalName='Provider Legalname'
 const former=await h.person(email,'contributor',[d.id])
 await h.command('member',{email,name:nativeName,role:'contributor',departments:[d.id]})
 const position=await h.command('position',{scenario,line:line.id,department:d.id,title:'Engineer',holder:nativeName,annualSalary:'120000',start:'2026-01'})
 const board=await h.person('board@example.test','viewer')
 const roster={provider:'Justworks',scenario,kind:'roster',asOf:'2026-01-31',filename:'roster.csv',csv:`Employee ID,Name,Department,Title,Employment Type,Salary,Start\n1,${legalName},Engineering,Engineer,W-2,120000,2026-01-12\n2,Unlinked Colleague,Engineering,Analyst,W-2,1,2026-01-01\n`,positionMap:{1:position.originId},memberMap:{1:email}}
 const accept=async input=>h.kit('payroll','commit',{...input,fingerprint:(await h.kit('payroll','preview',input)).fingerprint})
 await h.kit('payroll','preview',roster,board,403)
 await h.kit('payroll','preview',{...roster,memberMap:{1:'unknown@example.test'}},h.owner,404)
 const first=await accept(roster)
 // Identical source bytes in a different provider must remain byte-identical.
 const other=await accept({...roster,provider:'Other PEO',memberMap:{},positionMap:{}})
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Register')
 sheet.addRow(['Employee ID','Department','Pay Date','Gross Wages','Employer Taxes','Benefits','Fees'])
 sheet.addRow([1,'Engineering','2026-01-31',1000,1,1,1]);sheet.addRow([2,'Engineering','2026-01-31',1,1,1,1])
 const registerBytes=Buffer.from(await book.xlsx.writeBuffer({useSharedStrings:true}))
 const register=await accept({provider:'Justworks',scenario,kind:'register',line:line.id,filename:'register.xlsx',base64:registerBytes.toString('base64')})
 const rosterBook=new ExcelJS.Workbook(),rosterSheet=rosterBook.addWorksheet('Roster')
 rosterSheet.addRow(['Employee ID','Name','Department','Title','Employment Type','Salary','Start'])
 rosterSheet.addRow([1,legalName,'Engineering','Engineer','W-2',120000,'2026-01-12'])
 rosterSheet.addRow([2,'Unlinked Colleague','Engineering','Analyst','W-2',1,'2026-01-01'])
 const rosterBytes=Buffer.from(await rosterBook.xlsx.writeBuffer({useSharedStrings:true}))
 const later=await accept({provider:'Justworks',scenario,kind:'roster',asOf:'2026-02-28',filename:'roster.xlsx',base64:rosterBytes.toString('base64')})
 const approved=await h.command('approve-budget',{scenario,revision:(await h.get(`/api/easel/scenario/${scenario}`)).scenario.revision})
 const snapshots=(await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
 const before=(await h.get(`/api/easel/payroll/${scenario}`)).reconciliation
 const originals=(await h.db.prepare('SELECT * FROM ik_originals ORDER BY job_id,original_key').all()).results
 await h.command('member',{email,name:nativeName,role:'contributor',departments:[d.id],active:false})
 const receipt=await h.command('person-erase',{email})
 assert.equal((await h.send('/api/easel/state',undefined,former)).status,401)
 assert.deepEqual((await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results,snapshots)
 for(const sn of snapshots) {
  const value=await h.get(`/api/easel/snapshot/${sn.id}`)
  assert.equal(value.sha256,sn.sha256);assert.ok(!JSON.stringify(value).includes(nativeName))
  assert.ok(JSON.stringify(value).includes(receipt.pseudonym))
 }
 const view=await h.get(`/api/easel/payroll/${scenario}`)
 const own=view.roster.filter(r=>r.provider==='Justworks'),untouched=view.roster.filter(r=>r.provider==='Other PEO')
 assert.equal(own.find(r=>r.employeeId===receipt.pseudonym).name,receipt.pseudonym)
 assert.equal(own.find(r=>r.employeeId==='2').salaryCents,100)
 assert.equal(untouched.find(r=>r.employeeId==='1').name,legalName,'Same ID/name never infers another provider association')
 assert.deepEqual(view.reconciliation,before,'All planning/payroll amounts remain identical')
 const history=await h.kit('payroll','status',{id:first.import.id})
 assert.ok(!JSON.stringify(history).includes(email))
 const response=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}})
 assert.equal(response.status,200)
 const zip=await JSZip.loadAsync(await response.arrayBuffer()),manifest=JSON.parse(await zip.file('manifest.json').async('string'))
 const original=async id=>{
  const item=manifest.originals.find(o=>o.jobId===id && o.status==='retained');assert.ok(item)
  return zip.file(item.path).async('nodebuffer')
 }
 const exportedCsv=(await original(first.job.id)).toString()
 assert.ok(exportedCsv.includes(receipt.pseudonym));assert.ok(!exportedCsv.includes(legalName));assert.ok(exportedCsv.includes('2,Unlinked Colleague,Engineering,Analyst,W-2,1,'))
 assert.equal((await original(other.job.id)).toString(),roster.csv,'Identical bytes from another provider remain unchanged')
 const exportedRoster=await original(later.job.id),rosterRead=new ExcelJS.Workbook();await rosterRead.xlsx.load(exportedRoster)
 assert.equal(rosterRead.worksheets[0].getCell('A2').value,receipt.pseudonym);assert.equal(rosterRead.worksheets[0].getCell('B2').value,receipt.pseudonym)
 assert.equal(rosterRead.worksheets[0].getCell('F3').value,1);assert.equal(rosterRead.worksheets[0].getCell('A3').value,2)
 const nested=await JSZip.loadAsync(exportedRoster)
 for(const entry of Object.values(nested.files).filter(e=>!e.dir))assert.ok(!(await entry.async('string')).includes(legalName),'No orphaned shared-string identity')
 const registerRead=new ExcelJS.Workbook();await registerRead.xlsx.load(await original(register.job.id))
 assert.equal(registerRead.worksheets[0].getCell('A2').value,receipt.pseudonym);assert.equal(registerRead.worksheets[0].getCell('D3').value,1)
 const model=JSON.parse(await zip.file('model.json').async('string'))
 const mappings=model.records.filter(r=>r.kind==='payroll-file-mapping'&&r.value.provider==='Justworks')
 assert.ok(mappings.every(r=>!Object.hasOwn(r.value.positionMap,'1')&&!Object.hasOwn(r.value.memberMap,'1')))
 assert.deepEqual((await h.db.prepare('SELECT * FROM ik_originals ORDER BY job_id,original_key').all()).results,originals,'Stored originals stay immutable')
 // A verified native archive is also a public file door, including journal payloads.
 const dir=await mkdtemp(join(tmpdir(),'easel-payroll-erased-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'erased.rer')
 await exportArchive(await createEaselExportService({db:h.db}),path,[])
 const records=[];for await(const record of fileRecords(path))records.push(record)
 assert.ok(records[0].transforms.some(x=>x.receiptIds.includes(receipt.receiptId)))
 const destination=await harness();t.after(()=>destination.close())
 await importArchive(await createPortability({db:destination.db,policy:easelPolicy}),path,[])
 const restored=await destination.get(`/api/easel/payroll/${scenario}`)
 assert.deepEqual(restored.roster,view.roster);assert.deepEqual(restored.reconciliation,view.reconciliation)
 // Erasure changes identity only; it cannot turn journal-owned records into edits.
 for(const imp of [later,register,first]) await h.kit('payroll','undo',{id:imp.import.id})
 const undone=await h.get(`/api/easel/payroll/${scenario}`)
 assert.equal(undone.roster.length,2);assert.ok(undone.roster.every(r=>r.provider==='Other PEO'));assert.deepEqual(undone.runs,[])
 // Even after undo, retained originals are still scoped and anonymized.
 const after=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}});assert.equal(after.status,200,await after.clone().text())
 const afterZip=await JSZip.loadAsync(await after.arrayBuffer())
 const afterManifest=JSON.parse(await afterZip.file('manifest.json').async('string'))
 const afterOriginal=afterManifest.originals.find(o=>o.jobId===first.job.id)
 assert.ok(!(await afterZip.file(afterOriginal.path).async('string')).includes(legalName))
})
