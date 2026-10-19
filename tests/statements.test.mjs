import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

test('FIN-001 every scenario links 24-month profit, balance sheet and indirect cash with traced reconciliation and frozen formula exports', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', {name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const dept = await h.command('department',{name:'Operations'})
 const revenue = await h.command('line',{name:'Services',type:'revenue'})
 const costs = await h.command('line',{name:'Operating costs',type:'operating-expense'})
 const payroll = await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true})
 const depreciation = await h.command('line',{name:'Depreciation',type:'operating-expense',nonCash:true})
 const reserve = await h.command('line',{name:'Noncash provision',type:'operating-expense',nonCash:true})
 const board = await h.person('board@example.test','viewer')
 const contributor = await h.person('planner@example.test','contributor',[dept.id])
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const read = id => h.get(`/api/easel/scenario/${id}`)
 await h.command('scenario-cash',{scenario:budget.id,basis:'estimate',opening:'100000',receivables:'12000',payables:'5000',collectionLag:1,paymentLag:1})
 await h.command('revenue',{scenario:budget.id,name:'Contract revenue',kind:'volume',department:dept.id,line:revenue.id,start:'2026-01',startVolume:'10',rate:'1000',collectionLag:1})
 await h.command('expense',{scenario:budget.id,name:'Rent',kind:'recurring',department:dept.id,line:costs.id,start:'2026-01',amount:'3000'})
 await h.command('position',{scenario:budget.id,title:'Analyst',holder:'Private salary holder',department:dept.id,line:payroll.id,start:'2026-01',annualSalary:'12000'})
 await h.command('expense',{scenario:budget.id,name:'Noncash reserve estimate',kind:'recurring',department:dept.id,line:reserve.id,start:'2026-01',amount:'100'})
 const category = await h.command('asset-category',{scenario:budget.id,name:'Equipment',usefulLifeMonths:60})
 const short = await h.command('asset-category',{scenario:budget.id,name:'Short life',usefulLifeMonths:12})
 const asset = {scenario:budget.id,department:dept.id,line:depreciation.id,category:category.originId,kind:'purchase',start:'2026-01'}
 await h.command('asset',{...asset,name:'Production equipment',cost:'120000',paymentMonth:'2026-03',disposalMonth:'2026-04',disposalProceeds:'100000'})
 await h.command('asset',{...asset,name:'Existing equipment',kind:'existing',cost:'1000',openingAccumulated:'400',remainingLifeMonths:3})
 await h.command('asset',{...asset,category:short.originId,name:'Prepaid equipment',start:'2026-04',paymentMonth:'2026-02',cost:'6000'})
 const reconcile = v => {
  const c=v.calculation
  assert.equal(c.balanceSheet.length,c.months.length);assert.equal(c.cashFlow.length,c.months.length)
  let retained=0
  for(const [i,b] of c.balanceSheet.entries()) {
   const f=c.cashFlow[i],p=c.profit[i];retained+=p.profit
   assert.equal(b.assets,b.cash+b.receivables+b.capitalPrepayments+b.fixedAssets)
   assert.equal(b.liabilities,b.payables+b.capitalPayables+b.nonCashReserve)
   assert.equal(b.assets,b.liabilities+b.equity,b.month)
   assert.equal(b.balanceDifference,0);assert.equal(b.cashDifference,0)
   assert.equal(b.retainedEarnings,retained);assert.equal(b.equity,b.openingEquity+retained)
   assert.equal(f.netIncome,p.profit)
   assert.equal(f.operating,f.netIncome+f.nonCashExpense+f.receivablesChange+f.payablesChange)
   assert.equal(f.investing,f.capex+f.disposalProceeds)
   assert.equal(f.change,f.operating+f.investing+f.financing)
   assert.equal(f.closing,f.opening+f.change);assert.equal(f.closing,b.cash);assert.equal(f.closing,c.cash[i].closing);assert.equal(f.difference,0)
   assert.ok(b.trace.length);assert.ok(f.trace.length);assert.deepEqual(b.causes,[])
  }
 }
 let v=await read(budget.id);reconcile(v)
 const approval=await h.command('approve-budget',{scenario:budget.id,revision:v.scenario.revision})
 const frozen=await read(budget.id)
 await h.command('forecast-window',{scenario:approval.forecast.id,revision:1,months:24})
 v=await read(approval.forecast.id);assert.equal(v.calculation.months.length,24);reconcile(v)
 const jan=v.calculation.balanceSheet[0]
 assert.deepEqual(['cash','receivables','fixedAssets','capitalPayables','payables','nonCashReserve','openingEquity','retainedEarnings'].map(k=>jan[k]),[10600000,1000000,11840000,12000000,300000,10000,10760000,370000])
 assert.deepEqual(v.calculation.balanceSheet.slice(0,4).map(b=>b.capitalPrepayments),[0,600000,600000,0])
 assert.deepEqual(v.calculation.cashFlow.slice(0,4).map(f=>f.capex),[0,-600000,-12000000,0])
 assert.equal(v.calculation.cashFlow[3].disposalProceeds,10000000)
 assert.equal(v.calculation.cashFlow[3].nonCashExpense,1460000)
 const branch=await h.command('branch',{from:approval.forecast.id,name:'Downside'})
 const proposal=await h.command('proposal-create',{from:approval.forecast.id,name:'Operating proposal',request:'Review cash timing'},contributor)
 for(const id of [branch.id,proposal.id]) {const other=await read(id);assert.equal(other.calculation.months.length,24);reconcile(other)}
 const kept=await h.command('reforecast-save',{from:approval.forecast.id,name:'Q1 version',revision:v.scenario.revision})
 const saved=await read(kept.id);reconcile(saved)
 const viewer=await h.get(`/api/easel/scenario/${approval.forecast.id}`,board)
 assert.deepEqual(viewer.calculation.balanceSheet,v.calculation.balanceSheet)
 assert.deepEqual(viewer.calculation.cashFlow,v.calculation.cashFlow)
 assert.doesNotMatch(JSON.stringify(viewer),/Private salary holder/)
 const response=await h.mf.dispatchFetch(h.origin+`/api/easel/scenario/${kept.id}/document.xlsx`,{headers:{cookie:board}})
 assert.equal(response.status,200)
 const book=await readWorkbook(await response.arrayBuffer());proveFormulas(book)
 for(const name of ['Balance sheet','Indirect cash flow'])assert.equal(book.getWorksheet(name).rowCount,26)
 const filtered=await h.mf.dispatchFetch(h.origin+`/api/easel/scenario/${kept.id}/document.xlsx?department=${dept.id}`,{headers:{cookie:board}})
 const scoped=await readWorkbook(await filtered.arrayBuffer())
 assert.equal(scoped.getWorksheet('Balance sheet'),undefined);assert.equal(scoped.getWorksheet('Indirect cash flow'),undefined)
 // Closed P&L actuals inconsistent with planned depreciation must leave a
 // visible imbalance rather than silently changing either source or equity.
 for(const [account,target] of [['400',revenue.id],['500',costs.id],['600',payroll.id],['700',depreciation.id],['710',reserve.id]])await h.command('account-map',{account,target})
 await h.command('department-map',{source:'Operations',department:dept.id})
 const body={filename:'january.csv',csv:'Date,Account,Department,Amount\n2026-01-31,400,Operations,-10000\n2026-01-31,500,Operations,3000\n2026-01-31,600,Operations,1000\n2026-01-31,700,Operations,2500\n2026-01-31,710,Operations,100\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 const preview=await h.kit('actuals','preview',body);await h.kit('actuals','commit',{...body,fingerprint:preview.fingerprint})
 await h.command('close-month',{scenario:approval.forecast.id,month:'2026-01'})
 const closed=await read(approval.forecast.id),check=closed.calculation.balanceSheet[0]
 assert.equal(check.balanceDifference,30000);assert.equal(check.cashDifference,0)
 assert.ok(check.causes.some(c=>c.includes('CONNECT-007')))
 assert.ok(check.causes.some(c=>c.includes('depreciation')))
 assert.equal(closed.calculation.cashFlow[0].closing,check.cash)
 assert.deepEqual(await read(budget.id),frozen);assert.deepEqual(await read(kept.id),saved)
})
