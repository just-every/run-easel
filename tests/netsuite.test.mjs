import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { createEaselExportService } from '../scripts/installer/erasure-export.mjs'
import { easelPolicy } from '../src/easel/erasure-archive/policy.mjs'
import { harness } from './harness.mjs'
import { netsuiteProvider,netsuiteFixture,netsuiteGrant,acceptNetSuite } from './netsuite-fixture.mjs'

test('NetSuite native finance journey partitions two subsidiary books, reconciles history and reviewed corrections under sealed custody',async t=>{
 const provider=netsuiteProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const f=await netsuiteFixture(h),board=await h.person('netsuite-board@example.test','viewer'),status=await h.get('/api/easel/connections/netsuite')
 assert.equal(status.connected,true);assert.equal(status.bindings.length,2);assert.equal(status.schedule,'Manual');assert.equal(status.role,netsuiteGrant.role)
 assert.equal((await h.send('/api/easel/connections/netsuite/check',{},board)).status,403)
 const sealed=await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='netsuite'").first();assert.ok(!sealed.sealed.includes(netsuiteGrant.tokenSecret));assert.ok(!JSON.stringify(status).includes(netsuiteGrant.consumerSecret))
 const bindings=status.bindings
 const before=await h.db.prepare('SELECT COUNT(*) AS n FROM e_records').first(),first={binding:bindings[0].id,month:'2024-01',includeOpening:true}
 const p=await h.kit('netsuite','preview',first)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS n FROM e_records').first(),before,'Preview writes no durable product records')
 assert.equal(p.source.ledgerRows,1200);assert.equal(p.source.trialBalance.balanced,true)
 await h.kit('netsuite','commit',{...first,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint},h.owner,409)
 for(let i=0;i<24;i++)for(const binding of bindings){const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,result=await acceptNetSuite(h,{binding:binding.id,month,includeOpening:i===0});assert.equal(result.source.trialBalance.balanced,true);if(i===0)assert.ok(result.continued>0,'Large month follows journal continuation');if(month==='2024-06')assert.equal(result.changedRows,0)}
 assert.equal((await h.get('/api/easel/connections/netsuite')).months.filter(m=>m.status==='accepted').length,48)
 assert.equal((await h.get('/api/easel/actuals')).months.length,0,'Entity ledgers never enter the legacy installation ledger')
 for(const binding of bindings){const view=await h.get('/api/easel/actuals?entity='+binding.entity);assert.equal(view.currency,binding.currency);assert.equal(view.months.find(m=>m.period==='2024-01').revenue,binding.subsidiary==='1'?10000:8000);assert.equal(view.months.find(m=>m.period==='2024-06').rows,0);assert.ok(view.trialBalances.every(t=>t.difference===0))}
 const posted=JSON.parse((await h.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.netsuiteOpening')=0 LIMIT 1").first()).value)
 assert.equal(posted.date,'2023-12-31');assert.equal(posted.period,'2024-01');assert.equal(posted.netsuiteBook,'1');assert.equal(posted.sourceDimensions.locationId,'1')
 for(const binding of bindings)for(const month of['2026-01','2026-02'])await acceptNetSuite(h,{binding:binding.id,month,includeOpening:false})
 const counts=await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first()
 for(const binding of bindings){const r=await acceptNetSuite(h,{binding:binding.id,month:'2026-02',includeOpening:false});assert.equal(r.unchanged,true)}
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS n FROM e_actuals').first(),counts)
 provider.change=true
 for(const binding of bindings){const r=await acceptNetSuite(h,{binding:binding.id,month:'2026-02',includeOpening:false});assert.equal(r.changedRows,2);assert.equal(r.changedTransactions,1);assert.equal((await h.kit('netsuite','preview',{binding:binding.id,month:'2026-02',includeOpening:false})).unchanged,true)}
 const refresh={binding:bindings[0].id,month:'2026-02',includeOpening:false},reviewed=await h.kit('netsuite','preview',refresh)
 provider.change=false
 await h.kit('netsuite','stage',{...refresh,sourceFingerprint:reviewed.sourceFingerprint},h.owner,409)
 provider.remove=true
 const removed=await acceptNetSuite(h,refresh);assert.equal(removed.changedRows,2);assert.equal(removed.changedTransactions,1)
 assert.equal((await h.get('/api/easel/actuals?entity='+bindings[0].entity)).months.find(m=>m.period==='2026-02').revenue,0)
 provider.remove=false;provider.change=true;await acceptNetSuite(h,refresh)
 // Entity history becomes an independently tagged budget descendant, then a designated forecast.
 const forecasts=[]
 for(const entity of f.entities){const b=await h.command('budget-from-actuals',{entity:entity.id,name:entity.name+' history budget',growth:{}});const approved=await h.command('approve-budget',{scenario:b.id,revision:b.revision});forecasts.push(approved.forecast);assert.equal(approved.forecast.entity,entity.id)}
 const historyBatch=(await h.get('/api/easel/state')).batches.find(b=>b.netsuiteSource?.entity===bindings[0].entity&&b.netsuiteSource?.month==='2024-02')
 assert.equal((await h.kit('actuals','undo',{id:historyBatch.id})).batch.status,'undone')
 assert.match((await h.command('close-month',{scenario:forecasts[0].id,month:'2026-01'},h.owner,409)).error,/NetSuite history is incomplete/)
 await h.command('close-month',{scenario:forecasts[1].id,month:'2026-01'})
 await acceptNetSuite(h,{binding:bindings[0].id,month:'2024-02',includeOpening:false})
 await h.command('close-month',{scenario:forecasts[0].id,month:'2026-01'})
 await h.kit('actuals','undo',{id:historyBatch.id},h.owner,409)
 const closedBatch=(await h.get('/api/easel/state')).batches.find(b=>b.netsuiteSource?.entity===bindings[0].entity&&b.netsuiteSource?.month==='2026-01')
 assert.match((await h.kit('actuals','undo',{id:closedBatch.id},h.owner,409)).error,/closed with these actuals/)
 for(let i=0;i<forecasts.length;i++){
  const v=await h.get('/api/easel/variance/2026-01?forecast='+forecasts[i].id),row=v.rows.find(r=>r.line===f.line.id&&r.department===f.department.id)
  assert.equal(v.currency,f.entities[i].currency);assert.equal(row.actual,i===0?10000:8000);assert.ok(row.citations.length);assert.ok(row.citations.every(c=>c.providerUrl==='https://1234567-sb1.app.netsuite.com/app/accounting/transactions/journal.nl?id=1026'))
  const viewer=await h.get('/api/easel/variance/2026-01?forecast='+forecasts[i].id,board);assert.equal(viewer.rows.find(r=>r.key===row.key).actual,row.actual);assert.deepEqual(viewer.rows.find(r=>r.key===row.key).citations,[])
 }
 const descendant=await h.command('branch',{from:forecasts[1].id,name:'European actuals descendant'})
 await h.command('member',{email:'netsuite-board@example.test',name:'Canada board',role:'viewer',dimensionMembers:{[f.entities[0].dimension]:[f.entities[0].member]}})
 await h.get('/api/easel/scenario/'+forecasts[1].id,board,404);await h.get('/api/easel/scenario/'+descendant.id,board,404)
 await h.get('/api/easel/variance/2026-01?forecast='+forecasts[1].id,board,404)
 assert.equal((await h.get('/api/easel/consolidation/'+f.root.id,board)).consolidated[0].profit,null)
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/variance/2026-01/document.xlsx?forecast='+forecasts[1].id,{headers:{cookie:board}})).status,404)
 await h.command('member',{email:'netsuite-board@example.test',name:'Board',role:'viewer',dimensionMembers:{}})
 assert.equal((await h.get('/api/easel/variance/2026-01?forecast='+forecasts[1].id,board)).rows.find(r=>r.line===f.line.id).actual,8000)
 provider.extra='mapped'
 const automatic=await acceptNetSuite(h,{binding:bindings[0].id,month:'2026-03',includeOpening:false});assert.equal(automatic.accounts.find(a=>a.account==='4001').target,f.line.id)
 provider.extra='both'
 const unresolved=await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false});assert.equal(unresolved.accounts.find(a=>a.account==='9999').target,null)
 await h.command('account-rule',{match:'type',from:'Income',target:f.line.id})
 assert.equal((await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false})).accounts.find(a=>a.account==='9999').target,f.line.id)
 const otherLine=await h.command('line',{name:'Other income',type:'revenue'})
 await h.command('account-rule',{match:'prefix',from:'9999',target:otherLine.id})
 assert.equal((await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false})).accounts.find(a=>a.account==='9999').mappingStatus,'ambiguous')
 await h.command('account-map',{account:'9999',target:f.line.id});await acceptNetSuite(h,{binding:bindings[0].id,month:'2026-03',includeOpening:false})
 provider.dimensionChange=true
 const region=f.dimensions.find(d=>d.dimension.name==='Region'),west=await h.command('dimension-member',{dimension:region.dimension.id,name:'West'})
 const dimensionPreview=await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false});assert.ok(dimensionPreview.dimensionExceptions.length)
 await h.command('dimension-map',{dimension:region.dimension.id,member:west.id,sourceKind:'location',source:'West',match:'exact'})
 const reclassified=await acceptNetSuite(h,{binding:bindings[0].id,month:'2026-03',includeOpening:false});assert.equal(reclassified.changedTransactions,3)
 for(const month of['2026-02','2026-03'])await h.command('close-month',{scenario:forecasts[0].id,month})
 const dimensionReport=await h.get('/api/easel/dimension-report/'+forecasts[0].id+'?dimension='+region.dimension.id)
 assert.equal(dimensionReport.dimensions[0].members.find(m=>m.id===west.id).lineTotals[f.line.id]['2026-03'],15000)
 assert.equal((await h.get('/api/easel/variance/2026-01?forecast='+forecasts[1].id)).rows.find(r=>r.line===f.line.id).actual,8000,'The other entity remains usable after independent metadata and mapping review')
 provider.badTrial=true
 const mismatch=await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false});assert.equal(mismatch.source.trialBalance.balanced,false)
 await h.kit('netsuite','commit',{binding:bindings[0].id,month:'2026-03',includeOpening:false,sourceFingerprint:mismatch.sourceFingerprint,fingerprint:mismatch.fingerprint},h.owner,409);provider.badTrial=false
 provider.badPage=true;await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false},h.owner,502);provider.badPage=false
 provider.drift=true;await h.kit('netsuite','preview',{binding:bindings[0].id,month:'2026-03',includeOpening:false},h.owner,409);provider.drift=false
 await h.stepUp();const issued=await f.call('tokens/issue',{label:'NetSuite native authority refusal',kind:'personal',scope:'write'})
 for(const path of['connections/netsuite','import/actuals/status','import/actuals/undo','import/actuals/resume']){
  const response=await h.mf.dispatchFetch(h.origin+'/api/easel/'+path,{headers:{authorization:`Bearer ${issued.token}`,'content-type':'application/json'},...(path.startsWith('import/')?{method:'POST',body:JSON.stringify({id:closedBatch.id})}:{})});assert.equal(response.status,403)
 }
 provider.status=429;await f.call('connections/netsuite/check',{});assert.equal((await h.get('/api/easel/connections/netsuite')).rateLimit,'Retry after 42 seconds');provider.status=200
 await f.call('connections/netsuite/check',{});assert.equal((await h.get('/api/easel/connections/netsuite')).error,null)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const body=await file.async('string');assert.ok(!body.includes(netsuiteGrant.consumerSecret));assert.ok(!body.includes(netsuiteGrant.tokenSecret));assert.ok(!body.includes(sealed.sealed))}
 await portableReconnect(t,h,provider,sealed.sealed,bindings)
 provider.revocation=503;const disconnected=await f.call('connections/netsuite/disconnect',{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'refused');assert.match(disconnected.error,/Access Tokens/);assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='netsuite'").first(),null)
 await f.call('connections/netsuite/connect',netsuiteGrant);provider.revocation=200;assert.equal((await f.call('connections/netsuite/disconnect',{})).providerRevocation.status,'confirmed')
 const events=await h.get('/api/easel/activity');for(const action of['netsuite-connected','netsuite-source-staged','netsuite-checked','netsuite-disconnected'])assert.ok(events.some(e=>e.action===action));assert.ok(!JSON.stringify(events).includes(netsuiteGrant.tokenSecret))
 await balanceAndConsolidation(t)
})

