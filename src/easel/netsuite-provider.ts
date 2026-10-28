import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { netsuiteAuthorization, netsuiteHost, type NetSuiteCredentials } from './netsuite-auth'
import { Fault, requireThat, type Data } from './types'
export class NetSuiteFailure extends Fault { constructor(message:string,public httpStatus:number|null=null,public rateLimit:string|null=null){super(502,message)} }
export const netsuiteId=(v:unknown)=>{requireThat(typeof v==='string'&&/^\d{1,20}$/.test(v),'NetSuite returned an invalid identifier',502);return v}
export const netsuiteText=(v:unknown,max=500)=>{requireThat(typeof v==='string'&&v.length<=max,'NetSuite returned invalid metadata',502);return v}
export const exact=(v:number)=>{requireThat(Number.isSafeInteger(v),'NetSuite amounts exceed exact cents',502);return v}
export function netsuiteCents(v:unknown){requireThat(typeof v==='string'&&/^-?\d+(?:\.\d{1,2})?$/.test(v),'NetSuite returned an inexact base-currency amount',502);const [a,b='']=v.replace('-','').split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));requireThat(n<=BigInt(Number.MAX_SAFE_INTEGER),'NetSuite amount exceeds exact cents',502);return Number(n)*(v.startsWith('-')?-1:1)}
const metadata={accounts:'SELECT id, acctnumber AS code, accountsearchdisplayname AS name, accttype AS type, isinactive FROM account ORDER BY id',subsidiaries:'SELECT s.id, s.name, c.symbol AS currency, s.isinactive FROM subsidiary s JOIN currency c ON c.id=s.currency ORDER BY s.id',books:'SELECT id, name, isprimary FROM accountingbook ORDER BY id',periods:"SELECT id, periodname AS name, TO_CHAR(startdate,'YYYY-MM-DD') AS startdate, TO_CHAR(enddate,'YYYY-MM-DD') AS enddate, isyear, isquarter, isadjust, closed FROM accountingperiod ORDER BY id",departments:'SELECT id, name, isinactive FROM department ORDER BY id',classes:'SELECT id, name, isinactive FROM classification ORDER BY id',locations:'SELECT id, name, isinactive FROM location ORDER BY id'} as const
/** Private fixed-query boundary: no API door accepts SQL, origins or provider URLs. */
async function query(key:NetSuiteCredentials,q:string,deadline=Date.now()+90000) {
 const rows:Data[]=[],seen=new Set<string>();let total:number|undefined;let totalBytes=0
 for(let offset=0;offset<=5000;offset+=1000){
  requireThat(Date.now()<deadline,'NetSuite read exceeded its time bound; retry the whole review',409)
  const url=new URL('/services/rest/query/v1/suiteql','https://'+netsuiteHost(key.realm));url.searchParams.set('limit','1000');url.searchParams.set('offset',String(offset))
  let r:Response
  try{r=await fetch(url,{method:'POST',headers:{Authorization:await netsuiteAuthorization(key,'POST',url),Prefer:'transient',Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({q}),redirect:'manual',signal:AbortSignal.timeout(Math.min(20000,Math.max(1,deadline-Date.now())))})}catch{throw new NetSuiteFailure('NetSuite could not be reached; no data accepted')}
  if(r.status!==200){await r.body?.cancel();const retry=r.headers.get('retry-after');throw new NetSuiteFailure(`NetSuite refused a read (HTTP ${r.status}); no data accepted`,r.status,r.status===429?retry&&/^\d{1,6}$/.test(retry)?`Retry after ${retry} seconds`:'Rate limited; retry explicitly later':null)}
  const reader=r.body?.getReader();requireThat(reader,'NetSuite returned empty data',502);const chunks:Uint8Array[]=[];let size=0
  for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;totalBytes+=p.value.length;if(size>8_000_000||totalBytes>16_000_000){await reader.cancel();throw new Fault(409,'NetSuite page exceeds its byte bound')}chunks.push(p.value)}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  let body:Data;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault(502,'NetSuite returned unreadable data')}
  requireThat(body&&Array.isArray(body.items)&&body.offset===offset&&body.count===body.items.length&&body.count<=1000&&typeof body.hasMore==='boolean'&&Number.isSafeInteger(body.totalResults)&&body.totalResults>=0,'NetSuite pagination is incomplete',502)
  total??=body.totalResults;requireThat(total===body.totalResults&&total!<=5000,'NetSuite read changed or exceeds its row bound',409)
  for(const row of body.items){const print=canonicalJson(row);requireThat(!seen.has(print),'NetSuite pagination repeated a source row',502);seen.add(print);rows.push(row)}
  requireThat(rows.length<=total!&&(!body.hasMore||body.count===1000),'NetSuite pagination has a gap',502)
  if(!body.hasMore){requireThat(rows.length===total,'NetSuite pagination omitted source rows',502);return rows}
 }
 throw new Fault(409,'NetSuite read exceeds its page bound')
}
export async function netsuiteMetadata(key:NetSuiteCredentials,deadline=Date.now()+120000){
 const result:Data={}
 for(const [kind,q]of Object.entries(metadata)){
  const rows=await query(key,q,deadline),ids=new Set<string>()
  for(const row of rows){const id=netsuiteId(row.id);requireThat(!ids.has(id),'NetSuite metadata repeats an identifier',502);ids.add(id);if(kind==='accounts'){netsuiteText(row.code,120);netsuiteText(row.type,120)}else netsuiteText(row.name);if(kind==='subsidiaries')requireThat(/^[A-Z]{3}$/.test(row.currency),'NetSuite subsidiary currency is unavailable',502)}
  result[kind]=rows.map(row=>{
   const base={id:row.id,name:netsuiteText(row.name)}
   if(kind==='accounts')return {...base,code:netsuiteText(row.code,120),type:netsuiteText(row.type,120),isinactive:row.isinactive==='T'?'T':'F'}
   if(kind==='subsidiaries')return {...base,currency:row.currency,isinactive:row.isinactive==='T'?'T':'F'}
   if(kind==='books')return {...base,isprimary:row.isprimary==='T'?'T':'F'}
   if(kind==='periods'){for(const flag of ['isyear','isquarter','isadjust','closed'])requireThat(['T','F'].includes(row[flag]),'NetSuite source period flags are incomplete',502);return {...base,startdate:row.startdate,enddate:row.enddate,isyear:row.isyear,isquarter:row.isquarter,isadjust:row.isadjust,closed:row.closed}}
   return {...base,isinactive:row.isinactive==='T'?'T':'F'}
  })
 }
 return result
}
const joins=' FROM TransactionAccountingLine tal JOIN Transaction t ON t.id=tal.transaction JOIN TransactionLine tl ON tl.transaction=tal.transaction AND tl.id=tal.transactionline JOIN AccountingPeriod p ON p.id=t.postingperiod'
export async function netsuitePostings(key:NetSuiteCredentials,book:string,subsidiary:string,periods:string[],deadline=Date.now()+120000){
 book=netsuiteId(book);subsidiary=netsuiteId(subsidiary);const selected=periods.map(netsuiteId);requireThat(selected.length>0&&selected.length<=40,'Select explicit source periods')
 return query(key,"SELECT t.id AS transactionid, t.type AS transactiontype, TO_CHAR(t.trandate,'YYYY-MM-DD') AS date, t.postingperiod AS periodid, tal.transactionline AS lineid, tal.account AS accountid, tal.accountingbook AS bookid, tl.subsidiary AS subsidiaryid, NVL(tal.debit,0) AS debit, NVL(tal.credit,0) AS credit, NVL(t.memo,'') AS memo, NVL(t.tranid,'') AS reference, tl.department AS departmentid, tl.class AS classid, tl.location AS locationid"+joins+` WHERE t.posting='T' AND tal.posting='T' AND tal.accountingbook=${book} AND tl.subsidiary=${subsidiary} AND t.postingperiod IN (${selected.join(',')}) ORDER BY t.postingperiod,t.id,tal.transactionline,tal.account`,deadline)
}
export async function netsuiteTrial(key:NetSuiteCredentials,book:string,subsidiary:string,periods:string[],deadline=Date.now()+120000){
 const selected=periods.map(netsuiteId);if(!selected.length)return []
 return query(key,'SELECT tal.account AS accountid, SUM(NVL(tal.debit,0)-NVL(tal.credit,0)) AS balance'+joins+` WHERE t.posting='T' AND tal.posting='T' AND tal.accountingbook=${netsuiteId(book)} AND tl.subsidiary=${netsuiteId(subsidiary)} AND t.postingperiod IN (${selected.join(',')}) GROUP BY tal.account ORDER BY tal.account`,deadline)
}
export const netsuiteDigest=(v:unknown)=>sha256(canonicalJson(v))
