import assert from 'node:assert/strict'

const time=value=>Date.parse(value+'T00:00:00Z')/1000
export const billingGrant={key:'synthetic-easel-1',consent:true}
export function billingProvider(){
 const state={status:200,change:false,adjustments:false,reads:[]}
 const amounts=[[10000,20000,5000],[15000,10000,0],[0,12000,5000]]
 const invoices=[],lines=new Map()
 for(let m=0;m<3;m++)for(let customer=0;customer<3;customer++){
  const amount=amounts[m][customer];if(!amount)continue
  const month=`2026-0${m+1}`,next=`2026-0${m+2}`,id=`synthetic-easel-invoice-${m}-${customer}`
  invoices.push({id,customer:`synthetic-easel-customer-${customer}`,currency:'usd',created:time(month+'-01'),status:'open',total_excluding_tax:amount,total:amount,amount_paid:0})
  lines.set(id,[{id:`synthetic-easel-line-${m}-${customer}`,currency:'usd',amount,subscription:customer===2?`synthetic-easel-subscription-2-${m===0?'old':'new'}`:`synthetic-easel-subscription-${customer}`,period:{start:time(month+'-01'),end:time(next+'-01')},price:{id:'synthetic-easel-price-1'}}])
 }
 state.outbound=async request=>{
  const u=new URL(request.url);assert.equal(u.origin,'https://api.stripe.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),`Bearer ${billingGrant.key}`)
  state.reads.push(u.pathname)
  if(state.status!==200)return Response.json({private:billingGrant.key},{status:state.status,headers:{'retry-after':'60'}})
  const list=data=>Response.json({data,has_more:false})
  if(u.pathname==='/v1/subscriptions')return list([
   {id:'synthetic-easel-subscription-0',customer:'synthetic-easel-customer-0',currency:'usd',status:'canceled',ended_at:time('2026-03-01')},
   {id:'synthetic-easel-subscription-1',customer:'synthetic-easel-customer-1',currency:'usd',status:'active',ended_at:null},
   {id:'synthetic-easel-subscription-2-old',customer:'synthetic-easel-customer-2',currency:'usd',status:'canceled',ended_at:time('2026-02-01')},
   {id:'synthetic-easel-subscription-2-new',customer:'synthetic-easel-customer-2',currency:'usd',status:'active',ended_at:null},
   ...(state.adjustments?[{id:'synthetic-easel-annual-subscription',customer:'synthetic-easel-customer-annual',currency:'usd',status:'canceled',ended_at:time('2026-02-15')}]:[]),
  ])
  if(u.pathname==='/v1/invoices')return list(state.adjustments?[...invoices.map((r,i)=>i===0?{...r,status:'paid',amount_paid:r.total+1000,total:r.total+1000,charge:'synthetic-easel-21'}:r),{id:'synthetic-easel-annual-1',customer:'synthetic-easel-customer-annual',created:time('2026-01-01'),status:'open',currency:'usd',total_excluding_tax:120000,total:132000,amount_paid:0}]:invoices)
  if(u.pathname==='/v1/credit_notes')return list([])
  if(u.pathname==='/v1/invoice_payments')return list([{id:'synthetic-easel-18',invoice:invoices[0].id,payment:{type:'payment_intent',payment_intent:'synthetic-easel-19'}}])
  if(u.pathname==='/v1/refunds')return list([{id:'synthetic-easel-20',created:time('2026-02-10'),status:'succeeded',amount:2000,currency:'usd',payment_intent:'synthetic-easel-19',charge:'synthetic-easel-21'}])
  if(u.pathname.startsWith('/v1/prices/'))return Response.json({id:u.pathname.split('/').at(-1),type:'recurring',currency:'usd',recurring:{usage_type:'licensed',interval:u.pathname.endsWith('annual')?'year':'month',interval_count:1}})
  const id=u.pathname.split('/')[3]
  if(u.pathname.endsWith('/lines')&&id==='synthetic-easel-annual-1')return list([{id:'synthetic-easel-annual-line',currency:'usd',amount:120000,subscription:'synthetic-easel-annual-subscription',period:{start:time('2026-01-01'),end:time('2027-01-01')},price:{id:'synthetic-easel-price-annual'}}])
  if(u.pathname.endsWith('/lines')&&lines.has(id)){const rows=structuredClone(lines.get(id));if(state.change&&id==='synthetic-easel-invoice-2-1')rows[0].amount+=100;return list(rows)}
  assert.fail(`Unexpected Stripe read ${u.pathname}`)
 }
 return state
}

export async function billingFixture(h){
 await h.command('workspace',{name:'Harbour Subscription Studio',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await h.command('department',{name:'Subscriptions'}),line=await h.command('line',{name:'Recurring subscription revenue',type:'revenue'})
 const scenario=(await h.get('/api/easel/state')).scenarios[0].id
 const driver=await h.command('revenue',{scenario,department:department.id,line:line.id,name:'Subscription customers',kind:'customers',start:'2026-01',startCustomers:'1',arpa:'100',newPerMonth:'0',churnPercent:'0',newPerRep:'0'})
 await h.command('account-map',{account:'4000',target:line.id});await h.command('account-map',{account:'1000',target:'cash'});await h.command('department-map',{source:'',department:department.id})
 const csv='Date,Account,Amount\n2026-01-31,4000,-350\n2026-01-31,1000,350\n2026-02-28,4000,-250\n2026-02-28,1000,250\n2026-03-31,4000,-170\n2026-03-31,1000,170\n'
 const input={filename:'synthetic-subscription-ledger.csv',csv,dateFormat:'YYYY-MM-DD',columns:{date:'Date',account:'Account',amount:'Amount'}}
 const preview=await h.kit('actuals','preview',input);await h.kit('actuals','commit',{...input,fingerprint:preview.fingerprint,acknowledgeRejected:0})
 const sc=(await h.get(`/api/easel/scenario/${scenario}`)).scenario
 return{scenario,driver,department,line,input:{scenario,driver:driver.id,scenarioRevision:sc.revision,from:'2026-01',to:'2026-03'}}
}