async function portableReconnect(t,h,provider,sealed,bindings){
 const source=await createEaselExportService({db:h.db}),exportId=await source.exports.create()
 while((await source.exports.advance(exportId,{maxParts:16})).phase==='building'){}
 const bytes=await new Response(await source.exports.download(exportId)).text();await source.exports.abort(exportId)
 for(const privateValue of[netsuiteGrant.consumerSecret,netsuiteGrant.tokenSecret,sealed])assert.ok(!bytes.includes(privateValue),'Native portable archive excludes plain and sealed credentials')
 const records=bytes.trim().split('\n').map(JSON.parse),closing=records.at(-1),restored=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>restored.close())
 const target=await createPortability({db:restored.db,policy:easelPolicy}),id=await target.imports.create(records[0])
 for(const part of records.filter(r=>r.kind==='part'))await target.imports.uploadPart(id,part.index,part)
 await target.imports.finalize(id,{contentHash:closing.contentHash,archiveHash:closing.archiveHash})
 const status=await restored.get('/api/easel/connections/netsuite');assert.equal(status.connected,false);assert.match(status.error,/Reconnect NetSuite after restore/);assert.deepEqual(status.bindings,bindings)
 for(const binding of bindings)assert.deepEqual(await restored.get('/api/easel/actuals?entity='+binding.entity),await h.get('/api/easel/actuals?entity='+binding.entity))
 assert.equal((await restored.send('/api/easel/connections/netsuite/connect',netsuiteGrant,restored.owner)).status,200)
 assert.equal((await restored.get('/api/easel/connections/netsuite')).connected,true)
}

