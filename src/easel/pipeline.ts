import type { Bindings } from '../auth.server'
import { requireMember, seesDepartmentDetail, seesPayDetail } from './access'
import { canSeeDashboard } from './dashboard-access'
import type { Context } from './context'
import { commissionPosition } from './commissions'
import { datePeriod } from './fiscal-calendar'
import { requireEditable, scenarioInputs, workspace } from './model'
import { month } from './months'
import { visiblePipelineMetadata } from './pipeline-visibility'
import { startPipelineImport } from './pipeline-journal'
import { bump } from './plan'
import { pipelineAuthority, pipelineId, pipelineKey } from './pipeline-connection'
import { PipelineFailure, pipelineProvider, readPipeline, type PipelineSource } from './pipeline-provider'
import { scenarioAccess } from './scenario-access'
import { readFence, sha256 } from './store'
import { all, choice, find, get, integer, put, remove, requireThat, text, type Data } from './types'
import { cents, formatBps, formatMoney, mulDiv, percentBps } from './units'

const sum = (values: number[]) => { const n=Number(values.reduce((a,b)=>a+BigInt(b),0n)); requireThat(Number.isSafeInteger(n),'Pipeline exceeds exact money limits',409); return n }
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])) : v
const digest = (v: unknown) => sha256(JSON.stringify(canonical(v)))
const addDays = (date: string, days: number) => new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
const boundedReview=(value:Data)=>{requireThat(new TextEncoder().encode(JSON.stringify(value)).byteLength<=900000,'CRM review exceeds the atomic record limit; narrow the source grant',409);return value}
function reviewHistory(prior:Data|undefined){
 const history=[...(prior?.history??[])]
 if(prior?.status==='accepted')history.push({status:'accepted',revision:prior.revision,sourceDigest:prior.sourceDigest,assumptionDigest:prior.assumptionDigest,acceptedAt:prior.acceptedAt,acceptedBy:prior.acceptedBy,assumptions:prior.assumptions})
 while(history.length>36 || new TextEncoder().encode(JSON.stringify(history)).byteLength>100000)history.shift()
 return history
}

export function pipelineBlock(c: Context, sc: Data, department?: string) {
 if (sc.status === 'frozen') return null
 if(all(c.s,'pipeline-import').some(i=>i.scenario===sc.id&&['importing','undoing'].includes(i.status)))return 'Complete the pipeline import or undo journal before using dependent conclusions.'
 if(all(c.s,'pipeline-observation').some(r=>r.scenario===sc.id && r.status==='pending'))return 'Observed CRM source changes await mapping and finance acceptance; dependent conclusions are unavailable.'
 const inputs = scenarioInputs(c.s,sc.id,'revenue').filter(r=>r.pipeline && (!department || r.department === department))
 const providers = new Set([...inputs.map(r=>r.pipeline.provider),...Object.keys(sc.pipelineSources??{})])
 for (const review of all(c.s,'pipeline-review').filter(r=>r.scenario === sc.id && (!department || r.departments.includes(department)))) {
  providers.add(review.provider)
  if (review.status === 'pending') return 'Pipeline source changes await finance review; dependent conclusions are unavailable.'
 }
 for (const provider of providers) {
  const connection=find(c.s,'connection',pipelineId(provider)), review=all(c.s,'pipeline-review').find(r=>r.scenario===sc.id && r.provider===provider)
  if (!connection?.connected || connection.error) return 'Pipeline source is disconnected or its last read failed; dependent conclusions are unavailable.'
  const acceptedDigest=sc.pipelineSources?.[provider]?.sourceDigest ?? review?.sourceDigest
  if(connection.latestSourceDigest && acceptedDigest!==connection.latestSourceDigest)return 'Pipeline source changed since this scenario was accepted; review this scenario before using dependent conclusions.'
  if(connection.pendingRaw)return 'Pipeline source changes await finance acceptance; dependent conclusions are unavailable.'
  const expected=sc.pipelineSources?.[provider]?.nextExpectedAt ?? review?.nextExpectedAt ?? connection.nextExpectedAt
  if(expected && Date.parse(c.now)>Date.parse(expected))return 'Pipeline source stopped updating; refresh and review before using dependent conclusions.'
 }
 return null
}

