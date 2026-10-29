// A CRM refresh is one logical import effect: a complete scoped pipeline.
// Base import-kit owns its before-image and reversal. Its target adapter
// publishes the revenue projection in the same atomic batch as provenance.
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob, resumeD1Import, undoD1Import, type SourceBundle, type D1Sql } from '../modules/import-kit/src/d1/index'
import type { Context, KitStep } from './context'
import { kitContext, targets, base64 } from './kit'
import { pipelineAuthority } from './pipeline-connection'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { importAudit } from './audit-write'
import { all, get, key, put, requireThat, uid, type Data, type Row, type State } from './types'

const NAMESPACE='easel-crm-pipeline'
const sql=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
const json=(value:unknown)=>JSON.stringify(value)
const rawRows=(s:State,scenario:string,provider:string)=>[...s.values()].filter(r=>r.kind==='revenue'&&r.value.scenario===scenario&&r.value.pipeline?.provider===provider)
const strip=(r:Row)=>({...r,value:{...r.value}})

function journalContext(c:Context,entry:Data,job?:Data){
 const ctx=kitContext(c.db,c.x.actor,entry.destination,NAMESPACE,job?.mapping_version??'pipeline-v1')
 if(job)ctx.authorization={...ctx.authorization!,principalId:job.principal_id}
 const native=ctx.storage.targets
 const projection=(rows:Row[])=>{
  const statements=[sql("DELETE FROM e_records WHERE kind='revenue' AND json_extract(value,'$.scenario')=? AND json_extract(value,'$.pipeline.provider')=?",entry.scenario,entry.provider)]
  for(const row of rows)statements.push(...targets.write({destination:row.destination,targetKind:row.kind,targetId:row.id,revision:row.revision,value:row.value}))
  return statements
 }
 const matchesRows=(rows:Row[])=>sql(
  "(SELECT COUNT(*) FROM e_records WHERE kind='revenue' AND json_extract(value,'$.scenario')=? AND json_extract(value,'$.pipeline.provider')=?)=? AND "+
  rows.map(()=>"EXISTS(SELECT 1 FROM e_records WHERE kind=? AND id=? AND revision=? AND value=?)").join(' AND '),
  entry.scenario,entry.provider,rows.length,...rows.flatMap(r=>[r.kind,r.id,r.revision,json(r.value)]))
 // A zero-row pipeline still has a real, exact observation.
 const fenceRows=(rows:Row[])=>rows.length?matchesRows(rows):sql("(SELECT COUNT(*) FROM e_records WHERE kind='revenue' AND json_extract(value,'$.scenario')=? AND json_extract(value,'$.pipeline.provider')=?)=0",entry.scenario,entry.provider)
 native.matches=(row,d,k,id)=>{
  const a=targets.matches(row,d,k,id),b=fenceRows(row?(row.value as Data).after:entry.before)
  return sql('('+a.sql+') AND ('+b.sql+')',...(a.params??[]),...(b.params??[]))
 }
 native.write=row=>[
  ...importAudit(c.x.actor,row.destination,row.targetKind,row.targetId,row),
  ...targets.write(row),
  ...projection((row.value as Data).after),
  ...((row.value as Data).after as Row[]).flatMap(r=>importAudit(c.x.actor,r.destination,r.kind,r.id,{destination:r.destination,targetKind:r.kind,targetId:r.id,revision:r.revision,value:r.value})),
 ]
 native.remove=(d,k,id)=>[
  ...importAudit(c.x.actor,d,k,id),
  ...projection(entry.before),
  ...entry.before.flatMap((r:Row)=>importAudit(c.x.actor,r.destination,r.kind,r.id,{destination:r.destination,targetKind:r.kind,targetId:r.id,revision:r.revision,value:r.value})),
  ...targets.remove(d,k,id),
 ]
 // The import's own resume/undo metadata is not an independent dependency.
 const prepare=native.preparePreservedUndo!
 native.preparePreservedUndo=async function(...args){
  const snapshot=await prepare.call(this,...args)
  return {...snapshot,dependencies:snapshot.dependencies.filter(d=>d.cause.field!=='pipeline-import')}
 }
 const authority=ctx.authorization!.predicate!
 ctx.authorization={...ctx.authorization!,predicate:(...args)=>{
  const a=authority(...args) as {sql:string;params:unknown[]}
  return sql('('+a.sql+") AND EXISTS(SELECT 1 FROM e_records WHERE kind='scenario' AND id=? AND json_extract(value,'$.revision')=? AND json_extract(value,'$.status')='working')"+
   (c.x.actor.baseRole==='owner'?'':" AND EXISTS(SELECT 1 FROM e_records WHERE kind='pay-grant' AND id=? AND json_extract(value,'$.granted')=1)"),
   ...a.params,entry.scenario,get(c.s,'scenario',entry.scenario).revision,...(c.x.actor.baseRole==='owner'?[]:[c.x.actor.email]))
 }}
 return ctx
}

