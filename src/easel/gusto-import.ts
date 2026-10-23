// Gusto observations enter the existing payroll journal and read models. The
// provider is never a second headcount ledger or a source of editable positions.
import type { Bindings } from '../auth.server'
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, sha256, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import type { Context, KitStep } from './context'
import { transformErased, type ErasureMap } from './erasure-map.mjs'
import { gustoAuthority, gustoStoredCredentials } from './gusto-connection'
import { gustoDate, readGusto } from './gusto-provider'
import { base64 } from './kit'
import { payrollImport } from './payroll-import'
import { payrollJournalContext } from './payroll-journal'
import { rosterBuckets } from './payroll-reconciliation'
import { requireScenarioEdit } from './scenario-access'
import { all, find, get, put, requireThat, type Data } from './types'

const NAMESPACE='easel-payroll-files'
const csvCell=(value:unknown)=>`"${String(value ?? '').replace(/"/g,'""')}"`
const publicPreview=({ctx:_ctx,plan:_plan,...view}:Data)=>view
const providerName=(environment:string,company:string)=>`Gusto:${environment}:${company}`

async function preview(c:Context,env:Bindings,b:Data) {
 gustoAuthority(c)
 requireThat(get(c.s,'workspace','main').currency==='USD','Gusto payroll is in USD; use a USD workspace instead of inferring an exchange rate',409)
 const scenario=get(c.s,'scenario',b.scenario); requireScenarioEdit(c.x,scenario)
 const line=get(c.s,'line',b.line,'payroll line'); requireThat(line.payroll,'Choose a payroll-classified ledger line')
 const asOf=gustoDate(b.asOf,'Roster observation date'),windowStart=gustoDate(b.windowStart,'Payroll window start'),windowEnd=gustoDate(b.windowEnd,'Payroll window end')
 const payrollHistoryStart=gustoDate(b.payrollHistoryStart,'Payroll history boundary')
 requireThat(asOf === c.now.slice(0,10),'The roster is observed today; historical observation dates cannot be invented')
 requireThat(windowStart <= windowEnd && windowEnd <= asOf && Date.parse(windowEnd)-Date.parse(windowStart) <= 365*86400000,'Choose a past payroll check-date window of at most one year')
 requireThat(payrollHistoryStart<=windowStart,'Choose a payroll history boundary on or before the payroll check-date window')
 const key=await gustoStoredCredentials(c,env),provider=providerName(key.environment,key.companyId)
 const data=await readGusto(key,asOf,windowStart,windowEnd,payrollHistoryStart)
 const erasures=all(c.s,'erasure') as (Data & ErasureMap)[]
 const redact=(row:Data)=>transformErased({...row,provider},erasures) as Data
 const roster=data.roster.map(row=>redact({...row,sourceObservationId:sha256(canonicalJson([provider,'roster',row.employeeId,asOf]))})).sort((a,b)=>a.employeeId.localeCompare(b.employeeId))
 const runs=data.runs.map(row=>redact({...row,sourceObservationId:sha256(canonicalJson([provider,'payroll',row.providerPayrollId,row.employeeId]))})).sort((a,b)=>a.providerPayrollId.localeCompare(b.providerPayrollId)||a.employeeId.localeCompare(b.employeeId))
 const mappings=all(c.s,'payroll-file-mapping')
 const saved=mappings.filter(m=>m.provider===provider && m.source==='gusto' && m.scenario===scenario.id && all(c.s,'payroll-import').some(i=>i.destination===m.batch && i.status==='imported')).sort((a,b)=>b.order-a.order)[0]
 requireThat(b.employeeMap === undefined || b.employeeMap && typeof b.employeeMap === 'object' && !Array.isArray(b.employeeMap),'Choose an explicit employee mapping')
 const choices:Data=Object.fromEntries((saved?.employees ?? []).map((r:Data)=>[r.employeeId,{department:r.department,positionOrigin:r.positionOrigin,unplanned:r.unplanned,memberEmail:find(c.s,'member',saved?.memberMap?.[r.employeeId] ?? '')?.email ?? ''}]))
 const positions=all(c.s,'position').filter(p=>p.scenario===scenario.id)
 for (const [id,input] of Object.entries(b.employeeMap ?? {})) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input),'Choose a department and planned position for each employee')
  const value=input as Data
  let memberEmail=''
  if(value.memberEmail) memberEmail=get(c.s,'member',String(value.memberEmail).toLowerCase(),'associated member').email
  choices[id]={department:value.department,positionOrigin:value.positionOrigin ?? '',unplanned:value.unplanned === true,memberEmail}
 }
 const identities=[...new Set([...roster,...runs].map(row=>row.employeeId))]
 const unmapped=identities.filter(id=>!choices[id]?.department || !choices[id]?.positionOrigin && choices[id]?.unplanned !== true)
 for(const id of identities.filter(id=>!unmapped.includes(id))) {
  const map=choices[id]; get(c.s,'department',map.department,'mapped department')
  requireThat(map.positionOrigin ? positions.some(p=>p.originId===map.positionOrigin && p.department===map.department) : map.unplanned === true,'Choose a position in the mapped department or explicitly mark the employee unplanned',409)
 }
 const linked=roster.map(r=>choices[r.employeeId]?.positionOrigin).filter(Boolean)
 requireThat(new Set(linked).size===linked.length,'A planned position cannot match two employees in one roster',409)
 const positionMap:Data={},memberMap:Data={}
 const employees=identities.filter(id=>!unmapped.includes(id)).map(employeeId=>{
  const value=choices[employeeId]; positionMap[employeeId]=value.positionOrigin
  if(value.memberEmail) memberMap[employeeId]=value.memberEmail
  return {provider,employeeId,department:value.department,positionOrigin:value.positionOrigin,unplanned:value.unplanned}
 })
 // Keep source employee identifiers in their dedicated erasure-aware field;
 // opaque observation IDs and journal IDs contain only hashes.
 const mappedRoster:Data[]=roster.map((row,index)=>{
  const map=choices[row.employeeId],planned=positions.find(p=>p.originId===map?.positionOrigin)
  return {...row,scenario:scenario.id,asOf,department:map?.department ?? null,positionOrigin:map?.positionOrigin ?? '',plannedStartDate:planned?.plannedStartDate ?? '',plannedStartMonth:planned?.start ?? '',plannedTitle:planned?.title ?? '',plannedPosition:planned?.id ?? '',backfillOrigin:planned?.backfillOrigin ?? '',source:'gusto',row:index+2}
 })
 const priorRuns=all(c.s,'payroll-run').filter(r=>r.provider===provider && r.scenario===scenario.id)
 const mappedRuns:Data[]=runs.map((row,index)=>({...row,source:'gusto',scenario:scenario.id,department:choices[row.employeeId]?.department ?? null,line:line.id,row:mappedRoster.length+index+2}))
 const newRuns=mappedRuns.filter(row=>{
  const prior=priorRuns.find(r=>r.sourceObservationId===row.sourceObservationId)
  if(!prior)return true
  for(const field of ['payDate','providerPeriodStart','providerPeriodEnd','department','line','grossWagesCents','employerTaxesCents','benefitsCents','totalCents']) requireThat(prior[field]===row[field],'Previously accepted Gusto payroll or its mapping changed; undo that import before replacing it',409)
  return false
 })
 const rows=[...mappedRoster,...newRuns]
 const fields=['employeeId','name','source','sourceObservationId','providerPayrollId','providerPeriodStart','providerPeriodEnd','asOf','payDate','department','positionOrigin','start','termination','salaryCents','hourlyRateCents','grossWagesCents','employerTaxesCents','benefitsCents','feesCents','totalCents']
 const bytes=new TextEncoder().encode([fields.map(csvCell).join(','),...rows.map(row=>fields.map(field=>csvCell((row as Data)[field])).join(','))].join('\n')+'\n')
 const sha=sha256(bytes),id=sha256(canonicalJson([provider,scenario.id,asOf,windowStart,windowEnd,sha])).slice(0,24),destination=`payroll:${id}`,file=`gusto-observations-${asOf}.csv`
 const completeness={complete:true,asOf,windowStart,windowEnd,payrollHistoryStart,historySlices:data.historySlices,scannedPayrollCount:data.scannedPayrollCount,payrollScanFingerprint:data.payrollScanFingerprint,overlappingPayrollIds:data.overlappingPayrollIds,employeeCount:data.employeeCount,payrollCount:data.payrollCount,payrollIds:data.payrollIds,employeePages:data.employeePages,payrollPages:data.payrollPages,payrollDetailPages:data.payrollDetailPages,skippedExistingPayRuns:mappedRuns.length-newRuns.length,costBasis:'Gross wages + employer taxes + employer benefits; provider fees excluded'}
 const mappingPayload={provider,kind:'roster',source:'gusto',scenario:scenario.id,batch:destination,order:Math.max(0,...mappings.map(m=>m.order))+1,employees,positionMap,memberMap,line:line.id,config:{columns:{employeeId:'employeeId',name:'name'},dateFormat:'YYYY-MM-DD'},completeness}
 const ctx=payrollJournalContext(c,destination,`gusto-v1:${sha256(canonicalJson({mappingPayload,positions,departments:all(c.s,'department'),source:mappedRuns})).slice(0,24)}`,undefined,scenario.id)
 const record=(kind:string,sourceId:string,payload:Data)=>({namespace:NAMESPACE,kind,sourceId,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:sha,location:{artifact:file,pointer:sourceId}})
 const source:SourceBundle={diagnostics:[],artifacts:[{name:file,sha256:sha,size:bytes.length,original:{status:'available',base64:base64(bytes)}}],records:[record('mapping','mapping',mappingPayload),...mappedRoster.map(row=>record('roster',row.sourceObservationId,row)),...newRuns.map(row=>record('register',row.sourceObservationId,row))]}
 const mapping:ImportMapping={version:ctx.mappingVersion,map:record=>({effects:[{targetKind:record.kind==='mapping'?'payroll-file-mapping':record.kind==='roster'?'roster-actual':'payroll-run',targetId:`${id}:${record.sourceId}`,value:record.kind==='mapping'?record.payload:{...(record.payload as Data),batch:destination,file}}]})}
 const plan=await planD1Import(source,mapping,ctx)
 return {id,destination,file,sha256:sha,provider,scenario:scenario.id,kind:'roster',asOf,rows,roster:mappedRoster,runs:newRuns,unmapped,employeeMap:choices,positions:positions.map(p=>({id:p.id,originId:p.originId,title:p.title,department:p.department})),departments:all(c.s,'department'),completeness,reconciliation:rosterBuckets(c.s,scenario.id,mappedRoster),totalCents:newRuns.reduce((n,r)=>n+r.totalCents,0),fingerprint:plan.fingerprint,counts:plan.counts,ctx,plan}
}

