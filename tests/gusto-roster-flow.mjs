// Synthetic data lives at the paid/network edge only. Application commands
// still use actual provider HTTP reads and real D1 import-journal writes.
import assert from 'node:assert/strict'
export const gustoGrant={environment:'demo',companyId:'synthetic-easel-1',accessToken:'synthetic-easel-2',consent:true}
export const employeeIds=['synthetic-easel-3','synthetic-easel-4','synthetic-easel-5']
export function gustoProvider({date= value=>value}={}) {
 const rewriteDates=value=>Array.isArray(value)?value.map(rewriteDates):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,rewriteDates(child)])):typeof value==='string'?date(value):value
 const state={reads:[],status:200,malformed:'',pause:null,extraEmployees:0,changeSalary:false,emptyRoster:false,includeHistoryPayrolls:false}
 const person=(id,index)=>rewriteDates({uuid:id,company_uuid:gustoGrant.companyId,first_name:['Private Taylor','Private Morgan','Private Riley'][index]??`Private Employee ${index}`,last_name:'Gusto',department:'Untrusted department label',terminated:index===0,onboarded:true,version:'synthetic-easel-6',ssn:'PRIVATE SSN MUST NEVER PERSIST',email:'private-provider-address@example.test',jobs:[{uuid:`synthetic-easel-job-${index}`,primary:true,title:['Departing engineer','Late engineer','Replacement engineer'][index]??'Engineer',hire_date:['2025-01-01','2026-02-13','2026-02-10'][index]??'2026-01-01',compensations:[{uuid:`synthetic-easel-comp-${index}`,effective_date:'2025-01-01',rate:state.changeSalary&&index===1?'150000.00':['120000.00','144000.00','84000.00'][index]??'120000.00',payment_unit:'Year'}]}],terminations:index===0?[{effective_date:'2026-02-05',active:true}]:[]})
 const payroll=(id,checkDate,people,period)=>rewriteDates({uuid:id,payroll_uuid:id,company_uuid:gustoGrant.companyId,processed:true,check_date:checkDate,pay_period:period??{start_date:checkDate.slice(0,7)+'-01',end_date:checkDate},employee_compensations:people.map(([employee_uuid,gross_pay,tax,benefit])=>({employee_uuid,excluded:false,gross_pay,taxes:[{employer:true,amount:tax},{employer:false,amount:'999.00'}],benefits:[{company_contribution:benefit,employee_deduction:'500.00'}]})),totals:{gross_pay:String(people.reduce((n,p)=>n+Number(p[1]),0)),employer_taxes:String(people.reduce((n,p)=>n+Number(p[2]),0)),benefits:String(people.reduce((n,p)=>n+Number(p[3]),0))}})
 const payrolls=[payroll('synthetic-easel-7','2026-01-31',[[employeeIds[0],'10000.00','700.00','200.00']]),payroll('synthetic-easel-8','2026-02-28',[[employeeIds[1],'10000.00','700.00','200.00'],[employeeIds[2],'6500.00','350.00','100.00']])]
 const historyPayrolls=[{...payroll('synthetic-easel-9','2026-02-20',[[employeeIds[1],'100.00','7.00','2.00']],{start_date:'2025-12-31',end_date:'2026-01-01'}),off_cycle:true},payroll('synthetic-easel-10','2025-12-31',[[employeeIds[0],'5000.00','350.00','100.00']])]
 const pageResponse=(request,rows,value)=>{
  const u=new URL(request.url),page=Number(u.searchParams.get('page')),per=Number(u.searchParams.get('per'))
  assert.equal(per,100)
  const selected=rows.slice((page-1)*per,page*per)
  const headers={'X-Page':String(page),'X-Per-Page':String(per),'X-Total-Pages':String(Math.max(1,Math.ceil(rows.length/per))),'X-Total-Count':String(rows.length)}
  if(state.malformed==='headers')delete headers['X-Total-Count']
  if(state.malformed==='truncated')headers['X-Total-Count']='101',headers['X-Total-Pages']='2'
  return Response.json(value?{...value,employee_compensations:selected}:selected,{headers})
 }
 state.outbound=async request=>{
  const u=new URL(request.url)
  assert.equal(u.origin,'https://api.gusto-demo.com');assert.equal(request.method,'GET')
  assert.equal(request.headers.get('authorization'),`Bearer ${gustoGrant.accessToken}`)
  assert.equal(request.headers.get('X-Gusto-API-Version'),'2026-06-15')
  state.reads.push(u.pathname)
  if(state.pause)await state.pause(request)
  if(state.status!==200)return Response.json({private:gustoGrant.accessToken},{status:state.status,...(state.status===302?{headers:{location:'https://unrelated.example/'}}:{})})
  const base=`/v1/companies/${gustoGrant.companyId}`
  if(u.pathname===base)return Response.json({uuid:gustoGrant.companyId,name:'Private company'})
  if(u.pathname===`${base}/employees`){
   const rows=state.emptyRoster?[]:[...employeeIds.map(person),...Array.from({length:state.extraEmployees},(_,i)=>person(`synthetic-easel-extra-${i}`,i+3))]
   if(state.malformed==='duplicate')rows[1].uuid=rows[0].uuid
   if(state.malformed==='compensation')delete rows[1].jobs[0].compensations
   if(state.malformed==='date')rows[0].terminations[0].effective_date='2026-02-30'
   if(state.malformed==='foreign')rows[0].company_uuid='synthetic-easel-99'
   return pageResponse(request,rows)
  }
  if(u.pathname===`${base}/payrolls`){
   assert.equal(u.searchParams.get('processing_statuses'),'processed');assert.equal(u.searchParams.get('payroll_types'),'regular,off_cycle,external');assert.equal(u.searchParams.has('date_filter_by'),false)
   const all=state.includeHistoryPayrolls?[...payrolls,...historyPayrolls]:payrolls
   const selected=all.filter(p=>p.pay_period.end_date>=u.searchParams.get('start_date')&&p.pay_period.start_date<=u.searchParams.get('end_date')).map(({employee_compensations,totals,...p})=>({...p}))
   if(state.malformed==='changed-history'&&u.searchParams.get('start_date')>'2025-12-31')for(const row of selected)if(row.uuid==='synthetic-easel-9')row.check_date='2026-02-21'
   return pageResponse(request,selected)
  }
  const found=[...payrolls,...historyPayrolls].find(p=>u.pathname===`${base}/payrolls/${p.uuid}`)
  assert.ok(found,`Unexpected provider endpoint ${u.pathname}`);assert.equal(u.searchParams.get('include'),'taxes,benefits')
  const value=structuredClone(found)
  if(state.malformed==='taxes')delete value.employee_compensations[0].taxes
  if(state.malformed==='benefits')value.totals.benefits='9999.00'
  if(state.malformed==='precision')value.employee_compensations[0].gross_pay='0.001'
  if(state.malformed==='unprocessed')value.processed=false
  return pageResponse(request,value.employee_compensations,value)
 }
 return state
}

