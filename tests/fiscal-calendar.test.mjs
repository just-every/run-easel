import assert from 'node:assert/strict'
import test from 'node:test'
import { harness } from './harness.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

const sum = values => values.reduce((n, v) => n + v, 0)
const dateAdd = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
const view = (h, id, cookie = h.owner) => h.get(`/api/easel/scenario/${id}`, cookie)
const workbook = async (h, id, cookie = h.owner) => {
 const r = await h.mf.dispatchFetch(h.origin + `/api/easel/scenario/${id}/document.xlsx`, { headers: {cookie} })
 assert.equal(r.status,200)
 const book = await readWorkbook(new Uint8Array(await r.arrayBuffer())); proveFormulas(book); return book
}
function reconcile(v) {
 for (const groups of [v.fiscal.quarters, v.fiscal.years]) for (const group of groups) {
  const monthly = v.calculation.profit.filter(p => group.periods.includes(p.month))
  for (const field of ['revenue','costOfSales','operatingExpenses','grossMargin','profit']) assert.equal(group[field],sum(monthly.map(p=>p[field])))
  for (const line of v.lines) assert.equal(group.lineTotals[line.id],sum(group.periods.map(m=>v.calculation.lineTotals[line.id]?.[m]??0)))
  const cash=v.calculation.cash.filter(p=>group.periods.includes(p.month))
  assert.equal(group.cash.opening,cash[0].opening);assert.equal(group.cash.closing,cash.at(-1).closing)
  assert.equal(group.cash.collections,sum(cash.map(p=>p.collections)));assert.equal(group.cash.payments,sum(cash.map(p=>p.payments)))
  assert.equal(group.cash.opening+group.cash.collections-group.cash.payments,group.cash.closing)
 }
 for(const year of v.fiscal.years) {
  const quarters=v.fiscal.quarters.filter(q=>q.fiscalYear===year.fiscalYear)
  assert.equal(year.profit,sum(quarters.map(q=>q.profit)));assert.equal(year.revenue,sum(quarters.map(q=>q.revenue)))
 }
}

