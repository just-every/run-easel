// Provider-specific read transports. Raw responses never enter the journal.
import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { ownerDestination } from './egress'
import { gustoDate } from './gusto-provider'
import { cents } from './units'
import { choice, Fault, requireThat, text, type Data } from './types'

export const HRIS = ['rippling','willow','bamboohr','adp'] as const
export type Hris = typeof HRIS[number]
export const hrisName: Record<Hris,string> = {rippling:'Rippling',willow:'Willow',bamboohr:'BambooHR',adp:'ADP Workforce Now'}
export const hrisId = (value: unknown): Hris => choice(value,HRIS,'HRIS provider')
export const HRIS_SCOPE = 'Read roster, employment and compensation; no source changes or payroll execution'
export const hrisPurpose = (id:Hris) => `easel:hris:${id}:roster:read:v1`
export type HrisKey = {tenant:string;credential:string;clientId?:string;clientSecret?:string;apiVersion?:string}
export class HrisFailure extends Fault {
 constructor(message:string,public httpStatus:number|null=null){super(502,message)}
}
const sourceId = (value:unknown) => {
 requireThat(typeof value==='string' && /^[\w-]{1,100}$/.test(value) && !['__proto__','prototype','constructor'].includes(value),'Provider returned an invalid employee ID',502)
 return value
}
export function hrisCredentials(id:Hris,b:Data):HrisKey {
 if(id==='adp'){const clientId=text(b.clientId,'ADP client ID',500);requireThat(/^[\w-]+$/.test(clientId),'Use the ADP client ID without whitespace');return {tenant:clientId,credential:'',clientId,clientSecret:text(b.clientSecret,'ADP client secret',2000)}}
 const tenant=text(b.tenant,'Provider company or origin',240)
 if(id==='willow') {
  const url=ownerDestination(tenant,'Willow origin')
  requireThat(url.pathname==='/'&&!url.search,'Use only the Willow installation origin')
 } else requireThat(/^[a-zA-Z0-9-]{1,100}$/.test(tenant),'Use the provider company identifier or BambooHR subdomain')
 const credential=text(b.credential,'Read-only provider credential',2000)
 requireThat(!/\s/.test(credential),'Provider credentials must not contain whitespace')
 return {tenant:id==='willow'?new URL(tenant).origin:tenant,credential,...(id==='rippling'?{apiVersion:gustoDate(b.apiVersion,'Rippling API version')}: {})}
}
const auth = (id:Hris,key:HrisKey) => id==='bamboohr'?`Basic ${btoa(`${key.credential}:x`)}`:`Bearer ${key.credential}`
async function request(id:Hris,key:HrisKey,env:Bindings,url:URL,init:RequestInit={}) {
 let response:Response
 try {
  const fetcher=id==='adp'?env.HRIS_ADP_MTLS?.fetch.bind(env.HRIS_ADP_MTLS):fetch
  requireThat(fetcher,'Configure the ADP mutual-TLS certificate binding before connecting',409)
  response=await fetcher(url.toString(),{...init,headers:{Authorization:auth(id,key),Accept:'application/json',...(id==='rippling'?{'Rippling-Api-Version':key.apiVersion!}:{}),...init.headers},redirect:'manual',signal:AbortSignal.timeout(15000)})
 }catch(error){if(error instanceof Fault)throw error;throw new HrisFailure(`${hrisName[id]} could not be reached; no observations accepted`)}
 if(response.status!==200){await response.body?.cancel();throw new HrisFailure(`${hrisName[id]} refused the read (HTTP ${response.status})${response.status===429?'; rate limited; check explicitly later':''}`,response.status)}
 let raw:string,value:Data
 try{raw=await response.text();requireThat(raw.length<=4_000_000,'Provider response exceeds the read limit',502);value=JSON.parse(raw)}catch{throw new HrisFailure(`${hrisName[id]} returned an unreadable response`,200)}
 requireThat(value&&typeof value==='object','Provider returned an invalid response',502)
 return value
}
async function adpKey(key:HrisKey,env:Bindings) {
 const value=await request('adp',key,env,new URL('https://accounts.adp.com/auth/oauth/v2/token'),{method:'POST',headers:{Authorization:`Basic ${btoa(`${key.clientId}:${key.clientSecret}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'})
 requireThat(value.token_type?.toLowerCase()==='bearer'&&typeof value.access_token==='string'&&!/\s/.test(value.access_token),'ADP did not return an OAuth bearer grant',502)
 return {...key,credential:value.access_token}
}
const list = (value:unknown,label:string):Data[] => {requireThat(Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)),`${label} is unavailable or malformed; check the provider read scopes`,502);return value}
const amount = (value:unknown) => {requireThat(typeof value==='string'||typeof value==='number','Provider compensation is unavailable',502);requireThat(/^\d+(\.\d{1,2})?$/.test(String(value)),'Provider compensation must be exact cents',502);return cents(String(value),'Provider compensation')}
const exact = (value:unknown) => {requireThat(Number.isSafeInteger(value)&&Number(value)>=0,'Provider compensation must be integer cents',502);return Number(value)}
function pay(rate:number,basis:unknown,currency:unknown){
 requireThat(currency==='USD','Provider compensation must explicitly be USD; no exchange rate is inferred',409)
 const unit=String(basis).toLowerCase(),factor=({annual:1,year:1,yearly:1,monthly:12,month:12,weekly:52,week:52} as Data)[unit]
 requireThat(unit==='hour'||unit==='hourly'||factor,'Provider pay frequency is unmapped; no annualization is guessed',409)
 const salaryCents=factor?rate*factor:null
 requireThat(salaryCents===null||Number.isSafeInteger(salaryCents),'Provider salary exceeds exact precision',502)
 return {salaryCents,hourlyRateCents:factor?null:rate}
}
function person(row:Data,fields:Data){
 const start=gustoDate(fields.start,'Provider start date'),termination=fields.termination?gustoDate(fields.termination,'Provider termination date'):''
 requireThat(!termination||termination>=start,'Provider termination predates the current employment',409)
 return {employeeId:sourceId(fields.employeeId),name:text(fields.name,'Provider employee name',240),title:text(fields.title,'Provider job title',240),sourceDepartment:text(fields.sourceDepartment,'Provider department',240),sourceEmploymentType:text(fields.sourceEmploymentType,'Provider employment type',100),employmentType:['W-2','1099'].includes(fields.sourceEmploymentType)?fields.sourceEmploymentType:null,start,termination,...fields.pay,sourceDigest:sha256(canonicalJson(row))}
}
const unknownKeys=(row:Data,known:string[],prefix='')=>Object.keys(row).filter(k=>!known.includes(k)).map(k=>`${prefix}${k}`)
const fieldName=(value:unknown)=>text(value,'Unmapped provider field name',160)
function adpCustom(group:Data|undefined,prefix:string){
 return Object.entries(group??{}).flatMap(([kind,fields])=>Array.isArray(fields)?fields.map(f=>`${prefix}.${kind}.${fieldName(f.nameCode?.codeValue??f.nameCode?.shortName??f.itemID)}`):[`${prefix}.${kind}`])
}
function indexedUnmapped(value:unknown,known:string[],prefix=''):string[]{
 if(known.includes(prefix))return []
 if(value&&typeof value==='object'&&!Object.keys(value).length)return prefix?[prefix]:[]
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,child])=>indexedUnmapped(child,known,prefix?prefix+'.'+key:key))
 return prefix?[prefix]:[]
}
function unmappedPaths(value:unknown,known:string[],prefix=''):string[]{
 if(known.includes(prefix))return []
 if(Array.isArray(value)&&!value.length)return prefix?[prefix]:[]
 if(Array.isArray(value))return [...new Set(value.flatMap(item=>unmappedPaths(item,known,prefix+'[]')))]
 if(value&&typeof value==='object'&&!Object.keys(value).length)return prefix?[prefix]:[]
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,child])=>unmappedPaths(child,known,prefix?prefix+'.'+key:key))
 return prefix?[prefix]:[]
}

