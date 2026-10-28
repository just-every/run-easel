import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { qboFixture } from './qbo-fixture.mjs'
const recording=JSON.parse(await readFile(new URL('../fixtures/netsuite/suiteql.json',import.meta.url),'utf8'))
export const netsuiteGrant={realmId:'1234567_SB1',roleId:'1001',consumerKey:'synthetic-easel-consumer',consumerSecret:'synthetic-easel-consumer-secret-900000003',tokenId:'synthetic-easel-token-900000004',tokenSecret:'synthetic-easel-token-secret-900000005',consent:true,readOnlyRole:true}
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())
const money=n=>(n/100).toFixed(2)
export function netsuiteProvider(){
 const state={status:200,change:false,extra:'',entries:null,badTrial:false,reads:[],nonces:new Set(),initial:false,denseMonth:null,duplicate:false,pages:0}
 const chart=()=>state.entries?[...new Set(state.entries.map(r=>r[1]))].map((code,i)=>({id:String(100+i),code,name:code,type:code.startsWith('4')?'Income':code==='3000'?'Equity':code==='1200'?'Prepaid':'Asset'})):[...recording.accounts,...(state.initial?[{id:'403',code:'4002',name:'New initial revenue',type:'Income'},{id:'404',code:'9998',name:'Subscription revenue',type:'Income'}]:[]),...(['mapped','both'].includes(state.extra)?[{id:'401',code:'4001',name:'New subscription revenue',type:'Income'}]:[]),...(['unmapped','both'].includes(state.extra)?[{id:'402',code:'9999',name:'Subscription revenue',type:'Income'}]:[])]
 function entries(sub){
  const rows=[]
  if(state.entries){for(const [i,r]of state.entries.entries())rows.push({transaction_id:String(2000+[...new Set(state.entries.map(r=>r[0]))].indexOf(r[0])),transaction_type:'Journal',line_id:String(i+1),account_id:chart().find(a=>a.code===r[1]).id,source_date:r[0],department_id:null,class_id:null,location_id:null,amount:r[2]});return sub==='1'?rows:[]}
  for(let i=0;i<28;i++){
   const month=`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`
   if(month==='2024-06')continue
   const amount=(sub==='1'?10000:7000)+(state.change&&month==='2026-02'&&sub==='1'?2500:0)
   for(const [line,account,n]of[['1','100',amount],['2','400',-amount]])rows.push({...recording.page.items[0],transaction_id:String(Number(sub)*100000+i+1),line_id:line,account_id:account,source_date:month+'-15',amount:money(n)})
  }
  if(state.denseMonth){
   const first=rows.find(r=>r.source_date.slice(0,7)===state.denseMonth&&r.line_id==='1'),second=rows.find(r=>r.source_date.slice(0,7)===state.denseMonth&&r.line_id==='2')
   first.amount=money(Math.round(Number(first.amount)*100)-600);second.amount=money(Math.round(Number(second.amount)*100)+600)
   for(let i=0;i<600;i++)for(const[line,account,n]of[[String(3+i*2),'100',1],[String(4+i*2),'400',-1]])rows.push({...first,line_id:line,account_id:account,amount:money(n)})
  }
  if(state.initial&&sub==='1')for(const[i,account]of['403','404'].entries())for(const[line,a,n]of[['1','100',1500],['2',account,-1500]])rows.push({...recording.page.items[0],transaction_id:String(400000+i),line_id:line,account_id:a,source_date:'2024-01-15',amount:money(n)})
  if(sub==='1')for(const [i,a]of chart().filter(a=>['4001','9999'].includes(a.code)).entries())for(const [line,account,n]of[['1','100',2500],['2',a.id,-2500]])rows.push({...recording.page.items[0],transaction_id:String(300000+i),line_id:line,account_id:account,source_date:'2026-03-15',amount:money(n)})
  return rows
 }
 state.outbound=async request=>{
  const u=new URL(request.url);assert.equal(u.origin,'https://1234567-sb1.suitetalk.api.netsuite.com');assert.equal(u.pathname,'/services/rest/query/v1/suiteql');assert.equal(request.method,'POST');assert.equal(request.headers.get('prefer'),'transient')
  const header=request.headers.get('authorization');assert.match(header,/^OAuth /)
  const params=Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map(([,k,v])=>[k,decodeURIComponent(v)]));assert.equal(params.realm,netsuiteGrant.realmId);assert.equal(params.oauth_token,netsuiteGrant.tokenId);assert.equal(params.oauth_consumer_key,netsuiteGrant.consumerKey);assert.equal(params.oauth_signature_method,'HMAC-SHA256');assert.ok(Math.abs(Date.now()/1000-Number(params.oauth_timestamp))<60);assert.ok(!state.nonces.has(params.oauth_nonce));state.nonces.add(params.oauth_nonce)
  const expected=params.oauth_signature;delete params.realm;delete params.oauth_signature
  const pairs=[...u.searchParams,...Object.entries(params)].map(([k,v])=>[enc(k),enc(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0)
  const base=['POST',enc(u.origin+u.pathname),enc(pairs.map(([k,v])=>k+'='+v).join('&'))].join('&')
  assert.equal(expected,createHmac('sha256',enc(netsuiteGrant.consumerSecret)+'&'+enc(netsuiteGrant.tokenSecret)).update(base).digest('base64'))
  const {q}=await request.json();assert.match(q,/^SELECT /);assert.doesNotMatch(q,/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);state.reads.push(q)
  if(state.status!==200)return Response.json({private:netsuiteGrant.tokenSecret},{status:state.status,headers:{'retry-after':'60'}})
  let items=[]
  if(q.includes('FROM account ORDER')){assert.match(q,/acctname AS name/);items=chart()}
  else if(q.includes('FROM subsidiary'))items=recording.subsidiaries
  else if(q.includes('FROM department'))items=state.entries?[]:recording.departments
  else if(q.includes('FROM classification'))items=state.entries?[]:recording.classes
  else if(q.includes('FROM location'))items=state.entries?[]:recording.locations
  else if(q.includes('FROM accountingbook'))items=recording.books
  else if(q.includes('FROM accountingperiod')){const dates=[...q.matchAll(/TO_DATE\('([^']+)'/g)].map(m=>m[1]),month=dates[0].slice(0,7);items=[{id:String(Number(month.slice(0,4))*12+Number(month.slice(5))),start_date:dates[0],end_date:dates[1]}]}
  else {
   assert.match(q,/tal\.posting='T' AND t\.posting='T' AND tal\.accountingbook=1/)
   const sub=/tl\.subsidiary=(\d+)/.exec(q)[1],all=entries(sub)
   if(q.includes('AS transaction_id')){
    const period=Number(/t\.postingperiod=(\d+)/.exec(q)[1]),month=`${Math.floor((period-1)/12)}-${String((period-1)%12+1).padStart(2,'0')}`
    const to=[...q.matchAll(/TO_DATE\('([^']+)'/g)].at(-1)[1]
    items=all.filter(r=>r.source_date.slice(0,7)===month&&r.source_date<=to)
    if(state.duplicate&&items.length)items.push({...items[0]})
   }else{
    const boundary=/ap\.startdate(<=?)TO_DATE\('([^']+)'/.exec(q);assert.ok(boundary)
    const month=boundary[2].slice(0,7),values=new Map()
    if(!state.entries){values.set('100',sub==='1'?50000:30000);values.set('300',sub==='1'?-50000:-30000)}
    for(const r of all)if(boundary[1]==='<'?r.source_date.slice(0,7)<month:r.source_date.slice(0,7)<=month)values.set(r.account_id,(values.get(r.account_id)??0)+Math.round(Number(r.amount)*100))
    if(state.badTrial&&boundary[1]==='<='){values.set('100',(values.get('100')??0)+1);values.set('300',(values.get('300')??0)-1)}
    items=[...values].map(([account_id,n])=>({account_id,amount:money(n)}))
   }
  }
  const offset=Number(u.searchParams.get('offset'));assert.equal(u.searchParams.get('limit'),'1000');const page=items.slice(offset,offset+1000);state.pages++
  return Response.json({links:[],offset,count:page.length,totalResults:items.length,hasMore:offset+page.length<items.length,items:page})
 }
 return state
}
export const netsuiteCall=h=>async(path,body,status=200)=>{const r=await h.send('/api/easel/'+path,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function mapNetsuite(h,scenario){
 const first=await h.command('entity-save',{name:'US parent',scenario,currency:'USD',group:scenario,reporting:'USD'})
 const other=await h.command('branch',{from:scenario,name:'Services subsidiary plan'})
 const second=await h.command('entity-save',{name:'Services subsidiary',scenario:other.id,currency:'USD',group:scenario,reporting:'USD'})
 const call=netsuiteCall(h)
 if((await h.get('/api/easel/connections/netsuite')).connected)for(const[sub,entity]of[['1',first],['2',second]])await call('connections/netsuite/map',{subsidiaryId:sub,entity:entity.id})
 return{first,second,other}
}
export async function netsuiteFixture(h){
 const f=await qboFixture(h),scenario=(await h.get('/api/easel/state')).scenarios[0]
 const entities=await mapNetsuite(h,scenario.id),dimensions=[]
 for(const[name,sourceKind,source]of[['Product','class','Enterprise'],['Region','location','East']]){
  const dimension=await h.command('dimension',{name}),member=await h.command('dimension-member',{dimension:dimension.id,name:source})
  await h.command('dimension-map',{dimension:dimension.id,member:member.id,sourceKind,source,match:'exact'});dimensions.push({dimension,member})
 }
 return{...f,scenario,entities,dimensions}
}
export async function acceptNetsuite(h,input){
 const p=await h.kit('netsuite','preview',input)
 let r=await h.kit('netsuite','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint})
 for(let n=0;r.batch?.status==='importing'&&n<50;n++)r=await h.kit('actuals','resume',{id:r.batch.id})
 assert.ok(r.accepted||r.batch?.status==='accepted');return p
}
