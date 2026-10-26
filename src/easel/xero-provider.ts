import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { reconcileQboTrial } from './qbo-trial'
import { Fault, requireThat, type Data } from './types'
export type XeroCredentials={environment:'production';realmId:string;clientId:string;clientSecret:string;accessToken:string;refreshToken:string;expiresAt:number}
export type XeroLedgerRow={id:string;transactionId:string;transactionType:string;date:string;accountId:string;account:string;accountName:string;accountType:string;amount:number;class_name:string;location_name:string;customer_name:string;vendor_name:string;description:string;reference:string}
const TRIAL=['Reports','TrialBalance'].join('/')
export class XeroFailure extends Fault{constructor(message:string,public httpStatus:number|null=null,public rateLimit:string|null=null){super(502,message)}}
const id=(v:unknown)=>{requireThat(typeof v==='string'&&/^[A-Za-z0-9-]{1,120}$/.test(v),'Xero returned an invalid source identifier',502);return v}
const str=(v:unknown,max=500)=>{requireThat(typeof v==='string'&&v.length<=max,'Xero returned invalid source text',502);return v}
const exact=(v:number)=>{requireThat(Number.isSafeInteger(v),'Xero amounts exceed exact cents',502);return v}
function cents(v:unknown){const s=String(v??'');requireThat(/^-?\d+(?:\.\d{1,2})?$/.test(s),'Xero returned an inexact amount',502);const [a,b='']=s.replace('-','').split('.');return exact((s.startsWith('-')?-1:1)*(Number(a)*100+Number(b.padEnd(2,'0'))))}
function sourceDate(v:unknown){const s=str(v),m=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(s);const d=m?new Date(Number(m[1])).toISOString().slice(0,10):s.slice(0,10);requireThat(/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d,'Xero returned an invalid date',502);return d}
export async function xeroRequest(key:XeroCredentials,resource:string,query:Record<string,string>={}):Promise<Data>{
 requireThat(['Organisation','Accounts','TrackingCategories','Contacts','Journals',TRIAL].includes(resource),'Unsupported Xero read')
 id(key.realmId)
 const url=new URL('/api.xro/2.0/'+resource,'https://api.xero.com');url.search=new URLSearchParams(query).toString()
 let r:Response
 try{r=await fetch(url,{headers:{Authorization:`Bearer ${key.accessToken}`,'xero-tenant-id':key.realmId,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{throw new XeroFailure('Xero could not be reached; no data accepted')}
 if(r.status!==200){await r.body?.cancel();const retry=r.headers.get('retry-after');throw new XeroFailure(`Xero refused a read (HTTP ${r.status}); no data accepted`,r.status,r.status===429?retry&&/^\d{1,6}$/.test(retry)?`Retry after ${retry} seconds`:'Rate limited; retry explicitly later':null)}
 const reader=r.body?.getReader();requireThat(reader,'Xero returned empty data',502)
 const chunks:Uint8Array[]=[];let size=0
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>8_000_000){await reader.cancel();throw new Fault(409,'Xero monthly read exceeds its byte limit')}chunks.push(p.value)}
 const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.length}
 let body:Data;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault(502,'Xero returned unreadable data')}
 requireThat(body&&typeof body==='object'&&!body.ErrorNumber,'Xero returned invalid data',502);return body
}
const list=(v:unknown,label:string):Data[]=>{requireThat(Array.isArray(v),`Xero ${label} are incomplete`,502);return v}
function trial(body:Data,chart:Map<string,Data>){
 const reports=list(body.Reports,'trial reports');requireThat(reports.length===1&&reports[0].ReportType==='TrialBalance','Xero trial balance report is unavailable',502)
 let debit=-1,credit=-1;const balance=new Map<string,number>()
 const walk=(rows:Data[])=>{for(const r of rows){
  if(r.RowType==='Header'){const values=list(r.Cells,'report columns').map(c=>c.Value);debit=values.indexOf('YTD Debit');credit=values.indexOf('YTD Credit');requireThat(debit>=0&&credit>=0,'Xero trial balance needs year-to-date columns',502)}
  if(r.RowType==='Row'){
   const cells=list(r.Cells,'report cells');requireThat(debit>=0&&credit>=0&&cells.length>Math.max(debit,credit),'Xero trial balance columns changed',502)
   const source=id(cells[0].Attributes?.find((a:Data)=>a.Id==='account')?.Value)
   requireThat(chart.has(source)&&!balance.has(source),'Xero trial balance has an unknown or repeated account',502)
   const dr=cents(cells[debit].Value||0),cr=cents(cells[credit].Value||0);requireThat(dr>=0&&cr>=0&&!(dr&&cr),'Xero trial balance has invalid debit or credit',502);balance.set(source,exact(dr-cr))
  }
  if(r.Rows)walk(list(r.Rows,'report sections'))
 }}
 walk(list(reports[0].Rows,'trial rows'))
 requireThat(debit>=0&&credit>=0&&[...balance.values()].reduce((n,v)=>exact(n+v),0)===0,'Xero trial balance does not reconcile',409)
 return balance
}
export async function readXeroLedger(key:XeroCredentials,month:string,asOf=new Date().toISOString().slice(0,10)){
 requireThat(typeof month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month),'Choose a Xero month')
 const from=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10),to=end<asOf?end:asOf
 requireThat(from<=to,'Choose a month that has started')
 const before=new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10)
 const orgs=list((await xeroRequest(key,'Organisation')).Organisations,'organisations');requireThat(orgs.length===1,'Xero organisation metadata is ambiguous',502)
 const org=orgs[0],currency=str(org.BaseCurrency,3);requireThat(/^[A-Z]{3}$/.test(currency),'Xero returned invalid currency',502)
 const chart=new Map<string,Data>(),codes=new Set<string>()
 for(const a of list((await xeroRequest(key,'Accounts')).Accounts,'accounts')){
  const accountId=id(a.AccountID),code=str(a.Code,120);requireThat(!chart.has(accountId)&&!codes.has(code),'Xero returned duplicate accounts',502)
  chart.set(accountId,{id:accountId,code,name:str(a.Name),type:str(a.Type),subtype:a.SystemAccount==='RETAINEDEARNINGS'?'RetainedEarnings':''});codes.add(code)
 }
 const categories=list((await xeroRequest(key,'TrackingCategories',{includeArchived:'true'})).TrackingCategories,'tracking categories')
 requireThat(categories.length<=2,'Xero has more tracking categories than this mapping supports',409)
 categories.sort((a,b)=>id(a.TrackingCategoryID).localeCompare(id(b.TrackingCategoryID)))
 const normalized=categories.map(c=>({id:id(c.TrackingCategoryID),name:str(c.Name),options:list(c.Options,'tracking options').map(o=>({id:id(o.TrackingOptionID),name:str(o.Name)}))}))
 const contacts:Data[]=[]
 for(let page=1;page<=50;page++){const batch=list((await xeroRequest(key,'Contacts',{page:String(page),includeArchived:'true'})).Contacts,'contacts');for(const c of batch)contacts.push({id:id(c.ContactID),name:str(c.Name)});if(batch.length<100)break;requireThat(page<50,'Xero contacts pagination exceeded its limit',409)}
 const dimensions={classes:normalized[0]?.options??[],locations:normalized[1]?.options??[],categories:normalized,customers:contacts,vendors:[]}
 const rows:XeroLedgerRow[]=[],seen=new Set<string>();let offset=0
 for(let page=0;page<100;page++){
  const batch=list((await xeroRequest(key,'Journals',{offset:String(offset)})).Journals,'journals')
  for(const j of batch){
   const journalId=id(j.JournalID);requireThat(!seen.has(journalId)&&Number.isSafeInteger(j.JournalNumber)&&j.JournalNumber>offset,'Xero journal pagination repeated or moved backwards',502);seen.add(journalId)
   const date=sourceDate(j.JournalDate);if(date<from||date>to)continue
   let sum=0
   for(const line of list(j.JournalLines,'journal lines')){
    const accountId=id(line.AccountID),account=chart.get(accountId);requireThat(account,'Xero journal has an unknown account',502)
    const tracking=list(line.TrackingCategories??[],'journal tracking')
    requireThat(tracking.every(t=>normalized.some(c=>c.id===t.TrackingCategoryID))&&new Set(tracking.map(t=>t.TrackingCategoryID)).size===tracking.length,'Xero journal tracking is unknown or ambiguous',502)
    const option=(index:number)=>{const cat=normalized[index];if(!cat)return '';const t=tracking.find(t=>t.TrackingCategoryID===cat.id);if(!t)return '';const name=str(t.Option);requireThat(cat.options.some(o=>o.name===name),'Xero journal tracking option is unknown',502);return name}
    const amount=cents(line.NetAmount);sum=exact(sum+amount)
    rows.push({id:id(line.JournalLineID),transactionId:journalId,transactionType:'Journal',date,accountId,account:account.code,accountName:account.name,accountType:account.type,amount,class_name:option(0),location_name:option(1),customer_name:'',vendor_name:'',description:str(line.Description??''),reference:String(j.JournalNumber)})
   }
   requireThat(sum===0,'Xero journal does not balance',409)
  }
  if(batch.length<100)break
  const next=batch.at(-1)!.JournalNumber;requireThat(next>offset&&page<99,'Xero journal pagination exceeded its read limit',409);offset=next
 }
 requireThat(rows.length<=5000&&new Set(rows.map(r=>r.id)).size===rows.length,'Xero monthly journal lines exceed limits or repeat',409)
 const opening=trial(await xeroRequest(key,TRIAL,{date:before,paymentsOnly:'false'}),chart),closing=trial(await xeroRequest(key,TRIAL,{date:to,paymentsOnly:'false'}),chart),movement=new Map<string,number>()
 for(const r of rows)movement.set(r.accountId,exact((movement.get(r.accountId)??0)+r.amount))
 const types:Record<string,string>={REVENUE:'Income',SALES:'Income',OTHERINCOME:'Other Income',EXPENSE:'Expense',OVERHEADS:'Expense',DEPRECIATN:'Expense',DIRECTCOSTS:'Cost of Goods Sold',EQUITY:'Equity'}
 const reconciledChart=new Map([...chart].map(([k,v])=>[k,{...v,type:types[v.type]??v.type}]))
 const startMonth=Number(org.FinancialYearEndMonth)%12+1
 const fiscal=['January','February','March','April','May','June','July','August','September','October','November','December'][startMonth-1]
 const trialBalance=reconcileQboTrial(reconciledChart,opening,movement,closing,from,fiscal)
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 return{month,from,to,currency,rows,nonPostingRows:[],chart:[...chart.values()],dimensions,trialBalance,digest:sha256(canonicalJson({rows,chart:[...chart.values()],dimensions,trialBalance}))}
}
