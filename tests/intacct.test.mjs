import { readWorkbook,evaluate } from './spreadsheet-proof.mjs'
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
   if(month==='2025-01')assert.ok(Object.values(p.source.trialBalance.reportTransfers).some(v=>v!==0),'Documented fiscal closing transfers stay separate from posting rows')
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
 provider.removed=true
 const removed=await acceptIntacct(h,input);assert.equal(removed.changedRows,2);assert.equal(removed.changedTransactions,1)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.ca.id)).months.find(r=>r.period==='2026-02').revenue,0)
 assert.equal((await h.kit('intacct','preview',input)).unchanged,true)
 provider.removed=false;await acceptIntacct(h,input)

 const previews=await h.kit('intacct','preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false})
 provider.extra='mapped'
 await h.kit('intacct','commit',{sourceEntity:'CA',month:'2026-03',includeOpening:false,fingerprint:previews.fingerprint,sourceFingerprint:previews.sourceFingerprint},h.owner,409)
 const conflict=await h.command('account-rule',{match:'prefix',from:'4001',target:f.expense.id})
 const ambiguous=await h.kit('intacct','preview',{sourceEntity:'CA',month:'2026-03',includeOpening:false})
 assert.equal(ambiguous.accounts.find(a=>a.account==='4001').mappingStatus,'ambiguous')
 await h.kit('intacct','commit',{sourceEntity:'CA',month:'2026-03',includeOpening:false,fingerprint:ambiguous.fingerprint,sourceFingerprint:ambiguous.sourceFingerprint},h.owner,409)
 assert.equal((await h.get('/api/easel/actuals?entity='+f.ca.id)).months.find(r=>r.period==='2026-02').revenue,12500)
 await h.command('account-rule-delete',{id:conflict.id})
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
 for(const [plan,line,amount]of [[f.first,f.revenue,10000],[f.second,f.expense,8000]]){
  const current=await h.get('/api/easel/scenario/'+plan.id)
  await h.command('formula',{scenario:plan.id,revision:current.scenario.revision,department:f.department.id,name:'Entity prior-year source',unit:'money',formula:`ACTUAL("${line.name}", "Services", -12)`,start:'2026-01'})
  const calculated=await h.get('/api/easel/scenario/'+plan.id)
  assert.equal(calculated.calculation.formulaValues.find(v=>v.name==='Entity prior-year source'&&v.month==='2026-01').value,amount)
 }
 const caPlan=await h.get('/api/easel/scenario/'+f.first.id)
 await h.command('formula',{scenario:f.first.id,revision:caPlan.scenario.revision,department:f.department.id,name:'Explicit empty source month',unit:'money',formula:'IF(PERIOD() = 6, ACTUAL("Management revenue", "Services", -24), 0)',start:'2026-01'})
 assert.equal((await h.get('/api/easel/scenario/'+f.first.id)).calculation.formulaValues.find(v=>v.name==='Explicit empty source month'&&v.month==='2026-06').value,0)
 for(const e of [f.ca,f.eu])for(const dimension of f.dimensions.filter(d=>d.dimension.name==='Posting location').map(d=>d.dimension).slice(0,1)){
  const report=await h.get(`/api/easel/dimension-report/actuals?entity=${e.id}&dimension=${dimension.id}`)
  assert.equal(report.currency,e.currency)
 }
 const firstBatch=(await h.get('/api/easel/state')).batches.find(b=>b.intacctSource?.sourceEntity==='CA'&&b.intacctSource?.month==='2024-01')
 await h.kit('actuals','undo',{id:firstBatch.id})
 await h.get('/api/easel/scenario/'+f.first.id,h.owner,409)
 await acceptIntacct(h,{sourceEntity:'CA',month:'2024-01',includeOpening:true})
 let root=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===f.first.id)
 const approved=await h.command('approve-budget',{scenario:root.id,revision:root.revision})
 await h.kit('actuals','undo',{id:firstBatch.id})
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
 const groupPath='/api/easel/consolidation/'+f.first.id
 assert.equal((await h.get(groupPath)).consolidated[0].profit,null,'Missing rates never add local currencies')
 for(const [entity,end,average]of [[f.ca,'0.9','0.8'],[f.eu,'1.125','1']]){
  await h.command('entity-rate',{entity:entity.id,month:'2025-12',monthEnd:average})
  await h.command('entity-rate',{entity:entity.id,month:'2026-01',monthEnd:end,average,budget:average})
 }
 const selections=(await h.get('/api/easel/entities')).ledgerSources
 const pick=(entity,target,period,opening=false)=>selections[entity.id].filter(r=>r.target===target&&r.period===period&&r.opening===opening).map(r=>r.id)
 const elimination={name:'Reviewed provider management fee and balances',month:'2026-01',group:f.first.id,fromEntity:f.ca.id,toEntity:f.eu.id,fromAmount:'100',toAmount:'80',receivable:'100',payable:'80',cashReceived:'100',cashPaid:'80',reviewed:true,ledgerSources:{from:{charge:pick(f.ca,f.revenue.id,'2026-01'),receivable:pick(f.ca,'bs:receivables','2023-12',true),cash:pick(f.ca,'cash','2026-01')},to:{charge:pick(f.eu,f.expense.id,'2026-01'),payable:pick(f.eu,'bs:payables','2023-12',true),cash:pick(f.eu,'cash','2026-01')}}}
 await h.command('entity-elimination-save',{...elimination,toAmount:'81'},h.owner,409)
 const savedElimination=await h.command('entity-elimination-save',elimination)
 await h.command('entity-elimination-save',elimination,h.owner,409)
 const consolidated=await h.get(groupPath),january=consolidated.consolidated[0]
 assert.deepEqual(january.unavailable,[])
 assert.equal(january.before.profit.revenue-january.profit.revenue,8000)
 assert.equal(january.before.profit.operatingExpenses-january.profit.operatingExpenses,8000)
 assert.equal(january.before.balanceSheet.receivables-january.balanceSheet.receivables,9000)
 assert.equal(january.before.balanceSheet.payables-january.balanceSheet.payables,9000)
 assert.equal(january.before.cash.collections-january.cash.collections,8000)
 assert.equal(january.before.cash.payments-january.cash.payments,8000)
 const workbookResponse=await h.mf.dispatchFetch(h.origin+groupPath+'/workbook',{headers:{cookie:h.owner}}),book=await readWorkbook(await workbookResponse.arrayBuffer())
 for(const name of ['Profit and loss','Balance sheet','Cash bridge']){const sheet=book.getWorksheet(name);if(sheet)sheet.eachRow(row=>row.eachCell(cell=>{if(cell.value?.formula)assert.equal(evaluate(sheet,cell.address),cell.result)}))}
 await h.command('member',{email:'intacct-board@example.test',name:'Canadian scoped reader',role:'viewer',dimensionMembers:{[f.ca.dimension]:[f.ca.member]}})
 await h.get('/api/easel/scenario/'+euApproved.forecast.id,viewer,404)
 await h.get('/api/easel/variance/2026-01?scenario='+euApproved.forecast.id,viewer,404)
 assert.equal((await h.get('/api/easel/variance/2026-01?scenario='+approved.forecast.id,viewer)).rows.find(r=>r.line===row.line&&r.department===row.department).actual,10000)
 await h.command('member',{email:'intacct-board@example.test',name:'Board reader',role:'viewer',dimensionMembers:{}})
 const stageInput={sourceEntity:'CA',month:'2026-04',includeOpening:false,observedAt:'2026-05-15T10:00:00.000Z',nextExpectedAt:'2026-06-01T00:00:00.000Z',expectedPayroll:[]}
 let staged=await h.kit('intacct','stage',stageInput)
 assert.equal(staged.provider,'intacct');assert.equal(staged.entity,f.ca.id);assert.ok(staged.impacts.scenarios.every(r=>r.id!==euApproved.forecast.id))
 assert.ok(!(await h.kit('intacct','preview',stageInput)).unchanged)
 await acceptIntacct(h,stageInput)
 assert.equal((await h.get('/api/easel/source-guard')).guards.find(g=>g.id===staged.id).status,'completed')
 provider.memberChange=true
 staged=await h.kit('intacct','stage',{...stageInput,revision:(await h.get('/api/easel/source-guard')).guards.find(g=>g.id===staged.id).revision})
 assert.ok(staged.unresolved.some(i=>i.kind==='dimensions'))
 const stagedPreview=await h.kit('intacct','preview',stageInput)
 await h.kit('intacct','commit',{...stageInput,fingerprint:stagedPreview.fingerprint,sourceFingerprint:stagedPreview.sourceFingerprint},h.owner,409)
 const decisions=staged.unresolved.map(issue=>({issue:issue.id,action:'exclude',reason:'Reviewed label-only member metadata; stable IDs and mappings remain unchanged'}))
 staged=await h.command('source-guard-review',{id:staged.id,revision:staged.revision,fingerprint:staged.fingerprint,decisions})
 assert.deepEqual(staged.unresolved,[],JSON.stringify(staged.unresolved))
 await acceptIntacct(h,stageInput)
 assert.equal((await h.get('/api/easel/source-guard')).guards.find(g=>g.id===staged.id).status,'completed')

 provider.largeApril=true
 const previousGuard=(await h.get('/api/easel/source-guard')).guards.find(g=>g.id===staged.id)
 await h.kit('intacct','stage',{...stageInput,revision:previousGuard.revision})
 const continued=await h.kit('intacct','preview',stageInput)
 let continuing=await h.kit('intacct','commit',{...stageInput,fingerprint:continued.fingerprint,sourceFingerprint:continued.sourceFingerprint})
 assert.equal(continuing.batch.status,'importing')
 assert.equal((await h.get('/api/easel/actuals?entity='+f.ca.id)).months.find(m=>m.period==='2026-04').revenue,null,'Partial journal amounts remain unavailable')
 await h.kit('intacct','preview',stageInput,h.owner,409)
 let continuations=0
 while(continuing.batch.status==='importing'&&continuations++<20)continuing=await h.kit('actuals','resume',{id:continuing.batch.id})
 assert.equal(continuing.batch.status,'accepted');assert.ok(continuations>0)
 assert.equal((await h.get('/api/easel/connections/intacct')).months.find(m=>m.entity===f.ca.id&&m.month==='2026-04').ledgerRows,402)

 const beforeCorrection=await h.get('/api/easel/scenario/'+approved.forecast.id)
 const kept=await h.command('reforecast-save',{from:approved.forecast.id,revision:beforeCorrection.scenario.revision,name:'Provider accepted January capture'})
 const frozen=await h.get('/api/easel/scenario/'+kept.id)
 const pack=await h.command('pack-create',{month:'2026-01',scenario:approved.forecast.id}),published=await h.command('pack-publish',{pack:pack.id})
 const packSnapshot=await h.get('/api/easel/snapshot/'+published.snapshot)
 provider.editMonth='2026-01'
 await acceptIntacct(h,{sourceEntity:'CA',month:'2026-01',includeOpening:false})
 assert.ok((await h.get(groupPath)).consolidated[0].unavailable.some(reason=>/source rows or mappings changed/.test(reason)))
 assert.deepEqual(await h.get('/api/easel/scenario/'+kept.id),frozen)
 assert.deepEqual(await h.get('/api/easel/snapshot/'+published.snapshot),packSnapshot)
 await h.command('entity-elimination-save',{...elimination,id:savedElimination.id})
 assert.deepEqual((await h.get(groupPath)).consolidated[0].unavailable,[])
 const historyBeforeDisconnect=await h.get('/api/easel/actuals?entity='+f.ca.id)
 await h.stepUp();const tokenResponse=await h.send('/api/easel/tokens/issue',{label:'Intacct native boundary',kind:'personal',scope:'write'},h.owner);assert.equal(tokenResponse.status,200)
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/easel/connections/intacct',{headers:{authorization:'Bearer '+tokenResponse.value.token}})).status,403)
 const archive=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}}),zip=await JSZip.loadAsync(await archive.arrayBuffer())
 for(const file of Object.values(zip.files).filter(f=>!f.dir)){const data=await file.async('string');for(const secret of [intacctGrant.userPassword,intacctGrant.senderPassword,sealed.sealed])assert.ok(!data.includes(secret))}
 provider.status=429;await call('check',{});status=await h.get('/api/easel/connections/intacct');assert.match(status.rateLimit,/60/);assert.ok(!JSON.stringify(status).includes(intacctGrant.userPassword));provider.status=200
 await call('check',{});assert.equal((await h.get('/api/easel/connections/intacct')).error,null)
 const disconnected=await call('disconnect',{});assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,'unsupported');assert.match(disconnected.providerRevocation.ownerStep,/Deactivate/)
 assert.equal(await h.db.prepare("SELECT id FROM e_connection_secrets WHERE id='intacct'").first(),null)
 assert.deepEqual(await h.get('/api/easel/actuals?entity='+f.ca.id),historyBeforeDisconnect)
 const activity=await h.get('/api/easel/activity');for(const action of ['intacct-connected','intacct-checked','intacct-disconnected','intacct-entity-bound'])assert.ok((await h.get('/api/easel/activity?action='+action)).some(e=>e.action===action))
 assert.ok(!JSON.stringify(activity).includes(intacctGrant.userPassword))
 await allocationJourney(t)
})

