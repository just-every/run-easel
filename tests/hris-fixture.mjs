// Synthetic provider recordings live only at the outbound HTTP boundary.
import assert from 'node:assert/strict'
export const hrisProviders=['rippling','willow','bamboohr','adp']
export const hrisNames={rippling:'Rippling',willow:'Willow',bamboohr:'BambooHR',adp:'ADP Workforce Now'}
export const ids=['hris-person-1','hris-person-2','hris-person-3','hris-person-4']
export const secret='synthetic-hris-read-only-credential-9821'
export const privateCustom='PRIVATE CUSTOM VALUE MUST NEVER PERSIST'
export const grant=id=>id==='adp'?{tenant:'synthetic-company',clientId:'synthetic-adp-client',clientSecret:secret,consent:true}:{tenant:id==='willow'?'https://willow.example.test':id==='bamboohr'?'synthetic-company':'synthetic-company',credential:secret,consent:true,...(id==='rippling'?{apiVersion:'2023-10-01'}:{})}
const base=[
 {id:ids[0],name:'Private Taylor HRIS',title:'Departing engineer',type:'Employee',start:'2025-01-01',end:'2026-02-05',rate:'120000.00',unit:'year'},
 {id:ids[1],name:'Private Morgan HRIS',title:'Late engineer',type:'Employee',start:'2026-02-13',end:'',rate:'150000.00',unit:'year'},
 {id:ids[2],name:'Private Casey HRIS',title:'Hourly contractor',type:'Contractor',start:'2026-02-01',end:'',rate:'40.00',unit:'hour'},
 {id:ids[3],name:'Private Riley HRIS',title:'Replacement engineer',type:'Employee',start:'2026-02-10',end:'',rate:'84000.00',unit:'year'},
]
export function hrisProvider({date=x=>x}={}){
 const state={status:200,mode:'',changed:false,pause:null,reads:[],extra:0,department:'Product Engineering',missing:false}
 const rewrite=value=>Array.isArray(value)?value.map(rewrite):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)])):typeof value==='string'?date(value):value
 state.outbound=async request=>{
  const u=new URL(request.url)
  if(state.pause)await state.pause(request)
  state.reads.push({method:request.method,path:u.pathname})
  if(state.status!==200)return Response.json({private:secret},{status:state.status,...(state.status===302?{headers:{location:'https://unrelated.example.test/'}}:{})})
  if(u.origin==='https://accounts.adp.com'){
   assert.equal(request.method,'POST');assert.equal(u.pathname,'/auth/oauth/v2/token');assert.equal(request.headers.get('authorization'),`Basic ${Buffer.from('synthetic-adp-client:'+secret).toString('base64')}`);assert.equal(await request.text(),'grant_type=client_credentials')
   return Response.json({token_type:'Bearer',access_token:'synthetic-adp-short-lived-token'})
  }
  const people=[...base,...Array.from({length:state.extra},(_,i)=>({...base[0],id:`extra-hris-${i}`,name:`Extra HRIS ${i}`,end:''}))].map((p,i)=>({...p,rate:state.changed&&i===1?'151000.00':p.rate}))
  if(state.missing)people.splice(0,1)
  if(state.mode==='duplicate')people[1].id=people[0].id
  if(state.mode==='precision')people[1].rate='150000.001'
  if(state.mode==='missing-comp')people[1].rate=null
  if(u.origin==='https://rest.ripplingapis.com'){
   assert.equal(request.method,'GET');assert.equal(u.pathname,'/workers/');assert.equal(request.headers.get('Rippling-Api-Version'),'2023-10-01');assert.equal(request.headers.get('authorization'),`Bearer ${secret}`)
   const skip=Number(u.searchParams.get('cursor')??0),selected=people.slice(skip,skip+100)
   const results=selected.map(p=>({id:p.id,status:p.end?'TERMINATED':'ACTIVE',user:{name:{formatted:p.name}},legal_entity:{company_id:'synthetic-company'},title:p.title,department:{name:state.department},employment_type:{type:p.type.toUpperCase(),compensation_time_period:p.unit==='hour'?'HOURLY':'SALARIED'},start_date:p.start,end_date:p.end,compensation:{salary_effective_date:'2025-01-01',[p.unit==='hour'?'hourly_wage':'annual_compensation']:{value:p.rate,currency_type:'USD',unmappedAllowanceCode:privateCustom,unmappedAllowanceDetails:{}}},custom_fields:[{name:'customFavouriteColour',value:privateCustom}],ssn:'PRIVATE SSN MUST NEVER PERSIST'}))
   return Response.json(rewrite({results,next_link:state.mode==='unsafe-next'?'https://unrelated.example.test/workers':skip+100<people.length?`https://rest.ripplingapis.com/workers/?limit=100&cursor=${skip+100}&expand=${u.searchParams.get('expand')}`:null}))
  }
  if(u.origin==='https://willow.example.test'){
   assert.equal(request.method,'GET');assert.equal(u.pathname,'/api/willow/v1/employees');assert.equal(u.searchParams.get('fields'),'name,employment,customFields');assert.equal(request.headers.get('authorization'),`Bearer ${secret}`)
   const skip=Number(u.searchParams.get('cursor')??0)
   const data=people.slice(skip,skip+100).map(p=>({id:p.id,name:p.name,withheld:state.mode==='withheld'?['employment']:[],employment:[{id:'employment-'+p.id,revision:'1',startDate:p.start,endDate:p.end?new Date(Date.parse(p.end)-86400000).toISOString().slice(0,10):null,employmentType:p.type,terms:[{id:'terms-'+p.id,status:'approved',inForce:!p.end,effectiveFrom:'2025-01-01',jobTitle:p.title,department:{id:'source-eng',name:state.department},pay:{basis:p.unit,amountCents:p.rate===null?null:Number(p.rate)*100,currency:'USD'}}]}],customFields:{asOf:'2026-02-28',fields:[{key:'customFavouriteColour',value:privateCustom}]}}))
   for(const row of data)if(row.employment[0].endDate){const terms=row.employment[0].terms;terms.unshift({...terms[0],id:'old-terms',effectiveFrom:'2024-01-01',pay:{...terms[0].pay,amountCents:11000000}});terms.push({...terms[1],id:'draft-terms',status:'draft',effectiveFrom:'2025-12-01',pay:{...terms[1].pay,amountCents:99999999}})}
   return Response.json(rewrite({apiVersion:'1',resetRequired:false,data,nextCursor:skip+100<people.length?String(skip+100):null,syncCursor:'synthetic-complete-cursor'}))
  }
  if(u.origin==='https://api.bamboohr.com'){
   assert.equal(request.headers.get('authorization'),`Basic ${Buffer.from(secret+':x').toString('base64')}`)
   if(u.pathname.endsWith('/meta/fields')){assert.equal(request.method,'GET');return Response.json([{id:'customFavouriteColour',alias:'customFavouriteColour',type:'text',name:'Favourite Colour'}])}
   assert.equal(request.method,'POST');assert.ok(u.pathname.endsWith('/reports/custom'));const body=await request.json()
   assert.equal(body.filters,undefined,'The report includes inactive employees, without an active-only filter')
   return Response.json(rewrite({fields:body.fields.map(id=>({id})),employees:people.map(p=>({id:p.id,firstName:p.name.split(' ')[0],lastName:p.name.split(' ').slice(1).join(' '),department:state.department,jobTitle:p.title,employmentHistoryStatus:p.type,hireDate:p.start,terminationDate:p.end,payRate:p.rate,payType:p.unit==='hour'?'Hourly':'Salary',payPer:p.unit,payRateCurrency:'USD',status:p.end?'Inactive':'Active',customFavouriteColour:privateCustom}))}))
  }
  assert.equal(u.origin,'https://api.adp.com');assert.equal(u.pathname,'/hr/v2/workers');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-adp-short-lived-token')
  const skip=Number(u.searchParams.get('$skip')),top=Number(u.searchParams.get('$top'));assert.equal(top,100)
  return Response.json(rewrite({meta:{totalNumber:people.length+(state.mode==='truncated'?1:0)},workers:people.slice(skip,skip+top).map(p=>({associateOID:p.id,workerStatus:{statusCode:{codeValue:p.end?'Terminated':'Active'}},person:{legalName:{formattedName:p.name},governmentIDs:[{idValue:'PRIVATE SSN MUST NEVER PERSIST'}]},workerDates:{originalHireDate:p.start,terminationDate:p.end},workAssignments:[{primaryIndicator:true,jobTitle:p.title,workerTypeCode:{codeValue:p.type==='Contractor'?'C':'E'},homeOrganizationalUnits:[{typeCode:{codeValue:'Department'},nameCode:{longName:state.department}},{typeCode:{codeValue:'BusinessUnit'},nameCode:{longName:privateCustom}}],baseRemuneration:{[p.unit==='hour'?'hourlyRateAmount':'annualRateAmount']:{amountValue:p.rate,currencyCode:'USD'}}}],customFieldGroup:{stringFields:[{nameCode:{codeValue:'customFavouriteColour'},stringValue:privateCustom}]}}))}))
 }
 return state
}
export async function hrisFixture(call){
 await call('command/workspace',{name:'Synthetic HRIS studio',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('command/department',{name:'Engineering'}),sales=await call('command/department',{name:'Sales'})
 const line=await call('command/line',{name:'Payroll',type:'operating-expense',payroll:true}),scenario=(await call('state')).scenarios[0].id
 const create=b=>call('command/position',{scenario,line:line.id,department:department.id,onCostPercent:'0',...b})
 const departing=await create({title:'Departing engineer',start:'2025-01',end:'2026-01',plannedStartDate:'2025-01-01',annualSalary:'120000'})
 const late=await create({title:'Late engineer',start:'2026-01',plannedStartDate:'2026-01-10',annualSalary:'144000',attritionPercent:'1.25'})
 const backfill=await create({title:'Replacement engineer',start:'2026-02',annualSalary:'84000',backfillOrigin:departing.originId,attritionPercent:'1.25'})
 const vacancy=await create({title:'Vacant engineer',start:'2026-02',annualSalary:'96000'})
 const employeeMap=Object.fromEntries(ids.map((id,i)=>[id,{department:department.id,positionOrigin:[departing,late,null,backfill][i]?.originId??'',unplanned:i===2,employmentType:i===2?'1099':'W-2'}]))
 return {scenario,department,sales,line,departing,late,backfill,vacancy,input:{scenario,asOf:'2026-02-28',employeeMap}}
}
export const hrisCall=h=>async(path,body)=>{if(body===undefined)return h.get('/api/easel/'+path);const r=await h.send('/api/easel/'+path,body,h.owner);assert.equal(r.status,200,r.text);return r.value}
export async function acceptHris(call,id,input){
 const p=await call(`import/${id}/preview`,input)
 await call(`import/${id}/stage`,{...input,fingerprint:p.fingerprint,sourceRevision:p.sourceReview.revision})
 let r=await call(`import/${id}/commit`,{...input,fingerprint:p.fingerprint})
 for(let i=0;r.import.status==='importing'&&i<50;i++)r=await call(`import/${id}/resume`,{id:r.import.id})
 assert.equal(r.import.status,'imported');return r
}
