import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { netsuiteProvider,netsuiteGrant,netsuiteFixture,netsuiteCall,acceptNetsuite } from './netsuite-fixture.mjs'

test('CONNECT-003 NetSuite SuiteQL backfills separate reconciled months and imports idempotent corrections under native custody',async t=>{
 const provider=netsuiteProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await netsuiteFixture(h),call=netsuiteCall(h)
 const board=await h.person('netsuite-board@example.test','viewer')
 assert.equal((await h.send('/api/easel/connections/netsuite/connect',netsuiteGrant,board)).status,403)
 await call('connections/netsuite/connect',netsuiteGrant)
 for(const[sub,entity]of[['1',f.entities.first],['2',f.entities.second]])await call('connections/netsuite/map',{subsidiaryId:sub,entity:entity.id})
 const status=await h.get('/api/easel/connections/netsuite');assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes(netsuiteGrant.tokenSecret))
 provider.initial=true;provider.denseMonth='2026-02';provider.displaced=true
 const beforeInitial=await h.get('/api/easel/actuals')
 const initial=await h.kit('netsuite','preview',{month:'2024-01',subsidiaryId:'1',includeOpening:true})
 assert.equal(initial.accounts.find(a=>a.account==='4002').target,f.line.id)
 assert.equal(initial.source.changes.accounts.find(a=>a.code==='4002').change,'new')
 assert.ok(initial.unmappedAccounts.includes('9998'))
 assert.deepEqual(await h.get('/api/easel/actuals'),beforeInitial,'preview never writes actuals')
 await h.kit('netsuite','commit',{month:'2024-01',subsidiaryId:'1',includeOpening:true,fingerprint:initial.fingerprint,sourceFingerprint:initial.sourceFingerprint},h.owner,409)
 await h.command('account-map',{account:'9998',target:f.line.id})
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='netsuite'").first();assert.ok(!sealed.sealed.includes(netsuiteGrant.tokenId))
 for(const subsidiaryId of ['1','2'])for(let i=0;i<24;i++){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,p=await acceptNetsuite(h,{month,includeOpening:i===0,subsidiaryId});assert.equal(p.source.trialBalance.balanced,true);if(month==='2024-06')assert.equal(p.changedRows,0)}
 assert.equal((await h.get('/api/easel/connections/netsuite')).months.filter(m=>m.status==='accepted').length,48)
 for(const subsidiaryId of ['1','2'])for(const month of['2026-01','2026-02'])await acceptNetsuite(h,{month,includeOpening:false,subsidiaryId})
 const count=await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first()
 assert.equal((await h.kit('netsuite','preview',{month:'2026-02',includeOpening:false,subsidiaryId:'1'})).unchanged,true)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS count FROM e_actuals').first(),count)
 provider.change=true
 const corrected=await acceptNetsuite(h,{month:'2026-02',includeOpening:false,subsidiaryId:'1'});assert.equal(corrected.changedRows,2);assert.equal(corrected.changedTransactions,1)
 assert.equal((await h.kit('netsuite','preview',{month:'2026-02',includeOpening:false,subsidiaryId:'1'})).unchanged,true)
 const actuals=await h.get('/api/easel/actuals');assert.ok(actuals.trialBalances.every(m=>m.difference===0))
 assert.equal(actuals.months.find(m=>m.period==='2026-02').revenue,19500)
 const firstBatch=(await h.get('/api/easel/state')).batches.find(b=>b.netsuiteSource?.month==='2024-01'&&b.netsuiteSource?.subsidiaryId==='1')
 await h.kit('actuals','undo',{id:firstBatch.id})
 const budget=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.scenario.id),approval=await h.command('approve-budget',{scenario:budget.id,revision:budget.revision})
 const incomplete=await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'},h.owner,409);assert.match(incomplete.error,/NetSuite history is incomplete/)
 await acceptNetsuite(h,{month:'2024-01',includeOpening:true,subsidiaryId:'1'})
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 const postedMonth=await h.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.netsuiteTransactionId')='100025' AND json_extract(value,'$.netsuiteAccountId')='400'").first()
 assert.equal(JSON.parse(postedMonth.value).date,'2026-01-31')
 assert.equal(JSON.parse(postedMonth.value).netsuiteSourceDate,'2026-02-01')
 assert.equal(JSON.parse(postedMonth.value).netsuitePostingPeriod,'999999')
 const variance=await h.get('/api/easel/variance/2026-01'),detail=variance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.equal(detail.actual,10000);assert.equal(detail.citations.length,1);assert.match(detail.citations[0].providerUrl,/1234567-sb1\.app\.netsuite\.com\/app\/accounting\/transactions\/transaction\.nl\?id=100025/)
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-02'})
 const febVariance=await h.get('/api/easel/variance/2026-02')
 const febDetail=febVariance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.equal(febDetail.citations.length,602,'every accepted split and correction row is available, without an evidence cap')
 assert.equal(febDetail.citations.reduce((n,r)=>n+r.amount,0),12500)
 assert.ok(provider.reads.some(q=>q.includes('AS transaction_id')))
 const boardVariance=await h.get('/api/easel/variance/2026-01',board),boardRow=boardVariance.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
 assert.equal(boardRow.actual,detail.actual);assert.deepEqual(boardRow.citations,[])
 provider.extra='mapped'
 const auto=await acceptNetsuite(h,{month:'2026-03',includeOpening:false,subsidiaryId:'1'})
 assert.equal(auto.accounts.find(a=>a.account==='4001').target,f.line.id)
 assert.equal(auto.source.changes.accounts.find(a=>a.code==='4001').change,'new')
 assert.deepEqual(auto.source.dimensions.classes,[{id:'20',name:'Enterprise'}])
 assert.deepEqual(auto.source.dimensions.locations,[{id:'30',name:'East'}])
 const metadata=await h.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.netsuiteAccountId')='401'").first();assert.equal(JSON.parse(metadata.value).sourceDimensions.location,'East')
 provider.extra='both'
 const p=await h.kit('netsuite','preview',{month:'2026-03',includeOpening:false,subsidiaryId:'1'});assert.equal(p.source.trialBalance.balanced,true)
 await h.kit('netsuite','commit',{month:'2026-03',includeOpening:false,subsidiaryId:'1',fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint},h.owner,409)
 const observation=await h.kit('netsuite','observe',{month:'2026-03',subsidiaryId:'1',includeOpening:false})
 assert.ok(observation.unmappedAccounts.includes('9999'));assert.ok(observation.impacts.reports.length);assert.equal(observation.issues.find(i=>i.account==='9999').proposals[0].target,f.line.id)
 const beforeFrozen=await h.get(`/api/easel/snapshot/${approval.snapshot}`)
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-03'},h.owner,409)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approval.snapshot}`),beforeFrozen)
 await h.command('account-map',{account:'9999',target:f.line.id});await acceptNetsuite(h,{month:'2026-03',includeOpening:false,subsidiaryId:'1'})
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-03').revenue,15000)
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-03'})
 provider.status=503
 await h.kit('netsuite','observe',{month:'2026-03',subsidiaryId:'1',includeOpening:false})
 await h.get(`/api/easel/scenario/${approval.forecast.id}`,h.owner,409)
 assert.deepEqual(await h.get(`/api/easel/snapshot/${approval.snapshot}`),beforeFrozen)
 provider.status=200
 await h.kit('netsuite','observe',{month:'2026-03',subsidiaryId:'1',includeOpening:false})
 await h.get(`/api/easel/scenario/${approval.forecast.id}`)
 const priorActuals=await h.get('/api/easel/actuals');provider.badTrial=true
 const difference=await h.kit('netsuite','preview',{month:'2026-03',includeOpening:false,subsidiaryId:'1'});assert.equal(difference.source.trialBalance.balanced,false)
 await h.kit('netsuite','commit',{month:'2026-03',includeOpening:false,subsidiaryId:'1',fingerprint:difference.fingerprint,sourceFingerprint:difference.sourceFingerprint},h.owner,409)
 assert.deepEqual(await h.get('/api/easel/actuals'),priorActuals);provider.badTrial=false
 for(const {dimension,member} of f.dimensions){
  const report=await h.get('/api/easel/dimension-report/actuals?dimension='+dimension.id)
  assert.equal(report.dimensions[0].members.find(m=>m.id===member.id).lineTotals[f.line.id]['2026-03'],15000)
 }
 const posted=JSON.parse(metadata.value)
 assert.equal(posted.sourceDimensions['tracking-option'],'East')
 await h.stepUp();const token=await call(['tokens','issue'].join('/'),{label:'NetSuite token refusal',kind:'personal',scope:'write'})
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/netsuite',{headers:{authorization:`Bearer ${token.token}`}})).status,403)
 for(const op of['resume','undo','status'])assert.equal((await h.mf.dispatchFetch(h.origin+`/api/easel/import/actuals/${op}`,{method:'POST',headers:{authorization:`Bearer ${token.token}`,'content-type':'application/json'},body:JSON.stringify({id:firstBatch.id})})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const text=await file.async('string');assert.ok(!text.includes(netsuiteGrant.tokenSecret));assert.ok(!text.includes(sealed.sealed),'Portable export excludes encrypted provider credentials too')}
 provider.status=429;await call(['connections','netsuite','check'].join('/'),{});assert.ok((await h.get('/api/easel/connections/netsuite')).rateLimit);provider.status=200
 await call(['connections','netsuite','check'].join('/'),{});assert.equal((await h.get('/api/easel/connections/netsuite')).error,null)

 const disconnected=await call(['connections','netsuite','disconnect'].join('/'),{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'owner-action-required');assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='netsuite'").first(),null)
 assert.equal((await h.get('/api/easel/actuals')).months.find(m=>m.period==='2026-02').revenue,19500)
 const entityView=await h.get(`/api/easel/scenario/${approval.forecast.id}`);assert.equal(entityView.calculation.profit[0].revenue,10000);assert.equal(entityView.actualsHistory.cells.find(c=>c.month==='2026-01'&&c.line===f.line.id).amount,10000)
 const events=await h.get('/api/easel/activity?record=netsuite')
 for(const action of ['netsuite-connected','netsuite-checked','netsuite-disconnected']){const event=events.find(e=>e.action===action);assert.ok(event);assert.equal(event.actor,'owner@example.test')}
 assert.ok(!JSON.stringify(events).includes(netsuiteGrant.tokenSecret))
 assert.equal(events.find(e=>e.action==='netsuite-disconnected').detail.localCredentialDeleted,true)
 const {proveLedgerOpenings}=await import('./ledger-openings-journey.mjs');await proveLedgerOpenings(t,['netsuite'])
})