/** Complete bounded traversals, including inactive employees. Unknown field names
 * are review evidence; their potentially sensitive values are never persisted. */
export async function readHris(id:Hris,stored:HrisKey,env:Bindings,asOf:string){
 const key=id==='adp'?await adpKey(stored,env):stored
 const roster:Data[]=[],unmappedFields=new Set<string>(),seen=new Set<string>(),pagesSeen=new Set<string>()
 let pages=0
 const add=(raw:Data,fields:Data,unknown:string[])=>{
  const value=person(raw,fields);requireThat(!seen.has(value.employeeId),'Provider returned duplicate employees; completeness is unproven',502);seen.add(value.employeeId);roster.push(value)
  requireThat(roster.length<=5000,'Provider roster exceeds 5000 employees; no partial roster is accepted',409)
  unknown.forEach(k=>unmappedFields.add(fieldName(k)))
 }
 if(id==='willow'){
  let cursor:string|null=null
  do{
   requireThat(++pages<=50,'Willow exceeds the complete read limit',409)
   const url=new URL('/api/willow/v1/employees',key.tenant)
   url.searchParams.set('fields','name,employment,customFields');url.searchParams.set('asOf',asOf);url.searchParams.set('limit','100');if(cursor)url.searchParams.set('cursor',cursor)
   const value=await request(id,key,env,url)
   requireThat(value.apiVersion==='1'&&value.resetRequired===false,'Willow population changed; start a fresh full preview',409)
   for(const row of list(value.data,'Willow employees')){
    requireThat(!row.withheld?.length,'Willow withheld required employment or compensation fields',409)
    const employments=list(row.employment,'Willow employment').filter(e=>e.startDate<=asOf).sort((a,b)=>b.startDate.localeCompare(a.startDate))
    const current=employments[0];requireThat(current&&employments.filter(e=>e.startDate===current.startDate).length===1,'Willow employment is missing or ambiguous',409)
    const ended=!!current.endDate&&current.endDate<=asOf
    const effectiveAt=ended?current.endDate:asOf
    const terms=list(current.terms,'Willow terms').filter(t=>t.status==='approved'&&t.effectiveFrom<=effectiveAt&&(ended||t.inForce===true)).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))
    requireThat(terms[0]?.pay&&terms.filter(t=>t.effectiveFrom===terms[0].effectiveFrom).length===1&& (ended||terms.length===1),'Willow needs one readable applicable approved compensation record',409)
    const term=terms[0],termination=current.endDate?new Date(Date.parse(gustoDate(current.endDate))+86400000).toISOString().slice(0,10):''
    add(row,{employeeId:row.id,name:row.name,title:term.jobTitle,sourceDepartment:term.department?.name,sourceEmploymentType:current.employmentType,start:current.startDate,termination,pay:pay(exact(term.pay.amountCents),term.pay.basis,term.pay.currency)},[...unknownKeys(row,['id','name','employment','customFields','withheld']),...list(row.customFields?.fields,'Willow custom fields').map(f=>`customFields.${f.key}`),...unmappedPaths(row.employment,['[].startDate','[].endDate','[].employmentType','[].terms[].jobTitle','[].terms[].department.name','[].terms[].pay.amountCents','[].terms[].pay.basis','[].terms[].pay.currency'])])
   }
   requireThat(value.nextCursor===null||typeof value.nextCursor==='string'&&value.nextCursor.length>0,'Willow pagination metadata is missing',502)
   cursor=value.nextCursor
   if(cursor){requireThat(!pagesSeen.has(cursor),'Willow repeated its cursor',502);pagesSeen.add(cursor)}else requireThat(typeof value.syncCursor==='string'&&value.syncCursor.length>0,'Willow did not confirm a complete sync',502)
  }while(cursor)
 }else if(id==='bamboohr'){
  const base=`https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(key.tenant)}/v1/`
  const meta=list(await request(id,key,env,new URL(base+'meta/fields')),'BambooHR field metadata')
  const fields=['id','firstName','lastName','department','jobTitle','employmentHistoryStatus','hireDate','terminationDate','payRate','payType','payPer','payRateCurrency','status']
  for(const field of meta){const name=String(field.alias??field.id);if(!fields.includes(name))unmappedFields.add(fieldName(name))}
  const custom=meta.filter(f=>String(f.alias??'').startsWith('custom')).map(f=>String(f.alias))
  // This documented POST is a read-only report request, never a source write.
  const value=await request(id,key,env,new URL(base+'reports/custom?format=JSON'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Easel read-only roster',fields:[...fields,...custom]})})
  const returned=list(value.fields,'BambooHR report fields').map(f=>String(f.id??f.alias))
  requireThat([...fields,...custom].every(f=>returned.includes(f)),'BambooHR omitted requested report fields; check read permissions',409)
  const rows=list(value.employees,'BambooHR report employees');requireThat(rows.length<5000,'BambooHR report may be truncated; no partial roster is accepted',409);pages=1
  for(const row of rows){
   requireThat(row.status==='Active'||row.status==='Inactive'&&row.terminationDate,'BambooHR inactive employment needs its termination date; no departure date is guessed',409)
   const match=String(row.payRate??'').match(/^(\d+(?:\.\d{1,2})?)(?: (USD))?$/)
   requireThat(match,'BambooHR compensation is unavailable or ambiguous',409)
   add(row,{employeeId:String(row.id),name:`${text(row.firstName,'BambooHR first name')} ${text(row.lastName,'BambooHR last name')}`,title:row.jobTitle,sourceDepartment:row.department,sourceEmploymentType:row.employmentHistoryStatus,start:row.hireDate,termination:row.terminationDate,pay:pay(amount(match[1]),row.payPer??row.payType,row.payRateCurrency??match[2])},unmappedPaths(row,fields))
  }
 }else if(id==='rippling'){
  const expanded='user,employment_type,compensation,department,custom_fields,legal_entity'
  let next:URL|null=new URL('https://rest.ripplingapis.com/workers/?limit=100&expand='+expanded)
  do{
   requireThat(++pages<=50,'Rippling exceeds the complete read limit',409)
   const value=await request(id,key,env,next)
   requireThat(!value.__meta?.redacted_fields?.length,'Rippling withheld fields; complete roster authority is required',409)
   for(const row of list(value.results,'Rippling workers')){
    const comp=row.compensation,type=row.employment_type
    requireThat(row.status!=='TERMINATED'||row.end_date,'Rippling departure needs its end date',409)
    requireThat(comp&&gustoDate(comp.salary_effective_date,'Rippling salary effective date')<=asOf,'Rippling compensation is unavailable on the observation date',409)
    requireThat(row.legal_entity?.company_id===key.tenant,'Rippling returned a worker from another company',409)
    requireThat(['HOURLY','SALARIED'].includes(type?.compensation_time_period),'Rippling compensation basis is unavailable',409)
    const hourly=type.compensation_time_period==='HOURLY',rate=hourly?comp.hourly_wage:comp.annual_compensation
    add(row,{employeeId:row.id,name:row.user?.name?.formatted,title:row.title,sourceDepartment:row.department?.name,sourceEmploymentType:type.type,start:row.start_date,termination:row.end_date,pay:pay(amount(rate?.value),hourly?'hour':'year',rate?.currency_type)},[
     ...unmappedPaths(row,['id','user.name.formatted','title','department.name','employment_type.type','employment_type.compensation_time_period','start_date','end_date','compensation.salary_effective_date',`compensation.${hourly?'hourly_wage':'annual_compensation'}.value`,`compensation.${hourly?'hourly_wage':'annual_compensation'}.currency_type`,'legal_entity.company_id','custom_fields']),
     ...list(row.custom_fields,'Rippling custom fields').map((f:Data)=>`custom_fields.${fieldName(f.name??f.custom_field?.name??f.custom_field_id??f.id)}`),
    ])
   }
   requireThat(value.next_link===null||typeof value.next_link==='string'&&value.next_link.length>0,'Rippling pagination metadata is missing',502)
   next=value.next_link?new URL(value.next_link):null
   if(next){
    requireThat(next.origin==='https://rest.ripplingapis.com'&&next.pathname==='/workers/'&&!next.username&&!next.password&&!next.hash&&[...next.searchParams.keys()].every(k=>['cursor','limit','expand'].includes(k)),'Rippling returned an unsafe next page',502)
    const cursor=next.searchParams.get('cursor');requireThat(cursor&&cursor.length<=4000&&!pagesSeen.has(cursor),'Rippling returned a missing or repeated cursor',502);pagesSeen.add(cursor)
    // Keep the reviewed expansion and page size even if the next link omits them.
    next=new URL('https://rest.ripplingapis.com/workers/?limit=100&expand='+expanded);next.searchParams.set('cursor',cursor)
   }
  }while(next)
 }else{
  let total=-1
  for(let skip=0;;skip+=100){
   requireThat(++pages<=50,'ADP exceeds the complete read limit',409)
   const value=await request(id,key,env,new URL(`https://api.adp.com/hr/v2/workers?$top=100&$skip=${skip}`))
   const count=value.meta?.totalNumber;requireThat(Number.isSafeInteger(count)&&count>=0&&count<=5000&&(total<0||total===count),'ADP worker count is missing or changed',502);total=count
   const rows=list(value.workers,'ADP workers');requireThat(rows.length===Math.min(100,total-skip),'ADP returned an incomplete worker page',502)
   for(const row of rows){
    const assignments=list(row.workAssignments,'ADP assignments'),primary=assignments.filter(a=>a.primaryIndicator===true)
    requireThat(primary.length===1,'ADP needs exactly one primary work assignment',409)
    requireThat(row.workerStatus?.statusCode?.codeValue!=='Terminated'||row.workerDates?.terminationDate,'ADP departure needs its termination date',409)
    const job=primary[0],salary=job.baseRemuneration?.annualRateAmount,hourly=job.baseRemuneration?.hourlyRateAmount
    requireThat(Boolean(salary)!==Boolean(hourly),'ADP compensation is missing or ambiguous',409)
    const dept=list(job.homeOrganizationalUnits,'ADP organizational units').filter(d=>d.typeCode?.codeValue==='Department')
    requireThat(dept.length===1,'ADP department is missing or ambiguous',409)
    add(row,{employeeId:row.associateOID,name:row.person?.legalName?.formattedName??[row.person?.legalName?.givenName1,row.person?.legalName?.middleName,row.person?.legalName?.familyName1,row.person?.legalName?.familyName2].filter(Boolean).join(' '),title:job.jobTitle,sourceDepartment:dept[0].nameCode?.longName,sourceEmploymentType:job.workerTypeCode?.codeValue,start:row.workerDates?.rehireDate||row.workerDates?.originalHireDate,termination:row.workerDates?.terminationDate,pay:pay(amount((salary??hourly).amountValue),salary?'annual':'hourly',(salary??hourly).currencyCode)},[...job.homeOrganizationalUnits.filter((unit:Data)=>unit!==dept[0]).map((unit:Data)=>`workAssignments.${assignments.indexOf(job)}.homeOrganizationalUnits.${fieldName(unit.typeCode?.codeValue??'untyped')}`),...adpCustom(row.customFieldGroup,'customFieldGroup'),...adpCustom(row.person?.customFieldGroup,'person.customFieldGroup'),...adpCustom(job.customFieldGroup,'workAssignment.customFieldGroup'),...indexedUnmapped(row,['associateOID','workerStatus.statusCode.codeValue',`workerDates.${row.workerDates?.rehireDate?'rehireDate':'originalHireDate'}`,'workerDates.terminationDate',...(row.person?.legalName?.formattedName?['person.legalName.formattedName']:['givenName1','middleName','familyName1','familyName2'].map(k=>'person.legalName.'+k)),...['primaryIndicator','jobTitle','workerTypeCode.codeValue',`homeOrganizationalUnits.${job.homeOrganizationalUnits.indexOf(dept[0])}.typeCode.codeValue`,`homeOrganizationalUnits.${job.homeOrganizationalUnits.indexOf(dept[0])}.nameCode.longName`,`baseRemuneration.${salary?'annualRateAmount':'hourlyRateAmount'}.amountValue`,`baseRemuneration.${salary?'annualRateAmount':'hourlyRateAmount'}.currencyCode`].map(path=>`workAssignments.${assignments.indexOf(job)}.${path}`)])])
   }
   if(skip+rows.length===total)break
  }
 }
 roster.sort((a,b)=>a.employeeId.localeCompare(b.employeeId))
 return {roster,unmappedFields:[...unmappedFields].sort(),complete:true,employeeCount:roster.length,pages,sourceDigest:sha256(canonicalJson(roster))}
}
