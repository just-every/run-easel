import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { acceptHris,grant,hrisCall,hrisFixture,hrisProvider,hrisProviders,ids,privateCustom,secret } from './hris-fixture.mjs'

test('PEOPLE-002 four native HRIS journeys reconcile and accept complete reviewed rosters, preserve dates and erasure, isolate pay and seal credentials',async t=>{
 let now='2026-02-28T12:00:00.000Z'
 const edge=hrisProvider(),h=await harness({now:()=>now,outbound:edge.outbound,serviceBindings:{HRIS_ADP_MTLS:edge.outbound}});t.after(()=>h.close())
 const call=hrisCall(h),f=await hrisFixture(call),original=await call(`scenario/${f.scenario}`)
 const viewer=await h.person('hris-board@example.test','viewer'),analyst=await h.person('hris-analyst@example.test','finance',[],false),head=await h.person('hris-head@example.test','contributor',[f.department.id])
 const liveFinance=await h.person('hris-live@example.test','finance')
 const counts=p=>Object.fromEntries(Object.entries(p.reconciliation??p.buckets).map(([k,v])=>[k,v.length]))
 for(const id of hrisProviders){
  const status=`connections/hris/${id}`,kit=`import/${id}`,key=grant(id),email=`${id}-person@example.test`
  await h.command('member',{email,name:'Morgan Native',role:'contributor',departments:[f.department.id]})
  const input={...f.input,employeeMap:{...f.input.employeeMap,[ids[1]]:{...f.input.employeeMap[ids[1]],memberEmail:email}}}
  for(const cookie of[viewer,analyst,head]){await h.get('/api/easel/'+status,cookie,403);await h.send('/api/easel/'+status+'/connect',key,cookie).then(r=>assert.equal(r.status,403));await h.kit(id,'preview',input,cookie,403)}
  await call(status+'/connect',key)
  let connection=await call(status)
  assert.equal(connection.connected,true);assert.equal(connection.keySuffix,'9821');assert.equal(connection.schedule,'Manual');assert.equal(connection.rowCount,4);assert.ok(connection.owner);assert.ok(connection.lastRefresh)
  const sealed=(await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('hris:'+id).first()).sealed
  assert.ok(sealed&&!sealed.includes(secret));assert.ok(!JSON.stringify(connection).includes(secret))
  edge.status=429;await call(status+'/check',{});connection=await call(status);assert.equal(connection.rateLimited,true);assert.match(connection.error,/HTTP 429/);assert.ok(!connection.error.includes(secret));edge.status=200
  await call(status+'/check',{});assert.equal((await call(status)).rateLimited,false)
  const before=await call(`payroll/${f.scenario}`),activity=await call('activity'),planBefore=await call(`scenario/${f.scenario}`)
  const unmapped=await call(kit+'/preview',{scenario:f.scenario,asOf:input.asOf})
  assert.equal(unmapped.unmapped.length,4);assert.ok(unmapped.completeness.unmappedFields.some(s=>s.includes('customFavouriteColour')));assert.ok(!JSON.stringify(unmapped).includes(privateCustom));assert.ok(!JSON.stringify(unmapped).includes('PRIVATE SSN'))
  assert.deepEqual(await call(`payroll/${f.scenario}`),before);assert.deepEqual(await call('activity'),activity)
  await h.kit(id,'commit',{scenario:f.scenario,asOf:input.asOf,fingerprint:unmapped.fingerprint},h.owner,409)
  const preview=await call(kit+'/preview',input)
  if(id==='rippling')assert.ok(preview.completeness.unmappedFields.includes('compensation.annual_compensation.unmappedAllowanceCode'))
  if(id==='adp')assert.ok(preview.completeness.unmappedFields.includes('workAssignments.0.homeOrganizationalUnits.1.nameCode.longName'))
  assert.deepEqual(preview.unmapped,[]);assert.deepEqual(counts(preview),{matched:2,unplanned:1,changedSalary:1,plannedNotHired:1})
  assert.equal(preview.roster[2].hourlyRateCents,4000);assert.equal(preview.roster[2].employmentType,'1099');assert.equal(preview.roster[1].salaryCents,15000000)
  await h.command('position',{id:f.vacancy.id,scenario:f.scenario,line:f.line.id,department:f.department.id,title:f.vacancy.title,start:'2026-02',annualSalary:'0',payBasis:'hourly',hourlyRate:'40',expectedHours:'120',onCostPercent:'0'})
  const hourlyInput={...input,employeeMap:{...input.employeeMap,[ids[2]]:{department:f.department.id,positionOrigin:f.vacancy.originId,unplanned:false,employmentType:'1099'}}}
  assert.equal((await call(kit+'/preview',hourlyInput)).reconciliation.matched.find(r=>r.employeeId===ids[2]).hourlyRateCents,4000)
  await h.command('position',{id:f.vacancy.id,scenario:f.scenario,line:f.line.id,department:f.department.id,title:f.vacancy.title,start:'2026-02',annualSalary:'96000',onCostPercent:'0'})
  const freshPreview=await call(kit+'/preview',input)
  edge.changed=true;await h.kit(id,'commit',{...input,fingerprint:freshPreview.fingerprint},h.owner,409);edge.changed=false
  await h.kit(id,'preview',{...input,asOf:'2026-02-27'},h.owner,400)
  const financePreview=await h.kit(id,'preview',input,liveFinance)
  let revoked=false
  edge.pause=async()=>{if(!revoked){revoked=true;await h.command('pay-detail',{email:'hris-live@example.test',granted:false})}}
  const refusedSave=await h.send('/api/easel/'+kit+'/commit',{...input,fingerprint:financePreview.fingerprint},liveFinance)
  assert.ok([403,409].includes(refusedSave.status),refusedSave.text);assert.equal(revoked,true);edge.pause=null
  assert.deepEqual(await call(`payroll/${f.scenario}`),before,'Losing Pay during the provider read prevents acceptance')
  await h.command('pay-detail',{email:'hris-live@example.test',granted:true})
  const accepted=await acceptHris(call,id,input),view=await call(`payroll/${f.scenario}`)
  assert.deepEqual(view.counts,{matched:2,unplanned:1,changedSalary:1,plannedNotHired:1});assert.equal(view.roster.length,4);assert.deepEqual((await call(`scenario/${f.scenario}`)).inputs,planBefore.inputs,'Accepting source matches cannot edit the plan')
  let hc=await call(`headcount/${f.scenario}`),month=hc.months.find(r=>r.month==='2026-02'&&r.department===f.department.id)
  assert.deepEqual([month.actualHeadcount,month.actualHires,month.actualDepartures,month.backfills,month.expectedAttritionHundredths,month.actualCostCents],[3,3,1,1,3,null])
  assert.equal(hc.history.find(r=>r.employeeId===ids[1]).slippageDays,34);assert.equal(hc.history.find(r=>r.employeeId===ids[3]).slippageDays,null)
  assert.equal(hc.months.find(r=>r.month==='2026-03').actualHeadcount,null)
  for(const cookie of[viewer,analyst]){
   const safe=await h.get(`/api/easel/payroll/${f.scenario}`,cookie),safeHc=await h.get(`/api/easel/headcount/${f.scenario}`,cookie)
   assert.equal(safe.departments.find(d=>d.department===f.department.id).headcount,3);assert.deepEqual(safe.roster,[]);assert.deepEqual(safe.runs,[]);assert.deepEqual(safeHc.history,[]);assert.deepEqual(safeHc.positions,[])
   assert.doesNotMatch(JSON.stringify([safe,safeHc]),/Private Morgan|hris-person-|15000000/)
  }
  // Actual payroll remains an independently reviewed provider register. The HRIS
  // endpoint supplies no run totals; missing cost cannot become an invented zero.
  const register={kind:'register',provider:accepted.import.provider,scenario:f.scenario,line:f.line.id,filename:`${id}-register.csv`,csv:'Employee,Department,Paid,Gross,Tax,Benefits,Fees\n'+ids.map((employee,i)=>`${employee},Engineering,2026-02-28,${[1000,10000,4800,7000][i]},0,0,0`).join('\n')+'\n',columns:{employeeId:'Employee',department:'Department',payDate:'Paid',grossWages:'Gross',employerTaxes:'Tax',benefits:'Benefits',fees:'Fees'},departmentMap:{Engineering:f.department.id},dateFormat:'YYYY-MM-DD'}
  const pay=await h.kit('payroll','commit',{...register,fingerprint:(await h.kit('payroll','preview',register)).fingerprint})
  await h.command('account-map',{account:'5000',target:f.line.id});await h.command('department-map',{source:'Engineering',department:f.department.id})
  const gl={filename:`${id}-ledger.csv`,csv:'Date,Account,Department,Amount\n2026-02-28,5000,Engineering,22800.00\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
  const ledger=await h.kit('actuals','commit',{...gl,fingerprint:(await h.kit('actuals','preview',gl)).fingerprint})
  assert.equal((await call(`payroll/${f.scenario}`)).reconciliation[0].status,'reconciled')
  assert.equal((await call(`headcount/${f.scenario}`)).months.find(r=>r.month==='2026-02'&&r.department===f.department.id).actualCostCents,2280000)
  // One additional full dated observation reuses the reviewed mapping; later
  // plan edits cannot change the captured 34-day slippage history.
  now='2026-03-31T12:00:00.000Z'
  const next={scenario:f.scenario,asOf:'2026-03-31'}
  assert.deepEqual((await call(kit+'/preview',next)).unmapped,[])
  const second=await acceptHris(call,id,next)
  await h.command('position',{...f.late,id:f.late.id,scenario:f.scenario,department:f.department.id,line:f.line.id,annualSalary:'144000',onCostPercent:'0',start:'2026-01',plannedStartDate:'2026-01-20',attritionPercent:'1.25'})
  assert.ok((await call(`headcount/${f.scenario}`)).history.filter(r=>r.employeeId===ids[1]).every(r=>r.slippageDays===34))
  await h.command('position',{...f.late,id:f.late.id,scenario:f.scenario,department:f.department.id,line:f.line.id,annualSalary:'144000',onCostPercent:'0',start:'2026-01',plannedStartDate:'2026-01-10',attritionPercent:'1.25'})
  // The next provider pull must remain private after an associated member is erased.
  await h.command('member',{email,name:'Morgan Native',role:'contributor',departments:[f.department.id],active:false})
  const receipt=await h.command('person-erase',{email}),erased=await call(`headcount/${f.scenario}`)
  assert.ok(erased.history.some(r=>r.employeeId===receipt.pseudonym));assert.ok(!JSON.stringify(erased).includes(ids[1]));assert.ok(!JSON.stringify(erased).includes('Private Morgan HRIS'))
  now='2026-04-30T12:00:00.000Z'
  const afterErasure=await call(kit+'/preview',{scenario:f.scenario,asOf:'2026-04-30'})
  assert.deepEqual(afterErasure.unmapped,[]);assert.ok(afterErasure.roster.some(r=>r.employeeId===receipt.pseudonym));assert.ok(!JSON.stringify(afterErasure).includes(ids[1]))
  const third=await acceptHris(call,id,{scenario:f.scenario,asOf:'2026-04-30'})
  const response=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}});assert.equal(response.status,200)
  const zip=await JSZip.loadAsync(await response.arrayBuffer())
  for(const entry of Object.values(zip.files).filter(e=>!e.dir)){
   const body=await entry.async('string')
   for(const forbidden of[secret,sealed,privateCustom,'PRIVATE SSN MUST NEVER PERSIST','Private Morgan HRIS',ids[1]])assert.ok(!body.includes(forbidden),`${id} ${entry.name} leaked ${forbidden===secret?'credential':forbidden}`)
  }
  await call(status+'/disconnect',{});connection=await call(status)
  assert.equal(connection.connected,false);assert.equal(connection.revocation,'owner-action-required');assert.ok(connection.revocationInstruction);assert.equal(await h.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('hris:'+id).first(),null)
  assert.ok((await call(`headcount/${f.scenario}`)).history.length>=6,'Disconnect retains accepted history')
  await h.kit(id,'preview',{scenario:f.scenario,asOf:'2026-04-30'},h.owner,409)
  await call(kit+'/undo',{id:third.import.id});await call(kit+'/undo',{id:second.import.id});await call(kit+'/undo',{id:accepted.import.id});await h.kit('payroll','undo',{id:pay.import.id});await h.kit('actuals','undo',{id:ledger.batch.id})
  assert.equal((await call(`payroll/${f.scenario}`)).roster.length,0)
  now='2026-02-28T12:00:00.000Z'
 }
 assert.deepEqual((await call(`scenario/${f.scenario}`)).calculation.lineTotals,original.calculation.lineTotals,'Erasure retains planned amounts')
 const audit=JSON.stringify(await call('activity'));assert.match(audit,/hris-connected/);assert.match(audit,/hris-checked/);assert.match(audit,/hris-disconnected/)
 // API tokens cannot administer credentials even with an owner write ceiling.
 now=new Date().toISOString();await h.stepUp()
 const token=(await h.send('/api/easel/tokens/issue',{label:'HRIS token boundary',kind:'personal',scope:'write'},h.owner)).value.token
 for(const id of hrisProviders)for(const [path,body] of [[`connections/hris/${id}`,undefined],[`connections/hris/${id}/disconnect`,{}],[`import/${id}/preview`,f.input]]){
  const response=await h.mf.dispatchFetch(h.origin+'/api/easel/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  assert.equal(response.status,403)
 }
 now='2026-02-28T12:00:00.000Z'
 // Complete pages and refusal paths use the same public doors, not adapter pins.
 for(const id of hrisProviders){
  await call(`connections/hris/${id}/connect`,grant(id));edge.extra=100
  assert.equal((await call(`import/${id}/preview`,f.input)).roster.length,104);edge.extra=0
  for(const mode of['duplicate','precision','missing-comp',...(id==='willow'?['withheld']:id==='adp'?['truncated']:id==='rippling'?['unsafe-next']:[])]){
   edge.mode=mode;const r=await h.send(`/api/easel/import/${id}/preview`,f.input,h.owner);assert.ok([400,409,502].includes(r.status),`${id} ${mode}: ${r.text}`)
  }
  edge.mode='';edge.status=302;const refused=await h.send(`/api/easel/import/${id}/preview`,f.input,h.owner);assert.equal(refused.status,502);assert.ok(!refused.text.includes(secret));edge.status=200
  await call(`connections/hris/${id}/disconnect`,{})
 }
 {
 const h=await harness({now:()=>now,outbound:edge.outbound,serviceBindings:{HRIS_ADP_MTLS:edge.outbound}});t.after(()=>h.close())
 const call=hrisCall(h),f=await hrisFixture(call),viewer=await h.person('provider-questions-board@example.test','viewer')
 // The same public journey follows provider-owned dated hires into the ordinary
 // ask/answer/proposal/promotion/escalation flow, then exercises source holds.
 now='2026-02-28T12:00:00.000Z'
 const forecast=(await h.command('approve-budget',{scenario:f.scenario,revision:(await call(`scenario/${f.scenario}`)).scenario.revision})).forecast
 const nativeOwner=await h.person('hris-hiring-owner@example.test','contributor',[f.department.id],true)
 const future=await h.command('position',{scenario:forecast.id,department:f.department.id,line:f.line.id,title:'Provider-owned upcoming hire',annualSalary:'150000',onCostPercent:'0',start:'2026-04',plannedStartDate:'2026-04-10'})
 const official=await call(`scenario/${forecast.id}`)
 await h.command('owner-question-settings',{enabled:true})
 const rule=await h.command('cash-alert-rule-save',{name:'HRIS dependent floor',kind:'floor'})
 for(const id of hrisProviders){
  const kit=`import/${id}`,status=`connections/hris/${id}`
  await call(status+'/connect',grant(id))
  const employeeMap={...f.input.employeeMap,[ids[1]]:{...f.input.employeeMap[ids[1]],positionOrigin:future.originId,ownerEmployeeId:ids[1],ownerEmail:'hris-hiring-owner@example.test'}}
  const input={scenario:forecast.id,asOf:'2026-02-28',employeeMap}
  const p=await call(kit+'/preview',input)
  await h.kit(id,'commit',{...input,fingerprint:p.fingerprint},h.owner,409)
  let g=await call(kit+'/stage',{...input,fingerprint:p.fingerprint,sourceRevision:p.sourceReview.revision})
  assert.ok(g.impacts.scenarios.some(r=>r.id===forecast.id));assert.ok(g.impacts.alerts.some(r=>r.id===rule.id))
  await call(kit+'/commit',{...input,fingerprint:p.fingerprint})
  const observation=(await call(`payroll/${forecast.id}`)).roster.find(r=>r.employeeId===ids[1]&&r.provider.startsWith(id+':'))
  assert.equal(observation.ownerBinding.sourceEmployeeId,ids[1]);assert.equal(observation.ownerBinding.ownerEmail,'hris-hiring-owner@example.test')
  const ask=async extra=>h.command('owner-question-ask',{scenario:forecast.id,scenarioRevision:(extra?.scenarioRevision??(await call(`scenario/${forecast.id}`)).scenario.revision),kind:'position',originId:future.originId,field:'plannedStartDate',owner:'hris-hiring-owner@example.test',hrisObservation:observation.id,source:'Ignored untrusted ownership prose',question:`${id}: confirm the hire date`,dueAt:'2026-02-28T12:30:00.000Z',...extra})
  let q=await ask()
  assert.match(q.source,new RegExp(id));assert.equal(q.providerEvidence.observation,observation.id)
  await h.command('owner-question-answer',{id:q.id,revision:q.revision,choice:'new-date',date:'2026-05-15'},viewer,404)
  q=await h.command('owner-question-answer',{id:q.id,revision:q.revision,choice:'new-date',date:'2026-05-15'},nativeOwner)
  assert.equal(q.answer.by,'hris-hiring-owner@example.test');assert.equal(q.answer.source,q.source)
  const proposal=await h.command('owner-question-propose',{id:q.id,revision:q.revision})
  const changed=await call(`scenario/${proposal.id}`)
  const safeProposal=await h.get(`/api/easel/scenario/${proposal.id}`,await h.person(`${id}-restricted-analyst@example.test`,'finance',[],false))
  assert.ok(!JSON.stringify(safeProposal).includes(ids[1])&&!JSON.stringify(safeProposal).includes('Private Morgan HRIS'))
  assert.equal(changed.inputs.position.find(r=>r.originId===future.originId).plannedStartDate,'2026-05-15')
  assert.equal(changed.inputs.position.find(r=>r.originId===future.originId).ownerAssumption.providerEvidence.observation,observation.id)
  assert.equal((await call(`scenario/${forecast.id}`)).inputs.position.find(r=>r.originId===future.originId).plannedStartDate,'2026-04-10')
  await h.command('proposal-submit',{id:proposal.id,revision:changed.scenario.revision})
  const submitted=await call(`scenario/${proposal.id}`)
  await h.command('proposal-promote',{id:proposal.id,revision:submitted.scenario.revision})
  assert.equal((await call(`scenario/${forecast.id}`)).inputs.position.find(r=>r.originId===future.originId).plannedStartDate,'2026-05-15')
  await h.command('position',{...future,id:(await call(`scenario/${forecast.id}`)).inputs.position.find(r=>r.originId===future.originId).id,scenario:forecast.id,line:f.line.id,department:f.department.id,annualSalary:'150000',onCostPercent:'0',start:'2026-04',plannedStartDate:'2026-04-10'})
  // An unanswered provider question escalates once without changing its date.
  const pending=await ask()
  now='2026-02-28T13:00:00.000Z'
  await h.command('owner-question-escalate',{})
  const escalated=(await call('owner-questions')).questions.find(r=>r.id===pending.id)
  assert.ok(escalated.escalatedAt);assert.equal(escalated.answer,undefined)
  await h.command('owner-question-cancel',{id:escalated.id,revision:escalated.revision,reason:'Finish source review first'})
  // Preview remains write-free. Staging a renamed source department holds the
  // working forecast and alerts until its explicit reviewed mapping is accepted.
  edge.department='Renamed Product Engineering'
  const refresh=await call(kit+'/preview',input),beforeStage=await call('source-guard')
  assert.ok(refresh.sourceReview.issues.some(i=>i.kind==='hris-metadata'),id)
  assert.deepEqual(await call('source-guard'),beforeStage)
  g=await call(kit+'/stage',{...input,fingerprint:refresh.fingerprint,sourceRevision:refresh.sourceReview.revision})
  await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
  await h.command('cash-alert-check',{})
  const alerts=await call('cash-alerts');assert.ok(alerts.rules.find(r=>r.id===rule.id).blocked.includes('Source refresh'))
  await h.kit(id,'commit',{...input,fingerprint:refresh.fingerprint},h.owner,409)
  g=await h.command('source-guard-review',{id:g.id,revision:g.revision,fingerprint:g.fingerprint,decisions:g.unresolved.map(i=>({issue:i.id,action:'exclude',reason:'Reviewed provider department rename; retain the explicit Engineering mapping'}))})
  // This date is already accepted; replace it through exact journal undo.
  const old=(await call(status)).imports.find(i=>i.scenario===forecast.id&&i.status==='imported')
  await call(kit+'/undo',{id:old.id})
  const renamed=await acceptHris(call,id,input)
  edge.missing=true
  const incomplete=await call(kit+'/preview',input)
  g=await call(kit+'/stage',{...input,fingerprint:incomplete.fingerprint,sourceRevision:incomplete.sourceReview.revision})
  assert.ok(g.unresolved.some(i=>i.kind==='hris-coverage'));await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
  assert.equal((await call(`headcount/${forecast.id}`)).months.find(r=>r.month==='2026-02'&&r.department===f.department.id).actualHeadcount,null)
  edge.missing=false
  await call(kit+'/undo',{id:renamed.import.id})
  const restored=await acceptHris(call,id,input)
  edge.mode='missing-comp'
  const failed=await call(kit+'/stage',input)
  assert.ok(failed.unresolved.some(i=>i.kind==='hris-read'));await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
  edge.mode=''
  await call(kit+'/undo',{id:restored.import.id})
  const recovered=await acceptHris(call,id,input)
  now='2026-03-02T13:00:00.000Z'
  assert.ok((await call('source-guard')).guards.find(r=>r.id===g.id).unresolved.some(i=>i.kind==='freshness'))
  await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
  await call(kit+'/undo',{id:recovered.import.id});await call(status+'/disconnect',{})
  edge.department='Product Engineering';now='2026-02-28T12:00:00.000Z'
 }

 await h.command('member',{email:'hris-hiring-owner@example.test',name:'hris-hiring-owner',role:'contributor',departments:[f.department.id],active:false})
 const erasedOwner=await h.command('person-erase',{email:'hris-hiring-owner@example.test'})
 for(const id of hrisProviders){
  await call(`connections/hris/${id}/connect`,grant(id))
  const p=await call(`import/${id}/preview`,{scenario:forecast.id,asOf:'2026-02-28'})
  assert.ok(p.roster.some(r=>r.employeeId===erasedOwner.pseudonym));assert.ok(!JSON.stringify(p).includes(ids[1]))
 }
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}})
 assert.equal(archive.status,200)
 const zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const entry of Object.values(zip.files).filter(e=>!e.dir)){
  const body=await entry.async('string')
  assert.ok(!body.includes(ids[1])&&!body.includes('Private Morgan HRIS')&&!body.includes('hris-hiring-owner@example.test'),entry.name+' leaked erased provider ownership')
 }

 }
})