export async function startPipelineImport(c:Context,before:State,activityBefore:number,scenario:string,provider:string,result:Data):Promise<KitStep>{
 const id=uid(),destination='pipeline:'+id
 const beforeRows=rawRows(before,scenario,provider).map(strip),afterRows=rawRows(c.s,scenario,provider).map(strip)
 const patch=[...c.s].filter(([k,r])=>r.kind!=='revenue'&&before.get(k)?.revision!==r.revision).map(([k,r])=>({key:k,row:r,expected:before.get(k)?.revision??null}))
 const events=c.activity.splice(activityBefore)
 const entry={id,destination,scenario,provider,before:beforeRows,after:afterRows,patch,events,result,status:'importing',createdAt:c.now,createdBy:c.x.actor.email}
 c.s=before
 put(c.s,'pipeline-import',id,entry)
 c.activity.push({action:'pipeline-import-started',record:id,scenario,detail:{provider,sourceDigest:result.sourceDigest}})
 const ctx=journalContext(c,entry),payload={before:beforeRows,after:afterRows}
 const bytes=new TextEncoder().encode(canonicalJson(payload))
 const {sha256}=await import('../modules/import-kit/src/d1/index')
 const sha=sha256(bytes),record={namespace:NAMESPACE,kind:'pipeline',sourceId:id,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:sha,location:{artifact:provider+'-pipeline.json'}}
 const source:SourceBundle={diagnostics:[],artifacts:[{name:provider+'-pipeline.json',sha256:sha,size:bytes.length,original:{status:'available',base64:base64(bytes)}}],records:[record]}
 const plan=await planD1Import(source,{version:ctx.mappingVersion,map:r=>({effects:[{targetKind:'pipeline-journal',targetId:id,value:r.payload}]})},ctx)
 return {result:{},kit:async()=>{
  const job=await createD1ImportJob(plan,{...ctx,reviewedFingerprint:plan.fingerprint,operationKey:id})
  return applyD1ImportBatches(job.id,ctx)
 },record:(after,job)=>finish(after,id,job)}
}

function finish(c:Context,id:string,job:Data){
 const entry=get(c.s,'pipeline-import',id)
 if(job.state!=='completed'){put(c.s,'pipeline-import',id,{...entry,job:job.id,status:'importing'});return {import:{id,status:'importing'},job:{id:job.id,state:job.state}}}
 for(const change of entry.patch)requireThat((c.s.get(change.key)?.revision??null)===change.expected,'Pipeline import completed but its review metadata changed; resolve the pending import before another refresh',409)
 for(const change of entry.patch)c.s.set(change.key,change.row)
 c.activity.push(...entry.events)
 put(c.s,'pipeline-import',id,{...entry,job:job.id,status:'accepted',acceptedAt:c.now,acceptedRevision:get(c.s,'scenario',entry.scenario).revision})
 return {...entry.result,import:{id,status:'accepted',job:job.id}}
}

