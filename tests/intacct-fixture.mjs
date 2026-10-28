import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Builder,parseStringPromise } from 'xml2js'
const builder=new Builder({headless:true,renderOpts:{pretty:false}})
const encode=o=>builder.buildObject(o)
const entities=(await parseStringPromise(await readFile(new URL('./fixtures/intacct/entities.xml',import.meta.url),'utf8'),{explicitArray:false})).data.entity
const detailRecording=(await parseStringPromise(await readFile(new URL('./fixtures/intacct/gl-detail.xml',import.meta.url),'utf8'),{explicitArray:false})).data.gldetail
const trialRecording=(await parseStringPromise(await readFile(new URL('./fixtures/intacct/trial-balance.xml',import.meta.url),'utf8'),{explicitArray:false})).data.glaccountbalance
export const intacctGrant={senderId:'synthetic-sender',senderPassword:'synthetic-sender-password-1234',companyId:'synthetic-company',userId:'readonly-easel',userPassword:'synthetic-user-password-5678',consent:true}
const standard=[['LOCATION','LOCATIONID','location'],['DEPARTMENT','DEPARTMENTID','department'],['CLASS','CLASSID','class'],['PROJECT','PROJECTID','project'],['CUSTOMER','CUSTOMERID','customer'],['VENDOR','VENDORID','vendor']]
const money=n=>`${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`
const prev=m=>{const d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
export function intacctProvider(){
 const state={status:200,change:false,extra:'',badTrial:false,badScope:false,badCurrency:false,badBook:false,duplicate:false,malformed:false,dtd:false,unreachable:false,unsafeUrl:false,removed:false,memberChange:false,reads:[],entries:null,editMonth:'',fiscalClose:true,largeApril:false}
 const chart=()=>state.entries?[...new Set(state.entries.map(r=>r[1]))].map(ACCOUNTNO=>({RECORDNO:ACCOUNTNO,ACCOUNTNO,TITLE:ACCOUNTNO,CATEGORY:'Synthetic source account',ACCOUNTTYPE:ACCOUNTNO.startsWith('4')?'Income':'Asset',NORMALBALANCE:ACCOUNTNO.startsWith('4')?'credit':'debit',CLOSINGTYPE:'non-closing account',CLOSINGACCOUNTNO:''})):[['1000','Bank','Asset'],['1100','Receivables','Asset'],['1200','Prepaid','Asset'],['1500','Fixed assets','Asset'],['2000','Payables','Liability'],['2100','Accrued liabilities','Liability'],['2200','Deferred revenue','Liability'],['2300','Debt','Liability'],['3000','Equity','Equity'],['4000','Management revenue','Income'],['6000','Management expense','Expense'],...(['mapped','both'].includes(state.extra)?[['4001','New revenue','Income']]:[]),...(state.extra==='both'?[['9999','Uncovered','Income']]:[])].map(([ACCOUNTNO,TITLE,ACCOUNTTYPE])=>({RECORDNO:ACCOUNTNO,ACCOUNTNO,TITLE,ACCOUNTTYPE,CATEGORY:ACCOUNTTYPE,NORMALBALANCE:ACCOUNTTYPE==='Income'||ACCOUNTTYPE==='Liability'||ACCOUNTTYPE==='Equity'?'credit':'debit',CLOSINGTYPE:state.fiscalClose&&['4000','6000'].includes(ACCOUNTNO)?'closing account':'non-closing account',CLOSINGACCOUNTNO:state.fiscalClose&&['4000','6000'].includes(ACCOUNTNO)?'3000':''}))
 const movement=(entity,m)=>m==='2024-06'||m<'2024-01'?0:(entity==='CA'?10000:8000)+(state.change&&m==='2026-02'?(entity==='CA'?2500:2000):0)+(state.editMonth===m?(entity==='CA'?100:80):0)+(state.largeApril&&m==='2026-04'?200:0)
 const totals=(entity,m)=>{
  if(state.entries)return new Map(chart().map(a=>[a.ACCOUNTNO,state.entries.filter(r=>r[0].slice(0,7)<=m&&r[1]===a.ACCOUNTNO).reduce((n,r)=>n+Math.round(Number(r[2])*100),0)]))
  let sum=0;for(let y=2024;y<=Number(m.slice(0,4));y++)for(let k=1;k<=12;k++){const month=`${y}-${String(k).padStart(2,'0')}`;if(month<=m)sum+=movement(entity,month)}
  const values=new Map([['1000',50000],['1100',10000],['1200',12000],['1500',1750000],['2000',-8000],['2100',-15000],['2200',-20000],['2300',-10000],['3000',-1769000],['4000',0],['6000',0]])
  // Independent cumulative accounting expectations: the first entity receives fees, the second pays.
  values.set('1000',50000+(entity==='CA'?sum:-sum));values.set(entity==='CA'?'4000':'6000',entity==='CA'?-sum:sum)
  if(state.extra&&m>='2026-03')for(const a of chart().filter(a=>['4001','9999'].includes(a.ACCOUNTNO))){values.set(a.ACCOUNTNO,-2500);values.set('1000',values.get('1000')+2500)}
  if(state.removed&&m>='2026-02'){values.set('1000',values.get('1000')-movement(entity,'2026-02')*(entity==='CA'?1:-1));values.set(entity==='CA'?'4000':'6000',values.get(entity==='CA'?'4000':'6000')+movement(entity,'2026-02')*(entity==='CA'?1:-1))}
  if(state.fiscalClose){let prior=0;for(let year=2024;year<Number(m.slice(0,4));year++)for(let k=1;k<=12;k++)prior+=movement(entity,`${year}-${String(k).padStart(2,'0')}`);const direction=entity==='CA'?-1:1;values.set(entity==='CA'?'4000':'6000',values.get(entity==='CA'?'4000':'6000')-direction*prior);values.set('3000',values.get('3000')+direction*prior)}
  return values
 }
 const pages=new Map()
 state.outbound=async request=>{
  assert.equal(request.url,'https://api.intacct.com/ia/xml/xmlgw.phtml');assert.equal(request.method,'POST')
  if(state.unreachable)throw Error('synthetic network unavailable')
  const r=(await parseStringPromise(await request.text(),{explicitArray:false})).request,login=r.operation.authentication.login,fn=r.operation.content.function,control=fn.$.controlid,operation=Object.keys(fn).find(k=>k!=='$'),body=fn[operation],entity=login.locationid??''
  assert.equal(login.companyid,intacctGrant.companyId);assert.equal(login.userid,intacctGrant.userId);assert.equal(login.password,intacctGrant.userPassword);assert.equal(r.control.password,intacctGrant.senderPassword)
  assert.ok(['readEntityDetails','getDimensions','lookup','readByQuery','readMore','get_trialbalance'].includes(operation),`Refuse every write: ${operation}`)
  state.reads.push({operation,entity})
  if(state.status!==200)return new Response('synthetic private diagnostic '+intacctGrant.userPassword,{status:state.status,headers:{'retry-after':'60'}})
  if(state.dtd)return new Response('<!DOCTYPE response [<!ENTITY x SYSTEM "file:///etc/passwd">]><response>&x;</response>')
  if(state.malformed)return new Response('<response><broken>')
  let data
  if(operation==='readEntityDetails')data={entity:entities}
  else{
   assert.ok(entities.some(e=>e.id===entity),'Every data read explicitly authenticates its entity')
   if(operation==='getDimensions')data={dimensions:{dimension:[...standard.map(([objectName])=>({objectName,objectLabel:objectName,userDefinedDimension:'false',enabledInGL:'true'})),{objectName:'LINE_OF_BUSINESS',objectLabel:'Line of business',userDefinedDimension:'true',enabledInGL:'true'}]}}
   if(operation==='lookup'){
    const object=body.object
    const fields=object==='GLACCOUNT'?Object.keys(chart()[0]):object==='GLDETAIL'?['RECORDNO','BATCHNO','BATCH_DATE','ACCOUNTNO','DEBITAMOUNT','CREDITAMOUNT','BASECURR','BOOKID','STATE','DESCRIPTION','RECORD_URL',...standard.map(s=>s[1]),'GLDIMLINE_OF_BUSINESS']:object==='LINE_OF_BUSINESS'?['id','name']:['RECORDNO',standard.find(s=>s[0]===object)?.[1],'NAME']
    assert.ok(fields.every(Boolean));data={Type:{Name:object,Fields:{Field:fields.map(Name=>({Name}))}}}
   }
   if(operation==='readByQuery'||operation==='readMore'){
    let rows,object,offset=0
    if(operation==='readMore'){const page=pages.get(body.resultId);assert.ok(page);({rows,object,offset}=page)}
    else{
     object=body.object
     assert.equal(body.pagesize,'1000');assert.equal(body.returnFormat,'xml')
     if(object==='GLACCOUNT')rows=chart()
     else if(object==='LINE_OF_BUSINESS')rows=[{id:'B2B',name:'Business services'}]
     else if(object==='GLDETAIL'){
      assert.match(body.query,/BOOKID = 'ACCRUAL' AND STATE = 'Posted'/)
      const dates=[...body.query.matchAll(/'(\d{2})\/(\d{2})\/(\d{4})'/g)].map(m=>`${m[3]}-${m[1]}-${m[2]}`);assert.equal(dates.length,2)
      const m=dates[0].slice(0,7),amount=movement(entity,m)-(state.largeApril&&m==='2026-04'?200:0),entries=state.entries?state.entries.filter(r=>r[0].slice(0,7)===m).map(r=>[r[1],Math.round(Number(r[2])*100)]):amount&&!(state.removed&&m==='2026-02')?[['1000',entity==='CA'?amount:-amount],[entity==='CA'?'4000':'6000',entity==='CA'?-amount:amount]]:[]
      if(state.extra&&m==='2026-03')for(const a of chart().filter(a=>['4001','9999'].includes(a.ACCOUNTNO)))entries.push(['1000',2500],[a.ACCOUNTNO,-2500])
      if(state.largeApril&&m==='2026-04')for(let i=0;i<200;i++)entries.push(['1000',entity==='CA'?1:-1],[entity==='CA'?'4000':'6000',entity==='CA'?-1:1])
      rows=entries.map(([ACCOUNTNO,n],i)=>({...detailRecording,RECORDNO:`${entity}-${m}-${i}`,BATCHNO:`${entity}-entry-${m}${i>=2?'-'+Math.floor(i/2):''}`,BATCH_DATE:state.entries?(()=>{const date=state.entries.filter(r=>r[0].slice(0,7)===m)[i][0];return date.slice(5,7)+'/'+date.slice(8)+'/'+date.slice(0,4)})():m.slice(5)+'/15/'+m.slice(0,4),ACCOUNTNO,DEBITAMOUNT:money(Math.max(n,0)),CREDITAMOUNT:money(Math.max(-n,0)),BASECURR:state.badCurrency?'USD':entities.find(e=>e.id===entity).currency,BOOKID:state.badBook?'CASH':'ACCRUAL',STATE:'Posted',DESCRIPTION:'Recorded management services',RECORD_URL:state.unsafeUrl?'https://www.intacct.com/ia/acct/entry?sessionid=private':`https://www.intacct.com/ia/acct/gl/view?recordno=${entity}-entry-${m}`,LOCATIONID:entity==='CA'?'L1':'L2',DEPARTMENTID:state.entries?'':'D1',CLASSID:'C1',PROJECTID:'P1',CUSTOMERID:'CU1',VENDORID:'V1',GLDIMLINE_OF_BUSINESS:'B2B'}))
     }else{const field=standard.find(s=>s[0]===object)?.[1];assert.ok(field);const values=object==='LOCATION'?[['L1','Toronto'],['L2','Berlin']]:object==='DEPARTMENT'?[['D1','Services'],['D2','Engineering'],['D3','Finance']]:[[{CLASS:'C1',PROJECT:'P1',CUSTOMER:'CU1',VENDOR:'V1'}[object],object]];rows=values.map(([id,NAME],i)=>({RECORDNO:String(i+1),[field]:id,NAME:NAME+(state.memberChange?' updated':'')}))}
     const fields=body.fields.split(',');assert.ok(rows.every(row=>fields.every(f=>Object.hasOwn(row,f))))
    }
    const page=rows.slice(offset,offset+(rows.length>100?100:2)),remaining=rows.length-offset-page.length,cursor=`${entity}:${object}:${control}`
    if(remaining)pages.set(cursor,{rows,object,offset:offset+page.length})
    data={$:{count:String(page.length),numremaining:String(remaining),totalcount:String(rows.length),resultId:cursor},[object.toLowerCase()]:state.duplicate&&offset?page.map(()=>rows[0]):page}
   }
   if(operation==='get_trialbalance'){
    assert.equal(body.reportingbook,'ACCRUAL');assert.equal(body.statistical,'exclude');assert.equal(body.debitcreditbalance,'true');assert.equal(body.locationid,entity);assert.equal(body.showzerobalances,'true')
    const m=body.startdate.year+'-'+body.startdate.month,opening=totals(entity,prev(m)),closing=totals(entity,m)
    if(state.badTrial)closing.set('1000',closing.get('1000')+1)
    data={glaccountbalance:chart().map(a=>({...trialRecording,accountno:a.ACCOUNTNO,currency:entities.find(e=>e.id===entity).currency,reportingbook:'ACCRUAL',startbalancedebit:money(Math.max(opening.get(a.ACCOUNTNO)??0,0)),startbalancecredit:money(Math.max(-(opening.get(a.ACCOUNTNO)??0),0)),endbalancedebit:money(Math.max(closing.get(a.ACCOUNTNO)??0,0)),endbalancecredit:money(Math.max(-(closing.get(a.ACCOUNTNO)??0),0))}))}
   }
  }
  assert.ok(data,operation)
  return new Response(encode({response:{control:{status:'success',controlid:control},operation:{authentication:{status:'success',locationid:state.badScope?'other':entity},result:{status:'success',function:operation,controlid:control,data}}}}),{headers:{'content-type':'application/xml'}})
 }
 return state
}
export const intacctCall=h=>async(op,body,status=200)=>{const r=await h.send('/api/easel/connections/intacct/'+op,body,h.owner);assert.equal(r.status,status,r.text);return r.value}
export async function intacctFixture(h,{connect=true}={}){
 await h.command('workspace',{name:'Recorded Intacct entity company',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await h.command('department',{name:'Services'}),revenue=await h.command('line',{name:'Management revenue',type:'revenue'}),expense=await h.command('line',{name:'Management expense',type:'operating-expense'})
 const first=(await h.get('/api/easel/state')).scenarios[0],second=await h.command('branch',{from:first.id,name:'European budget',budget:true})
 const ca=await h.command('entity-save',{name:'Canadian Services',scenario:first.id,currency:'CAD',group:first.id,reporting:'USD'}),eu=await h.command('entity-save',{name:'European Services',scenario:second.id,currency:'EUR',group:first.id,reporting:'USD'})
 for(const [account,target]of [['1000','cash'],['1100','bs:receivables'],['1200','bs:prepaid'],['1500','bs:fixed-assets'],['2000','bs:payables'],['2100','bs:accrued-liabilities'],['2200','bs:deferred-revenue'],['2300','bs:debt'],['3000','bs:equity'],['6000',expense.id]])await h.command('account-map',{account,target})
 await h.command('account-rule',{match:'range',from:'4000',to:'4999',target:revenue.id})
 for(const source of ['','D1','D2','D3'])await h.command('department-map',{source,department:department.id})
 const dimensions=[]
 for(const [name,kind,values]of [['Posting location','location',['L1','L2']],['Source department','department',['D1','D2','D3']]]){
  const d=await h.command('dimension',{name})
  for(const source of values){const member=await h.command('dimension-member',{dimension:d.id,name:source});await h.command('dimension-map',{dimension:d.id,member:member.id,sourceKind:kind,source});dimensions.push({dimension:d,member,source})}
 }
 if(connect)await intacctCall(h)('connect',intacctGrant)
 if(connect)for(const [sourceEntity,e]of [['CA',ca],['EU',eu]])await intacctCall(h)('bind',{sourceEntity,entity:e.id})
 return{ca,eu,first,second,department,revenue,expense,dimensions}
}
export async function acceptIntacct(h,input){
 const p=await h.kit('intacct','preview',input)
 let r=await h.kit('intacct','commit',{...input,fingerprint:p.fingerprint,sourceFingerprint:p.sourceFingerprint})
 p.continuations=0
 for(let n=0;r.batch?.status==='importing'&&n<50;n++){p.continuations++;r=await h.kit('actuals','resume',{id:r.batch.id})}
 assert.ok(r.accepted||r.batch?.status==='accepted',JSON.stringify(r));return p
}