test('MODEL-001: October 36-month budgets reconcile monthly, fiscal-quarter and annual cents, with fixed frozen horizons and editable 12–60-month plans',async t=>{
 const h=await harness();t.after(()=>h.close())
 const settings={name:'Ridgeline Advisory',currency:'USD',fiscalYearStart:10,planStart:'2026-10',horizon:36}
 await h.command('workspace',settings)
 const d=await h.command('department',{name:'Advisory'}), rev=await h.command('line',{name:'Retainers',type:'revenue'}), cost=await h.command('line',{name:'Delivery',type:'cost-of-sales'}), op=await h.command('line',{name:'Office',type:'operating-expense'})
 const budget=(await h.get('/api/easel/state')).scenarios[0]
 const initial=await view(h,budget.id), months=initial.calculation.months
 assert.equal(months.length,36);assert.deepEqual([months[0],months.at(-1)],['2026-10','2029-09'])
 const values=Object.fromEntries(months.map((m,i)=>[m,`${1000+i}.${String((i*13+1)%100).padStart(2,'0')}`]))
 await h.command('schedule',{scenario:budget.id,name:'Client retainers',line:rev.id,department:d.id,values})
 await h.command('expense',{scenario:budget.id,name:'Delivery team',kind:'recurring',line:cost.id,department:d.id,start:settings.planStart,amount:'500.07'})
 await h.command('expense',{scenario:budget.id,name:'Office costs',kind:'recurring',line:op.id,department:d.id,start:settings.planStart,amount:'100.03'})
 let current=await view(h,budget.id);reconcile(current)
 assert.deepEqual(current.fiscal.years.map(y=>y.label),['FY2027','FY2028','FY2029'])
 assert.deepEqual(current.fiscal.quarters[0].periods,['2026-10','2026-11','2026-12'])
 assert.equal(current.fiscal.quarters.length,12);assert.ok(current.fiscal.years.every(y=>y.complete))
 assert.equal(current.fiscal.years[1].revenue,sum(months.slice(12,24).map((m,i)=>Math.round(Number(values[m])*100))))
 const book=await workbook(h,budget.id), annual=book.getWorksheet('Fiscal years'), quarterly=book.getWorksheet('Fiscal quarters')
 for(const [sheet,groups] of [[annual,current.fiscal.years],[quarterly,current.fiscal.quarters]])for(const [i,g] of groups.entries())assert.equal(evaluate(sheet,sheet.getRow(sheet.rowCount).getCell(i+2).address),g.profit)
 assert.equal(book.getWorksheet('Accounting periods').rowCount,38)
 const board=await h.person('board@example.test','viewer')
 await h.command('workspace',{...settings,horizon:48},board,403)
 assert.deepEqual((await view(h,budget.id,board)).fiscal,current.fiscal)
 for(const bad of [{horizon:11},{horizon:61},{horizon:12.5},{fiscalYearStart:9},{calendar:'4-4-5',retailStartDate:'2026-10-05'}])await h.command('workspace',{...settings,...bad},h.owner,bad.calendar?409:400)
 assert.deepEqual(await view(h,budget.id),current)
 const stale=current.scenario.revision
 await h.command('workspace',{...settings,horizon:37})
 await h.command('approve-budget',{scenario:budget.id,revision:stale},h.owner,409)
 const extended=await view(h,budget.id);assert.equal(extended.calculation.months.length,37);assert.equal(extended.fiscal.years.at(-1).complete,false);assert.equal(extended.fiscal.quarters.at(-1).complete,false);reconcile(extended)
 await h.command('workspace',settings)
 current=await view(h,budget.id)
 const {forecast}=await h.command('approve-budget',{scenario:budget.id,revision:current.scenario.revision})
 const frozen=await view(h,budget.id),forecastBefore=await view(h,forecast.id)
 await h.command('workspace',{...settings,horizon:60})
 assert.equal((await h.get('/api/easel/state')).workspace.horizon,60)
 assert.deepEqual(await view(h,budget.id),frozen);assert.deepEqual(await view(h,forecast.id),forecastBefore)
 const branch=await h.command('branch',{from:forecast.id,name:'Three-year downside'})
 assert.equal((await view(h,branch.id)).calculation.months.length,36)
 await h.command('workspace',{...settings,horizon:12})
 assert.deepEqual(await view(h,budget.id),frozen)
 // Each possible fiscal start has a real API-created plan and complete fiscal groups.
 for(let start=1;start<=12;start++){
  const other=await harness()
  try {
   const first=`2026-${String(start).padStart(2,'0')}`
   await other.command('workspace',{name:'Fiscal alternatives',planStart:first,fiscalYearStart:start,horizon:24})
   const sc=(await other.get('/api/easel/state')).scenarios[0],v=await view(other,sc.id)
   assert.equal(v.fiscal.years.length,2);assert.equal(v.fiscal.quarters.length,8)
   assert.equal(v.fiscal.periods[0].fromDate,`${first}-01`);assert.ok(v.fiscal.years.every(g=>g.complete));reconcile(v)
  } finally {await other.close()}
 }
})

