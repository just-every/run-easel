import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { headcountFixture } from './headcount-fixture.mjs'

test('PEOPLE-006 monthly reviewed-file headcount, hiring slippage, backfills, attrition and payroll comparisons retain history with live pay and scenario grants',async t=>{
 const h=await harness();t.after(()=>h.close())
 const call=(path,body)=>body===undefined?h.get(`/api/easel/${path}`):h.send(`/api/easel/${path}`,body,h.owner).then(r=>{assert.equal(r.status,200,JSON.stringify(r.value));return r.value})
 const f=await headcountFixture(call),query=(cookie=h.owner)=>h.get(`/api/easel/headcount/${f.scenario}`,cookie)
 let view=await query()
 const row=(m,d=f.engineering.id)=>view.months.find(r=>r.month===m&&r.department===d)
 assert.deepEqual([row('2026-01').plannedHeadcount,row('2026-01').actualHeadcount,row('2026-01').plannedCostCents],[2,1,2200000])
 assert.deepEqual([row('2026-02').plannedHeadcount,row('2026-02').actualHeadcount,row('2026-02').headcountDifference],[3,3,0])
 assert.deepEqual([row('2026-02').plannedHires,row('2026-02').actualHires,row('2026-02').plannedDepartures,row('2026-02').actualDepartures],[2,3,1,1])
 assert.deepEqual([row('2026-02').plannedCostCents,row('2026-02').actualCostCents,row('2026-02').costDifferenceCents],[2700000,2600000,-100000])
 assert.equal(row('2026-02').backfills,1);assert.equal(row('2026-02').expectedAttritionHundredths,3,'Sum probabilities before rounding once to hundredths of a person')
 assert.deepEqual([row('2026-02',f.sales.id).plannedHeadcount,row('2026-02',f.sales.id).actualHeadcount,row('2026-02',f.sales.id).actualHires],[0,1,1])
 assert.equal(row('2026-03').actualHeadcount,null);assert.equal(row('2026-01').actualCostCents,null)
 assert.equal(view.history.find(r=>r.employeeId==='M').slippageDays,34)
 assert.equal(view.history.find(r=>r.employeeId==='R').slippageDays,9)
 assert.equal(view.history.find(r=>r.employeeId==='D').slippageDays,null,'A month-only plan never guesses day one')
 assert.equal(view.history.filter(r=>r.employeeId==='T').length,2,'Earlier observations remain in history')
 assert.deepEqual(view.months.find(r=>r.month==='2026-02').observations,[{provider:'Justworks',asOf:'2026-02-28'}])
 // A later plan edit leaves the reviewed historical date and slippage intact.
 await h.command('position',{...f.late,scenario:f.scenario,id:f.late.id,line:f.line.id,department:f.engineering.id,annualSalary:'144000',start:'2026-01',plannedStartDate:'2026-01-20',attritionPercent:'1.25'})
 assert.equal((await query()).history.find(r=>r.employeeId==='M').slippageDays,34)
 const stable=await query()
 for(const bad of[{plannedStartDate:'2026-02-30',start:'2026-02'},{plannedStartDate:'2026-02-01',start:'2026-01'},{backfillOrigin:f.monthly.originId,start:'2026-01'},{attritionPercent:'100.01'}])await h.command('position',{scenario:f.scenario,title:'Invalid',annualSalary:'100000',start:'2026-02',line:f.line.id,department:f.engineering.id,...bad},h.owner,400)
 await h.command('input-delete',{kind:'position',id:f.departing.id},h.owner,409)
 assert.deepEqual(await query(),stable)
 const board=await h.person('board@example.test','viewer'),analyst=await h.person('analyst@example.test','finance',[],false),head=await h.person('head@example.test','contributor',[f.engineering.id]),sales=await h.person('sales@example.test','contributor',[f.sales.id])
 for(const cookie of[board,analyst,sales]){const safe=await query(cookie);assert.deepEqual(safe.months,view.months);assert.deepEqual(safe.positions,[]);assert.deepEqual(safe.history,[]);assert.doesNotMatch(JSON.stringify(safe),/Private Morgan|Private Taylor|Private Drew/)}
 assert.equal((await query(head)).history.length,5)
 await h.command('pay-detail',{email:'head@example.test',granted:false})
 assert.deepEqual((await query(head)).history,[])
 // API token pay ceilings use the same server-side view.
 await h.stepUp(analyst)
 const token=(await h.send('/api/easel/tokens/issue',{label:'Headcount totals',kind:'personal',scope:'read'},analyst)).value.token
 const response=await h.mf.dispatchFetch(h.origin+`/api/easel/headcount/${f.scenario}`,{headers:{authorization:`Bearer ${token}`}})
 assert.equal(response.status,200);assert.deepEqual((await response.json()).history,[])
 // Undo removes only that import's observations; older history and cost evidence remain.
 await h.kit('payroll','undo',{id:f.feb.import.id});view=await query()
 assert.equal(row('2026-02').actualHeadcount,null);assert.equal(view.history.length,1)
 assert.equal(row('2026-02').actualCostCents,2600000)
 await h.kit('payroll','undo',{id:f.pay.import.id});view=await query();assert.equal(row('2026-02').actualCostCents,null)
 const privateFinance=await h.person('private@example.test','finance')
 const sandbox=await h.command('sandbox-create',{from:f.scenario,name:'Private hiring'},privateFinance)
 await h.get(`/api/easel/headcount/${sandbox.id}`,h.owner,404)
 await h.command('scenario-share',{scenario:sandbox.id,email:'owner@example.test',mode:'read',revision:(await h.get(`/api/easel/scenario/${sandbox.id}`,privateFinance)).scenario.revision},privateFinance)
 assert.equal((await h.get(`/api/easel/headcount/${sandbox.id}`)).positions.length,4)
 await h.command('scenario-share',{scenario:sandbox.id,email:'owner@example.test',mode:'remove',revision:(await h.get(`/api/easel/scenario/${sandbox.id}`,privateFinance)).scenario.revision},privateFinance)
 await h.get(`/api/easel/headcount/${sandbox.id}`,h.owner,404)
})

