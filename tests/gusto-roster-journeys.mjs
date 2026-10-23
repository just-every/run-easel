import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { acceptGusto, employeeIds, gustoCall, gustoFixture, gustoGrant, gustoProvider } from './gusto-roster-flow.mjs'

export async function gustoObservationFlow(t) {
 let now='2026-01-31T12:00:00.000Z'
 const provider=gustoProvider(),h=await harness({now:()=>now,outbound:provider.outbound});t.after(()=>h.close())
 const call=gustoCall(h),f=await gustoFixture(call)
 await call('connections/gusto/connect',gustoGrant)
 const jan={...f.input,asOf:'2026-01-31',windowEnd:'2026-01-31'}
 const original=await call(`headcount/${f.scenario}`),activity=await call('activity')
 const unmapped=await call('import/gusto/preview',{...jan,employeeMap:{}})
 assert.equal(unmapped.unmapped.length,3,'Even a matching department label cannot infer an employee mapping')
 assert.deepEqual(await call(`headcount/${f.scenario}`),original);assert.deepEqual(await call('activity'),activity)
 await h.kit('gusto','commit',{...jan,employeeMap:{},fingerprint:unmapped.fingerprint},h.owner,409)
 const preview=await call('import/gusto/preview',jan)
 await h.kit('gusto','commit',{...jan,fingerprint:'stale'},h.owner,409)
 provider.changeSalary=true
 await h.kit('gusto','commit',{...jan,fingerprint:preview.fingerprint},h.owner,409)
 provider.changeSalary=false
 await h.command('position',{...f.late,scenario:f.scenario,id:f.late.id,line:f.line.id,department:f.department.id,annualSalary:'145000',start:'2026-01',plannedStartDate:'2026-01-10',attritionPercent:'1.25'})
 await h.kit('gusto','commit',{...jan,fingerprint:preview.fingerprint},h.owner,409)
 await h.command('position',{...f.late,scenario:f.scenario,id:f.late.id,line:f.line.id,department:f.department.id,annualSalary:'144000',start:'2026-01',plannedStartDate:'2026-01-10',attritionPercent:'1.25'})
 const plannedBeforeImports=await call(`scenario/${f.scenario}`)
 const first=await acceptGusto(call,jan)
 now='2026-02-28T12:00:00.000Z'
 const feb={...f.input};delete feb.employeeMap
 const secondPreview=await call('import/gusto/preview',feb)
 assert.equal(secondPreview.unmapped.length,0,'Accepted explicit employee mappings are reused')
 assert.equal(secondPreview.completeness.skippedExistingPayRuns,1,'Overlapping check-date windows never double count accepted payrolls')
 assert.equal(secondPreview.runs.length,2)
 const second=await acceptGusto(call,feb)
 const view=await call(`headcount/${f.scenario}`),row=m=>view.months.find(r=>r.month===m&&r.department===f.department.id)
 assert.deepEqual([row('2026-01').actualHeadcount,row('2026-02').actualHeadcount],[1,2])
 assert.deepEqual([row('2026-02').actualHires,row('2026-02').actualDepartures,row('2026-02').backfills,row('2026-02').expectedAttritionHundredths],[2,1,1,3])
 assert.deepEqual([row('2026-01').actualCostCents,row('2026-02').actualCostCents],[1090000,1785000])
 assert.equal(view.history.find(r=>r.employeeId===employeeIds[1]).slippageDays,34)
 assert.equal(view.history.find(r=>r.employeeId===employeeIds[2]).slippageDays,9)
 assert.equal(view.history.filter(r=>r.employeeId===employeeIds[0]).length,2,'Dated history survives the later departure')
 assert.equal(row('2026-03').actualHeadcount,null,'No missing-month roster is invented')
 const payroll=await call(`payroll/${f.scenario}`)
 assert.equal(payroll.runs.length,3)
 assert.ok(payroll.runs.every(r=>r.source==='gusto'&&r.sourceObservationId&&r.providerPayrollId&&r.costBasis.includes('fees excluded')))
 assert.deepEqual(payroll.reconciliation.sort((a,b)=>a.month.localeCompare(b.month)).map(r=>[r.department,r.totalCents]),[[f.department.id,1090000],[f.department.id,1785000]])
 assert.deepEqual(await call(`scenario/${f.scenario}`),plannedBeforeImports,'Accepted observations leave planned inputs and revisions unchanged')
 await h.kit('gusto','commit',{...feb,fingerprint:secondPreview.fingerprint},h.owner,409)
 await call('import/gusto/undo',{id:second.import.id})
 const undone=await call(`headcount/${f.scenario}`)
 assert.equal(undone.history.length,3);assert.equal(undone.months.find(r=>r.month==='2026-02'&&r.department===f.department.id).actualHeadcount,null)
 assert.equal((await call(`payroll/${f.scenario}`)).runs.length,1)
 assert.equal((await call('import/gusto/status',{id:first.import.id})).job.state,'completed')
 now='2026-03-31T12:00:00.000Z';provider.emptyRoster=true
 const empty=await acceptGusto(call,{...feb,asOf:'2026-03-31',windowStart:'2026-03-01',windowEnd:'2026-03-31'})
 const emptyView=await call(`headcount/${f.scenario}`)
 assert.equal(emptyView.months.find(r=>r.month==='2026-03'&&r.department===f.department.id).actualHeadcount,0,'A complete empty roster is an observed zero')
 assert.deepEqual((await call(`payroll/${f.scenario}`)).roster,[],'A complete empty roster cannot resurrect the preceding roster')
 await call('import/gusto/undo',{id:empty.import.id})
 assert.equal((await call(`payroll/${f.scenario}`)).roster.length,3,'Undo restores the preceding dated source')
}