export async function gustoFixture(call) {
 await call('command/workspace',{name:'Synthetic Gusto studio',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('command/department',{name:'Engineering'}),sales=await call('command/department',{name:'Sales'})
 const line=await call('command/line',{name:'Payroll',type:'operating-expense',payroll:true})
 const scenario=(await call('state')).scenarios[0].id
 const create=b=>call('command/position',{scenario,line:line.id,department:department.id,onCostPercent:'0',...b})
 const departing=await create({title:'Departing engineer',holder:'Private Taylor',start:'2025-01',end:'2026-01',plannedStartDate:'2025-01-01',annualSalary:'120000'})
 const late=await create({title:'Late engineer',holder:'Private Morgan',start:'2026-01',plannedStartDate:'2026-01-10',annualSalary:'144000',attritionPercent:'1.25'})
 const backfill=await create({title:'Replacement engineer',start:'2026-02',plannedStartDate:'2026-02-01',annualSalary:'84000',backfillOrigin:departing.originId,attritionPercent:'1.25'})
 const employeeMap=Object.fromEntries(employeeIds.map((id,i)=>[id,{department:department.id,positionOrigin:[departing,late,backfill][i].originId}]))
 const input={scenario,line:line.id,asOf:'2026-02-28',windowStart:'2026-01-01',windowEnd:'2026-02-28',payrollHistoryStart:'2025-01-01',employeeMap}
 return {scenario,department,sales,line,departing,late,backfill,input}
}

export const gustoCall=h=>async(path,body)=>{if(body===undefined)return h.get(`/api/easel/${path}`);const r=await h.send(`/api/easel/${path}`,body,h.owner);assert.equal(r.status,200,r.text);return r.value}
export async function acceptGusto(call,input) {
 const preview=await call('import/gusto/preview',input)
 let result=await call('import/gusto/commit',{...input,fingerprint:preview.fingerprint})
 for(let n=0;result.import.status==='importing'&&n<50;n++)result=await call('import/gusto/resume',{id:result.import.id})
 assert.equal(result.import.status,'imported')
 return result
}
