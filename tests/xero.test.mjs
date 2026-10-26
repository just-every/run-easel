import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { xeroProvider,xeroGrant,xeroFixture,xeroCall,acceptXero } from './xero-fixture.mjs'

test('Xero OAuth backfills separate reconciled months and imports idempotent corrections under native custody',async t=>{
 const provider=xeroProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await xeroFixture(h),call=xeroCall(h)
 const board=await h.person('xero-board@example.test','viewer')
 assert.equal((await h.send('/api/easel/connections/xero/connect',xeroGrant,board)).status,403)
 const pending=await call(['connections','xero','begin'].join('/'),xeroGrant),state=new URL(pending.authorizationUrl).searchParams.get('state')
 const callback=`/api/easel/connections/xero/callback?${new URLSearchParams({state,code:'synthetic-easel-6',})}`
 assert.equal((await h.send(callback,undefined,h.owner)).status,303)
 assert.equal((await h.send(callback,undefined,h.owner)).status,409)
 const status=await h.get('/api/easel/connections/xero');assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes(xeroGrant.clientSecret))
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='xero'").first();assert.ok(!sealed.sealed.includes('synthetic-easel-rotated'))
 for(let i=0;i<24;i++){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,p=await acceptXero(h,{month,includeOpening:i===0});assert.equal(p.source.trialBalance.balanced,true);if(month==='2024-06')assert.equal(p.changedRows,0)}
 assert.equal((await h.get('/api/easel/connections/xero')).months.filter(m=>m.status==='accepted').length,24)
 for(const month of['2026-01','2026-02'])await acceptXero(h,{month,includeOpening:false})
 const count=await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first()
 assert.equal((await h.kit('xero','preview',{month:'2026-02',includeOpening:false})).unchanged,true)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first(),count)
 provider.change=true
 const corrected=await acceptXero(h,{month:'2026-02',includeOpening:false});assert.equal(corrected.changedRows,2);assert.equal(corrected.changedTransactions,1)
 assert.equal((await h.kit('xero','preview',{month:'2026-02',includeOpening:false})).unchanged,true)
 const actuals=await h.get('/api/easel/actuals');assert.ok(actuals.trialBalances.every(m=>m.difference===0))
 assert.equal(actuals.months.find(m=>m.period==='2026-02').revenue,12500)
 const firstBatch=(await h.get('/api/easel/state')).batches.find(b=>b.xeroSource?.month==='2024-01')
 await h.kit('actuals','undo',{id:firstBatch.id})
 const budget=(await h.get('/api/easel/state')).scenarios[0],approval=await h.command('approve-budget',{scenario:budget.id,revision:budget.revision})
 const incomplete=await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'},h.owner,409);assert.match(incomplete.error,/Xero history is incomplete/)
 await acceptXero(h,{month:'2024-01',includeOpening:true})
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 const variance=await h.get('/api/easel/variance/2026-01'),detail=variance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.ok(detail.citations.length>0);assert.match(detail.citations[0].providerUrl,/go\.xero\.com\/Journal\/View\.aspx\?JournalID=synthetic-easel-transaction-2026-01/)
 const boardVariance=await h.get('/api/easel/variance/2026-01',board),boardRow=boardVariance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.equal(boardRow.actual,detail.actual);assert.deepEqual(boardRow.citations,[])
 provider.extra='mapped'
 const auto=await acceptXero(h,{month:'2026-03',includeOpening:false})
 assert.equal(auto.accounts.find(a=>a.account==='4001').target,f.line.id)
 assert.equal(auto.source.changes.accounts.find(a=>a.code==='4001').change,'new')
 assert.deepEqual(auto.source.dimensions.classes,[{id:'synthetic-easel-option-1',name:'Subscriptions'}])
 assert.deepEqual(auto.source.dimensions.locations,[{id:'synthetic-easel-option-2',name:'East'}])
 const metadata=await h.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.xeroAccountId')='synthetic-easel-401'").first();assert.equal(JSON.parse(metadata.value).sourceDimensions.location,'East')
 provider.extra='both'
 const p=await h.kit('xero','preview',{month:'2026-03',includeOpening:false});assert.equal(p.source.trialBalance.balanced,true)
 await h.kit('xero','commit',{month:'2026-03',includeOpening:false,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint},h.owner,409)
 await h.command('account-map',{account:'9999',target:f.line.id});await acceptXero(h,{month:'2026-03',includeOpening:false})
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-03').revenue,15000)
 const priorActuals=await h.get('/api/easel/actuals');provider.badTrial=true
 await h.kit('xero','preview',{month:'2026-03',includeOpening:false},h.owner,409)
 assert.deepEqual(await h.get('/api/easel/actuals'),priorActuals);provider.badTrial=false
 for(const {dimension,member} of f.dimensions){
  const report=await h.get('/api/easel/dimension-report/actuals?dimension='+dimension.id)
  assert.equal(report.dimensions[0].members.find(m=>m.id===member.id).lineTotals[f.line.id]['2026-03'],15000)
 }
 const posted=JSON.parse(metadata.value)
 assert.equal(posted.sourceDimensions['tracking-option'],'East')
 await h.stepUp();const token=await call(['tokens','issue'].join('/'),{label:'QBO token refusal',kind:'personal',scope:'write'})
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/xero',{headers:{authorization:`Bearer ${token.token}`}})).status,403)
 for(const op of['resume','undo','status'])assert.equal((await h.mf.dispatchFetch(h.origin+`/api/easel/import/actuals/${op}`,{method:'POST',headers:{authorization:`Bearer ${token.token}`,'content-type':'application/json'},body:JSON.stringify({id:firstBatch.id})})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const text=await file.async('string');assert.ok(!text.includes(xeroGrant.clientSecret));assert.ok(!text.includes(sealed.sealed),'Portable export excludes encrypted provider credentials too')}
 provider.status=429;await call(['connections','xero','check'].join('/'),{});assert.ok((await h.get('/api/easel/connections/xero')).rateLimit);provider.status=200
 await call(['connections','xero','check'].join('/'),{});assert.equal((await h.get('/api/easel/connections/xero')).error,null)
 provider.revocation=503
 const disconnected=await call(['connections','xero','disconnect'].join('/'),{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'refused');assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='xero'").first(),null)
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-02').revenue,12500)
 const events=await h.get('/api/easel/activity')
 for(const action of ['xero-connected','xero-checked','xero-disconnected']){const event=events.find(e=>e.action===action);assert.ok(event);assert.equal(event.actor,'owner@example.test')}
 assert.ok(!JSON.stringify(events).includes(xeroGrant.clientSecret))
 assert.equal(events.find(e=>e.action==='xero-disconnected').detail.localCredentialDeleted,true)
})
