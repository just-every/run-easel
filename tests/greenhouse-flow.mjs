import assert from 'node:assert/strict'
export const greenhouseGrant={apiKey:'synthetic-easel-820',consent:true}
export function greenhouseProvider(){
 const state={status:'open',salary:'120000.00',start:'2026-04-15',failure:200,multiple:false,paginate:false,reads:[],pause:null}
 state.outbound=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://harvest.greenhouse.io');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),`Basic ${btoa(`${greenhouseGrant.apiKey}:`)}`);state.reads.push(url.pathname)
  if(state.pause)await state.pause(request)
  if(state.failure!==200)return Response.json({private:greenhouseGrant.apiKey},{status:state.failure,...(state.failure===302?{headers:{location:'https://unrelated.example/'}}:{})})
  const job={id:820,name:'Platform engineer',status:state.status==='closed'?'closed':'open',requisition_id:'ENG-820',departments:[{id:12,name:'Product Engineering'}],custom_fields:{level:'Senior',target_start_date:'2026-02-01',annual_salary:{value:'96000.00',currency:'USD'}}}
  if(url.pathname==='/v1/jobs')return Response.json([job])
  if(url.pathname==='/v1/jobs/820')return Response.json(job)
  if(url.pathname==='/v1/jobs/820/openings')return Response.json([{id:821,opening_id:'ENG-820-1',status:state.status==='open'?'open':'closed'},...(state.multiple?[{id:825,opening_id:'ENG-820-2',status:'open'}]:[])])
  if(url.pathname==='/v1/offers'){assert.equal(url.searchParams.has('job_id'),false);if(state.paginate&&url.searchParams.get('page')==='1')return Response.json([{id:824,job_id:999,status:'accepted'}],{headers:{Link:'<https://unrelated.example/steal>; rel="next"'}});return Response.json(state.status==='accepted'?[{id:822,job_id:820,candidate_id:823,status:'accepted',opening:{id:821,opening_id:'ENG-820-1'},starts_at:state.start,custom_fields:{annual_salary:{value:state.salary,currency:'USD'}}}]:[])}
  if(url.pathname==='/v1/candidates/823')return Response.json({id:823,first_name:'Private Morgan',last_name:'Green',email_addresses:[{value:'never-retain@example.test'}],addresses:['Never retain']})
  throw Error(`Unexpected Greenhouse read ${url.pathname}`)
 }
 return state
}
export async function greenhouseFixture(call){
 await call('/command/workspace',{name:'Synthetic ATS studio',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('/command/department',{name:'Engineering',onCostPercent:'0'}),line=await call('/command/line',{name:'Salaries',type:'operating-expense',payroll:true})
 const scenario=(await call('state')).scenarios[0].id
 return {scenario,department,line,input:{scenario,department:department.id,line:line.id,jobId:'820'}}
}
export async function promoteATS(call,p){await call('/command/proposal-submit',{id:p.id});return call('/command/proposal-promote',{id:p.id,revision:p.revision})}