test('Connected Gusto observations require reviewed employee mapping and retain dated hiring, departure, backfill, attrition and department cost through the payroll journal', async t => {
 const { gustoObservationFlow } = await import('./gusto-roster-journeys.mjs')
 await gustoObservationFlow(t)
})

test('Gusto accepts only complete read-only provider pages and exact processed payroll cost; failed reads, changed mappings and hidden scenarios cannot mutate observations', async t => {
 const { gustoCompletenessFlow } = await import('./gusto-roster-journeys.mjs')
 await gustoCompletenessFlow(t)
})

test('Gusto credentials stay sealed and archive-excluded while native live pay authority and explicit member erasure govern all retained observations and future pulls', async t => {
 const { gustoCustodyFlow } = await import('./gusto-roster-journeys.mjs')
 await gustoCustodyFlow(t)
})

test('Greenhouse requisitions, accepted offers and closed roles become reviewed revision-bound finance proposals with sealed native custody',async t=>{
 const {greenhouseProvider,greenhouseGrant,greenhouseFixture,promoteATS}=await import('./greenhouse-flow.mjs')
 const provider=greenhouseProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-10-26T12:00:00.000Z'});t.after(()=>h.close())
 const call=async(path,body)=>{path=path.replace(/^\//,'');if(body===undefined)return h.get(`/api/easel/${path}`);const r=await h.send(`/api/easel/${path}`,body,h.owner);assert.equal(r.status,200,r.text);return r.value}
 const f=await greenhouseFixture(call),view=()=>call(`scenario/${f.scenario}`),status=()=>call('/connections/greenhouse')
 const original=await view()
 await call('/connections/greenhouse/connect',greenhouseGrant)
 assert.equal((await status()).connected,true);assert.equal((await status()).keySuffix,'-820');
 provider.failure=429;await call('/connections/greenhouse/check',{});assert.equal((await status()).rateLimited,true);assert.match((await status()).error,/HTTP 429/);provider.failure=200;await call('/connections/greenhouse/check',{});assert.equal((await status()).error,null);assert.equal((await status()).rowCount,1);assert.equal((await status()).lastRefresh,'2026-10-26T12:00:00.000Z');assert.doesNotMatch(JSON.stringify(await status()),new RegExp(greenhouseGrant.apiKey))
 const stored=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='greenhouse'").first();assert.ok(stored.sealed);assert.doesNotMatch(stored.sealed,new RegExp(greenhouseGrant.apiKey))
 const exported=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}});assert.equal(exported.status,200)
 const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(await exported.arrayBuffer());for(const file of Object.values(zip.files))if(!file.dir)assert.doesNotMatch(await file.async('string'),new RegExp(greenhouseGrant.apiKey))
 provider.multiple=true;assert.equal((await h.send('/api/easel/greenhouse/preview',f.input,h.owner)).status,409)
 assert.equal((await call('/greenhouse/preview',{...f.input,openingId:'821'})).source.opening,'ENG-820-1');provider.multiple=false
 let preview=await call('/greenhouse/preview',f.input)
 assert.equal(preview.source.level,'Senior');assert.equal(preview.source.sourceDepartment.name,'Product Engineering');assert.equal(preview.action,'add');assert.deepEqual(await view(),original)
 let p=(await call('/greenhouse/propose',{...f.input,fingerprint:preview.fingerprint})).proposal
 assert.deepEqual(await view(),original)
 let positions=(await call(`scenario/${p.id}`)).inputs.position
 assert.equal(positions[0].holder,'');assert.equal(positions[0].annualSalaryCents,9600000);assert.equal(positions[0].start,'2026-02');assert.equal(positions[0].ats.level,'Senior')
 await promoteATS(call,p)
 const position=(await view()).inputs.position[0];await h.command('position',{...position,scenario:f.scenario,annualSalary:'96000',onCostPercent:'0'});assert.equal((await view()).inputs.position[0].ats.jobId,'820')
 const opened=await view();provider.status='accepted';provider.paginate=true
 preview=await call('/greenhouse/preview',f.input)
 assert.equal(preview.source.start,'2026-04-15');assert.equal(preview.source.annualSalary,'120000.00');assert.equal(preview.prior.start,'2026-02')
 provider.salary='132000.00'
 assert.equal((await h.send('/api/easel/greenhouse/propose',{...f.input,fingerprint:preview.fingerprint},h.owner)).status,409)
 provider.salary='120000.00'
 p=(await call('/greenhouse/propose',{...f.input,fingerprint:preview.fingerprint})).proposal
 positions=(await call(`scenario/${p.id}`)).inputs.position
 assert.equal(positions[0].holder,'Private Morgan Green');assert.equal(positions[0].start,'2026-04');assert.equal(positions[0].annualSalaryCents,12000000);assert.equal(positions[0].plannedStartDate,'2026-04-15')
 assert.deepEqual(await view(),opened)
 // Exact monthly cost changes: February and March are removed; April uses new salary.
 const targetCalc=opened.calculation,proposalView=await call(`scenario/${p.id}`)
 const costs=v=>v.calculation.cells.filter(c=>c.line===f.line.id&&c.department===f.department.id).map(c=>[c.month,c.amount])
 assert.ok(targetCalc);assert.notDeepEqual(costs(opened),costs(proposalView))
 const cost=(v,m)=>costs(v).find(r=>r[0]===m)?.[1]??0
 assert.equal(cost(opened,'2026-02'),800000);assert.equal(cost(proposalView,'2026-02'),0);assert.equal(cost(proposalView,'2026-04'),1000000)
 await call('/command/proposal-submit',{id:p.id})
 await h.command('proposal-promote',{id:p.id,revision:p.revision-1},h.owner,409)
 const contributor=await h.person('ats-head@example.test','contributor',[f.department.id]),viewer=await h.person('ats-board@example.test','viewer'),noPay=await h.person('ats-finance@example.test','finance',[],false)
 for(const cookie of[contributor,viewer,noPay]){
  await h.get('/api/easel/connections/greenhouse',cookie,403)
  for(const path of['/connections/greenhouse/connect','/connections/greenhouse/disconnect','/connections/greenhouse/check','/greenhouse/preview','/greenhouse/propose'])assert.equal((await h.send(`/api/easel${path}`,{...f.input,...greenhouseGrant,fingerprint:preview.fingerprint},cookie)).status,403)
  if(cookie!==noPay)await h.command('proposal-promote',{id:p.id,revision:p.revision},cookie,403)
 }
 await call('/command/proposal-promote',{id:p.id,revision:p.revision})
 assert.equal((await view()).inputs.position[0].holder,'Private Morgan Green')
 assert.doesNotMatch(JSON.stringify(await h.get(`/api/easel/scenario/${f.scenario}`,viewer)),/Private Morgan/)
 // Target revision conflicts refuse promotion without overwriting intervening edits.
 provider.paginate=false;preview=await call('/greenhouse/preview',f.input);provider.status='closed'
 preview=await call('/greenhouse/preview',f.input);assert.equal(preview.action,'remove')
 p=(await call('/greenhouse/propose',{...f.input,fingerprint:preview.fingerprint})).proposal
 assert.deepEqual((await call(`scenario/${p.id}`)).inputs.position,[])
 await call('/command/proposal-submit',{id:p.id});await h.command('position',{scenario:f.scenario,title:'Unrelated hire',department:f.department.id,line:f.line.id,start:'2026-01',annualSalary:'12000'})
 await h.command('proposal-promote',{id:p.id,revision:p.revision},h.owner,409)
 preview=await call('/greenhouse/preview',f.input);p=(await call('/greenhouse/propose',{...f.input,fingerprint:preview.fingerprint})).proposal;await promoteATS(call,p)
 assert.deepEqual((await view()).inputs.position.map(p=>p.title),['Unrelated hire'])
 await h.stepUp();const issued=await h.send('/api/easel/tokens/issue',{label:'ATS token refusal',kind:'personal',scope:'read'},h.owner)
 const r=await h.mf.dispatchFetch(h.origin+'/api/easel/connections/greenhouse',{headers:{authorization:`Bearer ${issued.value.token}`}});assert.equal(r.status,403)
 for(const failure of[302,429,500]){provider.failure=failure;const before=await view();assert.equal((await h.send('/api/easel/greenhouse/preview',f.input,h.owner)).status,502);assert.deepEqual(await view(),before)}
 await call('/connections/greenhouse/disconnect',{})
 assert.equal((await status()).connected,false);assert.equal((await status()).revocation,'unsupported');assert.match((await status()).revocationInstruction,/Delete the Harvest API key/)
 assert.equal(await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='greenhouse'").first(),null)
 const activity=await call('activity');assert.match(JSON.stringify(activity),/greenhouse-connected/);assert.match(JSON.stringify(activity),/greenhouse-disconnected/);assert.doesNotMatch(JSON.stringify(activity),/synthetic-easel-820|never-retain/)
})