function assumptions(c: Context, b: Data, source: PipelineSource, scenario: Data, provider: string) {
 const w=workspace(c.s), positions=scenarioInputs(c.s,scenario.id,'position')
 if(source.currency!==w.currency||source.deals.some(d=>d.currency!==w.currency))throw new PipelineFailure('CRM currency differs from the plan; no exchange rate is inferred; accepted data is unchanged')
 for (const key of ['stages','products','owners','periods']) requireThat(Array.isArray(b[key]),`Review explicit ${key} mappings`)
 requireThat(new Set(source.deals.map(d=>d.id)).size===source.deals.length && new Set(source.stages.map(s=>s.id)).size===source.stages.length,'CRM source identifiers are ambiguous',409)
 const stages:Data[]=source.stages.map((s):Data=>{
  const maps=b.stages.filter((m:Data)=>m.stage===s.id); requireThat(maps.length===1,`Map stage ${s.name} exactly once`,409)
  const m=maps[0], mode=choice(m.mode,['crm','override'] as const,'stage probability source')
  requireThat(mode!=='crm' || Number.isSafeInteger(s.probabilityBps),'This CRM stage needs a finance probability',409)
  return {...s,mode,probabilityBps:mode==='crm'?s.probabilityBps:percentBps(m.probability,'Stage probability'),slippageDays:integer(m.slippageDays,'Stage slippage days',0,730)}
 })
 requireThat(b.stages.length===stages.length,'Remove mappings for stages no longer in the source',409)
 const productIds=[...new Set(source.deals.flatMap(d=>d.products.length?d.products.map((p:Data)=>p.product):['*']))].sort()
 const products=productIds.map(id=>{
  const maps=b.products.filter((m:Data)=>m.product===id); requireThat(maps.length===1,`Map product ${id} exactly once`,409)
  const p=maps[0], line=get(c.s,'line',p.line), department=get(c.s,'department',p.department)
  requireThat(line.type==='revenue' && !line.nonCash,'Choose a cash revenue planning line')
  requireEditable(c.s,c.x,scenario,department.id)
  return {product:id,line:line.id,department:department.id,rule:choice(p.rule,['one-time','ratable','subscription-start'] as const,'deal-to-revenue rule'),termMonths:integer(p.termMonths ?? 1,'Term months',1,120),termSource:choice(p.termSource ?? 'finance',['finance','crm'] as const,'term source'),dsoDays:integer(p.dsoDays ?? 0,'Collection days',0,365)}
 })
 requireThat(products.length===b.products.length,'Remove unused product mappings',409)
 const ownerIds=[...new Set(source.deals.map(d=>d.owner))].sort()
 const owners=ownerIds.map(owner=>{
  const maps=b.owners.filter((m:Data)=>m.owner===owner); requireThat(maps.length===1,`Review CRM owner ${owner || '(unassigned)'} exactly once`,409)
  const p=maps[0], position=p.position?positions.find(r=>r.originId===p.position):null
  if (p.position) { requireThat(position,'CRM commission position must exist in the same scenario',409); requireThat(seesPayDetail(c.x,position!.department),'Pay detail is required to map CRM commission',403); requireThat(!get(c.s,'line',position!.line).nonCash,'Commission needs a cash salary line',409) }
  let member=''
  if (p.member) { if(p.member===c.x.actor.email)member=c.x.actor.email;else{const m=get(c.s,'member',p.member); requireThat(m.active && m.role!=='viewer','Map CRM owners to active native planners'); member=m.id} }
  return {owner,position:position?.originId ?? '',member}
 })
 requireThat(owners.length===b.owners.length,'Remove unused CRM owner mappings',409)
 const periods:Data[]=source.periods.map((p):Data=>{
  const matches=b.periods.filter((m:Data)=>m.period===p.id); requireThat(matches.length===1,`Map Salesforce fiscal period ${p.id}`,409)
  requireThat(p.start<=p.end,'CRM fiscal period is inverted',409)
  return {...p,month:month(matches[0].month)}
 }).sort((a,b)=>a.start.localeCompare(b.start))
 requireThat(b.periods.length===periods.length && new Set(periods.map(p=>p.month)).size===periods.length,'Fiscal periods must map once to distinct Easel period keys',409)
 for(let i=1;i<periods.length;i++)requireThat(periods[i].start>periods[i-1].end && periods[i].month>periods[i-1].month,'CRM fiscal periods overlap or have reordered Easel mappings',409)
 const probabilityVersion={stages,products,owners,periods}
 const inputs:Data[]=[]
 for(const deal of [...source.deals].sort((a,b)=>a.id.localeCompare(b.id))) {
  const stage=stages.find(s=>s.id===deal.stage); requireThat(stage,'CRM deal stage has no reviewed probability',409)
  const closeDate=addDays(deal.closeDate,deal.closed?0:stage!.slippageDays)
  const fiscal=provider==='salesforce'?periods.filter(p=>p.start<=closeDate && closeDate<=p.end):[]
  requireThat(provider!=='salesforce'||fiscal.length===1,'Slipped Salesforce close date has no unique CRM fiscal period',409)
  const start=fiscal[0]?.month ?? datePeriod(w,closeDate)
  const probability=deal.closed?(deal.won?10000:0):stage!.probabilityBps
  const owner=owners.find(o=>o.owner===deal.owner)!
  const parts=deal.products.length?deal.products:[{id:'deal',product:'*',name:deal.name,amountCents:deal.amountCents,term:null}]
  requireThat(sum(parts.map((p:Data)=>p.amountCents))===deal.amountCents,`CRM deal ${deal.id} amount differs from its line items; review in the CRM`,409)
  for(const part of parts) {
   const rule=products.find(p=>p.product===part.product)!
   let term=rule.termMonths
   if(rule.termSource==='crm' && rule.rule!=='one-time') { const raw=String(part.term??''), match=raw.match(/^(?:P)?([1-9]\d{0,2})(?:M)?$/); if(!match||Number(match[1])>120)throw new PipelineFailure('CRM line-item term is absent or unsupported for its reviewed revenue rule; accepted data is unchanged'); term=Number(match![1]) }
   if(rule.rule==='one-time')term=1
   const originId=`crm:${provider}:${deal.id}:${part.id}`, weighted=mulDiv(part.amountCents,probability,10000)
   requireThat(Number.isSafeInteger(weighted),'Weighted booking exceeds exact range',409)
   const input:Data={id:`${scenario.id}:${originId}`,originId,scenario:scenario.id,kind:'contract',name:part.product==='*'?deal.name:`${deal.name} · ${part.name}`,line:rule.line,department:rule.department,start,startDate:closeDate,contractValueCents:weighted,termMonths:term,billingCadence:'annual',dsoDays:rule.dsoDays,collectionLag:0,collectionMethod:'lag',dimensions:{},
    ...(owner.position?{commissionPosition:owner.position}:{}),pipeline:{provider,deal:deal.id,product:part.product,item:part.id,owner:deal.owner,member:owner.member,stage:deal.stage,stageName:stage!.name,closed:deal.closed,won:deal.won,sourceAmountCents:part.amountCents,sourceCloseDate:deal.closeDate,slippageDays:deal.closed?0:stage!.slippageDays,probabilityBps:probability,crmProbabilityBps:source.stages.find(s=>s.id===deal.stage)?.probabilityBps,mode:stage!.mode,rule:rule.rule,fiscalPeriod:fiscal[0]??null,quantity:part.quantity??null,unitPriceCents:part.unitPriceCents??null}}
   if(owner.position)commissionPosition(positions,input)
   if(provider==='salesforce'){
    const collection=addDays(closeDate,rule.dsoDays), matches=periods.filter(p=>p.start<=collection && collection<=p.end)
    requireThat(matches.length===1,'Salesforce collection date has no reviewed fiscal period',409)
    input.pipeline.collectionPeriod=matches[0].month
    input.pipeline.fiscalPeriods=periods
   }
   inputs.push(input)
  }
 }
 return {inputs,assumptions:probabilityVersion}
}

