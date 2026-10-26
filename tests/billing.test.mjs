import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { billingProvider,billingGrant,billingFixture } from './billing-fixture.mjs'
import { readWorkbook,proveFormulas } from './spreadsheet-proof.mjs'

test('Subscription billing review reconciles exact movements and cohorts, drives ARR and retains native sealed custody',async t=>{
 const provider=billingProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await billingFixture(h),post=async(path,body,cookie=h.owner,status=200)=>{const r=await h.send('/api/easel/'+path,body,cookie);assert.equal(r.status,status,r.text);return r.value}
 const board=await h.person('billing-board@example.test','viewer'),contributor=await h.person('billing-sales@example.test','contributor',[f.department.id])
 for(const cookie of[board,contributor])await post(['connections','stripe','connect'].join('/'),billingGrant,cookie,403)
 await post(['connections','stripe','connect'].join('/'),billingGrant)
 const status=await h.get('/api/easel/connections/stripe');assert.equal(status.connected,true);assert.equal(status.suffix,'el-1');assert.ok(!JSON.stringify(status).includes(billingGrant.key))
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='stripe'").first();assert.ok(!sealed.sealed.includes(billingGrant.key))
 const before=await h.get(`/api/easel/scenario/${f.scenario}`)
 const preview=await post(['billing','preview'].join('/'),f.input)
 assert.deepEqual(await h.get(`/api/easel/scenario/${f.scenario}`),before)
 assert.deepEqual(preview.bridge.map(r=>[r.endingMrrCents,r.arrCents,r.activeCustomers]),[[35000,420000,3],[25000,300000,2],[17000,204000,2]])
 assert.deepEqual(preview.bridge.map(r=>[r.newMrrCents,r.expansionMrrCents,r.contractionMrrCents,r.churnMrrCents,r.reactivationMrrCents]),[[35000,0,0,0,0],[0,5000,10000,5000,0],[0,2000,0,15000,5000]])
 assert.deepEqual(preview.bridge.map(r=>[r.grossRevenueRetentionBps,r.netRevenueRetentionBps]),[[null,null],[5714,7143],[4000,4800]])
 assert.deepEqual(preview.cohorts.map(r=>[r.cohortMonth,r.month,r.customers,r.activeCustomers,r.mrrCents]),[['2026-01','2026-01',3,3,35000],['2026-01','2026-02',3,2,25000],['2026-01','2026-03',3,2,17000]])
 assert.ok(preview.reconciliation.every(r=>r.complete&&r.differenceCents===0))
 provider.change=true;await post(['billing','accept'].join('/'),{...f.input,digest:preview.digest},h.owner,409);provider.change=false
 await post(['billing','accept'].join('/'),{...f.input,digest:preview.digest})
 const accepted=await h.get(`/api/easel/scenario/${f.scenario}`)
 assert.deepEqual(accepted.calculation.cells.filter(c=>c.line===f.line.id).slice(0,3).map(c=>c.amount),[35000,25000,17000])
 const dashboard=await h.command('dashboard-save',{name:'Subscription ARR',scenario:f.scenario,audience:'board',widgets:[{metric:'arr',display:'table'}]})
 const view=await h.get(`/api/easel/dashboards/${dashboard.id}`,board)
 assert.deepEqual(view.rows.slice(0,3).map(r=>r.arr),[420000,300000,204000]);assert.doesNotMatch(JSON.stringify(view),/synthetic-easel-customer|subscriptionId/)
 await h.command('dashboard-layout',{dashboard:dashboard.id,revision:0,definitionRevision:dashboard.revision,widgets:[{metric:'arr',display:'chart'}]},board)
 assert.equal((await h.get(`/api/easel/dashboards/${dashboard.id}`,board)).widgets[0].display,'chart')
 const response=await h.mf.dispatchFetch(h.origin+`/api/easel/dashboards/${dashboard.id}/document.xlsx`,{headers:{cookie:board}})
 assert.equal(response.status,200);proveFormulas(await readWorkbook(new Uint8Array(await response.arrayBuffer())),'imported subscription ARR')
 await h.get(`/api/easel/dashboards/${dashboard.id}`,contributor,404)
 const approval=await h.command('approve-budget',{scenario:f.scenario,revision:accepted.scenario.revision})
 const forecast=await h.get(`/api/easel/scenario/${approval.forecast.id}`),nextDriver=forecast.inputs.revenue.find(r=>r.originId===f.driver.originId)
 provider.adjustments=true
 const adjustedInput={...f.input,scenario:forecast.scenario.id,scenarioRevision:forecast.scenario.revision,driver:nextDriver.id}
 const adjustment=await post(['billing','preview'].join('/'),adjustedInput)
 assert.deepEqual(adjustment.bridge.map(r=>r.arrCents),[540000,300000,204000],'Annual cancellation ends the run rate while the original invoice service allocation stays visible')
 assert.deepEqual(adjustment.reconciliation.map(r=>r.differenceCents),[10192,9205,10192])
 assert.deepEqual(adjustment.reconciliation.map(r=>r.deferredCents),[109808,100603,90411])
 assert.deepEqual(adjustment.reconciliation.map(r=>r.refundsCents),[0,2000,0])
 assert.deepEqual(adjustment.reconciliation.map(r=>r.taxCents),[13000,0,0])
 await post(['billing','accept'].join('/'),{...adjustedInput,digest:adjustment.digest},h.owner,409)
 const explanations=Object.fromEntries(adjustment.reconciliation.map(r=>[r.month,`Annual service allocation ${r.serviceRevenueCents} differs from ledger ${r.ledgerRevenueCents}; deferred ${r.deferredCents}, refunds ${r.refundsCents} and tax ${r.taxCents} remain shown separately.`]))
 const explained=await post(['billing','preview'].join('/'),{...adjustedInput,explanations})
 await post(['billing','accept'].join('/'),{...adjustedInput,explanations,digest:explained.digest})
 assert.deepEqual((await h.get(`/api/easel/dashboards/${dashboard.id}`,board)).rows,view.rows,'Frozen ARR retains the accepted source capture')
 await h.stepUp();const token=await post(['tokens','issue'].join('/'),{label:'Billing token refusal',kind:'personal',scope:'write'})
 const denied=await h.mf.dispatchFetch(h.origin+'/api/easel/connections/stripe',{headers:{authorization:`Bearer ${token.token}`}});assert.equal(denied.status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const text=await file.async('string');assert.ok(!text.includes(billingGrant.key));assert.ok(!text.includes(sealed.sealed),'Portable export excludes encrypted provider credentials too')}
 provider.status=429;await post(['connections','stripe','check'].join('/'),{});assert.match((await h.get('/api/easel/connections/stripe')).rateLimit,/60/);provider.status=200
 await post(['connections','stripe','disconnect'].join('/'),{});assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='stripe'").first(),null)
 assert.equal((await h.get('/api/easel/connections/stripe')).providerRevocation.status,'unsupported')
 assert.deepEqual((await h.get(`/api/easel/dashboards/${dashboard.id}`,board)).rows,view.rows)
 const events=await h.get('/api/easel/activity')
 for(const action of ['stripe-connected','stripe-checked','stripe-disconnected']){const event=events.find(e=>e.action===action);assert.ok(event);assert.equal(event.actor,'owner@example.test')}
 assert.ok(!JSON.stringify(events).includes(billingGrant.key))
 assert.equal(events.find(e=>e.action==='stripe-disconnected').detail.localCredentialDeleted,true)
})