export async function gustoCompletenessFlow(t) {
 const provider=gustoProvider(),h=await harness({now:()=> '2026-02-28T12:00:00.000Z',outbound:provider.outbound});t.after(()=>h.close())
 const call=gustoCall(h),f=await gustoFixture(call)
 await h.send('/api/easel/connections/gusto/connect',{...gustoGrant,consent:false},h.owner).then(r=>assert.equal(r.status,400))
 await call('connections/gusto/connect',gustoGrant)
 const stable=await call(`headcount/${f.scenario}`)
 for(const status of [401,403,429,302,500]){
  provider.status=status;const count=provider.reads.length
  const result=await h.send('/api/easel/import/gusto/preview',f.input,h.owner)
  assert.equal(result.status,502);assert.equal(provider.reads.length,count+1,'No retry or redirect follows a rejected read')
  assert.match(result.value.error,new RegExp(`HTTP ${status}`));assert.ok(!result.text.includes(gustoGrant.accessToken))
 }
 provider.status=200
 for(const malformed of ['headers','truncated','duplicate','compensation','date','foreign','taxes','benefits','precision','unprocessed']){
  provider.malformed=malformed
  const r=await h.send('/api/easel/import/gusto/preview',f.input,h.owner)
  assert.ok([400,409,502].includes(r.status),`${malformed} must refuse a partial or understated source`)
  assert.deepEqual(await call(`headcount/${f.scenario}`),stable)
 }
 provider.malformed='';provider.extraEmployees=98
 const paged=await call('import/gusto/preview',f.input)
 assert.equal(paged.completeness.employeeCount,101);assert.ok(paged.completeness.employeePages>1);assert.equal(paged.unmapped.length,98)
 provider.extraEmployees=0
 provider.includeHistoryPayrolls=true
 const readStart=provider.reads.length
 const delayed=await call('import/gusto/preview',{...f.input,windowStart:'2026-02-01'})
 assert.equal(delayed.completeness.payrollHistoryStart,'2025-01-01');assert.equal(delayed.completeness.overlappingPayrollIds,1)
 assert.equal(delayed.completeness.scannedPayrollCount,4);assert.equal(delayed.completeness.payrollCount,2)
 assert.equal(delayed.runs.length,3);assert.equal(delayed.totalCents,1795900,'An old-period off-cycle check is included; regular checks outside the selected cost window are excluded')
 assert.equal(provider.reads.slice(readStart).filter(path=>path.endsWith('/payrolls/synthetic-easel-9')).length,1,'Identical payrolls crossing period slices are fetched once')
 provider.malformed='changed-history';await h.kit('gusto','preview',f.input,h.owner,409)
 provider.malformed='';provider.includeHistoryPayrolls=false
 await h.kit('gusto','preview',{...f.input,payrollHistoryStart:'2026-01-01'},h.owner,409)
 await h.kit('gusto','preview',{...f.input,asOf:'2026-01-31'},h.owner,400)
 await h.kit('gusto','preview',{...f.input,employeeMap:{...f.input.employeeMap,[employeeIds[0]]:{department:f.sales.id,positionOrigin:f.departing.originId}}},h.owner,409)
 const privateFinance=await h.person('private@example.test','finance')
 const privateScenario=await h.command('sandbox-create',{from:f.scenario,name:'Private payroll'},privateFinance)
 await h.kit('gusto','preview',{...f.input,scenario:privateScenario.id},h.owner,404)
 assert.deepEqual(await call(`headcount/${f.scenario}`),stable)
 assert.ok(provider.reads.every(p=>p.startsWith(`/v1/companies/${gustoGrant.companyId}`)))
}

