// Provider source reviews retain a credential-free, erasure-aware roster inventory.
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { sourceImpacts } from './agents/source-guard-detection'
import { sourceGuardBlock, sourceGuardIssues } from './agents/source-guard'
import type { Context } from './context'
import { datePeriod } from './fiscal-calendar'
import { workspace } from './model'
import { canSeeScenario } from './scenario-access'
import { all, find, get, put, requireThat, type Data } from './types'
const digest=(v:unknown)=>sha256(canonicalJson(v))
export const hrisGuardId=(provider:string,scenario:string)=>'hris:'+digest([provider,scenario]).slice(0,24)
export function hrisSourceReview(c:Context,p:Data){
 const id=hrisGuardId(p.provider,p.scenario),prior=find(c.s,'source-guard',id)
 const inventory=p.roster.map((r:Data)=>({key:r.sourceIdentityKey,person:{provider:p.provider,employeeId:r.employeeId,name:r.name},department:r.sourceDepartment,employmentType:r.sourceEmploymentType,positionOrigin:r.positionOrigin,departmentTarget:r.department,owner:r.ownerBinding??null})).sort((a:Data,b:Data)=>a.key.localeCompare(b.key))
 const metadata={inventory,fields:p.completeness.unmappedFields,complete:p.completeness.complete,employeeCount:p.completeness.employeeCount}
 const issues:Data[]=[],add=(kind:string,key:string,reason:string,detail:Data={})=>issues.push({id:digest([kind,key]).slice(0,20),kind,key,reason,...detail})
 for(const employee of p.unmapped)add('hris-mapping',digest(employee),'Review the employee department, employment type and planned-position mapping in the HRIS preview')
 const baseline=prior?.status==='completed'?prior:[...(prior?.history??[])].reverse().find((g:Data)=>g.status==='completed')
 if(baseline){
  for(const old of baseline.metadata.inventory){
   const row=inventory.find((r:Data)=>r.key===old.key)
   if(!row)add('hris-coverage',old.key,'A previously observed employee is absent; review source coverage. A departure must retain its historical employment record.',{person:old.person})
   else if(canonicalJson(old)!==canonicalJson(row))add('hris-metadata',row.key,'Provider department, employment type, responsible owner or reviewed mapping changed; explicitly review the new mapping before acceptance',{person:row.person,beforeDepartment:old.department,afterDepartment:row.department,targetDepartment:row.departmentTarget,proposals:row.departmentTarget?[{target:row.departmentTarget,name:get(c.s,'department',row.departmentTarget).name,reason:'The existing explicit employee mapping is proposed for review; a provider department label alone does not establish the planning assignment.'}]:[]})
  }
  if(canonicalJson(baseline.metadata.fields)!==canonicalJson(metadata.fields))add('hris-shape','fields','Provider field coverage changed; review newly uncovered fields')
 }
 const impacts=sourceImpacts(c,datePeriod(workspace(c.s),p.asOf))
 impacts.scenarios=all(c.s,'scenario').filter(s=>canSeeScenario(c.x,s)&&(s.id===p.scenario||s.parent===p.scenario)).map(s=>({id:s.id,name:s.name,status:s.status==='frozen'?'captured; unchanged':'working; dependent conclusions held'}))
 impacts.reports=impacts.reports.filter(r=>r.id==='actuals'||all(c.s,'dashboard').some(d=>d.id===r.id&&impacts.scenarios.some(s=>s.id===d.scenario)))
 impacts.reports.push({id:'headcount:'+p.scenario,name:'Headcount plan against actual',status:'dependent roster conclusions held'})
 impacts.packs=impacts.packs.filter(r=>all(c.s,'pack').some(p=>p.id===r.id&&impacts.scenarios.some(s=>s.id===p.forecast)))
 return {id,revision:prior?.revision??0,metadata,issues,impacts}
}
export function stageHrisSource(c:Context,p:Data,b:Data){
 const review=hrisSourceReview(c,p),prior=find(c.s,'source-guard',review.id)
 requireThat(b.fingerprint===p.fingerprint,'HRIS source or mapping changed; preview again',409)
 requireThat(b.sourceRevision===review.revision,'The source review changed; reload before staging',409)
 // Restaging the identical observation never drops unresolved review decisions.
 if(prior&&prior.previewFingerprint===p.fingerprint)return {...prior,unresolved:sourceGuardIssues(c,prior)}
 const nextExpectedAt=b.nextExpectedAt??new Date(Date.parse(c.now)+86400000).toISOString()
 requireThat(Number.isFinite(Date.parse(nextExpectedAt))&&Date.parse(nextExpectedAt)>Date.parse(c.now),'The next roster update must be a future time')
 const guard={...review,label:p.provider,provider:p.provider,source:review.id,scenario:p.scenario,month:datePeriod(workspace(c.s),p.asOf),sha256:p.sha256,previewFingerprint:p.fingerprint,sourceDigest:p.sourceDigest,observedAt:c.now,nextExpectedAt,stagedAt:c.now,stagedBy:c.x.actor.email,revision:review.revision+1,status:review.issues.length?'review':'ready',decisions:prior&&prior.sourceDigest===p.sourceDigest&&canonicalJson(prior.metadata)===canonicalJson(review.metadata)?prior.decisions:[],history:prior?[...(prior.history??[]),{...prior,history:undefined}]:[],hris:true}
 const fingerprint=digest(JSON.parse(JSON.stringify(guard)))
 put(c.s,'source-guard',review.id,{...guard,fingerprint})
 c.activity.push({action:'hris-source-staged',record:review.id,scenario:p.scenario,detail:{issues:review.issues.length}})
 return {...guard,fingerprint,unresolved:sourceGuardIssues(c,guard)}
}
export function assertHrisSource(c:Context,p:Data){
 const guard=find(c.s,'source-guard',hrisGuardId(p.provider,p.scenario))
 requireThat(guard&&guard.previewFingerprint===p.fingerprint,'Stage and review this exact HRIS observation before accepting it',409)
 requireThat(!sourceGuardIssues(c,guard).length,'Resolve the HRIS source coverage and mapping review before accepting it',409)
 return guard!
}
export function completeHrisSource(c:Context,imp:Data){
 const guard=get(c.s,'source-guard',imp.sourceGuard)
 requireThat(guard.previewFingerprint===imp.reviewedFingerprint&&!sourceGuardIssues(c,guard).length,'The HRIS source review changed; review before continuing',409)
 put(c.s,'source-guard',guard.id,{...guard,status:'completed',acceptedImport:imp.id,completedAt:c.now,revision:guard.revision+1})
}
export function hrisOwnerEvidence(c:Context,observation:string,scenario:string,originId:string){
 const row=get(c.s,'roster-actual',observation,'Accepted HRIS observation')
 const imports=all(c.s,'payroll-import').filter(i=>i.status==='imported'&&i.scenario===scenario&&i.source?.startsWith('hris:')&&i.provider===row.provider)
 const latest=imports.sort((a,b)=>b.asOf.localeCompare(a.asOf))[0]
 requireThat(latest?.destination===row.batch&&row.positionOrigin===originId&&row.ownerBinding,'Review a current provider-derived owner binding for this dated hire',409)
 requireThat(!sourceGuardBlock(c,get(c.s,'scenario',scenario)),'Resolve the provider source review before asking or proposing a hire assumption',409)
 return {observation:row.id,provider:row.provider,asOf:row.asOf,sourceDigest:row.sourceDigest,batch:row.batch,...row.ownerBinding}
}

/** A failed explicit refresh records only a sanitized coverage hold. Preview
 * remains write-free and never changes the last accepted observation. */
export function failHrisSource(c:Context,provider:string,scenario:string){
 const id=hrisGuardId(provider,scenario),prior=find(c.s,'source-guard',id)
 if(!prior)return null
 const issues=[{id:'read-failed',kind:'hris-read',reason:'The provider did not supply a complete readable roster; pull a new complete observation before dependent conclusions resume'}]
 const guard={...prior,status:'review',issues,decisions:[],revision:prior.revision+1,previewFingerprint:null,stagedAt:c.now,history:[...(prior.history??[]),{...prior,history:undefined}]}
 put(c.s,'source-guard',id,guard)
 c.activity.push({action:'hris-source-incomplete',record:id,scenario})
 return {...guard,unresolved:issues}
}
