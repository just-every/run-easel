import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { Fault, requireThat, type Data } from './types'

export type NetsuiteCredentials = { realmId:string; environment:string; consumerKey:string; consumerSecret:string; tokenId:string; tokenSecret:string; roleId:string }
export type NetsuiteLedgerRow = { id:string; transactionId:string; transactionType:string; date:string; accountId:string; account:string; accountName:string; accountType:string; amount:number; class_name:string; location_name:string; department_name:string; subsidiaryId:string; sourceDate:string; customer_name:string; vendor_name:string; description:string; reference:string }
export const NETSUITE_PURPOSE='easel:netsuite:suiteql:tba:v1'
export const NETSUITE_READS='SuiteQL SELECT: primary accounting book, accounts, subsidiaries, departments, classes, locations, accounting periods and posted accounting lines'
export class NetsuiteFailure extends Fault { constructor(message:string,public httpStatus:number|null=null,public rateLimit:string|null=null){super(502,message)} }
export function netsuiteHost(realm:unknown) {
 requireThat(typeof realm==='string'&&/^[A-Za-z0-9]+(?:_(?:SB|RP)\d+)?$/.test(realm),'Use the NetSuite account ID, including its sandbox suffix')
 return realm.toLowerCase().replaceAll('_','-')+'.suitetalk.api.netsuite.com'
}
export const sourceId=(v:unknown)=>{requireThat((typeof v==='string'||typeof v==='number')&&/^[1-9]\d{0,14}$/.test(String(v)),'NetSuite returned an invalid source identifier',502);return String(v)}
const str=(v:unknown,max=500)=>{requireThat(typeof v==='string'&&v.length<=max,'NetSuite returned invalid source text',502);return v}
const exact=(n:number)=>{requireThat(Number.isSafeInteger(n),'NetSuite amounts exceed exact cents',502);return n}
function cents(v:unknown){const s=String(v??'');requireThat(/^-?\d+(?:\.\d{1,2})?$/.test(s),'NetSuite returned an inexact amount',502);const[a,b='']=s.replace('-','').split('.');return exact((s.startsWith('-')?-1:1)*(Number(a)*100+Number(b.padEnd(2,'0'))))}
const enc=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())
async function authorization(key:NetsuiteCredentials,url:URL){
 const parameters:Record<string,string>={oauth_consumer_key:key.consumerKey,oauth_token:key.tokenId,oauth_nonce:crypto.randomUUID().replaceAll('-',''),oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA256',oauth_version:'1.0'}
 const pairs=[...url.searchParams.entries(),...Object.entries(parameters)].map(([k,v])=>[enc(k),enc(v)]).sort(([a,av],[b,bv])=>(a<b?-1:a>b?1:av<bv?-1:av>bv?1:0))
 const base=['POST',enc(url.origin+url.pathname),enc(pairs.map(([k,v])=>k+'='+v).join('&'))].join('&')
 const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(enc(key.consumerSecret)+'&'+enc(key.tokenSecret)),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature=await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(base))
 parameters.oauth_signature=btoa(String.fromCharCode(...new Uint8Array(signature)))
 return 'OAuth realm="'+enc(key.realmId)+'", '+Object.entries(parameters).map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ')
}
/** Only internal, fixed SELECTs reach this network edge. Never follows provider links or redirects. */
async function query(key:NetsuiteCredentials,sql:string,max=10000):Promise<Data[]> {
 const rows:Data[]=[]
 let expectedTotal:number|undefined
 for(let offset=0;offset<=max;offset+=1000){
  const url=new URL(`https://${netsuiteHost(key.realmId)}/services/rest/query/v1/suiteql?limit=1000&offset=${offset}`)
  let response:Response
  try{response=await fetch(url,{method:'POST',headers:{Authorization:await authorization(key,url),'Content-Type':'application/json',Accept:'application/json',Prefer:'transient'},body:JSON.stringify({q:sql}),redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{throw new NetsuiteFailure('NetSuite could not be reached; no data accepted')}
  if(response.status!==200){await response.body?.cancel();const retry=response.headers.get('retry-after');throw new NetsuiteFailure(`NetSuite refused a read (HTTP ${response.status}); no data accepted`,response.status,response.status===429?retry&&/^\d{1,6}$/.test(retry)?`Retry after ${retry} seconds`:'Rate limited; retry explicitly later':null)}
  const reader=response.body?.getReader();requireThat(reader,'NetSuite returned empty data',502)
  const chunks:Uint8Array[]=[];let size=0
  for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>8_000_000){await reader.cancel();throw new Fault(409,'NetSuite read exceeds its byte limit')}chunks.push(p.value)}
  const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.length}
  let body:Data;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new NetsuiteFailure('NetSuite returned unreadable data')}
  requireThat(body&&Array.isArray(body.items)&&typeof body.hasMore==='boolean'&&body.offset===offset&&body.count===body.items.length&&body.count<=1000,'NetSuite pagination is incomplete or changed',502)
  requireThat(Number.isSafeInteger(body.totalResults)&&body.totalResults>=offset+body.count&&(expectedTotal===undefined||expectedTotal===body.totalResults),'NetSuite result count changed during pagination',502)
  expectedTotal=body.totalResults
  requireThat(body.hasMore===(offset+body.count<body.totalResults),'NetSuite result pages are incomplete',502)
  rows.push(...body.items);requireThat(rows.length<=max,'NetSuite read exceeds its row limit; narrow the source period',409)
  if(!body.hasMore)return rows
  requireThat(body.count===1000&&rows.length<max,'NetSuite pagination is incomplete or exceeds its limit',409)
 }
 throw new Fault(409,'NetSuite pagination exceeded its limit')
}
export async function netsuiteInventory(key:NetsuiteCredentials){
 const chart=(await query(key,'SELECT id, acctnumber AS code, acctname AS name, accttype AS type FROM account ORDER BY id')).map(a=>({id:sourceId(a.id),code:a.code===null||a.code===''?`netsuite:${sourceId(a.id)}`:str(a.code,120),name:str(a.name),type:str(a.type)}))
 requireThat(new Set(chart.map(a=>a.id)).size===chart.length&&new Set(chart.map(a=>a.code)).size===chart.length,'NetSuite accounts have duplicate IDs or codes',502)
 const subsidiaries=(await query(key,'SELECT s.id, s.name, c.symbol AS currency FROM subsidiary s JOIN currency c ON c.id=s.currency ORDER BY s.id')).map(s=>({id:sourceId(s.id),name:str(s.name),currency:str(s.currency,3)}))
 requireThat(subsidiaries.length>0&&subsidiaries.every(s=>/^[A-Z]{3}$/.test(s.currency))&&new Set(subsidiaries.map(s=>s.id)).size===subsidiaries.length,'NetSuite subsidiaries are incomplete',502)
 const dimensions:Record<string,Data[]>={}
 for(const [kind,table]of [['departments','department'],['classes','classification'],['locations','location']]){
  const values=(await query(key,`SELECT id, name FROM ${table} ORDER BY id`)).map(d=>({id:sourceId(d.id),name:str(d.name)}))
  requireThat(new Set(values.map(d=>d.id)).size===values.length&&new Set(values.map(d=>d.name)).size===values.length,'NetSuite dimension IDs repeat',502);dimensions[kind]=values
 }
 const books=await query(key,"SELECT id FROM accountingbook WHERE isprimary='T' ORDER BY id")
 requireThat(books.length===1,'NetSuite needs exactly one primary accounting book',409)
 return{chart,subsidiaries,dimensions,book:sourceId(books[0].id)}
}
const date=(v:unknown)=>{const s=str(v,10);requireThat(/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s,'NetSuite returned an invalid date',502);return s}
export async function readNetsuiteLedger(key:NetsuiteCredentials,month:string,subsidiaryId:string,asOf:string){
 requireThat(typeof month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month),'Choose a NetSuite month')
 sourceId(subsidiaryId)
 const from=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10),to=end<asOf?end:asOf
 requireThat(from<=to,'Choose a month that has started')
 const inventory=await netsuiteInventory(key),subsidiary=inventory.subsidiaries.find(s=>s.id===subsidiaryId)
 requireThat(subsidiary,'The selected NetSuite subsidiary is no longer available',409)
 const periods=await query(key,`SELECT id, TO_CHAR(startdate,'YYYY-MM-DD') AS start_date, TO_CHAR(enddate,'YYYY-MM-DD') AS end_date FROM accountingperiod WHERE startdate=TO_DATE('${from}','YYYY-MM-DD') AND enddate=TO_DATE('${end}','YYYY-MM-DD') AND isadjust='F' AND isquarter='F' AND isyear='F' ORDER BY id`)
 requireThat(periods.length===1&&date(periods[0].start_date)===from&&date(periods[0].end_date)===end,'NetSuite needs one ordinary monthly accounting period; review adjustment or nonmonthly periods separately',409)
 const periodId=sourceId(periods[0].id),chart=new Map(inventory.chart.map(a=>[a.id,a]))
 const joins='FROM transactionaccountingline tal JOIN transaction t ON t.id=tal.transaction JOIN transactionline tl ON tl.transaction=tal.transaction AND tl.id=tal.transactionline JOIN accountingperiod ap ON ap.id=t.postingperiod'
 const where=`tal.posting='T' AND t.posting='T' AND tal.accountingbook=${inventory.book} AND tl.subsidiary=${subsidiaryId}`
 const amount='NVL(tal.debit,0)-NVL(tal.credit,0)'
 const raw=await query(key,`SELECT t.id AS transaction_id, t.type AS transaction_type, tl.id AS line_id, tal.account AS account_id, TO_CHAR(t.trandate,'YYYY-MM-DD') AS source_date, tl.department AS department_id, tl.class AS class_id, tl.location AS location_id, SUM(${amount}) AS amount ${joins} WHERE ${where} AND t.postingperiod=${periodId} AND t.trandate<=TO_DATE('${to}','YYYY-MM-DD') GROUP BY t.id,t.type,tl.id,tal.account,t.trandate,tl.department,tl.class,tl.location ORDER BY t.id,tl.id,tal.account`,5000)
 const seen=new Set<string>()
 const dimension=(kind:string,id:unknown)=>{if(id===null||id===undefined||id==='')return '';const value=inventory.dimensions[kind].find(d=>d.id===sourceId(id));requireThat(value,`NetSuite line has an unknown ${kind} member`,502);return value.name as string}
 const rows:NetsuiteLedgerRow[]=raw.map(r=>{
  const transactionId=sourceId(r.transaction_id),accountId=sourceId(r.account_id),account=chart.get(accountId),line=String(r.line_id)
  requireThat(account&&/^\d{1,15}$/.test(line),'NetSuite line has an unknown account or invalid line ID',502)
  const id=`${transactionId}:${line}:${accountId}`,sourceDate=date(r.source_date)
  requireThat(!seen.has(id),'NetSuite repeated a posting identity',502);seen.add(id)
  return{id,transactionId,transactionType:str(r.transaction_type,80),date:sourceDate<from?from:sourceDate>to?to:sourceDate,sourceDate,accountId,account:account.code,accountName:account.name,accountType:account.type,amount:cents(r.amount),department_name:dimension('departments',r.department_id),class_name:dimension('classes',r.class_id),location_name:dimension('locations',r.location_id),subsidiaryId,customer_name:'',vendor_name:'',description:'Posted NetSuite accounting line',reference:transactionId}
 })
 async function trial(boundary:string){
  const raw=await query(key,`SELECT tal.account AS account_id, SUM(${amount}) AS amount ${joins} WHERE ${where} AND ${boundary} GROUP BY tal.account ORDER BY tal.account`)
  const balances:Record<string,number>={}
  for(const r of raw){const id=sourceId(r.account_id);requireThat(chart.has(id)&&!Object.hasOwn(balances,id),'NetSuite trial balance has an unknown or repeated account',502);balances[id]=cents(r.amount)}
  requireThat(Object.values(balances).reduce((n,a)=>exact(n+a),0)===0,'NetSuite source trial balance does not sum to zero',409)
  return balances
 }
 const opening=await trial(`ap.startdate<TO_DATE('${from}','YYYY-MM-DD')`)
 const closing=await trial(`ap.startdate<=TO_DATE('${from}','YYYY-MM-DD') AND (t.postingperiod<>${periodId} OR t.trandate<=TO_DATE('${to}','YYYY-MM-DD'))`)
 const movement:Record<string,number>={};for(const r of rows)movement[r.accountId]=exact((movement[r.accountId]??0)+r.amount)
 const differences=inventory.chart.map(a=>({account:a.id,code:a.code,difference:exact((opening[a.id]??0)+(movement[a.id]??0)-(closing[a.id]??0))})).filter(a=>a.difference!==0)
 const trialBalance={opening,movement,closing,automaticClose:{},differences,balanced:!differences.length,basis:'Primary-book posted accounting lines by posting period, debit-positive; source opening plus reviewed movement equals source closing for this subsidiary.'}
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 return{month,from,to,currency:subsidiary.currency,subsidiary,periodId,rows,nonPostingRows:[],chart:inventory.chart,dimensions:{departments:inventory.dimensions.departments,classes:inventory.dimensions.classes,locations:inventory.dimensions.locations,customers:[],vendors:[],categories:[]},inventory,trialBalance,digest:sha256(canonicalJson({rows,inventory,periodId,trialBalance}))}
}