async function allocationJourney(t){
 const {seedBalanceActuals}=await import('./balance-actuals-fixture.mjs')
 const provider=intacctProvider(),h=await harness({outbound:provider.outbound,now:()=> '2026-05-15T12:00:00.000Z'});t.after(()=>h.close())
 const { revenue, expense } = await seedBalanceActuals(h.command)
 const dept = await h.command('department', { name: 'Delivery' })
 await h.command('department-map', { source: '', department: dept.id })
 const board = await h.person('board-opening@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const payrollLine = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const depreciation = await h.command('line', { name: 'Depreciation', type: 'operating-expense', nonCash: true })
 const subscriptions = await h.command('line', { name: 'Subscriptions', type: 'revenue' })
 const insurance = await h.command('line', { name: 'Insurance', type: 'operating-expense' })
 const base = { scenario: budget.id, department: dept.id, start: '2026-01' }
 const prepaid = await h.command('expense', { ...base, line: insurance.id, name: 'Annual insurance', kind: 'prepaid', amount: '1200', paymentMonth: '2025-12', amortizationMonths: '12' })
 const payroll = await h.command('position', { ...base, start: '2025-12', line: payrollLine.id, title: 'Private operations lead', holder: 'Restricted holder', annualSalary: '12000', payDay: 5, payMonthOffset: 1 })
 const bonus = await h.command('expense', { ...base, start: '2025-12', line: payrollLine.id, name: 'Restricted quarterly bonus', kind: 'bonus', amount: '900', payMonth: '2026-02' })
 const contract = await h.command('revenue', { ...base, line: subscriptions.id, name: 'Annual subscription', kind: 'contract', start: '2025-12', startDate: '2025-12-01', termMonths: 13, contractValue: '13000', billingCadence: 'annual', dsoDays: 0 })
 // This annual contract has one future invoice; attribution retains that invoice and its collection date.
 const category = await h.command('asset-category', { scenario: budget.id, name: 'Equipment', usefulLifeMonths: 60 })
 const asset = await h.command('asset', { ...base, line: depreciation.id, name: 'Delivery equipment', category: category.originId, kind: 'existing', cost: '24000', remainingLifeMonths: 24, disposalMonth: '2026-04', disposalProceeds: '1000' })
 for (const [account, target] of [['1200', 'bs:prepaid'], ['5100', insurance.id], ['5200', payrollLine.id], ['5300', depreciation.id], ['4100', subscriptions.id]]) await h.command('account-map', { account, target })
 const rows = [
 ['2025-12-31','1000','100000'],['2025-12-31','1100','12000'],['2025-12-31','1200','2400'],['2025-12-31','FA-01','18000'],
 ['2025-12-31','2000','-8000'],['2025-12-31','2100','-3000'],['2025-12-31','2200','-6600'],['2025-12-31','2300','-20000'],['2025-12-31','3000','-94800'],
 ['2026-01-15','1101','10000'],['2026-01-15','4000','-10000'],['2026-01-20','5000','4000'],['2026-01-20','1000','-4000'],
 ['2026-01-05','2100','1000'],['2026-01-05','1000','-1000'],['2026-01-31','1200','-200'],['2026-01-31','5100','200'],
 ['2026-01-31','FA-01','-500'],['2026-01-31','5300','500'],['2026-01-31','2200','600'],['2026-01-31','4100','-600'],['2026-01-31','2100','-1000'],['2026-01-31','5200','1000'],
 ]

 await h.command('workspace',{name:'Provider opening allocations',currency:'CAD',fiscalYearStart:1,planStart:'2026-01'})
 const entity=await h.command('entity-save',{name:'Canadian Services',scenario:budget.id,currency:'CAD',group:budget.id,reporting:'CAD'})
 provider.entries=rows
 await intacctCall(h)('connect',intacctGrant)
 await intacctCall(h)('bind',{sourceEntity:'CA',entity:entity.id})
 await acceptIntacct(h,{sourceEntity:'CA',month:'2025-12',includeOpening:true})
 await acceptIntacct(h,{sourceEntity:'CA',month:'2026-01',includeOpening:false})
 let b = await h.get(`/api/easel/scenario/${budget.id}`)
 const { forecast } = await h.command('approve-budget',{scenario:budget.id,revision:b.scenario.revision})
 const beforeClose = await h.get(`/api/easel/scenario/${forecast.id}`)
 await h.command('close-month',{scenario:forecast.id,month:'2026-01'})
 const view = () => h.get(`/api/easel/scenario/${forecast.id}`)
 let v = await view(), c = v.calculation
 assert.deepEqual(c.balanceSheet.slice(0,2).map(r => [r.cash,r.receivables,r.prepaid,r.fixedAssets,r.payables,r.accruedLiabilities,r.deferredRevenue,r.debt,r.openingEquity]), [
 [9500000,2200000,220000,1750000,800000,300000,600000,2000000,9480000],
 [9910000,1200000,210000,1650000,400000,240000,500000,2000000,9480000],
 ])
 assert.equal(c.balanceSheet[0].balanceDifference,0)
 assert.equal(c.cash[0].opening,10000000); assert.equal(c.cash[0].collections,0); assert.equal(c.cash[0].payments,500000)
 assert.equal(c.cashFlow[0].difference,0)
 assert.ok(c.balanceSheet[1].incompleteReasons.some(r => /no reviewed schedule attribution/.test(r)))
 const allocate = async (target, originId, amount, extra = {}, cookie = h.owner, status = 200) => {
  const revision = (await view()).scenario.revision
  return h.command('ledger-allocation',{scenario:forecast.id,revision,month:'2026-01',target,allocations:[{originId,amount,...extra}]},cookie,status)
 }
 await allocate('bs:prepaid',prepaid.originId,'2199',{},h.owner,409)
 await allocate('bs:prepaid',prepaid.originId,'2200',{},board,403)
 await allocate('bs:deferred-revenue',contract.originId,'6000')
 assert.deepEqual((await view()).calculation.contracts.invoices, c.contracts.invoices, 'future invoices and receipt dates are retained exactly')
 // A revised service schedule retains the explicit source association by origin.
 const futureContract = (await view()).inputs.revenue.find(r=>r.originId===contract.originId)
 await h.command('revenue',{...base,scenario:forecast.id,id:futureContract.id,line:subscriptions.id,name:'Annual subscription',kind:'contract',start:'2025-12',startDate:'2025-12-01',termMonths:12,contractValue:'12000',billingCadence:'annual',dsoDays:0})
 await allocate('bs:prepaid',prepaid.originId,'2200')
 await h.command('ledger-allocation',{scenario:forecast.id,revision:(await view()).scenario.revision,month:'2026-01',target:'bs:accrued-liabilities',allocations:[{originId:payroll.originId,amount:'2000'},{originId:bonus.originId,amount:'1000'}]})
 await allocate('bs:deferred-revenue',contract.originId,'6000')
 await allocate('bs:fixed-assets',asset.originId,'17500',{remainingLifeMonths:35})
 v = await view(); c = v.calculation
 const feb = c.balanceSheet[1]
 assert.equal(feb.prepaid,200000); assert.equal(feb.accruedLiabilities,100000); assert.equal(feb.fixedAssets,1700000)
 assert.equal(c.assets.find(r=>r.originId===asset.originId&&r.month==='2026-02').depreciation,50000)
 const prepaidRows=c.workingCapital.rows.filter(r=>r.originId===prepaid.originId)
 assert.equal(prepaidRows[1].prepaidExpense,20000); assert.equal(prepaidRows.at(-1).prepaid,0)
 const pay=c.workingCapital.rows.find(r=>r.originId===payroll.originId&&r.month==='2026-02')
 assert.equal(pay.accruedPayments,200000); assert.equal(pay.accruedLiabilities,100000)
 const bonusSettlement=c.workingCapital.rows.find(r=>r.originId===bonus.originId&&r.month==='2026-02')
 assert.equal(bonusSettlement.accruedPayments,130000); assert.equal(bonusSettlement.accruedLiabilities,0)
 assert.match(bonusSettlement.trace,/Imported.*opening.*account/)
 const disposal=c.assets.find(r=>r.originId===asset.originId&&r.month==='2026-04')
 assert.equal(disposal.depreciation,0); assert.equal(disposal.disposalBookValue,1650000); assert.equal(disposal.disposalProceeds,100000); assert.equal(disposal.closingBookValue,0)
 assert.equal(c.contracts.rows.filter(r=>r.month>'2026-01').reduce((n,r)=>n+r.revenue,0),600000)
 for (const r of [prepaidRows[1],pay,c.assets.find(r=>r.month==='2026-02'),c.contracts.rows.find(r=>r.month==='2026-02')]) assert.match(r.trace,/Imported.*opening.*account/)
 for (const [i,row] of c.balanceSheet.entries()) {
  assert.equal(row.balanceDifference,0,`${row.month}: ${row.trace}`)
  assert.equal(c.cashFlow[i].difference,0,`${row.month}: ${c.cashFlow[i].trace}`)
  assert.equal(row.incompleteReasons,undefined, row.month)
 }
 const branch = await h.command('branch',{from:forecast.id,name:'Imported opening branch'})
 assert.deepEqual((await h.get(`/api/easel/scenario/${branch.id}`)).calculation,c)
 const state = await h.get('/api/easel/state')
 const snapshot = await h.get(`/api/easel/snapshot/${state.snapshots.find(s=>s.kind==='forecast').id}`)
 assert.deepEqual(snapshot.body.calculation,beforeClose.calculation,'kept pre-close calculation is unchanged by later allocations')
 const kept=await h.command('reforecast-save',{from:forecast.id,revision:v.scenario.revision,name:'Actual opening review'})
 const frozen=await h.get(`/api/easel/scenario/${kept.id}`)
 const viewer=await h.get(`/api/easel/scenario/${forecast.id}`,board)
 assert.equal(viewer.scenario.ledgerAllocations,undefined)
 assert.doesNotMatch(JSON.stringify(viewer),/Restricted holder|Private operations lead|opening-ledger.csv|account 2100/)
 assert.deepEqual(viewer.calculation.balanceSheet,c.balanceSheet)
 const response=await h.mf.dispatchFetch(h.origin+`/api/easel/scenario/${forecast.id}/document.xlsx`,{headers:{cookie:h.owner}})
 assert.equal(response.status,200)
 const book=await readWorkbook(await response.arrayBuffer())
 for(const name of ['Balance sheet','Indirect cash flow']) {
  const sheet=book.getWorksheet(name)
  sheet.eachRow(row=>row.eachCell(cell=>{if(cell.value?.formula)assert.equal(evaluate(sheet,cell.address),cell.result,`${name}!${cell.address}`)}))
 }
 const sourceRule=(await h.get('/api/easel/state')).accountRules.find(r=>r.match==='prefix'&&r.from==='FA-')
 await h.command('account-rule-delete',{id:sourceRule.id})
 await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
 assert.deepEqual(await h.get(`/api/easel/scenario/${kept.id}`),frozen)
 await h.command('account-rule',{match:'prefix',from:'FA-',target:'bs:fixed-assets'})
 assert.deepEqual((await view()).calculation,c)
 provider.entries=provider.entries.map(row=>row[0]==='2025-12-31'&&row[1]==='1200'?[row[0],row[1],'2400.01']:row[0]==='2025-12-31'&&row[1]==='3000'?[row[0],row[1],'-94800.01']:row)
 await acceptIntacct(h,{sourceEntity:'CA',month:'2025-12',includeOpening:true})
 await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
 assert.deepEqual(await h.get(`/api/easel/scenario/${kept.id}`),frozen)
 const revision=(await h.get('/api/easel/state')).scenarios.find(s=>s.id===forecast.id).revision
 await h.command('ledger-allocation',{scenario:forecast.id,revision,month:'2026-01',target:'bs:prepaid',allocations:[{originId:prepaid.originId,amount:'2200.01'}]})
 const repaired=await view()
 assert.equal(repaired.calculation.balanceSheet[0].prepaid,220001)
 assert.equal(repaired.calculation.workingCapital.rows.filter(r=>r.originId===prepaid.originId).at(-1).prepaid,0,'final service month conserves the one-cent correction')
 assert.ok(repaired.calculation.balanceSheet.every(r=>r.balanceDifference===0))
 const liveAsset=repaired.inputs.asset.find(r=>r.originId===asset.originId)
 await h.command('input-delete',{kind:'asset',id:liveAsset.id})
 await h.get(`/api/easel/scenario/${forecast.id}`,h.owner,409)
 assert.deepEqual(await h.get(`/api/easel/scenario/${kept.id}`),frozen,'deleted allocation origins block working conclusions without changing the kept version')
}
