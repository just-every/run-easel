// HRIS observations reuse the payroll journal, live Pay grants and erasure.
// Acceptance records reviewed matches; it never overwrites planned positions.
import type { Bindings } from '../auth.server'
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, sha256, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import type { Context, KitStep } from './context'
import { transformErased, type ErasureMap } from './erasure-map.mjs'
import { hrisAuthority, hrisStoredCredentials } from './hris-connection'
import { readHris, type Hris } from './hris-provider'
import { gustoDate } from './gusto-provider'
import { base64 } from './kit'
import { payrollImport } from './payroll-import'
import { payrollJournalContext } from './payroll-journal'
import { rosterBuckets } from './payroll-reconciliation'
import { requireScenarioEdit } from './scenario-access'
import { all, find, get, put, requireThat, type Data } from './types'

const NAMESPACE='easel-payroll-files'
const csvCell=(value:unknown)=>`"${String(value ?? '').replace(/"/g,'""')}"`
const publicPreview=({ctx:_ctx,plan:_plan,...view}:Data)=>view
const sourceName=(id:Hris)=>`hris:${id}`

async function preview(c:Context,env:Bindings,id:Hris,b:Data) {
 hrisAuthority(c)
 requireThat(get(c.s,'workspace','main').currency==='USD','HRIS compensation requires a USD workspace; no exchange rate is inferred',409)
 const scenario=get(c.s,'scenario',b.scenario); requireScenarioEdit(c.x,scenario)
 const asOf=gustoDate(b.asOf,'Roster observation date')
 requireThat(asOf===c.now.slice(0,10),'A current roster must be observed today; historical observation dates cannot be invented')
 const key=await hrisStoredCredentials(c,env,id),provider=`${id}:${key.tenant}`,sourceId=sourceName(id)
 const data=await readHris(id,key,env,asOf)
 const erasures=all(c.s,'erasure') as (Data & ErasureMap)[]
 const redact=(row:Data)=>transformErased({...row,provider},erasures) as Data
 const roster=data.roster.map(row=>redact({...row,sourceObservationId:sha256(canonicalJson([provider,'roster',row.employeeId,asOf]))})).sort((a,b)=>a.employeeId.localeCompare(b.employeeId))
 const mappings=all(c.s,'payroll-file-mapping')
 const saved=mappings.filter(m=>m.provider===provider && m.source===sourceId && m.scenario===scenario.id && all(c.s,'payroll-import').some(i=>i.destination===m.batch && i.status==='imported')).sort((a,b)=>b.order-a.order)[0]
 requireThat(b.employeeMap === undefined || b.employeeMap && typeof b.employeeMap === 'object' && !Array.isArray(b.employeeMap),'Choose an explicit employee mapping')
 const choices:Data=Object.fromEntries((saved?.employees ?? []).map((r:Data)=>[r.employeeId,{department:r.department,positionOrigin:r.positionOrigin,unplanned:r.unplanned,employmentType:r.employmentType,memberEmail:find(c.s,'member',saved?.memberMap?.[r.employeeId] ?? '')?.email ?? ''}]))
 const positions=all(c.s,'position').filter(p=>p.scenario===scenario.id)
 for (const [id,input] of Object.entries(b.employeeMap ?? {})) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input),'Choose a department and planned position for each employee')
  const value=input as Data
  let memberEmail=''
  if(value.memberEmail) memberEmail=get(c.s,'member',String(value.memberEmail).toLowerCase(),'associated member').email
  choices[id]={department:value.department,positionOrigin:value.positionOrigin ?? '',unplanned:value.unplanned === true,employmentType:value.employmentType,memberEmail}
 }
 const identities=[...new Set(roster.map(row=>row.employeeId))]
 const unmapped=identities.filter(id=>!choices[id]?.department || !choices[id]?.positionOrigin && choices[id]?.unplanned !== true || !['W-2','1099'].includes(choices[id]?.employmentType??roster.find(r=>r.employeeId===id)?.employmentType))
 for(const id of identities.filter(id=>!unmapped.includes(id))) {
  const map=choices[id]; get(c.s,'department',map.department,'mapped department')
  requireThat(map.positionOrigin ? !map.unplanned && positions.some(p=>p.originId===map.positionOrigin && p.department===map.department) : map.unplanned === true,'Choose a position in the mapped department or explicitly mark the employee unplanned',409)
 }
 const linked=roster.map(r=>choices[r.employeeId]?.positionOrigin).filter(Boolean)
 requireThat(new Set(linked).size===linked.length,'A planned position cannot match two employees in one roster',409)
 const positionMap:Data={},memberMap:Data={}
 const employees=identities.filter(id=>!unmapped.includes(id)).map(employeeId=>{
  const value=choices[employeeId]; positionMap[employeeId]=value.positionOrigin
  if(value.memberEmail) memberMap[employeeId]=value.memberEmail
  return {provider,employeeId,department:value.department,positionOrigin:value.positionOrigin,unplanned:value.unplanned,employmentType:value.employmentType??roster.find(r=>r.employeeId===employeeId)?.employmentType}
 })
 // Keep source employee identifiers in their dedicated erasure-aware field;
 // opaque observation IDs and journal IDs contain only hashes.
 const mappedRoster:Data[]=roster.map((row,index)=>{
  const map=choices[row.employeeId],planned=positions.find(p=>p.originId===map?.positionOrigin)
  return {...row,employmentType:map?.employmentType??row.employmentType,scenario:scenario.id,asOf,department:map?.department ?? null,positionOrigin:map?.positionOrigin ?? '',plannedStartDate:planned?.plannedStartDate ?? '',plannedStartMonth:planned?.start ?? '',plannedTitle:planned?.title ?? '',plannedPosition:planned?.id ?? '',backfillOrigin:planned?.backfillOrigin ?? '',source:sourceId,row:index+2}
 })
 const rows=mappedRoster
 const fields=['employeeId','name','source','sourceObservationId','asOf','department','positionOrigin','start','termination','salaryCents','hourlyRateCents','employmentType','title','sourceDepartment','sourceEmploymentType']
 const bytes=new TextEncoder().encode([fields.map(csvCell).join(','),...rows.map(row=>fields.map(field=>csvCell((row as Data)[field])).join(','))].join('\n')+'\n')
 const sha=sha256(bytes),importId=sha256(canonicalJson([provider,scenario.id,asOf,sha,data.sourceDigest])).slice(0,24),destination=`payroll:${importId}`,file=`${id}-observations-${asOf}.csv`
 const completeness={complete:true,asOf,employeeCount:data.employeeCount,pages:data.pages,unmappedFields:data.unmappedFields,payrollCost:'Unavailable from this roster endpoint; review provider payroll-register files separately. Missing cost is never zero.'}
 const mappingPayload={provider,kind:'roster',source:sourceId,scenario:scenario.id,batch:destination,order:Math.max(0,...mappings.map(m=>m.order))+1,employees,positionMap,memberMap,config:{columns:{employeeId:'employeeId',name:'name'},dateFormat:'YYYY-MM-DD'},completeness,sourceDigest:data.sourceDigest}
 const ctx=payrollJournalContext(c,destination,`hris-v1:${sha256(canonicalJson({mappingPayload,positions,departments:all(c.s,'department'),source:mappedRoster})).slice(0,24)}`,undefined,scenario.id)
 const record=(kind:string,sourceId:string,payload:Data)=>({namespace:NAMESPACE,kind,sourceId,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:sha,location:{artifact:file,pointer:sourceId}})
 const source:SourceBundle={diagnostics:[],artifacts:[{name:file,sha256:sha,size:bytes.length,original:{status:'available',base64:base64(bytes)}}],records:[record('mapping','mapping',mappingPayload),...mappedRoster.map(row=>record('roster',row.sourceObservationId,row)),]}
 const mapping:ImportMapping={version:ctx.mappingVersion,map:record=>({effects:[{targetKind:record.kind==='mapping'?'payroll-file-mapping':record.kind==='roster'?'roster-actual':'payroll-run',targetId:`${importId}:${record.sourceId}`,value:record.kind==='mapping'?record.payload:{...(record.payload as Data),batch:destination,file}}]})}
 const plan=await planD1Import(source,mapping,ctx)
 return {id:importId,destination,file,sha256:sha,provider,scenario:scenario.id,kind:'roster',asOf,rows,roster:mappedRoster,unmapped,employeeMap:choices,positions:positions.map(p=>({id:p.id,originId:p.originId,title:p.title,department:p.department})),departments:all(c.s,'department'),completeness,reconciliation:rosterBuckets(c.s,scenario.id,mappedRoster),fingerprint:plan.fingerprint,counts:plan.counts,ctx,plan}
}