export async function gustoImport(c:Context,env:Bindings,op:string,b:Data):Promise<KitStep|undefined> {
 gustoAuthority(c)
 if(['resume','undo','status'].includes(op)) {
  const imp=get(c.s,'payroll-import',b.id); requireThat(imp.source==='gusto','Gusto import not found',404)
  const step=await payrollImport(c,op,b)
  if(step?.record){const record=step.record;step.record=(after,result)=>{
   gustoAuthority(after)
   const value=record(after,result)
   if(op==='resume'&&value.import?.status==='imported')put(after.s,'connection','gusto',{...get(after.s,'connection','gusto'),lastRefresh:after.now,rowCount:imp.rows,error:null})
   return value
  }}
  return step
 }
 if(!['preview','commit'].includes(op))return undefined
 const p=await preview(c,env,b)
 if(op==='preview')return {result:publicPreview(p)}
 requireThat(p.unmapped.length===0,'Map every Gusto employee to a department and planned position, or explicitly mark them unplanned, before accepting observations',409)
 requireThat(b.fingerprint===p.fingerprint,'Gusto data, mapping or plan changed; preview again',409)
 requireThat(!all(c.s,'payroll-import').some(i=>i.provider===p.provider && i.scenario===p.scenario && i.asOf===p.asOf && !['undone','failed'].includes(i.status)),'This Gusto roster date is already accepted; undo it before replacing it',409)
 const prior=find(c.s,'payroll-import',p.id),attempt=(prior?.attempt ?? 0)+1
 put(c.s,'payroll-import',p.id,{source:'gusto',destination:p.destination,file:p.file,sha256:p.sha256,provider:p.provider,kind:'roster',scenario:p.scenario,asOf:p.asOf,rows:p.rows.length,status:'importing',attempt,createdBy:c.x.actor.email,createdAt:c.now,completeness:p.completeness})
 c.activity.push({action:'gusto-import-started',record:p.id,scenario:p.scenario,detail:{rows:p.rows.length,asOf:p.asOf,complete:true}})
 return {result:{},kit:async()=>{
  const job=await createD1ImportJob(p.plan,{...p.ctx,reviewedFingerprint:p.fingerprint,operationKey:`${p.fingerprint}:${attempt}`})
  return applyD1ImportBatches(job.id,p.ctx)
 },record:(after,job)=>{
  gustoAuthority(after)
  const imp=get(after.s,'payroll-import',p.id),status=job.state==='completed'?'imported':'importing'
  put(after.s,'payroll-import',p.id,{...imp,status})
  if(status==='imported')put(after.s,'connection','gusto',{...get(after.s,'connection','gusto'),lastRefresh:after.now,rowCount:p.rows.length,error:null})
  after.activity.push({action:'gusto-import-progress',record:p.id,scenario:p.scenario,detail:{state:job.state}})
  return {import:get(after.s,'payroll-import',p.id),job:{id:job.id,state:job.state,checkpoint:job.checkpoint,total:job.total}}
 },failed:async(after,error)=>{
  if(await after.db.prepare('SELECT 1 FROM ik_jobs WHERE destination=?').bind(p.destination).first())return
  put(after.s,'payroll-import',p.id,{...get(after.s,'payroll-import',p.id),status:'failed',error:error.message.slice(0,500)})
 }}
}
