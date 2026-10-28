import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { qboFixture } from './qbo-fixture.mjs'
export const netsuiteGrant={realm:'1234567_SB1',consumerKey:'synthetic-consumer-01',consumerSecret:'synthetic-consumer-secret-02',tokenId:'synthetic-token-03',tokenSecret:'synthetic-token-secret-04',role:'Declared read-only accounting role',consent:true}
const recording=JSON.parse(await readFile(new URL('./netsuite-suiteql-recording.json',import.meta.url),'utf8'))
const encode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())
const decimal=n=>`${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`
export function netsuiteProvider(){
 const state={status:200,change:false,extra:'',badTrial:false,badPage:false,drift:false,remove:false,dimensionChange:false,revocation:200,reads:[],nonces:new Set(),entries:null,trials:null,large:true,largeMonth:'2024-01',splits:600,trialReads:0}
 const periods=[{id:'1',name:'Opening boundary',startdate:'2023-12-01',enddate:'2023-12-31',isyear:'F',isquarter:'F',isadjust:'F',closed:'T'},...recording.months.map(m=>({id:m.period,name:m.month,startdate:m.month+'-01',enddate:new Date(Date.UTC(Number(m.month.slice(0,4)),Number(m.month.slice(5)),0)).toISOString().slice(0,10),isyear:'F',isquarter:'F',isadjust:'F',closed:'T'})),{id:'99',name:'2025 fiscal adjustment',startdate:'2025-12-31',enddate:'2025-12-31',isyear:'F',isquarter:'F',isadjust:'T',closed:'T'},{id:'100',name:'2025 parent year',startdate:'2025-01-01',enddate:'2025-12-31',isyear:'T',isquarter:'F',isadjust:'F',closed:'T'}]
 const chart=()=>state.entries?[...new Set(state.entries.map(e=>e[2]))].map((code,i)=>({id:String(100+i),code,name:code,type:code.startsWith('4')?'Income':code==='3000'?'Equity':'Other',isinactive:'F'})):[...recording.accounts,...(state.extra?[{id:'401',code:'4001',name:'New subscription revenue',type:'Income',isinactive:'F'}]:[]),...(state.extra==='both'?[{id:'402',code:'9999',name:'Uncovered income',type:'Income',isinactive:'F'}]:[])]
 const posting=(sub,period,tx,line,account,amount,date)=>({transactionid:String(tx),transactiontype:'Journal',date:date??periods.find(p=>p.id===period).startdate,periodid:period,lineid:String(line),accountid:account,bookid:'1',subsidiaryid:sub,debit:decimal(Math.max(amount,0)),credit:decimal(Math.max(-amount,0)),memo:'Recorded accounting observation',reference:'NS-'+tx,departmentid:'1',classid:'1',locationid:state.dimensionChange?'2':'1'})
 state.outbound=async request=>{
  const u=new URL(request.url)
  assert.equal(u.origin,u.pathname==='/rest/revoketoken'?'https://1234567-sb1.restlets.api.netsuite.com':'https://1234567-sb1.suitetalk.api.netsuite.com');assert.equal(request.method,u.pathname==='/rest/revoketoken'?'GET':'POST')
  const auth=Object.fromEntries([...request.headers.get('authorization').matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],decodeURIComponent(m[2])]))
  assert.equal(auth.realm,netsuiteGrant.realm);assert.equal(auth.oauth_consumer_key,netsuiteGrant.consumerKey);assert.equal(auth.oauth_token,netsuiteGrant.tokenId);assert.equal(auth.oauth_signature_method,'HMAC-SHA256');assert.ok(Math.abs(Date.now()/1000-Number(auth.oauth_timestamp))<60)
  assert.ok(!state.nonces.has(auth.oauth_nonce),'Each request gets a fresh nonce');state.nonces.add(auth.oauth_nonce)
  const params=[...u.searchParams,...Object.entries(auth).filter(([k])=>k!=='realm'&&k!=='oauth_signature')].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(([k,v])=>k+'='+v).join('&')
  const expected=createHmac('sha256',encode(netsuiteGrant.consumerSecret)+'&'+encode(netsuiteGrant.tokenSecret)).update(request.method+'&'+encode(u.origin+u.pathname)+'&'+encode(params)).digest('base64');assert.equal(auth.oauth_signature,expected)
  if(u.pathname==='/rest/revoketoken'){assert.equal(u.searchParams.get('token'),netsuiteGrant.tokenId);if(state.revocation==='unreachable')throw Error('synthetic unreachable');return new Response(null,{status:state.revocation})}
  assert.equal(u.pathname,'/services/rest/query/v1/suiteql');assert.equal(request.headers.get('prefer'),'transient');const {q}=await request.json();assert.match(q,/^SELECT /);assert.doesNotMatch(q,/INSERT|UPDATE|DELETE|\*|SELECT.*FROM.*https:/i);state.reads.push(q)
  if(state.status!==200)return Response.json({private:netsuiteGrant.tokenSecret},{status:state.status,headers:{'retry-after':'42'}})
  let rows
  if(q.includes('FROM TransactionAccountingLine')){
   assert.match(q,/tl\.transaction=tal\.transaction AND tl\.id=tal\.transactionline/);assert.match(q,/tal\.accountingbook=1/)
   const sub=/tl\.subsidiary=(\d+)/.exec(q)[1],selected=/t\.postingperiod IN \(([^)]+)\)/.exec(q)[1].split(',');assert.ok(!selected.includes('100'),'Parent periods never double count leaf periods')
   if(q.includes('SUM(')){
    state.trialReads++
    const last=recording.months.filter(m=>selected.includes(m.period)).at(-1),base=sub==='1'?50000:40000
    if(state.entries){
     assert.ok(state.trials,'Custom recording requires independently supplied trial aggregates')
     const through=periods.filter(p=>selected.includes(p.id)).map(p=>p.enddate.slice(0,7)).sort().at(-1)
     const month=Object.keys(state.trials[sub]??{}).filter(m=>m<=through).sort().at(-1),balances=month?state.trials[sub][month]:{}
     rows=Object.entries(balances).map(([code,n])=>({accountid:chart().find(a=>a.code===code).id,balance:decimal(n)}))
    }
    else{
     const prior=last?Math.round(Number(sub==='1'?last.cadCashClosing:last.eurCashClosing)*100):base
     const correction=state.change&&selected.includes('27')?2500:0,removed=state.remove&&selected.includes('27')?(sub==='1'?10000:8000):0
     const extra=selected.includes('28')?(state.extra==='both'?5000:state.extra?2500:0):0
     rows=[{accountid:'100',balance:decimal(prior+correction-removed+extra+(state.badTrial?1:0)+(state.drift&&state.trialReads%2?1:0))},{accountid:'300',balance:decimal(-base)},{accountid:'400',balance:decimal(-(prior-base+correction-removed))},...(extra?[{accountid:'401',balance:'-25.00'}]:[]),...(extra===5000?[{accountid:'402',balance:'-25.00'}]:[])]
    }
   }else{
    rows=[]
    if(state.entries){for(const [i,e]of state.entries.entries())if(e[0]===sub&&selected.includes(periods.find(p=>p.name===e[1]).id)){const a=chart().find(a=>a.code===e[2]);rows.push(posting(sub,periods.find(p=>p.name===e[1]).id,1000+i,1,a.id,Math.round(Number(e[3])*100),e[4]))}}
    else for(const m of recording.months.filter(m=>selected.includes(m.period))){
     const amount=Math.round(Number(sub==='1'?m.cadMovement:m.eurMovement)*100)+(state.change&&m.period==='27'?2500:0);if(!amount||state.remove&&m.period==='27')continue
     if(state.large&&m.month===state.largeMonth){for(let i=0;i<state.splits;i++){const n=Math.floor(amount/state.splits)+(i<amount%state.splits?1:0);rows.push(posting(sub,m.period,1000+Number(m.period),i*2+1,'100',n,'2023-12-31'),posting(sub,m.period,1000+Number(m.period),i*2+2,'400',-n,'2023-12-31'))}}
     else{rows.push(posting(sub,m.period,1000+Number(m.period),1,'100',amount),posting(sub,m.period,1000+Number(m.period),2,'400',-amount))}
     if(state.extra&&m.period==='28')for(const a of chart().filter(a=>['401','402'].includes(a.id)))rows.push(posting(sub,m.period,2000+Number(a.id),1,'100',2500),posting(sub,m.period,2000+Number(a.id),2,a.id,-2500))
    }
   }
  }else{
   const kind=q.includes('FROM account ')?'accounts':q.includes('FROM subsidiary ')?'subsidiaries':q.includes('FROM accountingbook ')?'books':q.includes('FROM accountingperiod ')?'periods':q.includes('FROM department ')?'departments':q.includes('FROM classification ')?'classes':q.includes('FROM location ')?'locations':null
   assert.ok(kind,'Unexpected provider operation: '+q)
   rows=kind==='accounts'?chart():kind==='periods'?periods:kind==='locations'&&state.dimensionChange?[...recording.locations,{id:'2',name:'West',isinactive:'F'}]:recording[kind]
  }
  if(q.includes('AS transactionid'))rows.sort((a,b)=>{for(const k of ['periodid','transactionid','lineid','accountid']){const d=BigInt(a[k])-BigInt(b[k]);if(d)return d<0n?-1:1}return 0})
  const offset=Number(u.searchParams.get('offset')),items=rows.slice(offset,offset+1000)
  return Response.json({links:[],items,count:items.length,offset:state.badPage?offset+1:offset,hasMore:offset+items.length<rows.length,totalResults:rows.length})
 }
 return state
}
export const netsuiteCall=h=>async(path,body,status=200)=>{const r=await h.send('/api/easel/'+path,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function netsuiteFixture(h,{connect=true}={}){
 const f=await qboFixture(h),call=netsuiteCall(h),root=(await h.get('/api/easel/state')).scenarios[0],branch=await h.command('branch',{from:root.id,name:'European source plan'})
 const entities=[]
 for(const [name,currency,scenario]of[['Canada','CAD',root.id],['Europe','EUR',branch.id]])entities.push(await h.command('entity-save',{name,currency,scenario,group:root.id,reporting:'USD'}))
 const dimensions=[]
 for(const [name,sourceKind,source]of[['Product','class','Product'],['Region','location','East']]){const d=await h.command('dimension',{name}),m=await h.command('dimension-member',{dimension:d.id,name:source});await h.command('dimension-map',{dimension:d.id,member:m.id,sourceKind,source,match:'exact'});dimensions.push({dimension:d,member:m})}
 if(connect){await call('connections/netsuite/connect',netsuiteGrant);await mapNetSuite(h,entities)}
 return {...f,root,branch,entities,dimensions,call}
}
export async function mapNetSuite(h,entities){const call=netsuiteCall(h),status=await h.get('/api/easel/connections/netsuite');for(const p of status.inventory.periods.filter(p=>p.isyear==='F'&&p.isquarter==='F'))await call('connections/netsuite/map-period',{book:'1',period:p.id,month:p.enddate.slice(0,7)});for(let i=0;i<entities.length;i++)await call('connections/netsuite/map-subsidiary',{book:'1',subsidiary:String(i+1),entity:entities[i].id})}
export async function acceptNetSuite(h,input,{resolve=true}={}){
 const p=await h.kit('netsuite','preview',input),staged=await h.kit('netsuite','stage',{...input,sourceFingerprint:p.sourceFingerprint})
 if(resolve&&staged.guard.unresolved.length){const decisions=staged.guard.unresolved.map(issue=>({issue:issue.id,action:'exclude',reason:'Finance reviewed the synthetic source metadata change'}));await h.command('source-guard-review',{id:staged.guard.id,revision:staged.guard.revision,fingerprint:staged.guard.fingerprint,decisions})}
 let r=await h.kit('netsuite','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint})
 let continued=0;for(;r.batch?.status==='importing'&&continued<60;continued++)r=await h.kit('actuals','resume',{id:r.batch.id})
 assert.ok(r.accepted||r.batch?.status==='accepted',JSON.stringify(r));return {...p,batch:r.batch,continued}
}