/** The same HTTP sanity journey continues through provider-backed balance schedules and consolidation. */
async function balanceAndConsolidation(t){
 const { seedBalanceActuals }=await import('./balance-actuals-fixture.mjs')
 const provider=netsuiteProvider();provider.large=false
 const h=await harness({outbound:provider.outbound,now:()=> '2026-04-15T12:00:00.000Z'});t.after(()=>h.close())
 const {revenue,expense}=await seedBalanceActuals(h.command),dept=await h.command('department',{name:'Delivery'})
 await h.command('department-map',{source:'',department:dept.id});await h.command('department-map',{source:'Subscriptions',department:dept.id})
 const root=(await h.get('/api/easel/state')).scenarios[0],other=await h.command('branch',{from:root.id,name:'European source'})
 const left=await h.command('entity-save',{name:'Canada schedules',scenario:root.id,currency:'CAD',group:root.id,reporting:'USD'}),right=await h.command('entity-save',{name:'Europe schedules',scenario:other.id,currency:'EUR',group:root.id,reporting:'USD'})
 const people=await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true}),depreciation=await h.command('line',{name:'Depreciation',type:'operating-expense',nonCash:true}),subscriptions=await h.command('line',{name:'Subscriptions',type:'revenue'}),insurance=await h.command('line',{name:'Insurance',type:'operating-expense'})
 const origins=[]
 for(const [account,target]of[['1200','bs:prepaid'],['5100',insurance.id],['5200',people.id],['5300',depreciation.id],['4100',subscriptions.id]])await h.command('account-map',{account,target})
 const opening=[['1000',10000000],['1100',1200000],['1200',240000],['FA-01',1800000],['2000',-800000],['2100',-300000],['2200',-660000],['2300',-2000000],['3000',-9480000]]
 const movement=[['1101',1000000],['4000',-1000000],['5000',400000],['1000',-400000],['2100',100000],['1000',-100000],['1200',-20000],['5100',20000],['FA-01',-50000],['5300',50000],['2200',60000],['4100',-60000],['2100',-100000],['5200',100000]]
 const sourceRows=[]
 for(const sub of['1','2']){sourceRows.push(...opening.map(([code,n])=>[sub,'2025-12',code,(n/100).toFixed(2),'2025-12-31']),...movement.map(([code,n])=>[sub,'2026-01',code,(n/100).toFixed(2),'2026-01-31']))}
 sourceRows.push(['1','2026-01','1000','1000.00','2026-01-31'],['1','2026-01','1100','-1000.00','2026-01-31'])
 provider.entries=sourceRows
 // Independent closing observations are recorded separately from the detail above.
 const trials={'2025-12':{'1000':10000000,'1100':1200000,'1200':240000,'FA-01':1800000,'2000':-800000,'2100':-300000,'2200':-660000,'2300':-2000000,'3000':-9480000},'2026-01':{'1000':9500000,'1100':1200000,'1101':1000000,'1200':220000,'FA-01':1750000,'2000':-800000,'2100':-300000,'2200':-600000,'2300':-2000000,'3000':-9480000,'4000':-1000000,'5000':400000,'5100':20000,'5300':50000,'4100':-60000,'5200':100000}}
 provider.trials={'1':structuredClone(trials),'2':structuredClone(trials)}
 provider.trials['1']['2026-01']['1000']=9600000;provider.trials['1']['2026-01']['1100']=1100000
 const {netsuiteCall,mapNetSuite}=await import('./netsuite-fixture.mjs'),call=netsuiteCall(h)
 await call('connections/netsuite/connect',netsuiteGrant);await mapNetSuite(h,[left,right])
 const status=await h.get('/api/easel/connections/netsuite'),forecasts=[]
 for(let i=0;i<2;i++){
  const entity=[left,right][i],binding=status.bindings.find(b=>b.entity===entity.id)
  for(let n=1;n<=12;n++)await acceptNetSuite(h,{binding:binding.id,month:'2025-'+String(n).padStart(2,'0'),includeOpening:n===1})
  await acceptNetSuite(h,{binding:binding.id,month:'2026-01',includeOpening:false})
  const seeded=await h.command('budget-from-actuals',{entity:entity.id,name:entity.name+' from accepted history',growth:{}})
  const base={scenario:seeded.id,department:dept.id,start:'2026-01'}
  const prepaid=await h.command('expense',{...base,line:insurance.id,name:'Annual insurance',kind:'prepaid',amount:'1200',paymentMonth:'2025-12',amortizationMonths:'12'})
  const payroll=await h.command('position',{...base,start:'2025-12',line:people.id,title:'Private entity lead',holder:'Restricted person',annualSalary:'12000',payDay:5,payMonthOffset:1})
  const bonus=await h.command('expense',{...base,start:'2025-12',line:people.id,name:'Private bonus',kind:'bonus',amount:'900',payMonth:'2026-02'})
  const contract=await h.command('revenue',{...base,line:subscriptions.id,name:'Annual subscription',kind:'contract',start:'2025-12',startDate:'2025-12-01',termMonths:13,contractValue:'13000',billingCadence:'annual',dsoDays:0})
  const category=await h.command('asset-category',{scenario:seeded.id,name:'Equipment',usefulLifeMonths:60}),asset=await h.command('asset',{...base,line:depreciation.id,name:'Equipment',category:category.originId,kind:'existing',cost:'24000',remainingLifeMonths:24,disposalMonth:'2026-04',disposalProceeds:'1000'})
  origins.push({prepaid,payroll,bonus,contract,asset})
  const sc=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===seeded.id),approval=await h.command('approve-budget',{scenario:sc.id,revision:sc.revision});forecasts.push(approval.forecast)
  await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
  const view=()=>h.get('/api/easel/scenario/'+approval.forecast.id),before=await view();assert.equal(before.calculation.balanceSheet[0].balanceDifference,0);assert.ok(before.calculation.balanceSheet[1].incompleteReasons.some(r=>/no reviewed schedule attribution/.test(r)))
  const o=origins[i],allocate=async(target,allocations)=>h.command('ledger-allocation',{scenario:approval.forecast.id,revision:(await view()).scenario.revision,month:'2026-01',target,allocations})
  await allocate('bs:prepaid',[{originId:o.prepaid.originId,amount:'2200'}]);await allocate('bs:accrued-liabilities',[{originId:o.payroll.originId,amount:'2000'},{originId:o.bonus.originId,amount:'1000'}]);await allocate('bs:deferred-revenue',[{originId:o.contract.originId,amount:'6000'}]);await allocate('bs:fixed-assets',[{originId:o.asset.originId,amount:'17500',remainingLifeMonths:35}])
  const c=(await view()).calculation;assert.equal(c.assets.find(a=>a.month==='2026-02').depreciation,50000);assert.equal(c.assets.find(a=>a.month==='2026-04').disposalBookValue,1650000);assert.equal(c.assets.find(a=>a.month==='2026-04').depreciation,0);assert.equal(c.workingCapital.rows.filter(r=>r.originId===o.prepaid.originId).at(-1).prepaid,0)
  assert.deepEqual(c.contracts.invoices,before.calculation.contracts.invoices);assert.ok(c.balanceSheet.every(b=>b.balanceDifference===0));assert.ok(c.cashFlow.every(b=>b.difference===0))
 }
 const path='/api/easel/consolidation/'+root.id
 assert.equal((await h.get(path)).consolidated[0].profit,null,'Missing per-entity rates refuse consolidation')
 for(const entity of[left,right]){await h.command('entity-rate',{entity:entity.id,month:'2025-12',monthEnd:'1'});for(const m of['2026-01','2026-02'])await h.command('entity-rate',{entity:entity.id,month:m,average:'1',budget:'1',monthEnd:'1'})}
 const choices=await h.get('/api/easel/entities'),l=choices.ledgerEvidence.find(e=>e.entity===left.id),r=choices.ledgerEvidence.find(e=>e.entity===right.id)
 const pick=(source,target,period='2026-01',sign=1)=>source.rows.filter(row=>row.target===target&&row.month===period&&row.amount*sign>0).map(row=>row.id)
 const rule={evidence:'ledger',name:'Explicit recorded ledger reciprocity',month:'2026-01',fromEntity:left.id,toEntity:right.id,revenueLine:revenue.id,expenseLine:expense.id,fromAmount:'4000',toAmount:'4000',receivable:'8000',payable:'8000',cashReceived:'1000',cashPaid:'1000',reviewed:true,ledgerEvidence:{fromAmount:pick(l,revenue.id,'2026-01',-1),toAmount:pick(r,expense.id),receivable:pick(l,'bs:receivables','2025-12'),payable:pick(r,'bs:payables','2025-12',-1),cashReceived:pick(l,'cash','2026-01',1),cashPaid:pick(r,'cash','2026-01',-1)}}
 await h.command('entity-elimination-save',rule);await h.command('entity-elimination-save',{...rule,name:'Overlapping actual evidence'},h.owner,409)
 const consolidated=(await h.get(path)).consolidated[0];assert.equal(consolidated.profit.revenue,1720000);assert.equal(consolidated.profit.operatingExpenses,740000);assert.equal(consolidated.balanceSheet.receivables,3500000);assert.equal(consolidated.balanceSheet.payables,800000);assert.equal(consolidated.balanceSheet.balanceDifference,0);assert.equal(consolidated.cash.difference,0);assert.equal(consolidated.cash.collections,0);assert.equal(consolidated.cash.payments,900000)
 const {default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook(),response=await h.mf.dispatchFetch(h.origin+path+'/workbook',{headers:{cookie:h.owner}});assert.equal(response.status,200);await book.xlsx.load(await response.arrayBuffer());assert.ok(book.getWorksheet('Profit and loss').getCell('G3').formula)
 const kept=await h.command('reforecast-save',{from:forecasts[0].id,revision:(await h.get('/api/easel/scenario/'+forecasts[0].id)).scenario.revision,name:'Frozen entity source'}),frozen=await h.get('/api/easel/scenario/'+kept.id)
 const pack=await h.command('pack-create',{forecast:forecasts[0].id,month:'2026-01'});await h.command('pack-publish',{pack:pack.id});const published=await h.get('/api/easel/pack/'+pack.id+'/document.csv')
 const snapshots=await Promise.all((await h.get('/api/easel/state')).snapshots.map(s=>h.get('/api/easel/snapshot/'+s.id)))
 await h.command('entity-rate',{entity:left.id,month:'2026-01',average:'0.8',monthEnd:'0.8',budget:'0.8'});assert.equal((await h.get(path)).consolidated[0].profit,null,'Mismatched reviewed local evidence never manufactures a translated match')
 await h.command('entity-rate',{entity:left.id,month:'2026-01',average:'1',monthEnd:'1',budget:'1'})
 const viewer=await h.person('netsuite-schedule-viewer@example.test','viewer')
 await h.command('ledger-allocation',{scenario:forecasts[0].id,revision:(await h.get('/api/easel/scenario/'+forecasts[0].id)).scenario.revision,month:'2026-01',target:'bs:prepaid',allocations:[{originId:origins[0].prepaid.originId,amount:'2200'}]},viewer,403)
 assert.doesNotMatch(JSON.stringify(await h.get('/api/easel/scenario/'+forecasts[0].id,viewer)),/Restricted person|Private bonus|netsuiteAttribution/)
 for(const entry of provider.entries.filter(e=>e[0]==='1'&&e[1]==='2026-01'))if(entry[2]==='1200')entry[3]='-210.00';else if(entry[2]==='5100')entry[3]='210.00'
 provider.trials['1']['2026-01']['1200']=219000;provider.trials['1']['2026-01']['5100']=21000
 await acceptNetSuite(h,{binding:status.bindings.find(b=>b.entity===left.id).id,month:'2026-01',includeOpening:false})
 const changed=await h.get('/api/easel/scenario/'+forecasts[0].id,h.owner,409)
 assert.match(changed.error,/Accepted balances changed after the schedule allocation/,'Corrected provider balances invalidate schedule allocation review')
 assert.match((await h.get(path,h.owner,409)).error,/Accepted balances changed/)
 assert.equal((await h.get('/api/easel/scenario/'+forecasts[1].id)).calculation.balanceSheet[0].balanceDifference,0,'The independent entity remains available')
 assert.deepEqual(await h.get('/api/easel/scenario/'+kept.id),frozen);assert.deepEqual(await h.get('/api/easel/pack/'+pack.id+'/document.csv'),published)
 for(const snapshot of snapshots)assert.deepEqual(await h.get('/api/easel/snapshot/'+snapshot.id),snapshot,'Approval, kept forecast, reforecast and published evidence stay frozen after provider and FX corrections')
}
