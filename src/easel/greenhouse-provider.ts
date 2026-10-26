// Fixed Harvest read boundary. Credentials never travel to a supplied URL.
import { Fault, requireThat, text, type Data } from './types'
import { cents } from './units'
export const GREENHOUSE_PURPOSE='easel:greenhouse:harvest:read:v1'
export class GreenhouseFailure extends Fault { constructor(message:string,public httpStatus:number|null=null){super(502,message)} }
export const GREENHOUSE_SCOPE='Read jobs, openings, offers and accepted candidate names; manual pulls only'
export function greenhouseKey(value:unknown) { const key=text(value,'Greenhouse Harvest API key',2000); requireThat(!/\s/.test(key),'Use an API key without whitespace');return key }
export function greenhouseId(value:unknown) { requireThat(/^\d{1,16}$/.test(String(value)),'Use a numeric Greenhouse ID');return String(value) }
export async function greenhouseRead(key:string,path:string) {
 let r:Response
 try { r=await fetch(`https://harvest.greenhouse.io/v1/${path}`,{headers:{Authorization:`Basic ${btoa(`${key}:`)}`,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)}) }
 catch { throw new GreenhouseFailure('Greenhouse could not be reached; no plan changes were accepted') }
 if(r.status!==200){await r.body?.cancel();throw new GreenhouseFailure(`Greenhouse refused the read (HTTP ${r.status}); check Harvest read permissions and retry explicitly`,r.status)}
 const raw=await r.text();requireThat(raw.length<=4_000_000,'Greenhouse response exceeds the manual read limit',502)
 try{return {value:JSON.parse(raw),headers:r.headers}}catch{throw new Fault(502,'Greenhouse returned unreadable data')}
}
async function pages(key:string,path:string) {
 const rows:Data[]=[],ids=new Set<string>()
 // Construct pages locally. Never follow a provider-supplied next URL with the key.
 for(let page=1;page<=50;page++){
  const {value,headers}=await greenhouseRead(key,`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`)
  requireThat(Array.isArray(value)&&value.length<=100,'Greenhouse returned an invalid page',502)
  for(const row of value){const id=greenhouseId(row.id);requireThat(!ids.has(id),'Greenhouse returned duplicate IDs; preview again',409);ids.add(id);rows.push(row)}
  if(!headers.get('link')?.includes('rel="next"'))return rows
 }
 throw new Fault(409,'Greenhouse exceeds 50 pages; no incomplete observation is accepted')
}
function date(value:unknown) {const v=text(value,'Greenhouse start date');requireThat(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v,'Greenhouse needs a real start date');return v}
const field=(row:Data,key:string)=>row.keyed_custom_fields?.[key]?.value ?? row.custom_fields?.[key]
export async function greenhouseObservation(key:string,id:string,openingId?:string) {
 const {value:job}=await greenhouseRead(key,`jobs/${id}`)
 requireThat(String(job.id)===id&&['open','closed'].includes(job.status),'Choose an open or closed Greenhouse job',409)
 const title=text(job.name,'Greenhouse job title'),departments=job.departments
 requireThat(Array.isArray(departments)&&departments.length===1,'A requisition needs one explicit source department',409)
 const sourceDepartment={id:greenhouseId(departments[0].id),name:text(departments[0].name,'Greenhouse department')}
 const openings=await pages(key,`jobs/${id}/openings`)
 const selected=openingId?openings.find(row=>String(row.id)===openingId):openings.length===1?openings[0]:null
 requireThat(selected,'Choose the numeric opening ID when a job has multiple openings',409)
 const opening=String(selected.opening_id ?? selected.id),sourceOpeningId=greenhouseId(selected.id)
 // Harvest filters by offer status, not job ID. Filter complete pages locally.
 const offers=(await pages(key,'offers?status=accepted')).filter(row=>row.status==='accepted'&&String(row.job_id)===id&&(row.opening?String(row.opening.id)===sourceOpeningId:openings.length===1))
 requireThat(offers.length<=1,'Greenhouse returned ambiguous accepted offers',409)
 const offer=offers[0]
 if(job.status==='closed'||!offer&&selected.status==='closed')return {id,title,sourceDepartment,opening,sourceOpeningId,status:'closed',holder:'',level:'',start:'',annualSalary:''}
 let holder=''
 if(offer){const {value:candidate}=await greenhouseRead(key,`candidates/${greenhouseId(offer.candidate_id)}`);requireThat(String(candidate.id)===String(offer.candidate_id),'Greenhouse candidate changed',409);holder=`${text(candidate.first_name,'Candidate first name')} ${text(candidate.last_name,'Candidate last name')}`}
 const level=text(field(job,'level'),'Greenhouse level'),start=date(offer?(offer.starts_at??field(offer,'start_date')):field(job,'target_start_date'))
 const annual=field(offer??job,'annual_salary'),raw=annual??field(offer??job,'salary')
 // Require an explicitly annual USD amount, rather than guessing units or currency.
 requireThat(raw&&raw.currency==='USD'&&(annual!==undefined||field(offer??job,'salary_period')==='year'),'Greenhouse salary must explicitly specify USD and year',409)
 const amount=cents(String(raw.value),'Greenhouse annual salary');requireThat(amount>0,'Greenhouse salary must be positive',409)
 return {id,title,sourceDepartment,opening,sourceOpeningId,status:offer?'accepted':'open',holder,level,start,annualSalary:`${Math.floor(amount/100)}.${String(amount%100).padStart(2,'0')}`,...(offer?{offerId:greenhouseId(offer.id)}:{})}
}