function impacts(c: Context, scenario: string) {
 const scenarios=all(c.s,'scenario').filter(s=>s.id===scenario||s.parent===scenario).map(s=>({id:s.id,name:s.name,status:s.status==='frozen'?'captured; unchanged':'working dependency'}))
 return {scenarios,reports:all(c.s,'dashboard').filter(d=>canSeeDashboard(c.s,c.x,d)&&scenarios.some(s=>s.id===d.scenario)).map(d=>({id:d.id,name:d.name})),packs:all(c.s,'pack').filter(p=>scenarios.some(s=>s.id===p.forecast)).map(p=>({id:p.id,status:p.status==='published'?'published; unchanged':'draft dependency'})),alerts:all(c.s,'cash-alert-rule').filter(r=>!r.scenario||scenarios.some(s=>s.id===r.scenario)).map(r=>({id:r.id,name:r.name}))}
}

function mappingSuggestions(c:Context,source:PipelineSource,scenario:string,provider:string) {
 const prior=find(c.s,'pipeline-review',`${scenario}:${provider}`)?.assumptions?.products??[]
 const lines=all(c.s,'line').filter(l=>l.type==='revenue'&&!l.nonCash)
 const departments=all(c.s,'department')
 const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\brevenue\b/g,'').trim()
 const products=new Map<string,string>(source.deals.flatMap(d=>d.products.length?d.products.map((p:Data)=>[p.product,p.name] as [string,string]):[['*','Deal amount'] as [string,string]]))
 return [...products].map(([product,name])=>{
  const saved=prior.find((p:Data)=>p.product===product)
  const matches=lines.filter(l=>normalize(l.name)===normalize(name)||normalize(l.name)===normalize(product))
  const line=saved&&lines.some(l=>l.id===saved.line)?saved.line:matches.length===1?matches[0].id:lines.length===1?lines[0].id:null
  const related=prior.filter((p:Data)=>p.line===line)
  const mappedDepartments=[...new Set(related.map((p:Data)=>p.department))]
  const department=saved?.department??(mappedDepartments.length===1?mappedDepartments[0]:departments.length===1?departments[0].id:null)
  return {product,name,line,department,reason:saved?'Previously finance-approved mapping for this stable CRM product ID.':matches.length===1?`CRM product "${name}" matches planning line "${matches[0].name}" by normalized name.`:lines.length===1?'Only one cash revenue line is available.':'No unique planning-line match; finance must select a target.',departmentReason:department?'Retained approved product/line department, or the only planning department.':'Multiple departments are available; finance must choose.',requiresFinanceApproval:true}
 })
}

