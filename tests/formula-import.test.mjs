import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {harness} from './harness.mjs'
import {formulaWorkbook,formulaSetup} from './formula-import-fixture.mjs'

test('SHEET-003 translated cross-sheet/month arithmetic, SUM, IF, growth and exact lookups reconcile source totals, recalculate reviewed drivers, filter source detail, freeze and undo through HTTP',async t=>{
 const h=await harness();t.after(()=>h.close())
 const call=(path,body)=>body===undefined?h.get(`/api/easel/${path}`):h.send(`/api/easel/${path}`,body,h.owner).then(r=>{assert.equal(r.status,200,JSON.stringify(r.value));return r.value})
 const f=await formulaSetup(call),input={filename:'finance-model.xlsx',base64:(await formulaWorkbook()).toString('base64')}
 const before=await h.get('/api/easel/state'),activity=await h.get('/api/easel/activity')
 const preview=await h.kit('workbook','preview',input)
 assert.deepEqual(await h.get('/api/easel/state'),before);assert.deepEqual(await h.get('/api/easel/activity'),activity)
 const unsupported=preview.formulaReport.filter(r=>r.status==='cached')
 assert.deepEqual(unsupported.map(r=>[r.sheet,r.cell]),[['Budget','C4']]);assert.match(unsupported[0].reason,/PMT|unsupported/i)
 assert.deepEqual(preview.workbookTotals.map(r=>[r.month,r.workbookCents,r.translatedCents,r.status]),[['2026-01',1210000,1210000,'reconciled'],['2026-02',1330000,1330000,'reconciled'],['2026-03',1430000,1430000,'reconciled']])
 assert.equal(preview.formulaReport.find(r=>r.sheet==='Budget'&&r.cell==='E4').formula,'=D4','Shared-formula relative references expand through the workbook file door')
 assert.ok(preview.formulaReconciliation.every(r=>r.status==='reconciled'))
 const bad={...input,base64:(await formulaWorkbook({badTotal:true})).toString('base64')},badPreview=await h.kit('workbook','preview',bad)
 assert.equal(badPreview.workbookTotals[0].status,'unreconciled')
 await h.kit('workbook','commit',{...bad,fingerprint:badPreview.fingerprint},h.owner,409)
 await h.kit('workbook','preview',{...input,base64:(await formulaWorkbook({cycle:true})).toString('base64')},h.owner,400)
 assert.deepEqual(await h.get('/api/easel/state'),before)
 const imported=await h.kit('workbook','commit',{...input,fingerprint:preview.fingerprint}),scenario=imported.import.scenario
 const read=(cookie=h.owner)=>h.get(`/api/easel/scenario/${scenario}`,cookie)
 let view=await read(),book=view.inputs['workbook-model'][0]
 const value=(line,month)=>view.calculation.lineTotals[line][month]
 for(const total of preview.workbookTotals) assert.equal(view.calculation.cells.filter(c=>c.month===total.month).reduce((n,c)=>n+c.amount,0),total.workbookCents,'Imported plan cells equal the workbook own total to the cent')
 assert.deepEqual([value(f.revenue.id,'2026-01'),value(f.revenue.id,'2026-02'),value(f.hosting.id,'2026-03'),value(f.lease.id,'2026-01')],[1000000,1100000,210000,10000])
 const driver={scenario,id:book.id,cell:'Assumptions!B2',value:'20000',revision:view.scenario.revision}
 await h.command('workbook-driver',{...driver,revision:0},h.owner,409)
 await h.command('workbook-driver',{...driver,value:'5000'},h.owner,400)
 assert.deepEqual(await read(),view,'A driver producing an arithmetic error writes nothing')
 await h.command('workbook-driver',driver)
 view=await read()
 assert.deepEqual([value(f.revenue.id,'2026-01'),value(f.revenue.id,'2026-02'),value(f.revenue.id,'2026-03'),value(f.hosting.id,'2026-01'),value(f.hosting.id,'2026-02'),value(f.hosting.id,'2026-03')],[2000000,2200000,2420000,400000,440000,420000])
 assert.equal(value(f.lease.id,'2026-01'),10000,'Unsupported PMT remains its explicitly reported cache')
 await h.command('workbook-driver',{...driver,cell:'Budget!C2',revision:view.scenario.revision},h.owner,400)
 await h.command('workbook-driver',{...driver,cell:'Assumptions!B3',value:'0.025',revision:view.scenario.revision})
 view=await read();assert.equal(value(f.revenue.id,'2026-02'),2050000);assert.equal(value(f.revenue.id,'2026-03'),2101250)
 const board=await h.person('board@example.test','viewer'),analyst=await h.person('analyst@example.test','finance',[],false)
 for(const cookie of[board,analyst]) {
  const safe=await read(cookie);assert.deepEqual(safe.inputs['workbook-model'],[])
  assert.ok(!JSON.stringify(safe).includes('987654.32'));assert.equal(safe.calculation.lineTotals[f.revenue.id]['2026-02'],2050000)
  await h.command('workbook-driver',{...driver,revision:view.scenario.revision},cookie,403)
 }
 const saved=await h.command('reforecast-save',{from:scenario,name:'Reviewed model',revision:view.scenario.revision})
 const frozen=await h.get(`/api/easel/scenario/${saved.id}`)
 await h.command('workbook-driver',{...driver,value:'30000',revision:view.scenario.revision})
 assert.deepEqual((await h.get(`/api/easel/scenario/${saved.id}`)).calculation,frozen.calculation)
 const proposal=await h.command('proposal-create',{from:scenario,name:'Formula proposal',request:'Change growth'})
 const proposed=await h.get(`/api/easel/scenario/${proposal.id}`)
 assert.equal(proposed.inputs['workbook-model'].length,1)
 assert.equal(proposed.calculation.lineTotals[f.revenue.id]['2026-01'],3000000)
 // Undo of an untouched import removes every native schedule and source graph.
 await h.command('member',{email:'former@example.test',name:'Former Formula Source',role:'contributor',departments:[f.department.id],active:false})
 const receipt=await h.command('person-erase',{email:'former@example.test'})
 const erased=await read(),erasedSnapshot=await h.get(`/api/easel/scenario/${saved.id}`)
 for (const result of [erased,erasedSnapshot]) {
  assert.doesNotMatch(JSON.stringify(result),/Former Formula Source|former@example.test/,'SHEET-003 ERASE-001 source graph and frozen source reads inherit erasure')
  assert.ok(JSON.stringify(result).includes(receipt.pseudonym))
 }
 assert.equal(erased.calculation.lineTotals[f.revenue.id]['2026-01'],3000000)
 const archiveResponse=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}})
 assert.equal(archiveResponse.status,200)
 const archive=await JSZip.loadAsync(await archiveResponse.arrayBuffer())
 for(const entry of Object.values(archive.files).filter(f=>!f.dir)) {
  if(entry.name.endsWith('.xlsx')) {
   const workbook=await JSZip.loadAsync(await entry.async('nodebuffer'))
   for(const part of Object.values(workbook.files).filter(f=>!f.dir))assert.doesNotMatch(await part.async('string'),/Former Formula Source|former@example.test/,'Erased identities stay out of source originals and formula workbook exports')
  } else assert.doesNotMatch(await entry.async('string'),/Former Formula Source|former@example.test/,'Erased identities stay out of portable source graphs and frozen snapshots')
 }
 const second={...input,filename:'second-model.xlsx'}
 // Same content is one journal identity; complete undo first preserves intentional edits.
 const undo=await h.kit('workbook','undo',{id:imported.import.id})
 assert.equal(undo.job.state,'undone')
 assert.ok(undo.undo.preserved>0 || JSON.stringify(undo.undo).includes('preserv'))
 // A fresh installation proves exact no-edit undo, independent of retained edited versions.
 const clean=await harness();t.after(()=>clean.close())
 await formulaSetup((path,body)=>body===undefined?clean.get(`/api/easel/${path}`):clean.send(`/api/easel/${path}`,body,clean.owner).then(r=>{assert.equal(r.status,200);return r.value}))
 const cp=await clean.kit('workbook','preview',second),ci=await clean.kit('workbook','commit',{...second,fingerprint:cp.fingerprint})
 await clean.kit('workbook','undo',{id:ci.import.id})
 const gone=await clean.get(`/api/easel/scenario/${ci.import.scenario}`)
 assert.deepEqual(gone.inputs.schedule,[]);assert.deepEqual(gone.inputs['workbook-model'],[])
})