export async function pipelineJournal(c:Context,op:string,b:Data):Promise<KitStep>{
 pipelineAuthority(c)
 const entry=get(c.s,'pipeline-import',b.id),sc=scenarioAccess(c.s,c.x,entry.scenario)
 requireThat(sc.status==='working'&&!sc.sandbox&&sc.kind!=='proposal','Pipeline undo needs its working company scenario',409)
 requireThat(sc.revision===b.revision,'The plan changed; reload pipeline imports',409)
 requireThat(c.x.payDetail,'Pay detail is required to resume or undo a complete pipeline import',403)
 const job=await c.db.prepare('SELECT id,state,mapping_version,principal_id FROM ik_jobs WHERE destination=? AND namespace=? ORDER BY rowid DESC LIMIT 1').bind(entry.destination,NAMESPACE).first<Data>()
 requireThat(job,'This pipeline import has no journal yet',409)
 const ctx=journalContext(c,entry,job)
 if(op==='status')return {result:{import:{id:entry.id,status:entry.status},job:await readD1ImportJob(job.id,ctx)}}
 if(op==='resume')return {result:{},kit:()=>resumeD1Import(job.id,ctx),record:(after,outcome)=>finish(after,entry.id,outcome)}
 requireThat(op==='undo','Unknown pipeline journal action',404)
 requireThat(entry.status==='accepted','Only an accepted pipeline import can be undone',409)
 const latest=all(c.s,'pipeline-import').filter(i=>i.scenario===entry.scenario&&i.provider===entry.provider&&i.status==='accepted').sort((a,b)=>b.acceptedRevision-a.acceptedRevision)[0]
 requireThat(latest?.id===entry.id,'Undo the latest pipeline import first',409)
 requireThat(!sc.actualsThrough||![...entry.before,...entry.after].some((r:Row)=>r.value.start<=sc.actualsThrough),'This pipeline import touches a closed period; accept a reviewed correction instead of undoing',409)
 const current=rawRows(c.s,sc.id,entry.provider)
 requireThat(canonicalJson(current.map(strip).sort((a,b)=>a.id.localeCompare(b.id)))===canonicalJson([...entry.after].sort((a:Row,b:Row)=>a.id.localeCompare(b.id))),'Pipeline rows changed after import; undo cannot overwrite later edits',409)
 put(c.s,'pipeline-import',entry.id,{...entry,status:'undoing'})
 return {result:{},kit:()=>undoD1Import(job.id,ctx),record:(after,outcome)=>{
  requireThat(outcome.state==='undone','Pipeline undo retained conflicting effects; review the journal',409)
  const current=get(after.s,'scenario',sc.id)
  const original=entry.patch.find((p:Data)=>p.row.kind==='scenario')?.row.value
  // Restore source authority separately from other scenario settings/revisions.
  const priorEntry=all(after.s,'pipeline-import').filter(i=>i.id!==entry.id&&i.scenario===sc.id&&i.provider===entry.provider&&i.status==='accepted').sort((a,b)=>b.acceptedRevision-a.acceptedRevision)[0]
  const priorSource=priorEntry?.result
  put(after.s,'scenario',sc.id,{...current,pipelineSources:{...current.pipelineSources,[entry.provider]:priorSource?{sourceDigest:priorSource.sourceDigest,nextExpectedAt:priorSource.nextExpectedAt,observedAt:priorEntry!.acceptedAt,rows:priorSource.source.deals.length}: {sourceDigest:'undone',rows:entry.before.length}},pipelineCoverageTargetCents:current.pipelineCoverageTargetCents})
  put(after.s,'pipeline-review',`${sc.id}:${entry.provider}`,{scenario:sc.id,provider:entry.provider,status:'pending',departments:[...new Set(entry.before.map((r:Row)=>r.value.department))],reason:'Import undone; review the current CRM source before using this scenario'})
  put(after.s,'pipeline-import',entry.id,{...get(after.s,'pipeline-import',entry.id),status:'undone',undoneAt:after.now,undoneBy:after.x.actor.email})
  bump(after,get(after.s,'scenario',sc.id),'pipeline-import-undone',entry.id,{provider:entry.provider,job:job.id})
  return {import:{id:entry.id,status:'undone'},job:{id:job.id,state:outcome.state}}
 }}
}
