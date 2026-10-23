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
