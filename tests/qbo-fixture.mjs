import assert from 'node:assert/strict'

export const qboGrant={environment:'sandbox',realmId:'synthetic-easel-1',clientId:'synthetic-easel-2',clientSecret:'synthetic-easel-900000003',refreshToken:'synthetic-easel-900000004',consent:true}
const epoch='2024-01',index=m=>(Number(m.slice(0,4))-2024)*12+Number(m.slice(5))-1
const account=(Id,AcctNum,Name,AccountType)=>({Id,AcctNum,Name,AccountType,...(AccountType==='Equity'?{AccountSubType:'RetainedEarnings'}:{})})
export function qboProvider(){
 const state={status:200,change:false,extra:'',revocation:200,refreshes:0,reads:[],entries:null,transactionType:'Journal Entry'}
 const extras=()=>[...(['mapped','both'].includes(state.extra)?[account('synthetic-easel-401','4001','New recurring revenue','Income')]:[]),...(['unmapped','both'].includes(state.extra)?[account('synthetic-easel-402','9999','Uncovered revenue','Income')]:[])]
 const chart=()=>state.entries?[...new Set(state.entries.map(r=>r[1]))].map((code,i)=>account(`synthetic-easel-source-${i}`,code,code,code.startsWith('4')?'Income':code==='1000'?'Bank':'Other Asset')):[account('synthetic-easel-100','1000','Operating bank','Bank'),account('synthetic-easel-400','4000','Subscription revenue','Income'),account('synthetic-easel-300','3000','Equity','Equity'),...extras()]
 const amount=m=>m==='2024-06'?0:10000+(state.change&&m==='2026-02'?2500:0)
 const movement=m=>m<epoch?0:amount(m)
 const total=m=>{let n=0;for(let i=0;i<=index(m);i++)n+=amount(`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);return n}
 const money=n=>`${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`
 const cell=(value,id)=>({value:String(value),...(id?{id}:{})})
 const cols=keys=>({Column:keys.map(ColType=>({ColType,ColTitle:ColType}))})
 state.outbound=async request=>{
  const u=new URL(request.url)
  if(u.origin==='https://oauth.platform.intuit.com'){
   assert.equal(request.method,'POST');const body=new URLSearchParams(await request.text());assert.ok(['refresh_token','authorization_code'].includes(body.get('grant_type')))
   state.refreshes++;return Response.json({access_token:'synthetic-easel-5',refresh_token:`synthetic-easel-rotated-${state.refreshes}`,token_type:'bearer',expires_in:3600})
  }
  if(u.origin==='https://developer.api.intuit.com'){assert.equal(request.method,'POST');return new Response(null,{status:state.revocation})}
  assert.equal(u.origin,'https://sandbox-quickbooks.api.intuit.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-easel-5')
  state.reads.push(u.pathname)
  if(state.status!==200)return Response.json({private:qboGrant.refreshToken},{status:state.status})
  const prefix=`/v3/company/${qboGrant.realmId}`
  if(u.pathname===prefix+`/companyinfo/${qboGrant.realmId}`)return Response.json({CompanyInfo:{FiscalYearStartMonth:'January'}})
  if(u.pathname===prefix+'/query'){
   const name=/select \* from (\w+)/.exec(u.searchParams.get('query'))[1]
   return Response.json({QueryResponse:{[name]:name==='Account'?chart():!state.entries&&name==='Class'?[{Id:'synthetic-easel-class-1',Name:'Subscriptions'}]:!state.entries&&name==='Department'?[{Id:'synthetic-easel-location-1',Name:'East'}]:[]}})
  }
  const end=u.searchParams.get('end_date'),start=u.searchParams.get('start_date'),month=end.slice(0,7),name=u.pathname.split('/').at(-1)
  const Header={ReportName:name,ReportBasis:'Accrual',StartPeriod:start,EndPeriod:end,Currency:'USD'}
  if(name==='TrialBalance'){
   const priorYear=total(`${Number(month.slice(0,4))-1}-12`)
   const values=state.entries?new Map(chart().map(a=>[a.Id,state.entries.filter(r=>r[1]===a.AcctNum&&r[0]<=end).reduce((n,r)=>n+Math.round(Number(r[2])*100),0)])):new Map([['synthetic-easel-100',50000+total(month)],['synthetic-easel-400',-total(month)+priorYear],['synthetic-easel-300',-50000-priorYear]])
   if(state.extra&&month>='2026-03'){values.set('synthetic-easel-100',values.get('synthetic-easel-100')+2500*extras().length);for(const a of extras())values.set(a.Id,-2500)}
   return Response.json({Header,Columns:cols(['Account','Debit','Credit']),Rows:{Row:[...values].map(([id,n])=>({type:'Data',ColData:[cell(chart().find(a=>a.Id===id).Name,id),cell(n>0?money(n):''),cell(n<0?money(-n):'')]}))}})
  }
  assert.equal(name,'GeneralLedger')
  if(!state.entries&&month==='2024-06')return Response.json({Header:{...Header,Option:[{Name:'NoReportData',Value:'true'}]},Rows:{}})
  const fields=['tx_date','txn_type','doc_num','memo','account_name','debt_amt','credit_amt','cust_name','vend_name',...(!state.entries?['klass_name','dept_name']:[])]
  const rows=[]
  const push=(accountId,n,tx)=>rows.push({type:'Data',ColData:[cell(month+'-15'),cell(state.transactionType,tx),cell('Synthetic journal'),cell('Posted subscription observation'),cell(chart().find(a=>a.Id===accountId).Name,accountId),cell(n>0?money(n):''),cell(n<0?money(-n):''),cell(''),cell(''),...(!state.entries?[cell('Subscriptions','synthetic-easel-class-1'),cell('East','synthetic-easel-location-1')]:[])]})
  if(state.entries){
   for(const row of state.entries.filter(r=>r[0]>=start&&r[0]<=end)){
    const a=chart().find(a=>a.AcctNum===row[1]),n=Math.round(Number(row[2])*100)
    rows.push({type:'Data',ColData:[cell(row[0]),cell('Journal Entry',`synthetic-easel-transaction-${row[0]}`),cell('Synthetic journal'),cell('Posted source allocation'),cell(a.Name,a.Id),cell(n>0?money(n):''),cell(n<0?money(-n):''),cell(''),cell('')]})
   }
  }else if(month>=epoch){const tx=`synthetic-easel-transaction-${month}`;push('synthetic-easel-100',movement(month),tx);push('synthetic-easel-400',-movement(month),tx)}
  if(state.extra&&month==='2026-03')for(const a of extras()){push('synthetic-easel-100',2500,'synthetic-easel-new-'+a.Id);push(a.Id,-2500,'synthetic-easel-new-'+a.Id)}
  if(!state.entries&&month==='2026-02')rows.push({type:'Data',ColData:[cell(month+'-16'),cell('Payment','synthetic-easel-nonposting'),cell(''),cell(''),cell(''),cell('.00'),cell('.00'),cell(''),cell(''),cell(''),cell('')]})
  return Response.json({Header,Columns:cols(fields),Rows:{Row:rows}})
 }
 return state
}

export async function qboFixture(h){
 await h.command('workspace',{name:'Harbour Studio ledger',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const line=await h.command('line',{name:'Subscription revenue',type:'revenue'}),department=await h.command('department',{name:'Subscriptions'})
 await h.command('account-map',{account:'1000',target:'cash'});await h.command('account-map',{account:'3000',target:'bs:equity'});await h.command('account-rule',{match:'range',from:'4000',to:'4999',target:line.id});await h.command('department-map',{source:'',department:department.id});await h.command('department-map',{source:'Subscriptions',department:department.id})
 return{line,department}
}
export const qboCall=h=>async(path,body,status=200)=>{const r=await h.send('/api/easel/'+path,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function acceptQbo(h,input){
 const p=await h.kit('qbo','preview',input)
 let r=await h.kit('qbo','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint,acknowledgeNonPosting:p.source.nonPostingRows.length})
 for(let n=0;r.batch?.status==='importing'&&n<50;n++)r=await h.kit('actuals','resume',{id:r.batch.id})
 assert.ok(r.accepted||r.batch?.status==='accepted')
 return p
}
