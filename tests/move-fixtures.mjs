import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { readWorkbook } from './spreadsheet-proof.mjs'

export async function moveFixture(provider) {
 const folder = provider === 'adaptive' ? 'adaptive-planning' : provider
 const root = new URL(`../fixtures/${folder}/`,import.meta.url)
 const manifest = JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))
 const files = await Promise.all(manifest.files.map(async file=>({...file,base64:Buffer.from(await readFile(new URL(file.name,root))).toString('base64')})))
 const mapping = structuredClone(manifest.mapping ?? {})
 if (provider === 'adaptive') {
  mapping.levels = {'synthetic-easel-1':'exclude','synthetic-easel-3':'create'}
  mapping.accounts = {'synthetic-easel-10':'exclude','synthetic-easel-12':{name:'Payroll',type:'operating-expense',payroll:true},'synthetic-easel-15':{name:'Equipment expense',type:'operating-expense',payroll:false},'synthetic-easel-17':{name:'Services revenue',type:'revenue',payroll:false}}
  mapping.dimensions = {'synthetic-easel-30':'create'}
  mapping.members = {'synthetic-easel-30':{'synthetic-easel-32':'create','synthetic-easel-34':'create'}}
  mapping.personnelColumns = manifest.options.personnelColumns
 }
 return {provider,files,options:manifest.options,mapping}
}

export async function proveMove(h,provider) {
 const fixture = await moveFixture(provider)
 await h.command('workspace',{name:`Synthetic ${provider} planning`,currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const board = await h.person('board@example.test','viewer')
 const before = await h.get('/api/easel/state')
 const preview = await h.kit('incumbent','preview',fixture)
 assert.equal(preview.ready,true,JSON.stringify({unresolved:preview.unresolved,reconciliation:preview.reconciliation.filter(r=>r.status!=='reconciled')}))
 assert.equal(preview.positions.length,5)
 assert.equal(preview.positions.filter(p=>!p.holder).length,2)
 assert.ok(preview.positions.some(p=>p.bonusBps===1000 && p.meritBps===1000))
 assert.ok(preview.unmapped.some(r=>/Custom/.test(r.location+r.reason)))
 for (const kind of ['department','line','scenario']) assert.ok(preview.created.some(r=>r.kind===kind))
 assert.deepEqual(await h.get('/api/easel/state'),before,'Preview creates no native records')
 const safe = await h.kit('incumbent','preview',fixture,board)
 assert.equal(safe.fingerprint,undefined)
 assert.equal(safe.positions,undefined)
 assert.equal(safe.unmapped,undefined)
 assert.doesNotMatch(JSON.stringify(safe),/annualSalaryCents|hourlyRateCents|meritBps|bonusBps/)
 const serialized = JSON.stringify(safe)
 for(const position of preview.positions.filter(p=>p.holder)) assert.ok(!serialized.includes(position.holder),'Viewer preview hides names')
 assert.ok(safe.versions[0].cells.some(c=>c.amount>0))
 assert.ok(Object.keys(safe.versions[0].headcount).length>0)
 assert.equal(Object.values(safe.versions[0].headcount).reduce((sum,months)=>sum+(months['2026-12'] ?? 0),0),5)
 assert.deepEqual(safe.versions[0].cells,preview.versions[0].cells,'Viewer preview retains exact aggregate account totals')
 await h.kit('incumbent','commit',{...fixture,fingerprint:preview.fingerprint},board,403)
 const stale = {...fixture,mapping:{...fixture.mapping,personnelColumns:{...fixture.mapping.personnelColumns,benefits:undefined}}}
 await h.kit('incumbent','commit',{...stale,fingerprint:preview.fingerprint},h.owner,409)
 const changed = structuredClone(fixture)
 const dataName = provider === 'adaptive' ? 'exportData.xml' : fixture.options.tables.find(t=>t.role==='data').file
 const data = changed.files.find(f=>f.name===dataName)
 const originalText = Buffer.from(data.base64,'base64').toString('utf8')
 const sourceAmount = provider === 'adaptive' ? '19000' : '24200'
 assert.ok(originalText.includes(sourceAmount),'The independent source contains the payroll total to perturb')
 data.base64 = Buffer.from(originalText.replace(sourceAmount, String(Number(sourceAmount)+1))).toString('base64')
 const mismatch = await h.kit('incumbent','preview',changed)
 assert.equal(mismatch.ready,false)
 assert.ok(mismatch.reconciliation.some(r=>r.difference!==null && r.difference!==0))
 await h.kit('incumbent','commit',{...changed,fingerprint:mismatch.fingerprint},h.owner,409)
 const imported = await h.kit('incumbent','commit',{...fixture,fingerprint:preview.fingerprint})
 assert.equal(imported.import.status,'imported')
 for (const scenario of imported.import.scenarios) {
  const view = await h.get(`/api/easel/scenario/${scenario}`)
  const native = view.inputs.position
  const expectedPositions=preview.positions.filter(p=>p.scenario===scenario)
  assert.deepEqual(new Set(native.map(p=>p.originId)),new Set(expectedPositions.map(p=>p.originId)))
  assert.equal(native.filter(p=>!p.holder).length,expectedPositions.filter(p=>!p.holder).length)
  if(expectedPositions.some(p=>p.meritBps))assert.match(JSON.stringify(view.calculation),/Merit planning estimate/)
  if(expectedPositions.some(p=>p.bonusBps))assert.match(JSON.stringify(view.calculation),/Position bonus planning estimate/)
  for (const row of preview.reconciliation.filter(r=>r.version===view.scenario.imported.sourceVersion)) {
   assert.equal(view.calculation.cells.filter(c=>c.line===row.line && c.department===row.department && c.month===row.month).reduce((sum,c)=>sum+c.amount,0),row.exported)
   assert.equal(row.difference,0)
  }
  const viewer = await h.get(`/api/easel/scenario/${scenario}`,board)
  assert.deepEqual(viewer.inputs.position,[])
  assert.doesNotMatch(JSON.stringify(viewer),/annualSalaryCents|hourlyRateCents|meritBps|bonusBps/)
  for(const position of native.filter(p=>p.holder)) assert.ok(!JSON.stringify(viewer).includes(position.holder),'Accepted viewer read hides names')
  assert.deepEqual(viewer.calculation.headcount,view.calculation.headcount)
  assert.deepEqual(viewer.calculation.cells.map(c=>c.amount),view.calculation.cells.map(c=>c.amount))
  const response = await h.mf.dispatchFetch(h.origin+`/api/easel/scenario/${scenario}/document.xlsx`,{headers:{cookie:board}})
  assert.equal(response.status,200)
  const workbook = await readWorkbook(await response.arrayBuffer())
  for(const position of native.filter(p=>p.holder)) assert.ok(!JSON.stringify(workbook.model).includes(position.holder))
 }
 const undo = await h.kit('incumbent','undo',{id:imported.import.id})
 assert.equal(undo.import.status,'undone',JSON.stringify(undo.undo))
 const after = await h.get('/api/easel/state')
 for(const scenario of imported.import.scenarios) await h.get(`/api/easel/scenario/${scenario}`,h.owner,404)
 assert.equal(after.departments.length,before.departments.length)
 assert.equal(after.lines.length,before.lines.length)
 return {fixture,preview,imported}
}