export async function hrisImport(c:Context,env:Bindings,id:Hris,op:string,b:Data):Promise<KitStep|undefined> {
 hrisAuthority(c)
 if(['resume','undo','status'].includes(op)) {
  const imp=get(c.s,'payroll-import',b.id); requireThat(imp.source===sourceName(id),'HRIS import not found',404)
  const step=await payrollImport(c,op,b)
  if(step?.record){const record=step.record;step.record=(after,result)=>{
   hrisAuthority(after)
   const value=record(after,result)
   if(op==='resume'&&value.import?.status==='imported')put(after.s,'connection',sourceName(id),{...get(after.s,'connection',sourceName(id)),lastAccepted:after.now,lastRefresh:after.now,rateLimited:false,httpStatus:200,rowCount:imp.rows,error:null})
   return value
  }}
  return step
 }
 if(!['preview','commit'].includes(op))return undefined
 const p=await preview(c,env,id,b)
 if(op==='preview')return {result:publicPreview(p)}
 requireThat(p.unmapped.length===0,'Map every employee to a department, employment type and planned position or explicitly mark them unplanned',409)
 requireThat(b.fingerprint===p.fingerprint,'HRIS data, mapping or plan changed; preview again',409)
 requireThat(!all(c.s,'payroll-import').some(i=>i.provider===p.provider && i.scenario===p.scenario && i.asOf===p.asOf && !['undone','failed'].includes(i.status)),'This HRIS roster date is already accepted; undo it before replacing it',409)
 const prior=find(c.s,'payroll-import',p.id),attempt=(prior?.attempt ?? 0)+1
 put(c.s,'payroll-import',p.id,{source:sourceName(id),destination:p.destination,file:p.file,sha256:p.sha256,provider:p.provider,kind:'roster',scenario:p.scenario,asOf:p.asOf,rows:p.rows.length,status:'importing',attempt,createdBy:c.x.actor.email,createdAt:c.now,completeness:p.completeness})
 c.activity.push({action:'hris-import-started',record:p.id,scenario:p.scenario,detail:{rows:p.rows.length,asOf:p.asOf,complete:true}})
 return {result:{},kit:async()=>{
  const job=await createD1ImportJob(p.plan,{...p.ctx,reviewedFingerprint:p.fingerprint,operationKey:`${p.fingerprint}:${attempt}`})
  return applyD1ImportBatches(job.id,p.ctx)
 },record:(after,job)=>{
  hrisAuthority(after)
  const imp=get(after.s,'payroll-import',p.id),status=job.state==='completed'?'imported':'importing'
  put(after.s,'payroll-import',p.id,{...imp,status})
  if(status==='imported')put(after.s,'connection',sourceName(id),{...get(after.s,'connection',sourceName(id)),lastAccepted:after.now,lastRefresh:after.now,rateLimited:false,httpStatus:200,rowCount:p.rows.length,error:null})
  after.activity.push({action:'hris-import-progress',record:p.id,scenario:p.scenario,detail:{state:job.state}})
  return {import:get(after.s,'payroll-import',p.id),job:{id:job.id,state:job.state,checkpoint:job.checkpoint,total:job.total}}
 },failed:async(after,error)=>{
  if(await after.db.prepare('SELECT 1 FROM ik_jobs WHERE destination=?').bind(p.destination).first())return
  put(after.s,'payroll-import',p.id,{...get(after.s,'payroll-import',p.id),status:'failed',error:error.message.slice(0,500)})
 }}
}
