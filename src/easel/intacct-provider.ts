import { parseStringPromise } from 'xml2js'
import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { intacctEntryUrl } from './intacct-links'
import { intacctCents,reconcileIntacctTrial } from './intacct-trial'
import { Fault,requireThat,type Data } from './types'
export type IntacctCredentials={senderId:string;senderPassword:string;companyId:string;userId:string;userPassword:string}
export const INTACCT_PURPOSE='easel-intacct-web-services-v1'
export const INTACCT_READS=['readEntityDetails','getDimensions','lookup','readByQuery','readMore','get_trialbalance']
export class IntacctFailure extends Fault{constructor(message:string,public httpStatus:number|null=null,public rateLimit:string|null=null){super(502,message)}}
const xml=(s:unknown)=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))
export const intacctText=(v:unknown,label='source text',max=500)=>{requireThat(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),`Intacct returned invalid ${label}`,502);return v}
export const intacctId=(v:unknown)=>{const s=intacctText(v,'identifier',120);requireThat(/^[A-Za-z0-9_.:@ -]+$/.test(s),'Intacct returned an unsafe identifier',502);return s}
const array=(v:Data|Data[]|undefined):Data[]=>v===undefined?[]:Array.isArray(v)?v:[v]
function one(v:Data|Data[],label:string):Data{const a=array(v);requireThat(a.length===1,`Intacct ${label} is incomplete or repeated`,502);return a[0]}
/** This is the sole network door. Envelopes and provider error bodies never enter journals or errors. */
export async function intacctRequest(key:IntacctCredentials,operation:string,body='',entity=''):Promise<Data>{
 requireThat(INTACCT_READS.includes(operation),'Unsupported Intacct operation')
 const control=crypto.randomUUID()
 const request=`<?xml version="1.0" encoding="UTF-8"?><request><control><senderid>${xml(key.senderId)}</senderid><password>${xml(key.senderPassword)}</password><controlid>${control}</controlid><uniqueid>false</uniqueid><dtdversion>3.0</dtdversion></control><operation><authentication><login><userid>${xml(key.userId)}</userid><companyid>${xml(key.companyId)}</companyid><password>${xml(key.userPassword)}</password>${entity?`<locationid>${xml(intacctId(entity))}</locationid>`:''}</login></authentication><content><function controlid="${control}"><${operation}>${body}</${operation}></function></content></operation></request>`
 let r:Response
 try{r=await fetch('https://api.intacct.com/ia/xml/xmlgw.phtml',{method:'POST',headers:{'content-type':'application/xml','accept':'application/xml'},body:request,redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{throw new IntacctFailure('Intacct could not be reached; accepted data is unchanged')}
 if(r.status!==200){await r.body?.cancel();const retry=r.headers.get('retry-after');throw new IntacctFailure(`Intacct refused a read (HTTP ${r.status}); no data accepted`,r.status,r.status===429?retry&&/^\d{1,6}$/.test(retry)?`Retry after ${retry} seconds`:'Rate limited; retry explicitly later':null)}
 const reader=r.body?.getReader();requireThat(reader,'Intacct returned an empty response',502)
 let size=0;const chunks:Uint8Array[]=[]
 for(;;){let p:ReadableStreamReadResult<Uint8Array>;try{p=await reader.read()}catch{throw new IntacctFailure('Intacct response was interrupted; no data accepted')}if(p.done)break;size+=p.value.length;if(size>8_000_000){await reader.cancel();throw new IntacctFailure('Intacct response exceeds the read limit; no data accepted')}chunks.push(p.value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
 requireThat(!/<!\s*(?:DOCTYPE|ENTITY)/i.test(text),'Intacct XML declarations are not permitted',502)
 let parsed:Data
 try{parsed=await parseStringPromise(text,{explicitArray:false,explicitRoot:true,trim:false,normalize:false,strict:true,attrkey:'$'})}catch{throw new IntacctFailure('Intacct returned malformed XML; no data accepted')}
 const response=parsed.response
 requireThat(response&&Object.keys(parsed).length===1&&response.control?.status==='success'&&response.control?.controlid===control,'Intacct returned an unexpected response envelope',502)
 const op=one(response.operation,'operation'),result=one(op.result,'function result')
 requireThat(op.authentication?.status==='success'&&result.status==='success'&&result.function===operation&&result.controlid===control,'Intacct read or authentication failed; check the dedicated read-only user and sender authorization',502)
 if(entity)requireThat(op.authentication.locationid===entity,'Intacct authenticated a different entity scope',502)
 return one(result.data,'result data')
}
export async function intacctEntities(key:IntacctCredentials){
 const data=await intacctRequest(key,'readEntityDetails'),seen=new Set<string>()
 return array(data.entity).map(e=>{const id=intacctId(e.id);requireThat(!seen.has(id),'Intacct repeated an entity',502);seen.add(id);const currency=intacctText(e.currency,'entity currency',3);requireThat(/^[A-Z]{3}$/.test(currency),'Intacct entity currency is invalid',502);return{id,name:intacctText(e.name),currency,recordno:intacctId(e.recordno),firstFiscalMonth:intacctText(e.firstfiscalmonth,'fiscal month',2)}})
}
const objectName=(v:unknown)=>{const s=intacctText(v,'object or field',100);requireThat(/^[A-Za-z][A-Za-z0-9_]*$/.test(s),'Intacct returned an unsafe object or field',502);return s}
async function lookup(key:IntacctCredentials,object:string,entity:string){
 const d=await intacctRequest(key,'lookup',`<object>${xml(objectName(object))}</object>`,entity)
 const type=one(d.Type,'object definition');requireThat(type.Name===object,'Intacct lookup object changed',502)
 return new Set(array(type.Fields?.Field).map(f=>objectName(f.Name)))
}
async function readAll(key:IntacctCredentials,object:string,fields:string[],entity:string,query=''){
 const known=await lookup(key,object,entity);requireThat(fields.every(f=>known.has(f)),'Intacct required fields are unavailable; no partial source accepted',502)
 let data=await intacctRequest(key,'readByQuery',`<object>${xml(object)}</object><fields>${fields.map(xml).join(',')}</fields><query>${xml(query)}</query><pagesize>1000</pagesize><returnFormat>xml</returnFormat>`,entity)
 const result:Data[]=[],seen=new Set<string>(),cursors=new Set<string>();let total:number|undefined
 for(let page=0;page<100;page++){
  const attrs=data.$??{},count=Number(attrs.count),remaining=Number(attrs.numremaining),reported=Number(attrs.totalcount)
  requireThat([count,remaining,reported].every(n=>Number.isSafeInteger(n)&&n>=0)&&reported<=5000,'Intacct source counts are missing or exceed 5,000 rows',409)
  total??=reported;requireThat(total===reported,'Intacct source count changed during pagination',502)
  const keys=Object.keys(data).filter(k=>k!=='$'),batch=keys.flatMap(k=>array(data[k]))
  requireThat(batch.length===count&&result.length+count+remaining===total&&(!remaining||count>0),'Intacct pagination is incomplete',502)
  for(const row of batch){const id=intacctId(row.RECORDNO??row.id);requireThat(!seen.has(id),'Intacct repeated a source record number',502);seen.add(id);result.push(row)}
  if(!remaining)return result
  const cursor=intacctText(attrs.resultId,'pagination cursor',500);requireThat(cursor&&!cursors.has(cursor),'Intacct pagination made no progress',502);cursors.add(cursor)
  requireThat(page<99,'Intacct pagination limit exceeded',409)
  data=await intacctRequest(key,'readMore',`<resultId>${xml(cursor)}</resultId>`,entity)
 }
 throw new IntacctFailure('Intacct pagination was not completed')
}
const STANDARD=[['LOCATION','LOCATIONID','location'],['DEPARTMENT','DEPARTMENTID','department'],['CLASS','CLASSID','class'],['PROJECT','PROJECTID','project'],['CUSTOMER','CUSTOMERID','customer'],['VENDOR','VENDORID','vendor']]
const datePart=(date:string)=>{const[y,m,d]=date.split('-');return `<year>${y}</year><month>${m}</month><day>${d}</day>`}
export async function readIntacctLedger(key:IntacctCredentials,entityId:string,month:string,asOf:string){
 requireThat(typeof month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month),'Choose a valid Intacct month')
 const entity=(await intacctEntities(key)).find(e=>e.id===entityId);requireThat(entity,'The Intacct user cannot read this legal entity',403)
 const from=month+'-01',to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)
 requireThat(to<=asOf,'Intacct acceptance requires a completed month',409)
 const sourceChart=await readAll(key,'GLACCOUNT',['RECORDNO','ACCOUNTNO','TITLE','ACCOUNTTYPE','NORMALBALANCE','CLOSINGTYPE'],entityId)
 const chart=sourceChart.map(a=>({id:intacctId(a.RECORDNO),code:intacctId(a.ACCOUNTNO),name:intacctText(a.TITLE),type:intacctText(a.ACCOUNTTYPE),normalBalance:intacctText(a.NORMALBALANCE),closingType:intacctText(a.CLOSINGTYPE)}))
 requireThat(chart.length>0&&new Set(chart.map(a=>a.code)).size===chart.length,'Intacct chart is empty or ambiguous',502)
 const definitions=array((await intacctRequest(key,'getDimensions','',entityId)).dimensions?.dimension)
 const dimensions:Data={},udd:Data[]=[]
 for(const [object,field,kind]of STANDARD){
  requireThat(definitions.some(d=>d.objectName===object&&d.enabledInGL==='true'),'Intacct standard dimension definition is unavailable',502)
  const rows=await readAll(key,object,['RECORDNO',field,'NAME'],entityId)
  dimensions[kind]=rows.map(r=>({id:intacctId(r[field]),name:intacctText(r.NAME),recordno:intacctId(r.RECORDNO)}))
 }
 for(const d of definitions.filter(d=>d.userDefinedDimension==='true'&&d.enabledInGL==='true')){
  const object=objectName(d.objectName),fields=await lookup(key,object,entityId)
  requireThat(fields.has('id')&&fields.has('name'),'Intacct UDD identity fields are unavailable',502)
  const members=await readAll(key,object,['id','name'],entityId),field='GLDIM'+object
  udd.push({object,field,kind:'udd:'+object,name:intacctText(d.objectLabel),members:members.map(r=>({id:intacctId(r.id),name:intacctText(r.name)}))})
 }
 const fields=['RECORDNO','BATCHNO','BATCH_DATE','ACCOUNTNO','DEBITAMOUNT','CREDITAMOUNT','BASECURR','BOOKID','STATE','DESCRIPTION','RECORD_URL',...STANDARD.map(x=>x[1]),...udd.map(u=>u.field)]
 const format=(d:string)=>d.slice(5,7)+'/'+d.slice(8,10)+'/'+d.slice(0,4)
 const query=`BATCH_DATE >= '${format(from)}' AND BATCH_DATE <= '${format(to)}' AND BOOKID = 'ACCRUAL' AND STATE = 'Posted'`
 const detail=await readAll(key,'GLDETAIL',fields,entityId,query)
 const rows=detail.map(r=>{
  const date=intacctText(r.BATCH_DATE,'posting date',10),m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date),iso=m?`${m[3]}-${m[1]}-${m[2]}`:date
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(iso)&&Number.isFinite(Date.parse(iso))&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso&&iso>=from&&iso<=to,'Intacct returned a posting outside the period',502)
  requireThat(r.BOOKID==='ACCRUAL'&&r.STATE==='Posted'&&r.BASECURR===entity.currency,'Intacct ledger book, posted state or base currency changed',502)
  const a=chart.find(a=>a.code===r.ACCOUNTNO);requireThat(a,'Intacct detail has an unknown account',502)
  const dr=intacctCents(r.DEBITAMOUNT),cr=intacctCents(r.CREDITAMOUNT);requireThat(dr>=0&&cr>=0&&!(dr&&cr),'Intacct detail debit and credit are invalid',502)
  const sourceDimensions:Record<string,string>={},labels:Record<string,string>={}
  for(const [,field,kind]of STANDARD){const value=r[field]??'';requireThat(typeof value==='string','Intacct dimension identity is invalid',502);if(value){const member=dimensions[kind].find((m:Data)=>m.id===value);requireThat(member,'Intacct posting dimension is missing from metadata',502);labels[kind]=member.name}sourceDimensions[kind]=value}
  for(const u of udd){const value=r[u.field]??'';requireThat(typeof value==='string'&&(!value||u.members.some((m:Data)=>m.id===value)),'Intacct UDD member is unavailable',502);sourceDimensions[u.kind]=value}
  const url=intacctEntryUrl(r.RECORD_URL);requireThat(url,'Intacct entry destination is missing or unsafe; no rows accepted',409)
  return{id:intacctId(r.RECORDNO),transactionId:intacctId(r.BATCHNO),date:iso,accountId:a.id,account:a.code,accountName:a.name,accountType:a.type,amount:dr-cr,department:sourceDimensions.department,description:intacctText(r.DESCRIPTION??''),reference:intacctId(r.BATCHNO),sourceDimensions,dimensionLabels:labels,entryUrl:url}
 })
 const report=await intacctRequest(key,'get_trialbalance',`<startdate>${datePart(from)}</startdate><enddate>${datePart(to)}</enddate><debitcreditbalance>true</debitcreditbalance><showzerobalances>true</showzerobalances><showdeptdetail>false</showdeptdetail><showlocdetail>false</showlocdetail><reportingbook>ACCRUAL</reportingbook><includereportingbook>true</includereportingbook><statistical>exclude</statistical><locationid>${xml(entityId)}</locationid>`,entityId)
 const trialBalance=reconcileIntacctTrial(chart,array(report.glaccountbalance),rows,entity.currency)
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 const source={entity,book:'ACCRUAL',currency:entity.currency,month,from,to,chart,dimensions:{...dimensions,udd},rows,trialBalance}
 return{...source,digest:sha256(canonicalJson(source))}
}
