// Synthetic company data used only by the public HTTP and native browser journeys.
export async function headcountFixture(call) {
 await call('command/workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const engineering=await call('command/department',{name:'Engineering'}),sales=await call('command/department',{name:'Sales'})
 const line=await call('command/line',{name:'Payroll',type:'operating-expense',payroll:true})
 const scenario=(await call('state')).scenarios[0].id
 const create=b=>call('command/position',{scenario,line:line.id,department:engineering.id,onCostPercent:'0',...b})
 const departing=await create({title:'Departing engineer',holder:'Private Taylor',start:'2025-01',end:'2026-01',plannedStartDate:'2025-01-01',annualSalary:'120000'})
 const late=await create({title:'Late engineer',holder:'Private Morgan',start:'2026-01',plannedStartDate:'2026-01-10',annualSalary:'144000',attritionPercent:'1.25'})
 const backfill=await create({title:'Replacement engineer',start:'2026-02',plannedStartDate:'2026-02-01',annualSalary:'84000',backfillOrigin:departing.originId,attritionPercent:'1.25'})
 const monthly=await create({title:'Month-only designer',start:'2026-02',annualSalary:'96000'})
 const accept=async input=>call('import/payroll/commit',{...input,fingerprint:(await call('import/payroll/preview',input)).fingerprint})
 const base={scenario,kind:'roster',provider:'Justworks',positionMap:{T:departing.originId,M:late.originId,R:backfill.originId,D:monthly.originId}}
 const header='Employee ID,Name,Department,Title,Employment Type,Salary,Start,Termination\n'
 const jan=await accept({...base,asOf:'2026-01-31',filename:'january-roster.csv',csv:header+'T,Private Taylor,Engineering,Engineer,W-2,120000,2025-01-01,\n'})
 const feb=await accept({...base,asOf:'2026-02-28',filename:'february-roster.csv',csv:header+'T,Private Taylor,Engineering,Engineer,W-2,120000,2025-01-01,2026-02-05\nM,Private Morgan,Engineering,Engineer,W-2,144000,2026-02-13,\nR,Private Riley,Engineering,Engineer,W-2,84000,2026-02-10,\nD,Private Drew,Engineering,Designer,W-2,96000,2026-02-20,\nS,Private Sam,Sales,Sales,W-2,60000,2026-02-01,\n'})
 const pay=await accept({scenario,kind:'register',provider:'Justworks',line:line.id,filename:'february-register.csv',csv:'Employee ID,Department,Pay Date,Gross Wages,Employer Taxes,Benefits,Fees\nM,Engineering,2026-02-28,10000,700,200,100\nR,Engineering,2026-02-28,6500,350,100,50\nD,Engineering,2026-02-28,7500,300,150,50\n'})
 return {scenario,engineering,sales,line,late,departing,backfill,monthly,jan,feb,pay,create}
}
