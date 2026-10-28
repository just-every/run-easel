import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { intacctProvider,intacctFixture,intacctCall,intacctGrant,acceptIntacct } from './intacct-fixture.mjs'

test('CONNECT-011 recorded Web Services history, reviewed entity corrections, native custody and source consumption',async t=>{
 const provider=intacctProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-05-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await intacctFixture(h),call=intacctCall(h),viewer=await h.person('intacct-board@example.test','viewer')
 assert.equal((await h.send('/api/easel/connections/intacct',undefined,viewer)).status,403)
 assert.equal((await h.send('/api/easel/connections/intacct/disconnect',{},viewer)).status,403)
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='intacct'").first()
 assert.ok(sealed.sealed&&!sealed.sealed.includes(intacctGrant.userPassword))
 let status=await h.get('/api/easel/connections/intacct');assert.equal(status.connected,true);assert.equal(status.schedule,'Manual');assert.equal(status.bindings.length,2)
 assert.ok(!JSON.stringify(status).includes(intacctGrant.senderPassword));assert.ok(!JSON.stringify(status).includes(intacctGrant.userPassword))
 for(const [sourceEntity,entity]of [['CA',f.ca],['EU',f.eu]]){
  for(let i=0;i<24;i++){
   const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,p=await acceptIntacct(h,{sourceEntity,month,includeOpening:i===0})
   assert.equal(p.source.trialBalance.balanced,true,`${sourceEntity} ${month}`)
   if(month==='2024-06')assert.equal(p.changedRows,0)
  }
  for(const month of ['2026-01','2026-02'])await acceptIntacct(h,{sourceEntity,month,includeOpening:false})
  const actuals=await h.get('/api/easel/actuals?entity='+entity.id)
  assert.ok(actuals.trialBalances.every(r=>r.difference===0));assert.ok(actuals.months.some(r=>r.period==='2024-06'&&r.rows===0))
  assert.equal(actuals.months.find(r=>r.period==='2026-02')[sourceEntity==='CA'?'revenue':'costs'],sourceEntity==='CA'?10000:8000)
 }
 await h.get('/api/easel/actuals',h.owner,409)
 status=await h.get('/api/easel/connections/intacct');assert.equal(status.months.filter(m=>m.status==='accepted').length,52)
 const input={sourceEntity:'CA',month:'2026-02',includeOpening:false},before=await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first()
 assert.equal((await h.kit('intacct','preview',input)).unchanged,true)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first(),before)
 provider.change=true
 const corrected=await acceptIntacct(h,input);assert.equal(corrected.changedRows,2);assert.equal(corrected.changedTransactions,1)
 assert.equal((await h.kit('intacct','preview',input)).unchanged,true)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.ca.id)).months.find(r=>r.period==='2026-02').revenue,12500)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.eu.id)).months.find(r=>r.period==='2026-02').costs,8000)
 const previews=await h.kit('intacct','preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false})
 provider.extra='mapped'
 await h.kit('intacct','commit',{sourceEntity:'CA',month:'2026-03',includeOpening:false,fingerprint:previews.fingerprint,sourceFingerprint:previews.sourceFingerprint},h.owner,409)
 const automatic=await acceptIntacct(h,{sourceEntity:'CA',month:'2026-03',includeOpening:false});assert.equal(automatic.accounts.find(a=>a.account==='4001').target,f.revenue.id)
 assert.ok(automatic.source.dimensions.udd[0].members.some(m=>m.id==='B2B'));assert.equal(automatic.source.dimensions.department.length,3);assert.equal(automatic.source.dimensions.location.length,2)
 provider.extra='both'
 const uncovered=await h.kit('intacct','preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false});assert.ok(uncovered.unmappedAccounts.includes('9999'))
 await h.kit('intacct','commit',{sourceEntity:'CA',month:'2026-03',includeOpening:false,fingerprint:uncovered.fingerprint,sourceFingerprint:uncovered.sourceFingerprint},h.owner,409)
 await h.command('account-map',{account:'9999',target:f.revenue.id});await acceptIntacct(h,{sourceEntity:'CA',month:'2026-03',includeOpening:false})
 const retained=await h.get('/api/easel/actuals?entity='+f.ca.id)
 for(const flag of ['badScope','badCurrency','badBook','duplicate','malformed','dtd','unsafeUrl']){
  provider[flag]=true;const denied=await h.send('/api/easel/import/intacct/preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false},h.owner);assert.ok(denied.status>=400,flag);provider[flag]=false
  assert.deepEqual(await h.get('/api/easel/actuals?entity='+f.ca.id),retained)
 }
 provider.badTrial=true
 const mismatch=await h.kit('intacct','preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false});assert.equal(mismatch.source.trialBalance.balanced,false);assert.ok(mismatch.source.trialBalance.differences.length)
 await h.kit('intacct','commit',{sourceEntity:'CA',month:'2026-03',includeOpening:false,fingerprint:mismatch.fingerprint,sourceFingerprint:mismatch.sourceFingerprint},h.owner,409);provider.badTrial=false
 const firstBatch=(await h.get('/api/easel/state')).batches.find(b=>b.intacctSource?.sourceEntity==='CA'&&b.intacctSource?.month==='2024-01')
 await h.kit('actuals','undo',{id:firstBatch.id})
 let root=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.first.id)
 const approved=await h.command('approve-budget',{scenario:root.id,revision:root.revision})
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'},h.owner,409)
 await acceptIntacct(h,{sourceEntity:'CA',month:'2024-01',includeOpening:true})
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const closed=await h.get('/api/easel/scenario/'+approved.forecast.id)
 assert.equal(closed.calculation.profit[0].revenue,10000)
 const variance=await h.get('/api/easel/variance/2026-01?scenario='+approved.forecast.id),row=variance.rows.find(r=>r.line===f.revenue.id&&r.department===f.department.id)
 assert.ok(row.citations.length>0);assert.ok(row.citations.every(c=>c.providerUrl==='https://www.intacct.com/ia/acct/gl/view?recordno=CA-entry-2026-01'))
 const viewed=await h.get('/api/easel/variance/2026-01?scenario='+approved.forecast.id,viewer),vrow=viewed.rows.find(r=>r.line===row.line&&r.department===row.department)
 assert.equal(vrow.actual,row.actual);assert.deepEqual(vrow.citations,[])
 const euRoot=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.second.id),euApproved=await h.command('approve-budget',{scenario:euRoot.id,revision:euRoot.revision})
 await h.command('close-month',{scenario:euApproved.forecast.id,month:'2026-01'})
 assert.equal((await h.get('/api/easel/scenario/'+euApproved.forecast.id)).calculation.profit[0].operatingExpenses,8000)
 await h.kit('actuals','undo',{id:firstBatch.id},h.owner,409)
 await h.stepUp();const tokenResponse=await h.send('/api/easel/tokens/issue',{label:'Intacct native boundary',kind:'personal',scope:'write'},h.owner);assert.equal(tokenResponse.status,200)
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/intacct',{headers:{authorization:'Bearer '+tokenResponse.value.token}})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const data=await file.async('string');for(const secret of [intacctGrant.userPassword,intacctGrant.senderPassword,sealed.sealed])assert.ok(!data.includes(secret))}
 provider.status=429;await call('check',{});status=await h.get('/api/easel/connections/intacct');assert.match(status.rateLimit,/60/);assert.ok(!JSON.stringify(status).includes(intacctGrant.userPassword));provider.status=200
 await call('check',{});assert.equal((await h.get('/api/easel/connections/intacct')).error,null)
 const disconnected=await call('disconnect',{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'unsupported');assert.match(disconnected.providerRevocation.ownerStep,/Deactivate/)
 assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='intacct'").first(),null)
 assert.deepEqual(await h.get('/api/easel/actuals?entity='+f.ca.id),retained)
 const activity=await h.get('/api/easel/activity');for(const action of ['intacct-connected','intacct-checked','intacct-disconnected','intacct-entity-bound'])assert.ok((await h.get('/api/easel/activity?action='+action)).some(e=>e.action===action))
 assert.ok(!JSON.stringify(activity).includes(intacctGrant.userPassword))
})