export async function gustoCustodyFlow(t) {
 let now='2026-02-28T12:00:00.000Z'
 const provider=gustoProvider(),h=await harness({now:()=>now,outbound:provider.outbound});t.after(()=>h.close())
 const call=gustoCall(h),f=await gustoFixture(call),email='morgan@example.test'
 const member=await h.person(email,'contributor',[f.department.id]),finance=await h.person('finance@example.test','finance'),board=await h.person('board@example.test','viewer')
 f.input.employeeMap[employeeIds[1]].memberEmail=email
 await call('connections/gusto/connect',gustoGrant)
 const sealed=(await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gusto').first()).sealed
 assert.ok(!sealed.includes(gustoGrant.accessToken))
 for(const cookie of [member,board]){
  await h.get('/api/easel/connections/gusto',cookie,403)
  for(const op of ['connect','disconnect'])assert.equal((await h.send(`/api/easel/connections/gusto/${op}`,gustoGrant,cookie)).status,403)
  for(const op of ['preview','commit'])await h.kit('gusto',op,f.input,cookie,403)
 }
 await h.command('pay-detail',{email:'finance@example.test',granted:false})
 await h.get('/api/easel/connections/gusto',finance,403);await h.kit('gusto','preview',f.input,finance,403)
 await h.command('pay-detail',{email:'finance@example.test',granted:true})
 const financePreview=await h.kit('gusto','preview',f.input,finance)
 let revokedDuringRead=false
 provider.pause=async request=>{if(!revokedDuringRead&&new URL(request.url).pathname.endsWith('/employees')){revokedDuringRead=true;await h.command('pay-detail',{email:'finance@example.test',granted:false})}}
 const revoked=await h.send('/api/easel/import/gusto/commit',{...f.input,fingerprint:financePreview.fingerprint},finance)
 assert.ok([403,409].includes(revoked.status),revoked.text);assert.equal(revokedDuringRead,true)
 assert.deepEqual((await call(`payroll/${f.scenario}`)).roster,[],'Losing pay authority during the provider read prevents acceptance')
 provider.pause=null
 // API tokens retain aggregate headcount parity but cannot administer or pull
 // a provider credential through a non-native session.
 now=new Date().toISOString()
 await h.stepUp()
 const token=(await h.send('/api/easel/tokens/issue',{label:'Gusto refusal',kind:'personal',scope:'write'},h.owner)).value.token
 for(const [path,body] of [['connections/gusto',undefined],['connections/gusto/disconnect',{}],['import/gusto/preview',f.input]]){
  const response=await h.mf.dispatchFetch(h.origin+`/api/easel/${path}`,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  assert.equal(response.status,403)
 }
 now='2026-02-28T12:00:00.000Z'
 const accepted=await acceptGusto(call,f.input),before=(await call(`payroll/${f.scenario}`)).reconciliation
 await h.command('member',{email,name:'Morgan Native',role:'contributor',departments:[f.department.id],active:false})
 const receipt=await h.command('person-erase',{email})
 const erased=await call(`headcount/${f.scenario}`)
 assert.ok(erased.history.some(r=>r.employeeId===receipt.pseudonym&&r.name===receipt.pseudonym))
 assert.ok(!JSON.stringify(erased).includes(employeeIds[1]));assert.ok(!JSON.stringify(erased).includes('Private Morgan Gusto'))
 assert.deepEqual((await call(`payroll/${f.scenario}`)).reconciliation,before)
 const response=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}})
 assert.equal(response.status,200)
 const zip=await JSZip.loadAsync(await response.arrayBuffer())
 for(const entry of Object.values(zip.files).filter(f=>!f.dir)){
  const value=await entry.async('string')
  for(const secret of [gustoGrant.accessToken,sealed,'PRIVATE SSN MUST NEVER PERSIST','private-provider-address@example.test','Private Morgan Gusto',employeeIds[1]])assert.ok(!value.includes(secret),`${entry.name} must exclude secrets and erased provider identity`)
 }
 now='2026-03-31T12:00:00.000Z'
 const next={...f.input,asOf:'2026-03-31'};delete next.employeeMap
 const p=await call('import/gusto/preview',next)
 assert.equal(p.unmapped.length,0);assert.equal(p.completeness.skippedExistingPayRuns,3,'Erasure keeps stable opaque observation IDs, preventing replay of old payroll')
 assert.ok(!JSON.stringify(p).includes(employeeIds[1]));assert.ok(!JSON.stringify(p).includes('Private Morgan Gusto'))
 await acceptGusto(call,next)
 await call('connections/gusto/disconnect',{})
 assert.equal(await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gusto').first(),null)
 await h.kit('gusto','preview',next,h.owner,409)
 assert.ok((await call(`headcount/${f.scenario}`)).history.length>=6)
 await call('import/gusto/undo',{id:accepted.import.id})
 assert.deepEqual((await call(`payroll/${f.scenario}`)).runs,[])
}
