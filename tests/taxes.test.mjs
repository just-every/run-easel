import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas, evaluate } from './spreadsheet-proof.mjs'

const identities=calc=>{
 for(const [i,b]of calc.balanceSheet.entries()) {
  const f=calc.cashFlow[i]
  assert.equal(b.assets,b.liabilities+b.equity,`${b.month} balance`)
  assert.equal(f.closing,calc.cash[i].closing,`${b.month} cash`)
  assert.equal(b.salesTaxPayable,calc.taxes.sales[i].payableCents)
  assert.equal(f.operating,f.netIncome+f.nonCashExpense+f.receivablesChange+f.payablesChange+f.inventoryChange+f.prepaidChange+f.accruedLiabilitiesChange+f.deferredRevenueChange+f.unbilledRevenueChange+f.salesTaxPayableChange)
 }
}
test('FIN-006 US employer annual tax bases, income loss carryforward and sales-tax pass-through stay exact, traced, scoped and frozen',async t=>{
 const h=await harness();t.after(()=>h.close())
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await h.command('department',{name:'Engineering'})
 const line=async(name,type='operating-expense',extra={})=>h.command('line',{name,type,...extra})
 const salary=await line('Payroll','operating-expense',{payroll:true}),taxLine=await line('Income tax estimate'),revenue=await line('Subscriptions','revenue')
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const w2body={scenario,title:'Engineer',holder:'Private tax sentinel',department:department.id,line:salary.id,annualSalary:'180000',onCostPercent:'0',start:'2026-01',employmentType:'W-2'}
 const w2=await h.command('position',w2body)
 await h.command('position',{...w2body,title:'Contractor',holder:'Private contractor',annualSalary:'36000',employmentType:'1099'})
 await h.command('revenue',{scenario,line:revenue.id,department:department.id,name:'Annual contract',kind:'contract',start:'2026-01',startDate:'2026-01-01',termMonths:'12',contractValue:'120000',billingCadence:'annual',dsoDays:'0'})
 await h.command('schedule',{scenario,line:revenue.id,department:department.id,name:'February launch',values:{'2026-02':'100000'}})
 await h.command('scenario-cash',{scenario,basis:'estimate',opening:'200000',collectionLag:0,paymentLag:0})
 const policyBody={scenario,line:taxLine.id,department:department.id,sutaPercent:'2.7',sutaBase:'9000',stateIncomePercent:'5',salesTaxPercent:'10',socialSecurityBase:'176100'}
 const board=await h.person('board@example.test','viewer'),analyst=await h.person('analyst@example.test','finance',[],false),head=await h.person('head@example.test','contributor',[department.id])
 await h.command('tax-policy',policyBody,board,403);await h.command('tax-policy',policyBody,head,403)
 await h.command('tax-policy',{...policyBody,sutaPercent:undefined},h.owner,400)
 const policy=await h.command('tax-policy',policyBody)
 assert.equal(policy.year,2026)
 const view=(id=scenario,cookie=h.owner)=>h.get(`/api/easel/scenario/${id}`,cookie)
 const original=await view(),c=original.calculation;identities(c)
 const payroll=c.taxes.payrollRows.filter(r=>r.originId===w2.originId)
 assert.deepEqual(payroll[0],{...payroll[0],wagesCents:1500000,socialSecurityCents:93000,medicareCents:21750,futaCents:42000,sutaCents:24300,totalCents:181050,ytdWagesCents:1500000})
 assert.equal(payroll.reduce((n,r)=>n+r.socialSecurityCents,0),1091820,'The explicitly overridden wage base caps this $180,000 case')
 assert.equal(payroll.at(-1).socialSecurityCents,68820)
 assert.equal(payroll.reduce((n,r)=>n+r.medicareCents,0),261000)
 assert.equal(payroll.reduce((n,r)=>n+r.futaCents,0),42000)
 assert.equal(payroll.reduce((n,r)=>n+r.sutaCents,0),24300)
 assert.ok(payroll.slice(1).every(r=>r.futaCents===0&&r.sutaCents===0))
 assert.ok(c.taxes.payrollRows.filter(r=>r.originId!==w2.originId).every(r=>r.totalCents===0))
 assert.match(payroll[0].trace,/176,100|176100/);assert.match(payroll[0].trace,/planning|assumptions/)
 assert.deepEqual(c.taxes.incomeRows.slice(0,2).map(r=>[r.preTaxProfitCents,r.lossUsedCents,r.taxCents,r.lossClosingCents]),[[-981050,0,0,981050],[9085250,981050,2107092,0]])
 assert.equal(c.profit[0].revenue,1000000,'Sales tax never becomes revenue')
 assert.deepEqual(c.taxes.sales.slice(0,2).map(r=>[r.collectedCents,r.remittedCents,r.payableCents]),[[1200000,0,1200000],[1000000,1200000,1000000]])
 assert.equal(c.balanceSheet[0].salesTaxPayable,1200000)
 assert.ok(c.cells.find(cell=>cell.line===salary.id&&cell.month==='2026-01').sources.some(source=>source.trace.includes('Social Security')))
 // Viewers and analysts get aggregates, never per-person wages or source traces.
 for(const cookie of[board,analyst]) {
  const safe=await view(scenario,cookie)
  assert.deepEqual(safe.calculation.taxes.payrollRows,[])
  assert.equal(safe.calculation.taxes.payrollTotals[0].totalCents,181050)
  assert.doesNotMatch(JSON.stringify(safe),/Private tax sentinel|Private contractor|18000000/)
 }
 await h.command('tax-policy',{...policyBody,id:policy.id},analyst)
 await h.command('line',{id:taxLine.id,name:taxLine.name,type:'revenue'},h.owner,409)
 for(const bad of[{sutaBase:'-1'},{futaPercent:'101'},{socialSecurityBase:'1.001'},{federalIncomePercent:'99',stateIncomePercent:'5'},{salesTaxRemitLagMonths:'-1'}])await h.command('tax-policy',{...policyBody,id:policy.id,...bad},h.owner,400)
 await h.command('tax-policy',policyBody,h.owner,409)
 // The loss allowance is bounded even when carried losses exceed profit.
 const lossBranch=await h.command('branch',{from:scenario,name:'Large opening losses'})
 const lossPolicy=(await view(lossBranch.id)).inputs['tax-policy'][0]
 await h.command('tax-policy',{...policyBody,scenario:lossBranch.id,id:lossPolicy.id,openingLoss:'1000000'})
 const limited=(await view(lossBranch.id)).calculation.taxes.incomeRows[1]
 assert.equal(limited.lossUsedCents,7268200);assert.equal(limited.taxCents,472433)
 // Defaults are independently verified at their stated 2026 wage base.
 await h.command('tax-policy',{...policyBody,id:policy.id,socialSecurityBase:undefined,salesTaxPercent:'0'})
 await h.command('position',{...w2body,id:w2.id,annualSalary:'250000'})
 const defaults=await view(),defaultRows=defaults.calculation.taxes.payrollRows.filter(r=>r.originId===w2.originId)
 assert.equal(defaultRows.reduce((n,r)=>n+r.socialSecurityCents,0),1143900)
 assert.equal(defaultRows.reduce((n,r)=>n+r.medicareCents,0),362500)
 assert.ok(defaultRows.at(-1).socialSecurityCents===0)
 // Explicit finance FUTA credit assumption and rate override are retained.
 await h.command('tax-policy',{...policyBody,id:policy.id,futaPercent:'0.6'})
 assert.equal((await view()).calculation.taxes.payrollRows.filter(r=>r.originId===w2.originId).reduce((n,r)=>n+r.futaCents,0),4200)
 await h.command('position',{...w2body,id:w2.id})
 await h.command('tax-policy',{...policyBody,id:policy.id})
 const approved=await h.command('approve-budget',{scenario,revision:(await view()).scenario.revision}),frozen=await view()
 const forecast=approved.forecast.id,forecastView=await view(forecast),forecastPolicy=forecastView.inputs['tax-policy'][0]
 assert.ok(forecastPolicy);identities(forecastView.calculation)
 await h.command('tax-policy',{...policyBody,scenario:forecast,id:forecastPolicy.id,futaPercent:'0.6'})
 assert.deepEqual((await view()).calculation,frozen.calculation,'Approved tax arithmetic remains captured')
 const response=await h.mf.dispatchFetch(h.origin+`/api/easel/scenario/${scenario}/document.xlsx`,{headers:{cookie:h.owner}})
 assert.equal(response.status,200)
 const book=await readWorkbook(new Uint8Array(await response.arrayBuffer()));proveFormulas(book)
 const bs=book.getWorksheet('Balance sheet'),cf=book.getWorksheet('Indirect cash flow')
 assert.equal(evaluate(bs,'J3'),frozen.calculation.balanceSheet[0].liabilities)
 assert.equal(evaluate(cf,'G3'),frozen.calculation.cashFlow[0].operating)
 // The finance agent door proposes the same tax policy without executing a filing.
 const proposal=await h.command('proposal-create',{from:forecast,name:'FUTA credit assumption',request:'Review the explicitly entered FUTA credit assumption'})
 const proposalPolicy=(await view(proposal.id)).inputs['tax-policy'][0]
 const rpc=await h.send('/api/easel/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'tax-policy',arguments:{...policyBody,scenario:proposal.id,id:proposalPolicy.id,futaPercent:'0.6'}}},h.owner)
 assert.equal(rpc.status,200);assert.ok(!rpc.value.error&&!rpc.value.result.isError,JSON.stringify(rpc.value))
 assert.equal((await view(proposal.id)).inputs['tax-policy'][0].futaBps,60)
 // Closing uses accepted P&L, not a second computed salary/tax expense.
 await h.command('account-map',{account:'4000',target:revenue.id});await h.command('account-map',{account:'5000',target:salary.id});await h.command('department-map',{source:'Engineering',department:department.id})
 const actual={filename:'january.csv',csv:'Date,Account,Department,Amount\n2026-01-31,4000,Engineering,-10000\n2026-01-31,5000,Engineering,19810.50\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 await h.kit('actuals','commit',{...actual,fingerprint:(await h.kit('actuals','preview',actual)).fingerprint})
 await h.command('close-month',{scenario:forecast,month:'2026-01'})
 const closed=await view(forecast)
 assert.equal(closed.calculation.profit[0].operatingExpenses,1981050);identities(closed.calculation)
 assert.deepEqual((await view()).calculation,frozen.calculation)
})


test('FIN-006 continuing midyear wages reach annual bases and reset in January without invented YTD',async t=>{
 const h=await harness();t.after(()=>h.close())
 await h.command('workspace',{name:'Calendar boundary',currency:'USD',fiscalYearStart:7,planStart:'2026-07'})
 const department=await h.command('department',{name:'Engineering'}),salary=await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true}),income=await h.command('line',{name:'Income tax estimate',type:'operating-expense'})
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const body={scenario,line:salary.id,department:department.id,title:'Continuing engineer',annualSalary:'180000',employmentType:'W-2',start:'2026-01'}
 const position=await h.command('position',body),settings={scenario,line:income.id,department:department.id,sutaPercent:'2.7',sutaBase:'9000',stateIncomePercent:'0'}
 await h.command('tax-policy',settings,h.owner,409)
 await h.command('position',{...body,id:position.id,taxYtdWages:'100000'})
 await h.command('tax-policy',settings)
 const calculation=(await h.get(`/api/easel/scenario/${scenario}`)).calculation,rows=calculation.taxes.payrollRows
 assert.equal(rows.filter(r=>r.month<'2027').reduce((n,r)=>n+r.socialSecurityCents,0),523900)
 assert.equal(rows.find(r=>r.month==='2026-12').socialSecurityCents,58900)
 const january=rows.find(r=>r.month==='2027-01')
 assert.equal(january.ytdWagesCents,1500000);assert.equal(january.socialSecurityCents,93000)
 assert.equal(january.medicareCents,21750);assert.equal(january.futaCents,42000);assert.equal(january.sutaCents,24300)
 assert.ok(rows.filter(r=>r.month<'2027').every(r=>r.futaCents===0&&r.sutaCents===0))
 await h.command('position',{...body,title:'Missing prior wages',start:'2026-02'},h.owner,409)
 identities(calculation)
})
