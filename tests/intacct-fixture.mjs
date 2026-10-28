// Recorded Web Services shapes. Only the provider HTTP edge is replaced.
import assert from 'node:assert/strict'
import { parseStringPromise, Builder } from 'xml2js'
export const intacctGrant={companyId:'synthetic-easel-company',senderId:'synthetic-easel-sender',senderPassword:'synthetic-easel-sender-secret-001',userId:'synthetic-easel-reader',password:'synthetic-easel-user-secret-002',consent:true}
const builder=new Builder({headless:true,renderOpts:{pretty:false}})
const money=n=>(n/100).toFixed(2)
export function intacctProvider(){
 const state={status:200,change:false,extra:'',badTrial:false,entries:null,reads:[],pages:0,rename:false,move:false}
 const entities=[{id:'US',name:'US services',currency:'USD'},{id:'CA',name:'Canadian services',currency:'CAD'}]
 const chart=()=>state.entries?[...new Set(state.entries.map(r=>r[1]))].map(code=>({ACCOUNTNO:code,TITLE:code,ACCOUNTTYPE:code.startsWith('4')?'incomestatement':'balancesheet'})):[
  ['1000','Cash','balancesheet'],['1100','Intercompany receivable','balancesheet'],['2000','Intercompany payable','balancesheet'],['3000','Equity','balancesheet'],['4000',state.rename?'Renamed services':'Management services','incomestatement'],['5000','Management cost','incomestatement'],
  ...(['mapped','both'].includes(state.extra)?[['4001','New services','incomestatement']]:[]),...(['unmapped','both'].includes(state.extra)?[['9999','Software','incomestatement']]:[])
 ].map(([ACCOUNTNO,TITLE,ACCOUNTTYPE])=>({ACCOUNTNO,TITLE,ACCOUNTTYPE}))
 const entries=(entity)=>{
  if(state.entries)return state.entries.map((r,i)=>({RECORDNO:String(i+1),BATCHNO:'batch-'+r[0],BATCH_DATE:r[0],ACCOUNTNO:r[1],n:Math.round(Number(r[2])*100),DEPARTMENTID:'',LOCATIONID:'',DESCRIPTION:'Source opening allocation',RECORD_URL:'https://www.intacct.com/ia/acct/glentry.phtml?recordno='+i}))
  const output=[],push=(month,account,n,part)=>{const i=output.length;output.push({RECORDNO:month.replace('-','')+'-'+part,BATCHNO:'batch-'+month+'-'+part.split('-')[0],BATCH_DATE:month+'-15',ACCOUNTNO:account,n,DEPARTMENTID:state.move&&entity==='US'&&month==='2026-03'&&account==='4000'?'D2':['D1','D2','D3'][i%3],LOCATIONID:state.move&&entity==='US'&&month==='2026-03'&&account==='4000'?'L1':['L1','L2'][i%2],CLASSID:'C1',PROJECTID:'P1',CUSTOMERID:'CU1',VENDORID:'V1',LINE_OF_BUSINESS:'SaaS',DESCRIPTION:'Recorded management entry',DOCNUMBER:'Record '+part,RECORD_URL:'https://www.intacct.com/ia/acct/glentry.phtml?recordno='+month+'-'+part})}
  for(let i=0;i<28;i++){const month=(2024+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0'),amount=10000+(state.change&&entity==='US'&&month==='2026-02'?2500:0)
   if(month==='2024-06')continue
   if(entity==='US'){push(month,month<'2026-01'?'1000':'1100',amount,'fee-1');push(month,'4000',-amount,'fee-2')}
   else{push(month,'5000',amount,'fee-1');push(month,month<'2026-01'?'1000':'2000',-amount,'fee-2')}
  }
  if(entity==='US'&&state.extra)for(const code of chart().map(a=>a.ACCOUNTNO).filter(c=>['4001','9999'].includes(c))){push('2026-03','1000',2500,code+'-1');push('2026-03',code,-2500,code+'-2')}
  return output
 }
 let cursor=0;const cursors=new Map()
 state.outbound=async request=>{
  assert.equal(request.url,'https://api.intacct.com/ia/xml/xmlgw.phtml');assert.equal(request.method,'POST')
  const parsed=await parseStringPromise(await request.text(),{explicitArray:false,trim:true}),r=parsed.request,login=r.operation.authentication.login,entity=login.locationid
  assert.equal(r.control.senderid,intacctGrant.senderId);assert.equal(r.control.password,intacctGrant.senderPassword)
  assert.equal(login.userid,intacctGrant.userId);assert.equal(login.password,intacctGrant.password)
  if(state.status!==200)return new Response('Private '+intacctGrant.password,{status:state.status,headers:{'retry-after':'30'}})
  const f=r.operation.content.function,kind=Object.keys(f).find(k=>k!=='$'),arg=f[kind]
  state.reads.push({kind,entity})
  assert.ok(['readEntityDetails','getDimensions','readByQuery','readMore','get_trialbalance'].includes(kind),'No accounting write can reach the provider')
  const result=data=>new Response(builder.buildObject({response:{control:{status:'success'},operation:{authentication:{status:'success'},result:{status:'success',function:kind,controlid:f.$.controlid,data}}}}),{headers:{'content-type':'application/xml'}})
  const page=(rows,tag='row')=>{
   const first=rows.slice(0,2),rest=rows.slice(2),id='cursor-'+(++cursor)
   if(rest.length)cursors.set(id,{rows:rest,tag})
   return result({$:{count:String(first.length),numremaining:String(rest.length),resultId:rest.length?id:''},...(first.length?{[tag]:first}:{})})
  }
  if(kind==='readEntityDetails')return result({entity:entities})
  assert.ok(entities.some(e=>e.id===entity))
  if(kind==='getDimensions')return result({dimensions:{dimension:[...['LOCATION','DEPARTMENT','CLASS','PROJECT','CUSTOMER','VENDOR'].map(objectName=>({objectName,userDefinedDimension:'false',enabledInGL:'true'})),{objectName:'LINE_OF_BUSINESS',userDefinedDimension:'true',enabledInGL:'true'}]}})
  if(kind==='readMore'){state.pages++;const saved=cursors.get(arg.resultId);assert.ok(saved);cursors.delete(arg.resultId);return page(saved.rows,saved.tag)}
  if(kind==='readByQuery'){
   const object=arg.object
   if(object==='GLACCOUNT')return page(chart(),'glaccount')
   if(object==='GLDETAIL'){
    const dates=[...arg.query.matchAll(/'(\d{2})\/(\d{2})\/(\d{4})'/g)].map(m=>m[3]+'-'+m[1]+'-'+m[2])
    assert.equal(dates.length,2);assert.equal(arg.fields,'*,RECORD_URL')
    return page(entries(entity).filter(r=>r.BATCH_DATE>=dates[0]&&r.BATCH_DATE<=dates[1]).map(({n,...r})=>({...r,DEBITAMOUNT:money(Math.max(n,0)),CREDITAMOUNT:money(Math.max(-n,0))})),'gldetail')
   }
   const dimensions={LOCATION:[{RECORDNO:'1',LOCATIONID:'L1',NAME:'East'},{RECORDNO:'2',LOCATIONID:'L2',NAME:'West'}],DEPARTMENT:['D1','D2','D3'].map((DEPARTMENTID,i)=>({RECORDNO:String(i+1),DEPARTMENTID,NAME:'Department '+(i+1)})),CLASS:[{RECORDNO:'1',CLASSID:'C1',NAME:'Subscriptions'}],PROJECT:[{RECORDNO:'1',PROJECTID:'P1',NAME:'Implementation'}],CUSTOMER:[{RECORDNO:'1',CUSTOMERID:'CU1',NAME:'Customer'}],VENDOR:[{RECORDNO:'1',VENDORID:'V1',NAME:'Vendor'}],LINE_OF_BUSINESS:[{RECORDNO:'1',id:'SaaS',name:'SaaS'}]}
   assert.ok(dimensions[object]);return page(dimensions[object],object.toLowerCase())
  }
  assert.equal(arg.reportingbook,'ACCRUAL')
  const day=x=>x.year+'-'+x.month.padStart(2,'0')+'-'+x.day.padStart(2,'0'),from=day(arg.startdate),to=day(arg.enddate),all=entries(entity)
  const opening=state.entries?[]:[['1000',50000],['3000',-50000]]
  return result({glaccountbalance:chart().map(a=>{
   const start=all.filter(r=>r.ACCOUNTNO===a.ACCOUNTNO&&r.BATCH_DATE<from).reduce((n,r)=>n+r.n,opening.find(r=>r[0]===a.ACCOUNTNO)?.[1]??0)
   const end=all.filter(r=>r.ACCOUNTNO===a.ACCOUNTNO&&r.BATCH_DATE<=to).reduce((n,r)=>n+r.n,opening.find(r=>r[0]===a.ACCOUNTNO)?.[1]??0)
   return{glaccountno:a.ACCOUNTNO,startbalance:money(start),endbalance:money(end+(state.badTrial&&a.ACCOUNTNO==='1000'?1:state.badTrial&&a.ACCOUNTNO==='3000'?-1:0))}
  })})
 }
 return state
}
export const intacctCall=h=>async(op,body,status=200)=>{const r=await h.send('/api/easel/connections/intacct/'+op,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function acceptIntacct(h,input){
 const p=await h.kit('intacct','preview',input)
 let r=await h.kit('intacct','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint})
 for(let n=0;r.batch?.status==='importing'&&n<50;n++)r=await h.kit('actuals','resume',{id:r.batch.id})
 assert.ok(r.accepted||r.batch?.status==='accepted');return p
}
export async function intacctFixture(h){
 await h.command('workspace',{name:'Intacct multi-entity planning',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const revenue=await h.command('line',{name:'Management services',type:'revenue'}),expense=await h.command('line',{name:'Management cost',type:'operating-expense'}),department=await h.command('department',{name:'Operations'})
 for(const source of['','D1','D2','D3'])await h.command('department-map',{source,department:department.id})
 for(const [account,target] of[['1000','cash'],['1100','bs:receivables'],['2000','bs:payables'],['3000','bs:equity'],['5000',expense.id]])await h.command('account-map',{account,target})
 await h.command('account-rule',{match:'range',from:'4000',to:'4999',target:revenue.id})
 const dimensions=[]
 for(const [name,sourceKind,values]of[['Intacct department','department',['D1','D2','D3']],['Intacct location','tracking-option',['L1','L2']]]){
  const dimension=await h.command('dimension',{name}),members=[]
  for(const source of values){const member=await h.command('dimension-member',{dimension:dimension.id,name:source});members.push(member);await h.command('dimension-map',{dimension:dimension.id,member:member.id,sourceKind,source,match:'exact'})}
  dimensions.push({dimension,members})
 }
 const parent=(await h.get('/api/easel/state')).scenarios[0],sub=await h.command('branch',{from:parent.id,name:'Canadian budget'})
 const us=await h.command('entity-save',{name:'US services',scenario:parent.id,currency:'USD',group:parent.id,reporting:'USD'}),ca=await h.command('entity-save',{name:'Canadian services',scenario:sub.id,currency:'CAD',group:parent.id,reporting:'USD'})
 return{revenue,expense,department,dimensions,parent,sub,us,ca}
}