export async function pipelinePull(c: Context, env: Bindings, op: string, b: Data) {
 pipelineAuthority(c)
 const provider=pipelineProvider(b.provider), sc=scenarioAccess(c.s,c.x,b.scenario), w=workspace(c.s)
 requireThat(sc.status!=='frozen' && sc.kind!=='proposal' && !sc.sandbox,'Pull CRM data into a working company budget or forecast',409)
 requireThat(!all(c.s,'pipeline-import').some(i=>i.scenario===sc.id&&['importing','undoing'].includes(i.status)),'Finish the pending pipeline import before another pull',409)
 requireThat(sc.revision===b.revision,'The plan changed; review pipeline again',409)
 requireThat(['sources','observe','preview','stage','accept'].includes(op),'Unknown pipeline action',404)
 const source=await readPipeline(await pipelineKey(c,env,provider),()=>readFence(c.db,c.x.actor,(c as Context & {revision:number}).revision))
 for(const deal of source.deals){
  if(new Set(deal.products.map((p:Data)=>p.id)).size!==deal.products.length)throw new PipelineFailure('CRM repeated a product line within one deal; accepted data is unchanged')
  deal.products.sort((a:Data,b:Data)=>a.id.localeCompare(b.id))
 }
 source.deals.sort((a,b)=>a.id.localeCompare(b.id));source.stages.sort((a,b)=>a.id.localeCompare(b.id));source.periods.sort((a,b)=>a.start.localeCompare(b.start))
 if(new TextEncoder().encode(JSON.stringify(source)).byteLength>750000)throw new PipelineFailure('CRM observation exceeds the atomic review limit; narrow the scoped source; accepted data is unchanged')
 if(op==='sources')return {...source,mappingSuggestions:mappingSuggestions(c,source,sc.id,provider)}
 if(op==='observe'){
  const id=`${sc.id}:${provider}`, prior=find(c.s,'pipeline-review',id),sourceDigest=await digest(source)
  const connection=get(c.s,'connection',pipelineId(provider))
  put(c.s,'connection',connection.id,{...connection,latestSourceDigest:sourceDigest,pendingRaw:connection.sourceDigest!==sourceDigest})
  put(c.s,'pipeline-observation',id,{scenario:sc.id,provider,sourceDigest,observedAt:c.now,observedBy:c.x.actor.email,status:prior?.sourceDigest===sourceDigest&&prior.status==='accepted'?'accepted':'pending',stages:source.stages,products:[...new Set(source.deals.flatMap(d=>d.products.map((p:Data)=>p.product)))],rows:source.deals.length})
  c.activity.push({action:'pipeline-observed',record:id,scenario:sc.id,detail:{provider,sourceDigest,rows:source.deals.length}})
  return {...source,mappingSuggestions:mappingSuggestions(c,source,sc.id,provider)}
 }
 // Removing a mapping also changes compensation. Recheck the previous links,
 // so omitting a position cannot bypass live Pay detail authority.
 for(const old of scenarioInputs(c.s,sc.id,'revenue').filter(r=>r.pipeline?.provider===provider && r.commissionPosition)){
  const position=scenarioInputs(c.s,sc.id,'position').find(p=>p.originId===old.commissionPosition)
  requireThat(position && seesPayDetail(c.x,position.department),'Pay detail is required to change or remove an existing CRM commission link',403)
 }
 const built=assumptions(c,b,source,sc,provider), sourceDigest=await digest(source)
 const coverageTargetCents=cents(b.coverageTarget,'Quarterly pipeline bookings target');requireThat(coverageTargetCents>0,'Quarterly pipeline target must be positive')
 Object.assign(built.assumptions,{coverageTargetCents})
 const assumptionDigest=await digest(built.assumptions)
 for(const input of built.inputs)input.pipeline.assumptionVersion=assumptionDigest
 const id=`${sc.id}:${provider}`, prior=find(c.s,'pipeline-review',id)
 const previous=scenarioInputs(c.s,sc.id,'revenue').filter(r=>r.pipeline?.provider===provider)
 const changes=[...new Set([...previous.map(r=>r.originId),...built.inputs.map(r=>r.originId)])].sort().flatMap(origin=>{
  const before=previous.find(r=>r.originId===origin),after=built.inputs.find(r=>r.originId===origin)
  const comparable=(r:Data|undefined)=>r?{...r,id:undefined,pipeline:{...r.pipeline,nextExpectedAt:undefined}}:r
  return JSON.stringify(canonical(comparable(before)))===JSON.stringify(canonical(comparable(after)))?[]:[{origin,before:before??null,after:after??null}]
 })
 const material=(r:Data|null)=>r?{...r,id:undefined,pipeline:{...r.pipeline,nextExpectedAt:undefined,assumptionVersion:undefined}}:r
 const closedChangeOrigins=changes.filter(change=>sc.actualsThrough && (change.before?.start<=sc.actualsThrough || change.after?.start<=sc.actualsThrough) && JSON.stringify(canonical(material(change.before)))!==JSON.stringify(canonical(material(change.after)))).map(change=>change.origin)
 const nextExpectedAt=text(b.nextExpectedAt,'Next expected CRM update',40)
 requireThat(Number.isFinite(Date.parse(nextExpectedAt))&&Date.parse(nextExpectedAt)>Date.parse(c.now),'Choose a future expected source update')
 const fingerprint=await digest({sourceDigest,assumptionDigest,revision:sc.revision,nextExpectedAt})
 const result={id,provider,scenario:sc.id,revision:sc.revision,digest:fingerprint,sourceDigest,assumptionDigest,currency:w.currency,source,assumptions:built.assumptions,changes,closedChangeOrigins,impacts:impacts(c,sc.id),nextExpectedAt,departments:[...new Set([...built.inputs,...previous].map(r=>r.department))],
  bookings:built.inputs.map(r=>({deal:r.pipeline.deal,product:r.pipeline.product,month:r.start,amountCents:r.contractValueCents,probabilityBps:r.pipeline.probabilityBps,trace:`${provider} deal ${r.pipeline.deal}: ${formatMoney(r.pipeline.sourceAmountCents,w.currency)} × ${formatBps(r.pipeline.probabilityBps)} (${r.pipeline.closed?'closed outcome':r.pipeline.mode==='override'?'finance override':'CRM probability'}); source close ${r.pipeline.sourceCloseDate} + ${r.pipeline.slippageDays} days = ${r.startDate}; ${r.pipeline.fiscalPeriod?`Salesforce fiscal period ${r.pipeline.fiscalPeriod.id} → `:''}${r.start}; assumption version ${assumptionDigest}`}))}
 if(op==='preview')return result
 const {source:_inventory,changes:_changes,bookings:_bookings,impacts:_impacts,...metadata}=result
 if(op==='stage'){
  const connection=get(c.s,'connection',pipelineId(provider))
  put(c.s,'connection',connection.id,{...connection,latestSourceDigest:sourceDigest,pendingRaw:connection.sourceDigest!==sourceDigest})
  put(c.s,'pipeline-review',id,boundedReview({...metadata,status:changes.length?'pending':'accepted',stagedBy:c.x.actor.email,stagedAt:c.now,acceptedSource:prior?.acceptedSource??null,history:reviewHistory(prior)}))
  c.activity.push({action:'pipeline-staged',record:id,scenario:sc.id,detail:{sourceDigest,changes:changes.length}})
  return result
 }
 requireThat(b.digest===fingerprint,'CRM, assumptions or plan changed since preview; review again',409)
 requireThat(prior?.digest===fingerprint && prior.status==='pending' || !changes.length,'Stage the exact source changes before accepting them',409)
 if(changes.length)text(b.reason,'Finance source-review reason',2000)
 requireThat(!closedChangeOrigins.length || b.reviewedClosedChanges===true,'Explicitly review the closed-period CRM changes before applying their future planning effects; accepted actuals and captures remain fixed',409)
 if(closedChangeOrigins.length)c.activity.push({action:'pipeline-restatement-reviewed',record:id,scenario:sc.id,detail:{sourceDigest,origins:closedChangeOrigins,actualsThrough:sc.actualsThrough,reason:b.reason,acceptedActualsAndCapturesUnchanged:true}})
 const beforeImport=new Map(c.s),activityBefore=c.activity.length
 if(changes.length){
  const accepted=prior?.acceptedSource as PipelineSource|undefined
  for(const observed of [accepted,source].filter(Boolean) as PipelineSource[])for(const deal of observed.deals.filter(d=>!d.closed)){
   const stage=(observed===source?built.assumptions:prior?.assumptions)?.stages.find((s:Data)=>s.id===deal.stage)
   const visitId=`${provider}:${deal.id}:${deal.stage}`
   if(stage && !find(c.s,'pipeline-stage-visit',visitId))put(c.s,'pipeline-stage-visit',visitId,{provider,deal:deal.id,stage:deal.stage,stageName:stage.name,probabilityBps:stage.probabilityBps,observedAt:c.now,sourceDigest})
  }
  for(const closed of source.deals.filter(d=>d.closed))for(const visit of all(c.s,'pipeline-stage-visit').filter(v=>v.provider===provider&&v.deal===closed.id)){
   if(!find(c.s,'pipeline-outcome',visit.id))put(c.s,'pipeline-outcome',visit.id,{...visit,outcomeBps:closed.won?10000:0,closedAt:closed.closeDate,observedAt:c.now,sourceDigest,reviewedBy:c.x.actor.email})
  }
  for(const old of previous)remove(c.s,'revenue',old.id)
  for(const input of built.inputs)put(c.s,'revenue',input.id,input)
  bump(c,sc,'pipeline-accepted',id,{provider,sourceDigest,assumptionDigest,deals:source.deals.length,reason:b.reason})
 }
 if(b.coverageTarget!==undefined){
  const target=cents(b.coverageTarget,'Quarterly pipeline bookings target')
  requireThat(target>0,'Quarterly pipeline target must be positive')
  const current=get(c.s,'scenario',sc.id)
  put(c.s,'scenario',sc.id,{...current,pipelineCoverageTargetCents:target,pipelineSources:{...current.pipelineSources,[provider]:{sourceDigest,observedAt:c.now,nextExpectedAt,rows:source.deals.length}}})
  if(!changes.length && current.pipelineCoverageTargetCents!==target)bump(c,get(c.s,'scenario',sc.id),'pipeline-target-saved',id,{targetCents:target})
 }
 put(c.s,'pipeline-review',id,boundedReview({...metadata,status:'accepted',acceptedSource:source,acceptedBy:c.x.actor.email,acceptedAt:c.now,resultingRevision:get(c.s,'scenario',sc.id).revision,history:prior?.status==='accepted'?reviewHistory(prior):prior?.history??[]}))
 put(c.s,'pipeline-observation',id,{scenario:sc.id,provider,sourceDigest,status:'accepted',observedAt:c.now,acceptedBy:c.x.actor.email})
 put(c.s,'connection',pipelineId(provider),{...get(c.s,'connection',pipelineId(provider)),lastRefresh:c.now,nextExpectedAt,sourceDigest,latestSourceDigest:sourceDigest,pendingRaw:false,rowCount:source.deals.length,error:null,rateLimit:null})
 c.activity.push({action:'pipeline-refresh',record:id,scenario:sc.id,detail:{sourceDigest,assumptionDigest,changes:changes.length}})
 const acceptedResult={...result,unchanged:!changes.length}
 if(changes.length)return {pipelineStep:await startPipelineImport(c,beforeImport,activityBefore,sc.id,provider,acceptedResult)}
 return acceptedResult
}