test('MODEL-001: real 4-4-5 and 5-4-4 accounting dates drive imports, contract recognition, settlement and exact fiscal roll-ups',async t=>{
 for(const calendar of ['4-4-5','5-4-4']) {
  const h=await harness()
  try {
   const settings={name:'Tallgrass Retail',planStart:'2026-10',fiscalYearStart:10,horizon:24,calendar,retailStartDate:'2026-10-05'}
   for(const bad of [{retailStartDate:''},{retailStartDate:'2026-10-32'},{retailStartDate:'2026-09-28'},{calendar:'4-5-4'}])await h.command('workspace',{...settings,...bad},h.owner,400)
   await h.command('workspace',settings)
   const d=await h.command('department',{name:'Stores'}), rev=await h.command('line',{name:'Sales',type:'revenue'}), payroll=await h.command('line',{name:'Store payroll',type:'operating-expense',payroll:true})
   const budget=(await h.get('/api/easel/state')).scenarios[0]
   let v=await view(h,budget.id),periods=v.fiscal.periods
   const pattern=calendar==='4-4-5'?[4,4,5]:[5,4,4]
   for(let i=0;i<periods.length;i++){
    const p=periods[i];assert.equal(p.weeks,pattern[i%3]);assert.equal((Date.parse(p.throughDate)-Date.parse(p.fromDate))/86400000+1,p.weeks*7)
    if(i)assert.equal(p.fromDate,dateAdd(periods[i-1].throughDate,1))
   }
   assert.equal(periods[12].fromDate,dateAdd(settings.retailStartDate,364))
   const monthly=Object.fromEntries(periods.map((p,i)=>[p.key,`${1000+i}.01`]))
   await h.command('schedule',{scenario:budget.id,name:'Store sales',line:rev.id,department:d.id,values:monthly})
   await h.command('position',{scenario:budget.id,title:'Store manager',line:payroll.id,department:d.id,start:periods[0].key,plannedStartDate:periods[0].fromDate,annualSalary:'60000',onCostPercent:'0',payDay:31,payMonthOffset:1})
   await h.command('position',{scenario:budget.id,title:'Wrong period',line:payroll.id,department:d.id,start:periods[1].key,plannedStartDate:periods[0].throughDate,annualSalary:'60000'},h.owner,400)
   await h.command('revenue',{scenario:budget.id,name:'After-period receipts',kind:'volume',line:rev.id,department:d.id,start:periods[0].key,end:periods[0].key,startVolume:'1',rate:'123.45',collectionMethod:'dso',dsoDays:1})
   await h.command('revenue',{scenario:budget.id,name:'Service agreement',kind:'contract',line:rev.id,department:d.id,start:periods[0].key,startDate:dateAdd(periods[0].throughDate,-1),contractValue:'100.01',termMonths:1,billingCadence:'monthly',dsoDays:2})
   v=await view(h,budget.id);reconcile(v)
   assert.equal(sum(v.calculation.contracts.rows.map(r=>r.revenue)),10001)
   assert.equal(v.calculation.contracts.rows[0].billings,10001)
   assert.equal(v.calculation.contracts.rows[0].collections,0);assert.equal(v.calculation.contracts.rows[1].collections,10001)
   assert.ok(v.calculation.cells.some(c=>c.month===periods[0].key&&c.sources.some(s=>s.trace.includes(`Invoice dated ${periods[0].throughDate}`))))
   assert.equal(v.calculation.workingCapital.months[0].accruedPayments,0)
   assert.equal(v.calculation.workingCapital.months[1].accruedPayments,500000)
   const q=v.fiscal.quarters[0];assert.equal(q.periods.length,3);assert.equal(sum(periods.slice(0,3).map(p=>p.weeks)),13)
   assert.equal(v.fiscal.years[0].periods.length,12)
   const book=await workbook(h,budget.id);assert.equal(book.getWorksheet('Accounting periods').getCell('E3').value,settings.retailStartDate)
   await h.command('account-map',{account:'4000',target:rev.id});await h.command('department-map',{source:'Stores',department:d.id})
   const body={filename:'retail-ledger.csv',dateFormat:'YYYY-MM-DD',csv:`Date,Account,Department,Amount\n${periods[0].throughDate},4000,Stores,-10.01\n${periods[1].fromDate},4000,Stores,-20.02\n`}
   const before=await h.get('/api/easel/actuals'),p=await h.kit('actuals','preview',body)
   assert.deepEqual(await h.get('/api/easel/actuals'),before)
   assert.deepEqual(p.periods.map(p=>p.period),[periods[0].key,periods[1].key])
   await h.kit('actuals','commit',{...body,fingerprint:p.fingerprint})
   assert.deepEqual((await h.get('/api/easel/actuals')).months.map(m=>[m.period,m.revenue]),[[periods[0].key,1001],[periods[1].key,2002]])
   const approved=await h.command('approve-budget',{scenario:budget.id,revision:(await view(h,budget.id)).scenario.revision})
   const frozen=await view(h,budget.id)
   await h.command('close-month',{scenario:approved.forecast.id,month:periods[0].key})
   const closed=await view(h,approved.forecast.id);assert.equal(closed.calculation.profit[0].revenue,1001);reconcile(closed)
   assert.deepEqual(await view(h,budget.id),frozen)
   await h.command('workspace',{...settings,calendar:'calendar-month'},h.owner,409)
  } finally {await h.close()}
 }
})
