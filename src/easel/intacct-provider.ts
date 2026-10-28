import { parseStringPromise } from 'xml2js'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { Fault, requireThat, type Data } from './types'

export type IntacctCredentials = { companyId:string; senderId:string; senderPassword:string; userId:string; password:string }
export const INTACCT_PURPOSE = 'easel-intacct-web-services-v1'
export const INTACCT_READS = 'Read-only Web Services: chart, entities, dimensions, GL detail and accrual trial balance'
export class IntacctFailure extends Fault {
 constructor(message:string, public httpStatus:number|null=null, public rateLimit:string|null=null) { super(502,message) }
}
export const xml = (v:unknown) => String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
const str = (v:unknown,max=500):string => { requireThat(typeof v==='string'&&v.length<=max,'Intacct returned invalid source text',502); return v }
export const sourceId = (v:unknown) => { const s=str(v,120); requireThat(/^[A-Za-z0-9_.-]+$/.test(s),'Intacct returned an invalid source identifier',502); return s }
const exact = (n:number) => { requireThat(Number.isSafeInteger(n),'Intacct amounts exceed exact cents',502); return n }
function cents(v:unknown) {
 const s=str(v); requireThat(/^-?\d+(?:\.\d{1,2})?$/.test(s),'Intacct returned an inexact amount',502)
 const [whole,fraction='']=s.replace('-','').split('.')
 return exact((s.startsWith('-')?-1:1)*(Number(whole)*100+Number(fraction.padEnd(2,'0'))))
}
const array = (v:any):Data[] => v===undefined?[]:Array.isArray(v)?v:[v]
export function intacctUrl(v:unknown):string|undefined {
 try { const u=new URL(String(v)); if(u.protocol==='https:'&&!u.username&&!u.password&&/^(?:[a-z0-9-]+\.)?intacct\.com$/.test(u.hostname)&&u.pathname.startsWith('/ia/'))return u.href } catch {}
 return undefined
}
/** The function XML is constructed only by this module; caller payloads never select functions or destinations. */
async function request(key:IntacctCredentials, fn:string, entity?:string):Promise<Data> {
 const control=crypto.randomUUID()
 const body='<request><control><senderid>'+xml(key.senderId)+'</senderid><password>'+xml(key.senderPassword)+'</password><controlid>'+control+'</controlid><uniqueid>false</uniqueid><dtdversion>3.0</dtdversion><includewhitespace>false</includewhitespace></control><operation><authentication><login><userid>'+xml(key.userId)+'</userid><companyid>'+xml(key.companyId)+'</companyid><password>'+xml(key.password)+'</password>'+(entity?'<locationid>'+xml(sourceId(entity))+'</locationid>':'')+'</login></authentication><content><function controlid="'+control+'">'+fn+'</function></content></operation></request>'
 let r:Response
 try { r=await fetch('https://api.intacct.com/ia/xml/xmlgw.phtml',{method:'POST',headers:{'content-type':'application/xml'},body,redirect:'manual',signal:AbortSignal.timeout(20000)}) } catch { throw new IntacctFailure('Intacct could not be reached; no data accepted') }
 if(r.status!==200) { await r.body?.cancel(); const retry=r.headers.get('retry-after'); throw new IntacctFailure('Intacct refused a read (HTTP '+r.status+'); no data accepted',r.status,r.status===429?(retry&&/^\d{1,6}$/.test(retry)?'Retry after '+retry+' seconds':'Rate limited; retry explicitly later'):null) }
 const reader=r.body?.getReader(); requireThat(reader,'Intacct returned empty data',502)
 const chunks:Uint8Array[]=[];let length=0
 for(;;) { const p=await reader.read(); if(p.done)break;length+=p.value.length;if(length>8_000_000){await reader.cancel();throw new Fault(409,'Intacct monthly read exceeds its byte limit')}chunks.push(p.value) }
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const content=new TextDecoder().decode(bytes);requireThat(!/<!DOCTYPE|<!ENTITY/i.test(content),'Intacct XML declarations are unsupported',502)
 let result:Data
 try { const parsed=await parseStringPromise(content,{explicitArray:false,trim:true}); const response=parsed.response;requireThat(response?.control?.status==='success'&&response.operation?.authentication?.status==='success','Intacct authentication failed; check the read-only Web Services user',502);result=response.operation.result } catch { throw new IntacctFailure('Intacct returned invalid XML or refused authentication; no data accepted',200) }
 requireThat(result&&!Array.isArray(result)&&result.status==='success'&&result.controlid===control,'Intacct refused the read or changed its response; no data accepted',502)
 return result.data??{}
}
async function read(key:IntacctCredentials,object:string,entity?:string,query='',fields='*') {
 const rows:Data[]=[];let resultId='',previousRemaining=Infinity
 for(let page=0;page<100;page++) {
  const data=await request(key,page?'<readMore><resultId>'+xml(resultId)+'</resultId></readMore>':'<readByQuery><object>'+xml(object)+'</object><fields>'+xml(fields)+'</fields><query>'+xml(query)+'</query><pagesize>1000</pagesize></readByQuery>',entity)
  const attrs=data.$
  requireThat(attrs&&/^\d+$/.test(attrs.count)&&/^\d+$/.test(attrs.numremaining),'Intacct omitted pagination completeness',502)
  const batch=Object.entries(data).filter(([k])=>k!=='$').flatMap(([,v])=>array(v))
  requireThat(batch.length===Number(attrs.count),'Intacct page count changed',502)
  rows.push(...batch);requireThat(rows.length<=10000,'Intacct source exceeds its row limit',409)
  requireThat(Number(attrs.numremaining)<previousRemaining,'Intacct pagination made no progress',502)
  previousRemaining=Number(attrs.numremaining)
  if(Number(attrs.numremaining)===0)return rows
  resultId=str(attrs.resultId,500);requireThat(resultId&&batch.length>0&&page<99,'Intacct pagination repeated or exceeded its limit',502)
 }
 throw new Fault(409,'Intacct pagination did not complete')
}
export async function intacctEntities(key:IntacctCredentials) {
 const data=await request(key,'<readEntityDetails/>')
 const entities=array(data.entity).map(e=>({id:sourceId(e.id),name:str(e.name),currency:str(e.currency,3)}))
 requireThat(entities.length>0&&entities.every(e=>/^[A-Z]{3}$/.test(e.currency))&&new Set(entities.map(e=>e.id)).size===entities.length,'Intacct entity metadata is incomplete',502)
 return entities
}
export type IntacctLedgerRow={id:string;transactionId:string;transactionType:string;date:string;accountId:string;account:string;accountName:string;accountType:string;amount:number;class_name:string;location_name:string;customer_name:string;vendor_name:string;description:string;reference:string;sourceDimensions:Record<string,string>;providerUrl?:string}
export async function readIntacctLedger(key:IntacctCredentials,entity:string,month:string,asOf:string) {
 sourceId(entity);requireThat(/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Choose an Intacct month')
 const from=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10),to=end<asOf?end:asOf
 requireThat(from<=to,'Choose a month that has started')
 const entities=await intacctEntities(key),selected=entities.find(e=>e.id===entity);requireThat(selected,'Choose a current Intacct entity',409)
 const chart=(await read(key,'GLACCOUNT',entity)).map(a=>({id:sourceId(a.ACCOUNTNO),code:sourceId(a.ACCOUNTNO),name:str(a.TITLE),type:str(a.ACCOUNTTYPE)}))
 requireThat(chart.length>0&&new Set(chart.map(a=>a.id)).size===chart.length,'Intacct chart is empty or ambiguous',502)
 const descriptions=await request(key,'<getDimensions/>',entity)
 const definitions=array(descriptions.dimensions?.dimension??descriptions.dimension).filter(d=>d.enabledInGL==='true')
 const dimensions:Record<string,Data[]>={}
 for(const object of new Set(['LOCATION','DEPARTMENT','CLASS','PROJECT','CUSTOMER','VENDOR',...definitions.filter(d=>d.userDefinedDimension==='true').map(d=>sourceId(d.objectName))])) {
  requireThat(/^[A-Za-z][A-Za-z0-9_]*$/.test(object),'Intacct returned an unsafe dimension name',502)
  dimensions[object]=(await read(key,object,entity)).map(r=>({...r,id:sourceId(r.RECORDNO),name:str(r.NAME??r.name??r[object+'ID']??r.id)}))
 }
 const date=(s:string)=>{const [y,m,d]=s.split('-');return m+'/'+d+'/'+y}
 const detail=await read(key,'GLDETAIL',entity,"BATCH_DATE >= '"+date(from)+"' AND BATCH_DATE <= '"+date(to)+"'",'*,RECORD_URL')
 const rows:IntacctLedgerRow[]=detail.map(r=>{
  const account=chart.find(a=>a.id===r.ACCOUNTNO);requireThat(account,'Intacct detail has an unknown account',502)
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r.BATCH_DATE),day=m?m[3]+'-'+m[1]+'-'+m[2]:str(r.BATCH_DATE)
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>=from&&day<=to&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day,'Intacct detail date is outside the reviewed month',502)
  const dr=cents(r.DEBITAMOUNT),cr=cents(r.CREDITAMOUNT);requireThat(dr>=0&&cr>=0&&!(dr&&cr),'Intacct returned invalid debit or credit',502)
  const sourceDimensions:Record<string,string>={entity,department:str(r.DEPARTMENTID??''),class:str(r.CLASSID??''),location:str(r.LOCATIONID??''),'tracking-option':str(r.LOCATIONID??''),project:str(r.PROJECTID??''),customer:str(r.CUSTOMERID??''),vendor:str(r.VENDORID??'')}
  for(const d of definitions.filter(d=>d.userDefinedDimension==='true'))sourceDimensions[d.objectName]=str(r[d.objectName]??r[d.objectName+'ID']??'')
  const providerUrl=intacctUrl(r.RECORD_URL);requireThat(providerUrl,'Intacct did not provide a supported transaction link',502)
  return{id:sourceId(r.RECORDNO),transactionId:sourceId(r.BATCHNO),transactionType:'Journal',date:day,accountId:account.id,account:account.code,accountName:account.name,accountType:account.type,amount:exact(dr-cr),class_name:sourceDimensions.department,location_name:sourceDimensions.location,customer_name:sourceDimensions.customer,vendor_name:sourceDimensions.vendor,description:str(r.DESCRIPTION??''),reference:str(r.DOCNUMBER??''),sourceDimensions,providerUrl}
 })
 requireThat(rows.length<=5000&&new Set(rows.map(r=>r.id)).size===rows.length,'Intacct detail repeats record numbers or exceeds monthly limits',409)
 const tag=(label:string,day:string)=>'<'+label+'><year>'+day.slice(0,4)+'</year><month>'+day.slice(5,7)+'</month><day>'+day.slice(8)+'</day></'+label+'>'
 const data=await request(key,'<get_trialbalance>'+tag('startdate',from)+tag('enddate',to)+'<reportingbook>ACCRUAL</reportingbook><statistical>exclude</statistical><showzerobalances>true</showzerobalances><showdeptdetail>false</showdeptdetail><showlocdetail>false</showlocdetail><debitcreditbalance>false</debitcreditbalance></get_trialbalance>',entity)
 const trials=array(data.glaccountbalance??data.trialbalance)
 requireThat(trials.length>0,'Intacct omitted its trial balance',502)
 const opening:Record<string,number>={},closing:Record<string,number>={},movement:Record<string,number>={}
 for(const r of rows)movement[r.accountId]=exact((movement[r.accountId]??0)+r.amount)
 for(const t of trials) { const id=sourceId(t.glaccountno);requireThat(chart.some(a=>a.id===id)&&!Object.hasOwn(opening,id),'Intacct trial has an unknown or repeated account',502);opening[id]=cents(t.startbalance);closing[id]=cents(t.endbalance) }
 requireThat(chart.every(a=>Object.hasOwn(opening,a.id)),'Intacct trial balance omitted accounts',502)
 requireThat(Object.values(opening).reduce((n,v)=>exact(n+v),0)===0&&Object.values(closing).reduce((n,v)=>exact(n+v),0)===0,'Intacct trial balance does not sum to zero',409)
 const differences=chart.map(a=>({accountId:a.id,amount:exact((opening[a.id]??0)+(movement[a.id]??0)-(closing[a.id]??0))})).filter(a=>a.amount)
 const trialBalance={opening,movement,closing,automaticClose:{},differences,balanced:differences.length===0,basis:'Entity accrual trial balance: opening plus posted movements equals closing'}
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 return{month,from,to,currency:selected.currency,entity:selected,entities,rows,nonPostingRows:[],chart,dimensions:{...dimensions,classes:dimensions.DEPARTMENT,locations:dimensions.LOCATION,categories:definitions,customers:dimensions.CUSTOMER,vendors:dimensions.VENDOR},trialBalance,digest:sha256(canonicalJson({rows,chart,dimensions,trialBalance,entity:selected}))}
}
