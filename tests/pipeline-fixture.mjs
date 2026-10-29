// Synthetic provider recordings at the HTTP edge. These are protocol fixtures,
// not sandbox qualification or evidence of a real CRM account.
import assert from 'node:assert/strict'
export const hubspotGrant={clientId:'synthetic-hubspot-client',clientSecret:'synthetic-hubspot-secret',refreshToken:'synthetic-hubspot-refresh',consent:true,readOnly:true,currency:'USD'}
export const salesforceGrant={clientId:'synthetic-salesforce-client',clientSecret:'synthetic-salesforce-secret',refreshToken:'synthetic-salesforce-refresh',instance:'https://synthetic.my.salesforce.com',termField:'Subscription_Term__c',consent:true,readOnly:true,currency:'USD'}
export function pipelineProvider(){
 const state={moved:false,fail:false,changed:false,restated:false,malformed:false,revocation:200,calls:[],learning:false,outcomes:false,proposal:false,missingName:false,malformedProduct:false,revocationFailure:false}
 const stages=[{id:'qualified',label:'Qualified',metadata:{probability:'0.2',isClosed:'false'}},{id:'proposal',label:'Proposal',metadata:{probability:'0.6',isClosed:'false'}},{id:'won',label:'Won',metadata:{probability:'1',isClosed:'true'}}]
 const hubspotDeals=()=>[
  {id:'deal-a',properties:{dealname:state.missingName?undefined:'Acme qualified',dealstage:'qualified',amount:state.changed?'1001':'1000',closedate:state.moved?'2026-07-01':'2026-04-01',hubspot_owner_id:'owner-1',deal_currency_code:'USD'}},
  {id:'deal-b',properties:{dealname:'Beta proposal',dealstage:'proposal',amount:state.restated?'2500':'2400',closedate:'2026-04-15',hubspot_owner_id:'owner-1',deal_currency_code:'USD'}},
  {id:'deal-c',properties:{dealname:'Gamma signed',dealstage:'won',amount:'1000',closedate:'2026-05-01',hubspot_owner_id:'owner-1',deal_currency_code:'USD'}},
  ...(state.learning?Array.from({length:3},(_,i)=>({id:`learning-${i}`,properties:{dealname:`Reviewed learning deal ${i}`,dealstage:state.outcomes?'won':state.proposal?'proposal':'qualified',amount:'1000',closedate:'2026-03-01',hubspot_owner_id:'owner-1',deal_currency_code:'USD'}})):[]),
 ]
 const periods=Array.from({length:24},(_,i)=>{
  const start=new Date(Date.UTC(2025,11+i,25)),end=new Date(Date.UTC(2026,i,24))
  return {Id:`period-${i+1}`,StartDate:start.toISOString().slice(0,10),EndDate:end.toISOString().slice(0,10),Number:i%12+1,Type:'Month'}
 })
 state.outbound=async request=>{
  const u=new URL(request.url);state.calls.push({method:request.method,url:u.href})
  if(u.pathname.endsWith('/token')){
   assert.equal(request.method,'POST');const body=new URLSearchParams(await request.text());assert.ok(['refresh_token','authorization_code'].includes(body.get('grant_type')))
   return Response.json({access_token:'synthetic-crm-access',refresh_token:body.get('refresh_token')??'synthetic-crm-refresh',expires_in:3600})
  }
  if(u.pathname.includes('/oauth/v1/refresh-tokens/')){assert.equal(request.method,'DELETE');if(state.revocationFailure)throw new Error('synthetic outage');return new Response(null,{status:state.revocation})}
  if(u.pathname.endsWith('/revoke'))return new Response('',{status:state.revocation})
  assert.equal(request.method,'GET');assert.match(request.headers.get('authorization'),/^Bearer /)
  if(state.fail)return new Response('Private provider diagnostic must never leave the edge',{status:429,headers:{'retry-after':'30'}})
  if(u.hostname==='api.hubapi.com'){
   if(u.pathname==='/crm/v3/pipelines/deals')return Response.json({results:[{id:'default',stages}]})
   if(u.pathname==='/crm/v3/objects/deals'){
    if(state.malformed)return Response.json({results:[{id:'bad'}]})
    return Response.json(u.searchParams.has('after')?{results:hubspotDeals().slice(1)}:{results:hubspotDeals().slice(0,1),paging:{next:{after:'page-2'}}})
   }
  }
  if(u.hostname==='synthetic.my.salesforce.com'){
   if(u.pathname.endsWith('/describe'))return Response.json({fields:[{name:'CurrencyIsoCode'}]})
   const q=u.searchParams.get('q')
   const list=records=>Response.json({records,done:true,totalSize:records.length})
   if(q?.includes('FROM OpportunityStage'))return list([{Id:'stage-custom',MasterLabel:'Custom commit',DefaultProbability:'60',IsClosed:false,IsWon:false}])
   if(q?.includes('FROM Period'))return list(periods)
   if(q?.includes('FROM OpportunityLineItem'))return list([
    {Id:'item-setup',OpportunityId:'sf-deal',PricebookEntry:{Product2Id:'setup',Product2:{Name:'Setup'}},Quantity:'1',UnitPrice:'100',TotalPrice:'100',Subscription_Term__c:1},
    {Id:'item-sub',OpportunityId:'sf-deal',PricebookEntry:{Product2Id:'subscription',Product2:{Name:state.malformedProduct?undefined:'Subscription'}},Quantity:'12',UnitPrice:'100',TotalPrice:'1200',Subscription_Term__c:12},
   ])
   if(q?.includes('FROM Opportunity'))return list([{Id:'sf-deal',Name:'Custom fiscal contract',StageName:'Custom commit',Amount:'1300',OwnerId:'sf-owner',CloseDate:'2026-05-25',IsClosed:false,IsWon:false,CurrencyIsoCode:'USD'}])
  }
  if(u.hostname==='orbit.example.test')return Response.json({deals:[{id:'orbit-deal',title:'Orbit source',stage_id:'open',value_cents:10000,company_id:'org'}],nextCursor:null})
  assert.fail(`Unexpected pipeline provider request ${u.hostname}${u.pathname}`)
 }
 return state
}
export async function pipelineFixture(h){
 await h.command('workspace',{name:'Pipeline planning',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await h.command('department',{name:'Sales'}),other=await h.command('department',{name:'Other'})
 const revenue=await h.command('line',{name:'Pipeline revenue',type:'revenue'}),subscription=await h.command('line',{name:'Subscription revenue',type:'revenue'}),salary=await h.command('line',{name:'Sales pay',type:'operating-expense',payroll:true}),tax=await h.command('line',{name:'Income tax estimate',type:'operating-expense'})
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const position=await h.command('position',{scenario,title:'Account executive',holder:'Private CRM commission sentinel',department:department.id,line:salary.id,start:'2026-01',annualSalary:'1200',onCostPercent:'0',employmentType:'W-2',commissionPercent:'10',commissionQuota:'1000',commissionTiers:'100:20\n200:30'})
 await h.command('tax-policy',{scenario,line:tax.id,department:department.id,socialSecurityPercent:'10',socialSecurityBase:'100000',medicarePercent:'0',futaPercent:'0',futaBase:'0',sutaPercent:'0',sutaBase:'0',federalIncomePercent:'0',stateIncomePercent:'0'})
 return {scenario,department,other,revenue,subscription,salary,tax,position}
}
export function pipelineInput(f,source,revision,provider='hubspot'){
 return {provider,scenario:f.scenario,revision,nextExpectedAt:'2026-12-31T12:00:00.000Z',coverageTarget:'1000',
  stages:source.stages.map(s=>({stage:s.id,mode:'override',probability:s.id==='qualified'?'50':s.id==='won'?'100':'40',slippageDays:s.id==='proposal'?16:0})),
  products:[...new Set(source.deals.flatMap(d=>d.products.length?d.products.map(p=>p.product):['*']))].sort().map(product=>({product,line:product==='subscription'?f.subscription.id:f.revenue.id,department:f.department.id,rule:product==='subscription'?'ratable':'one-time',termMonths:12,termSource:provider==='salesforce'?'crm':'finance',dsoDays:0})),
  owners:[...new Set(source.deals.map(d=>d.owner))].map(owner=>({owner,position:f.position.originId,member:''})),
  periods:source.periods.map((p,i)=>({period:p.id,month:`${2026+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`}))}
}
