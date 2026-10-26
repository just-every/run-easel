import assert from 'node:assert/strict'
import { qboFixture } from './qbo-fixture.mjs'
export const xeroScope='offline_access accounting.settings.read accounting.contacts.read accounting.journals.read accounting.reports.read'
export const xeroGrant={realmId:'synthetic-easel-1',clientId:'synthetic-easel-2',clientSecret:'synthetic-easel-900000003',refreshToken:'synthetic-easel-900000004',consent:true}
export function xeroProvider(){
 const state={status:200,change:false,extra:'',revocation:200,refreshes:0,entries:null,badTrial:false,reads:[]}
 const account=(id,code,name,type)=>({AccountID:id,Code:code,Name:name,Type:type})
 const chart=()=>state.entries?[...new Set(state.entries.map(r=>r[1]))].map((code,i)=>account('synthetic-easel-source-'+i,code,code,code.startsWith('4')?'REVENUE':code==='3000'?'EQUITY':'CURRENT')):[account('synthetic-easel-100','1000','Operating bank','BANK'),account('synthetic-easel-400','4000','Subscription revenue','REVENUE'),account('synthetic-easel-300','3000','Equity','EQUITY'),...(['mapped','both'].includes(state.extra)?[account('synthetic-easel-401','4001','New revenue','REVENUE')]:[]),...(['unmapped','both'].includes(state.extra)?[account('synthetic-easel-402','9999','Uncovered revenue','REVENUE')]:[])]
 const money=n=>(n/100).toFixed(2)
 const amount=m=>m==='2024-06'?0:10000+(state.change&&m==='2026-02'?2500:0)
 const total=m=>{let n=0;for(let y=2024;y<=Number(m.slice(0,4));y++)for(let k=1;k<=12;k++){const p=y+'-'+String(k).padStart(2,'0');if(p<=m)n+=amount(p)}return n}
 const tracking=[{TrackingCategoryID:'synthetic-easel-cat-1',Name:'Product',Options:[{TrackingOptionID:'synthetic-easel-option-1',Name:'Subscriptions'}]},{TrackingCategoryID:'synthetic-easel-cat-2',Name:'Region',Options:[{TrackingOptionID:'synthetic-easel-option-2',Name:'East'}]}]
 state.outbound=async request=>{
  const u=new URL(request.url)
  if(u.origin==='https://identity.xero.com'){
   assert.equal(request.method,'POST')
   if(u.pathname==='/connect/revocation')return new Response(null,{status:state.revocation})
   assert.equal(u.pathname,'/connect/token');state.refreshes++
   return Response.json({access_token:'synthetic-easel-5',refresh_token:'synthetic-easel-rotated-'+state.refreshes,token_type:'Bearer',expires_in:3600,scope:xeroScope})
  }
  assert.equal(u.origin,'https://api.xero.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-easel-5')
  if(u.pathname==='/connections')return Response.json([{tenantId:xeroGrant.realmId}])
  assert.equal(request.headers.get('xero-tenant-id'),xeroGrant.realmId);state.reads.push(u.pathname)
  if(state.status!==200)return Response.json({private:xeroGrant.refreshToken},{status:state.status})
  const kind=u.pathname.split('/').at(-1)
  if(kind==='Organisation')return Response.json({Organisations:[{BaseCurrency:'USD',FinancialYearEndMonth:12}]})
  if(kind==='Accounts')return Response.json({Accounts:chart()})
  if(kind==='TrackingCategories')return Response.json({TrackingCategories:tracking})
  if(kind==='Contacts')return Response.json({Contacts:[{ContactID:'synthetic-easel-contact-1',Name:'Synthetic customer'}]})
  if(kind==='TrialBalance'){
   const day=u.searchParams.get('date'),m=day.slice(0,7)
   const values=state.entries?new Map(chart().map(a=>[a.AccountID,state.entries.filter(r=>r[1]===a.Code&&r[0]<=day).reduce((n,r)=>n+Math.round(Number(r[2])*100),0)])):new Map([['synthetic-easel-100',50000+total(m)],['synthetic-easel-400',-total(m)],['synthetic-easel-300',-50000]])
   if(state.extra&&m>='2026-03')for(const a of chart().filter(a=>['4001','9999'].includes(a.Code))){values.set(a.AccountID,-2500);values.set('synthetic-easel-100',values.get('synthetic-easel-100')+2500)}
   if(state.badTrial)values.set('synthetic-easel-100',(values.get('synthetic-easel-100')??0)+1)
   return Response.json({Reports:[{ReportType:'TrialBalance',Rows:[{RowType:'Header',Cells:['Account','Debit','Credit','YTD Debit','YTD Credit'].map(Value=>({Value}))},{RowType:'Section',Rows:[...values].map(([id,n])=>({RowType:'Row',Cells:[{Value:id,Attributes:[{Id:'account',Value:id}]},{Value:''},{Value:''},{Value:n>0?money(n):''},{Value:n<0?money(-n):''}]}))}]}]})
  }
  assert.equal(kind,'Journals');assert.equal(u.searchParams.get('offset'),'0')
  const journals=[]
  const journal=(m,number,entries)=>{
   const JournalID='synthetic-easel-transaction-'+m+(state.entries?'-'+number:'')
   journals.push({JournalID,JournalNumber:number,JournalDate:m+'-15',JournalLines:entries.map(([code,n],i)=>({JournalLineID:JournalID+'-'+i,AccountID:chart().find(a=>a.Code===code).AccountID,NetAmount:money(n),Description:'Posted source observation',TrackingCategories:(state.entries?[]:tracking).map(c=>({TrackingCategoryID:c.TrackingCategoryID,Name:c.Name,Option:c.Options[0].Name}))}))})
  }
  if(state.entries){
   for(const [i,date]of [...new Set(state.entries.map(r=>r[0]))].entries()){
    journal(date.slice(0,7),i+1,state.entries.filter(r=>r[0]===date).map(r=>[r[1],Math.round(Number(r[2])*100)]));journals.at(-1).JournalDate=date
   }
  }else{
   for(let i=0;i<28;i++){const m=(2024+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0');if(amount(m))journal(m,i+1,[['1000',amount(m)],['4000',-amount(m)]])}
   if(state.extra)for(const [i,a]of chart().filter(a=>['4001','9999'].includes(a.Code)).entries()){journal('2026-03',50+i,[['1000',2500],[a.Code,-2500]]);const j=journals.at(-1);j.JournalID+='-extra-'+i;for(const l of j.JournalLines)l.JournalLineID+='-extra-'+i}
  }
  return Response.json({Journals:journals})
 }
 return state
}
export async function xeroFixture(h){
 const f=await qboFixture(h)
 const dimensions=[]
 for(const[name,sourceKind,source]of[['Product','class','Subscriptions'],['Region','tracking-option','East']]){
  const dimension=await h.command('dimension',{name}),member=await h.command('dimension-member',{dimension:dimension.id,name:source})
  await h.command('dimension-map',{dimension:dimension.id,member:member.id,sourceKind,source,match:'exact'})
  dimensions.push({dimension,member})
 }
 return{...f,dimensions}
}
export const xeroCall=h=>async(path,body,status=200)=>{const r=await h.send('/api/easel/'+path,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function acceptXero(h,input){
 const p=await h.kit('xero','preview',input)
 let r=await h.kit('xero','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint,acknowledgeNonPosting:0})
 for(let n=0;r.batch?.status==='importing'&&n<50;n++)r=await h.kit('actuals','resume',{id:r.batch.id})
 assert.ok(r.accepted||r.batch?.status==='accepted');return p
}
