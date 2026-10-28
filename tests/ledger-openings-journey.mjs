import assert from 'node:assert/strict'
import { readWorkbook,evaluate } from './spreadsheet-proof.mjs'
import { harness } from './harness.mjs'

export async function proveLedgerOpenings(t,sourceKinds=['file','pantry','qbo','xero']) {
 const { seedBalanceActuals } = await import('./balance-actuals-fixture.mjs')
 for(const sourceKind of sourceKinds) {
 const {pantryProvider,pantryGrant}=await import('./pantry-provider.mjs'),provider=pantryProvider()
 const {qboProvider,qboGrant,acceptQbo}=await import('./qbo-fixture.mjs'),qboEdge=qboProvider()
 const {xeroProvider,xeroGrant,acceptXero}=await import('./xero-fixture.mjs'),xeroEdge=xeroProvider()
 const {netsuiteProvider,netsuiteGrant,acceptNetsuite,mapNetsuite}=await import('./netsuite-fixture.mjs'),netsuiteEdge=netsuiteProvider()
 const h = await harness({outbound:sourceKind==='netsuite'?netsuiteEdge.outbound:sourceKind==='xero'?xeroEdge.outbound:sourceKind==='qbo'?qboEdge.outbound:provider.outbound,bindings:{PANTRY_ORIGIN:'https://pantry.example.test'}}); t.after(() => h.close())
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
 const ledger = { filename: 'opening-ledger.csv', dateFormat: 'YYYY-MM-DD', columns: { date: 'Date', account: 'Account', amount: 'Amount' }, csv: 'Date,Account,Amount\n' + rows.map(r => r.join(',')).join('\n') + '\n' }
 let preview
 if(sourceKind==='netsuite') {
  netsuiteEdge.entries=rows
  assert.equal((await h.send('/api/easel/connections/netsuite/connect',netsuiteGrant,h.owner)).status,200)
  await mapNetsuite(h,budget.id)
  await acceptNetsuite(h,{month:'2025-12',subsidiaryId:'1',includeOpening:true})
  preview=await acceptNetsuite(h,{month:'2026-01',subsidiaryId:'1',includeOpening:false})
  assert.equal(preview.source.trialBalance.balanced,true)
 } else if(sourceKind==='xero') {
  await h.command('workspace',{name:'Harbour Services',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
  xeroEdge.entries=rows
  assert.equal((await h.send('/api/easel/connections/xero/connect',xeroGrant,h.owner)).status,200)
  await acceptXero(h,{month:'2025-12',includeOpening:true})
  preview=await acceptXero(h,{month:'2026-01',includeOpening:false})
  assert.equal(preview.source.trialBalance.balanced,true)
 } else if(sourceKind==='qbo') {
  await h.command('workspace',{name:'Harbour Services',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
  qboEdge.entries=rows
  assert.equal((await h.send('/api/easel/connections/qbo/connect',qboGrant,h.owner)).status,200)
  await acceptQbo(h,{month:'2025-12',includeOpening:true})
  preview=await acceptQbo(h,{month:'2026-01',includeOpening:false})
  assert.equal(preview.source.trialBalance.balanced,true)
 } else if(sourceKind==='pantry') {
  await h.command('workspace',{name:'Harbour Services',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
  provider.extraAccounts=[...new Set(rows.map(r=>r[1]))].filter(code=>!['1000','4000'].includes(code)).map((code,i)=>({id:`synthetic-easel-account-${i}`,code,name:code,type:'asset'}))
  const chart=[{id:'synthetic-easel-2',code:'1000'},{id:'synthetic-easel-3',code:'4000'},...provider.extraAccounts]
  provider.entries=[...new Set(rows.map(r=>r[0]))].map((date,i)=>({id:`synthetic-easel-entry-${i}`,entry_date:date,status:'posted',revision:`synthetic-easel-revision-${i}`,lines:rows.filter(r=>r[0]===date).map((r,j)=>{const amount=Math.round(Number(r[2])*100);return {id:`synthetic-easel-line-${i}-${j}`,account_id:chart.find(a=>a.code===r[1]).id,debit_cents:Math.max(amount,0),credit_cents:Math.max(-amount,0)}})}))
  assert.equal((await h.send('/api/easel/connections/pantry/connect',pantryGrant,h.owner)).status,200)
  const range={from:'2025-12-01',to:'2026-01-31'}
  preview=await h.kit('pantry','preview',range)
  assert.equal(preview.source.trialBalance.balanced,true)
  await h.kit('pantry','commit',{...range,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint})
 } else {
  preview=await h.kit('actuals','preview',ledger)
  await h.kit('actuals','commit',{...ledger,fingerprint:preview.fingerprint})
 }
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
 const correction = { ...ledger, filename:'corrected-opening.csv', csv:'Date,Account,Amount\n2026-01-31,1200,0.01\n2026-01-31,3000,-0.01\n' }
 if(sourceKind==='netsuite'){
  netsuiteEdge.entries=[...rows,['2026-01-31','1200','0.01'],['2026-01-31','3000','-0.01']]
  await acceptNetsuite(h,{month:'2026-01',subsidiaryId:'1',includeOpening:false})
 }else{
  const corrected = await h.kit('actuals','preview',correction)
  await h.kit('actuals','commit',{...correction,fingerprint:corrected.fingerprint})
 }
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
}
