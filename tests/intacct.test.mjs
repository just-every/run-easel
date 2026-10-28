import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { intacctProvider,intacctGrant,intacctFixture,intacctCall,acceptIntacct } from './intacct-fixture.mjs'

test('CONNECT-011 Intacct native custody, 24 monthly entity backfills, reviewed changes, close, consolidation and source authority',async t=>{
 let now='2026-04-15T12:00:00Z'
 const edge=intacctProvider(),h=await harness({outbound:edge.outbound,now:()=>now});t.after(()=>h.close())
 const f=await intacctFixture(h),call=intacctCall(h)
 const viewer=await h.person('intacct-board@example.test','viewer'),contributor=await h.person('intacct-dept@example.test','contributor',[f.department.id])
 await h.get('/api/easel/connections/intacct',viewer,403)
 assert.equal((await h.send('/api/easel/connections/intacct/connect',intacctGrant,contributor)).status,403)
 await call('connect',{...intacctGrant,consent:false},400)
 const status=await call('connect',intacctGrant)
 assert.equal(status.connected,true);assert.equal(status.suffix,intacctGrant.password.slice(-4));assert.doesNotMatch(JSON.stringify(status),new RegExp(intacctGrant.password))
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='intacct'").first();assert.ok(sealed);assert.ok(!sealed.sealed.includes(intacctGrant.password))
 await call('entity-map',{source:'US',entity:f.ca.id},409)
 for(const [source,entity]of[['US',f.us],['CA',f.ca]])await call('entity-map',{source,entity:entity.id})
 await call('entity-map',{source:'US',entity:f.ca.id},409)
 const before=await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first()
 const first=await h.kit('intacct','preview',{sourceEntity:'US',month:'2024-01',includeOpening:true})
 assert.equal(first.source.trialBalance.balanced,true);assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first(),before)
 assert.equal(first.accounts.find(a=>a.account==='4000').target,f.revenue.id)
 assert.equal(first.source.dimensions.LOCATION.length,2);assert.equal(first.source.dimensions.DEPARTMENT.length,3)
 assert.ok(first.source.dimensions.LINE_OF_BUSINESS)
 const pull=(sourceEntity,month,includeOpening=false)=>acceptIntacct(h,{sourceEntity,month,includeOpening})
 for(let i=0;i<24;i++)for(const source of['US','CA']){const month=(2024+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0');const p=await pull(source,month,i===0);assert.equal(p.source.trialBalance.balanced,true)}
 assert.equal((await h.get('/api/easel/connections/intacct')).months.filter(m=>m.status==='accepted').length,48)
 assert.ok(edge.pages>0,'ReadMore completes provider pages')
 for(const source of['US','CA'])for(const month of['2026-01','2026-02'])await pull(source,month)
 const counts=await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first()
 assert.equal((await h.kit('intacct','preview',{sourceEntity:'US',month:'2026-02',includeOpening:false})).unchanged,true)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first(),counts)
 edge.change=true
 const correction=await pull('US','2026-02');assert.equal(correction.changedTransactions,1);assert.equal(correction.changedRows,2)
 assert.equal((await h.kit('intacct','preview',{sourceEntity:'US',month:'2026-02',includeOpening:false})).changedRows,0)
 assert.deepEqual((await h.get('/api/easel/actuals')).months,[],'entity ledgers never enter the installation ledger')
 for(const entity of[f.us,f.ca])assert.ok((await h.get('/api/easel/actuals?entity='+entity.id)).trialBalances.every(t=>t.difference===0))
 const forecasts=[]
 for(const source of[f.parent,f.sub]){const budget=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===source.id);forecasts.push((await h.command('approve-budget',{scenario:source.id,revision:budget.revision})).forecast)}
 const [us,ca]=forecasts
 for(const forecast of forecasts)await h.command('close-month',{scenario:forecast.id,month:'2026-01'})
 const variance=await h.get('/api/easel/variance/2026-01?scenario='+us.id),row=variance.rows.find(r=>r.line===f.revenue.id)
 assert.equal(row.actual,10000);assert.equal(row.citations.length,1);assert.match(row.citations[0].providerUrl,/intacct.com\/ia\/acct\/glentry.phtml\?recordno=2026-01-fee-2/)
 assert.deepEqual((await h.get('/api/easel/variance/2026-01?scenario='+us.id,viewer)).rows.find(r=>r.line===f.revenue.id).citations,[])
 for(const {dimension,members}of f.dimensions){
  const report=await h.get('/api/easel/dimension-report/'+us.id+'?dimension='+dimension.id)
  assert.equal(report.dimensions[0].members.filter(m=>members.some(v=>v.id===m.id)).reduce((n,m)=>n+(m.lineTotals[f.revenue.id]['2026-01']??0),0),10000)
 }
 // One source connection, independent local currencies/rates, source-line elimination and exact sum less elimination.
 await h.command('entity-rate',{entity:f.ca.id,month:'2025-12',monthEnd:'1'})
 await h.command('entity-rate',{entity:f.ca.id,month:'2026-01',average:'1',monthEnd:'1',budget:'1'})
 let group=await h.get('/api/easel/consolidation/'+f.parent.id)
 assert.deepEqual(group.entities.map(e=>e.local.currency).sort(),['CAD','USD'])
 assert.deepEqual(group.consolidated[0].unavailable,[])
 const origin=(entity,line)=>group.entities.find(e=>e.id===entity.id).local.lineTotals[line]['2026-01']
 assert.equal(origin(f.us,f.revenue.id),10000);assert.equal(origin(f.ca,f.expense.id),10000)
 const origins=(await h.get('/api/easel/entities')).origins
 const from=origins.find(o=>o.entity===f.us.id&&o.origin.includes('202601-fee-2')),to=origins.find(o=>o.entity===f.ca.id&&o.origin.includes('202601-fee-1'))
 assert.ok(from);assert.ok(to)
 await h.command('entity-elimination-save',{name:'Reviewed Intacct management fee',group:f.parent.id,month:'2026-01',fromEntity:f.us.id,toEntity:f.ca.id,fromOrigin:from.origin,toOrigin:to.origin,fromAmount:'100',toAmount:'100',receivable:'100',payable:'100',cashReceived:'0',cashPaid:'0',reviewed:true})
 group=await h.get('/api/easel/consolidation/'+f.parent.id)
 const consolidated=group.consolidated[0]
 assert.equal(consolidated.profit.revenue,0);assert.equal(consolidated.profit.operatingExpenses,0);assert.equal(consolidated.balanceSheet.receivables,0);assert.equal(consolidated.balanceSheet.payables,0)
 assert.equal(consolidated.before.profit.revenue-consolidated.profit.revenue,10000)
 assert.equal(consolidated.balanceSheet.balanceDifference,0);assert.equal(consolidated.cash.difference,0)
 const download=await h.mf.dispatchFetch(h.origin+'/api/easel/consolidation/'+f.parent.id+'/workbook',{headers:{cookie:h.owner}});assert.equal(download.status,200)
 const frozen=await h.command('reforecast-save',{from:us.id,revision:(await h.get('/api/easel/scenario/'+us.id)).scenario.revision,name:'Intacct frozen January'}),capture=await h.get('/api/easel/scenario/'+frozen.id)
 // Finance stages changed metadata at the network edge; new mappings need explicit review and dependent conclusions wait.
 edge.extra='mapped';const auto=await pull('US','2026-03');assert.equal(auto.accounts.find(a=>a.account==='4001').target,f.revenue.id);assert.equal(auto.source.changes.accounts.find(a=>a.code==='4001').change,'new')
 edge.move=true
 const moved=await pull('US','2026-03');assert.equal(moved.changedTransactions,1);assert.equal(moved.source.changes.records.length,1)
 assert.equal((await h.kit('intacct','preview',{sourceEntity:'US',month:'2026-03',includeOpening:false})).unchanged,true)
 edge.extra='both';const input={sourceEntity:'US',month:'2026-03',includeOpening:false}
 const pending=await h.kit('intacct','preview',input)
 await h.kit('intacct','commit',{...input,fingerprint:pending.fingerprint,sourceFingerprint:pending.sourceFingerprint},h.owner,409)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.us.id)).months.find(m=>m.period==='2026-02').revenue,12500)
 const staged=await h.kit('intacct','stage',{...input,scenario:us.id,nextExpectedAt:'2026-05-01T00:00:00Z',expectedPayroll:[]})
 const issue=staged.guard.unresolved.find(i=>i.kind==='account'&&i.account==='9999');assert.ok(issue)
 assert.ok(staged.source.impacts.scenarios.some(s=>s.id===us.id))
 await h.get('/api/easel/scenario/'+us.id,h.owner,409)
 await h.command('source-guard-review',{id:staged.guard.id,revision:staged.guard.revision,fingerprint:staged.guard.fingerprint,decisions:[{issue:issue.id,action:'map',target:f.revenue.id,reason:'Finance reviewed the new ledger source'}]})
 await pull('US','2026-03')
 assert.equal((await h.get('/api/easel/actuals?entity='+f.us.id)).months.find(m=>m.period==='2026-03').revenue,15000)
 assert.deepEqual(await h.get('/api/easel/scenario/'+frozen.id),capture)
 edge.badTrial=true
 const mismatch=await h.kit('intacct','preview',input);assert.equal(mismatch.source.trialBalance.balanced,false);assert.ok(mismatch.source.trialBalance.differences.length)
 await h.kit('intacct','commit',{...input,fingerprint:mismatch.fingerprint,sourceFingerprint:mismatch.sourceFingerprint},h.owner,409);edge.badTrial=false
 // Source metadata and missing payroll hold only this entity; finance explicitly resolves both.
 edge.rename=true
 const coverage=await h.kit('intacct','stage',{...input,scenario:us.id,nextExpectedAt:'2026-05-01T00:00:00Z',expectedPayroll:[{provider:'Reviewed payroll',payDate:'2026-03-31',rows:3}]})
 assert.ok(coverage.guard.unresolved.some(i=>i.kind==='metadata'))
 assert.ok(coverage.guard.unresolved.some(i=>i.kind==='payroll'))
 await h.get('/api/easel/scenario/'+us.id,h.owner,409)
 await h.get('/api/easel/scenario/'+ca.id)
 await h.command('source-guard-review',{id:coverage.guard.id,revision:coverage.guard.revision,fingerprint:coverage.guard.fingerprint,decisions:coverage.guard.unresolved.map(i=>({issue:i.id,action:'exclude',reason:'Finance reviewed metadata; payroll is held outside this ledger for the period'}))})
 await pull('US','2026-03')
 now='2026-05-02T12:00:00Z'
 await h.get('/api/easel/scenario/'+us.id,h.owner,409)
 assert.deepEqual(await h.get('/api/easel/scenario/'+frozen.id),capture)
 now='2026-04-15T12:00:00Z'
 // Archive excludes both plaintext and sealed custody; native and live entity authority remain enforced.
 await h.stepUp();const token=(await h.send('/api/easel/tokens/issue',{label:'Intacct native refusal',kind:'personal',scope:'write'},h.owner)).value
 assert.ok(token.token)
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/intacct',{headers:{authorization:'Bearer '+token.token}})).status,403)
 await h.command('member',{email:'intacct-board@example.test',name:'US reader',role:'viewer',dimensionMembers:{[f.us.dimension]:[f.us.member]}})
 await h.get('/api/easel/scenario/'+ca.id,viewer,404)
 assert.equal((await h.get('/api/easel/consolidation/'+f.parent.id,viewer)).scope,'restricted')
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/variance/2026-01?scenario='+ca.id,{headers:{cookie:viewer}})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const content=await file.async('string');assert.ok(!content.includes(intacctGrant.password));assert.ok(!content.includes(sealed.sealed))}
 edge.status=429;await call('check',{});assert.match((await h.get('/api/easel/connections/intacct')).rateLimit,/30/);edge.status=200;await call('check',{})
 const disconnected=await call('disconnect',{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'unsupported');assert.match(disconnected.error,/Disable the Web Services user/)
 assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='intacct'").first(),null)
 for(const name of['intacct-connected','intacct-entity-mapped','intacct-checked','intacct-disconnected']){const events=await h.get('/api/easel/activity?action='+name);assert.ok(events.some(e=>e.action===name));assert.ok(!JSON.stringify(events).includes(intacctGrant.password))}
})