export function pipelineFailed(c: Context, error: unknown, name: unknown) {
 if(!(error instanceof PipelineFailure))return false
 const p=pipelineProvider(name), row=find(c.s,'connection',pipelineId(p))
 if(row)put(c.s,'connection',row.id,{...row,error:error.message,failedAt:c.now,rateLimit:error.rateLimit,httpStatus:error.httpStatus})
 c.activity.push({action:'pipeline-read-failed',record:pipelineId(p),detail:{error:error.message,httpStatus:error.httpStatus,acceptedDataUnchanged:true}})
 return true
}

export function pipelineView(c: Context, scenario: unknown) {
 requireMember(c.x); const sc=scenarioAccess(c.s,c.x,scenario)
 const visible=(r:Data)=>seesDepartmentDetail(c.x,r.department)
 const inputs=scenarioInputs(c.s,sc.id,'revenue').filter(r=>r.pipeline && visible(r))
 return {scenario:sc.id,revision:sc.revision,blocked:pipelineBlock(c,sc),deals:inputs.map(r=>({id:r.originId,name:r.name,month:r.start,weightedCents:r.contractValueCents,provider:r.pipeline.provider,deal:r.pipeline.deal,product:r.pipeline.product,stage:r.pipeline.stageName,closed:r.pipeline.closed,closeDate:r.startDate,probabilityBps:r.pipeline.probabilityBps,mode:r.pipeline.mode,assumptionVersion:r.pipeline.assumptionVersion})),
  positions:c.x.role==='finance'?scenarioInputs(c.s,sc.id,'position').filter(p=>seesPayDetail(c.x,p.department)).map(p=>({origin:p.originId,title:p.title,department:p.department})):[],
  imports:c.x.role==='finance'&&c.x.payDetail?all(c.s,'pipeline-import').filter(i=>i.scenario===sc.id).map(i=>({id:i.id,provider:i.provider,status:i.status,createdAt:i.createdAt,acceptedRevision:i.acceptedRevision,revision:sc.revision})):[],
  reviews:c.x.role==='finance' && c.x.payDetail?all(c.s,'pipeline-review').filter(r=>r.scenario===sc.id).map(r=>visiblePipelineMetadata(c.s,c.x,{...r,impacts:r.impacts??impacts(c,sc.id)})):[]}
}
