import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { qboProvider,qboGrant,qboFixture,qboCall,acceptQbo } from './qbo-fixture.mjs'

test('QuickBooks OAuth backfills separate reconciled months and imports idempotent corrections under native custody',async t=>{
 const provider=qboProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await qboFixture(h),call=qboCall(h)
 const board=await h.person('qbo-board@example.test','viewer')
 assert.equal((await h.send('/api/easel/connections/qbo/connect',qboGrant,board)).status,403)
 const pending=await call(['connections','qbo','begin'].join('/'),qboGrant),state=new URL(pending.authorizationUrl).searchParams.get('state')
 const callback=`/api/easel/connections/qbo/callback?${new URLSearchParams({state,code:'synthetic-easel-6',realmId:qboGrant.realmId})}`
 assert.equal((await h.send(callback,undefined,h.owner)).status,303)
 assert.equal((await h.send(callback,undefined,h.owner)).status,409)
 const status=await h.get('/api/easel/connections/qbo');assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes(qboGrant.clientSecret))
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='qbo'").first();assert.ok(!sealed.sealed.includes('synthetic-easel-rotated'))
 for(let i=0;i<24;i++){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,p=await acceptQbo(h,{month,includeOpening:i===0});assert.equal(p.source.trialBalance.balanced,true);if(month==='2025-01')assert.deepEqual(Object.values(p.source.trialBalance.automaticClose).sort((a,b)=>a-b),[-110000,110000]);if(month==='2024-06')assert.equal(p.changedRows,0)}
 assert.equal((await h.get('/api/easel/connections/qbo')).months.filter(m=>m.status==='accepted').length,24)
 for(const month of['2026-01','2026-02'])await acceptQbo(h,{month,includeOpening:false})
 const count=await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first()
 assert.equal((await h.kit('qbo','preview',{month:'2026-02',includeOpening:false})).unchanged,true)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first(),count)
 provider.change=true
 const corrected=await acceptQbo(h,{month:'2026-02',includeOpening:false});assert.equal(corrected.changedRows,2);assert.equal(corrected.changedTransactions,1)
 assert.equal((await h.kit('qbo','preview',{month:'2026-02',includeOpening:false})).unchanged,true)
 const actuals=await h.get('/api/easel/actuals');assert.ok(actuals.trialBalances.every(m=>m.difference===0))
 assert.equal(actuals.months.find(m=>m.period==='2026-02').revenue,12500)
 const firstBatch=(await h.get('/api/easel/state')).batches.find(b=>b.qboSource?.month==='2024-01')
 await h.kit('actuals','undo',{id:firstBatch.id})
 const budget=(await h.get('/api/easel/state')).scenarios[0],approval=await h.command('approve-budget',{scenario:budget.id,revision:budget.revision})
 const incomplete=await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'},h.owner,409);assert.match(incomplete.error,/QuickBooks history is incomplete/)
 await acceptQbo(h,{month:'2024-01',includeOpening:true})
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 const variance=await h.get('/api/easel/variance/2026-01'),detail=variance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.ok(detail.citations.length>0);assert.match(detail.citations[0].providerUrl,/app\.sandbox\.qbo\.intuit\.com\/app\/journal\?txnId=synthetic-easel-transaction-2026-01/)
 const boardVariance=await h.get('/api/easel/variance/2026-01',board),boardRow=boardVariance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.equal(boardRow.actual,detail.actual);assert.deepEqual(boardRow.citations,[])
 provider.extra='mapped'
 const auto=await acceptQbo(h,{month:'2026-03',includeOpening:false})
 assert.equal(auto.accounts.find(a=>a.account==='4001').target,f.line.id)
 assert.equal(auto.source.changes.accounts.find(a=>a.code==='4001').change,'new')
 assert.deepEqual(auto.source.dimensions.classes,[{id:'synthetic-easel-class-1',name:'Subscriptions'}])
 assert.deepEqual(auto.source.dimensions.locations,[{id:'synthetic-easel-location-1',name:'East'}])
 const metadata=await h.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.qboAccountId')='synthetic-easel-401'").first();assert.equal(JSON.parse(metadata.value).sourceDimensions.location,'East')
 provider.extra='both'
 const p=await h.kit('qbo','preview',{month:'2026-03',includeOpening:false});assert.equal(p.source.trialBalance.balanced,true)
 await h.kit('qbo','commit',{month:'2026-03',includeOpening:false,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint},h.owner,409)
 await h.command('account-map',{account:'9999',target:f.line.id});await acceptQbo(h,{month:'2026-03',includeOpening:false})
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-03').revenue,15000)
 const priorActuals=await h.get('/api/easel/actuals');provider.transactionType='synthetic-easel-777'
 const unsupported=await h.kit('qbo','preview',{month:'2026-03',includeOpening:false})
 assert.ok(unsupported.source.unsupportedTransactions.length)
 await h.kit('qbo','commit',{month:'2026-03',includeOpening:false,fingerprint:unsupported.fingerprint,sourceFingerprint:unsupported.sourceFingerprint},h.owner,409)
 assert.deepEqual(await h.get('/api/easel/actuals'),priorActuals);provider.transactionType='Journal Entry'
 await h.stepUp();const token=await call(['tokens','issue'].join('/'),{label:'QBO token refusal',kind:'personal',scope:'write'})
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/qbo',{headers:{authorization:`Bearer ${token.token}`}})).status,403)
 for(const op of['resume','undo','status'])assert.equal((await h.mf.dispatchFetch(h.origin+`/api/easel/import/actuals/${op}`,{method:'POST',headers:{authorization:`Bearer ${token.token}`,'content-type':'application/json'},body:JSON.stringify({id:firstBatch.id})})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const text=await file.async('string');assert.ok(!text.includes(qboGrant.clientSecret));assert.ok(!text.includes(sealed.sealed),'Portable export excludes encrypted provider credentials too')}
 provider.status=429;await call(['connections','qbo','check'].join('/'),{});assert.ok((await h.get('/api/easel/connections/qbo')).rateLimit);provider.status=200
 await call(['connections','qbo','check'].join('/'),{});assert.equal((await h.get('/api/easel/connections/qbo')).error,null)
 provider.revocation=503
 const disconnected=await call(['connections','qbo','disconnect'].join('/'),{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'refused');assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='qbo'").first(),null)
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-02').revenue,12500)
 const events=await h.get('/api/easel/activity')
 for(const action of ['qbo-connected','qbo-checked','qbo-disconnected']){const event=events.find(e=>e.action===action);assert.ok(event);assert.equal(event.actor,'owner@example.test')}
 assert.ok(!JSON.stringify(events).includes(qboGrant.clientSecret))
 assert.equal(events.find(e=>e.action==='qbo-disconnected').detail.localCredentialDeleted,true)
})
