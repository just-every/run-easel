import { ledgerScope } from '../ledger-scope'
import { canSeeScenario } from '../scenario-access'
import { boundEntity } from '../entity-scope'
import { requireAgent } from './governance'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { requireCapability, requireFinance, requirePayDetail } from '../access'
import { actualsCommand, readActuals } from '../actuals'
import type { Context } from '../context'
import { datePeriod } from '../fiscal-calendar'
import { scopedReader } from '../group-projections'
import { workspace } from '../model'
import { month } from '../months'
import { setup } from '../setup'
import { all, find, get, integer, put, requireThat, text, type Data } from '../types'
import { sourceChanges, sourceImpacts } from './source-guard-detection'

function authority(c:Context) {
 requireFinance(c.x); requirePayDetail(c.x)
 requireCapability(c.x,'model-structure')
 requireThat(!scopedReader(c.x),'Company-wide finance access is required for source review',403)
}
const digest = (v: unknown) => sha256(canonicalJson(v))
function isoDate(v:unknown,label:string) { const value=text(v,label,10); requireThat(/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value,`${label} must be a real ISO date`); return value }
function payrollEvidence(c:Context, guard:Data, expected:Data) {
 const imports=all(c.s,'payroll-import').filter(i=>i.status==='imported' && i.scenario===guard.scenario && i.provider===expected.provider)
 return all(c.s,'payroll-run').filter(r=>imports.some(i=>i.destination===r.batch) && r.payDate===expected.payDate).length >= expected.rows
}
function currentIssues(c:Context,g:Data):Data[] { return Date.parse(c.now)>Date.parse(g.nextExpectedAt) && !g.issues.some((i:Data)=>i.kind==='freshness') ? [...g.issues,{id:'freshness',kind:'freshness',reason:`Source stopped updating: next update was expected ${g.nextExpectedAt}`}] : g.issues }
function unresolved(c:Context,g:Data) {
 if(g.status==='withdrawn')return []
 return currentIssues(c,g).filter((i:Data)=>{
  const d=[...g.decisions].reverse().find((d:Data)=>d.issue===i.id)
  if(i.kind==='payroll' && payrollEvidence(c,g,i.expected))return false
  if(!d)return true
  if(d.action==='evidence')return true
  if(i.kind==='account')return find(c.s,'account-map',i.account)?.target!==(d.action==='exclude'?'excluded':d.target)
  if(i.kind==='department' && d.action==='map')return find(c.s,'department-map',i.source)?.department!==d.target
  return false
 })
}

function visibleImpacts(c:Context,g:Data) {
 const impacts:ReturnType<typeof sourceImpacts>=g.provider?structuredClone(g.impacts):sourceImpacts(c,g.month)
 if(g.provider){const visible=sourceImpacts(c,g.month);impacts.scenarios=impacts.scenarios.filter(r=>canSeeScenario(c.x,get(c.s,'scenario',r.id)));impacts.reports=impacts.reports.filter(r=>r.id==='actuals'||r.id==='headcount:'+g.scenario||visible.reports.some(v=>v.id===r.id));impacts.packs=impacts.packs.filter(r=>visible.packs.some(v=>v.id===r.id));impacts.alerts=impacts.alerts.filter(r=>visible.alerts.some(v=>v.id===r.id))}
 if(g.status==='completed' && !unresolved(c,g).length) for(const [kind,rows] of Object.entries(impacts)) for(const row of rows) {
  if(row.status.includes('unchanged'))continue
  row.status=kind==='scenarios'?'working; source refresh accepted':kind==='reports'?'source accepted; available to refresh':kind==='packs'?'draft; accepted source available':'source accepted; ordinary rule checks resumed'
 }
 return impacts
}
export function sourceGuardView(c:Context) { authority(c); return {guards:all(c.s,'source-guard').filter(g=>!g.hris||canSeeScenario(c.x,get(c.s,'scenario',g.scenario))).map((g):Data=>({...g,issues:currentIssues(c,g),unresolved:unresolved(c,g),impacts:visibleImpacts(c,g),history:(g.history ?? []).map((h:Data)=>({...h,impacts:visibleImpacts(c,h)}))})).sort((a,b)=>b.stagedAt.localeCompare(a.stagedAt))} }
export function sourceGuardBlock(c:Context,forecast:Data,rule?:Data,through?:string):string|null {
 if(rule?.kind==='bank-below-plan')return null
 if(forecast.status==='frozen')return null
 const guards=all(c.s,'source-guard').filter(g=>g.status!=='withdrawn'&&(!g.provider||!through||g.month<=through)&&(!g.entity||boundEntity(c.s,forecast)?.id===g.entity)&&(g.scenario===forecast.id || g.impacts.scenarios.some((s:Data)=>s.id===forecast.id) || g.hris&&forecast.parent===g.scenario || !g.hris&&forecast.actualsThrough && forecast.actualsThrough>=g.month) && (g.status!=='completed' || unresolved(c,g).length))
 return guards.length ? guards.map(guard=>`Source refresh ${guard.label} for ${guard.month} is blocked: ${unresolved(c,guard).map((i:Data)=>i.reason).join('; ') || 'accept the reviewed source file before dependent conclusions resume'}`).join('; ') : null
}
/** Called after actuals journal completion, in the same fenced save as batch acceptance. */
export function completeSourceGuards(c:Context,batch:Data) {
 for(const g of all(c.s,'source-guard').filter(g=>!g.hris&&g.sha256===batch.sha256 && g.entity===batch.entity && g.status!=='completed')) {
  requireThat(!unresolved(c,g).length,`Resolve source review for ${g.label} before accepting these actuals`,409)
  put(c.s,'source-guard',g.id,{...g,status:'completed',completedAt:c.now,revision:g.revision+1})
  c.activity.push({action:'source-guard-completed',record:g.id})
 }
}
export async function sourceGuardCommands(c:Context,op:string,b:Data):Promise<Data|undefined> {
 if (['source-guard-stage', 'source-guard-propose'].includes(op)) requireAgent(c, 'sources')
 if(!['source-guard-stage','source-guard-review'].includes(op))return
 authority(c)
 if(op==='source-guard-stage') {
  requireThat(!all(c.s,'batch').some(b=>['importing','undoing'].includes(b.status)), 'Complete the in-progress actuals import before staging another source refresh',409)
  const id=text(b.source,'Source ID',100), label=text(b.label,'Source label'), period=month(b.month,'Coverage month'), scenario=get(c.s,'scenario',b.scenario)
  requireThat(scenario.kind==='forecast' && scenario.status!=='frozen','Choose a working forecast')
  const prior=find(c.s,'source-guard',id)
  requireThat(!prior || b.revision===prior.revision,'The source review changed; reload before staging again',409)
  requireThat(!prior || prior.status==='completed' || !unresolved(c,prior).filter((i:Data)=>i.kind!=='freshness').length,'Resolve the existing source issues before replacing its refresh',409)
  const payload=b.actuals ?? b
  const step=await actualsCommand(c,'preview',payload), preview=step!.result
  const raw=await readActuals({...payload,dateFormat:payload.dateFormat ?? workspace(c.s).dateFormat},workspace(c.s))
  requireThat(raw.normal.some(r=>r.period===period),'The file has no rows in the declared coverage month')
  requireThat(raw.normal.every(r=>r.period===period),'Stage one coverage month per source refresh')
  requireThat(Array.isArray(b.expectedPayroll) && b.expectedPayroll.length<=100,'Declare expected payroll runs (an empty list means no payroll dependency)')
  const expectedPayroll=b.expectedPayroll.map((r:Data)=>({provider:text(r.provider,'Payroll provider',100),payDate:isoDate(r.payDate,'Expected pay date'),rows:integer(r.rows,'Expected employee rows',1,5000)}))
  const observedAt=text(b.observedAt,'Source observation time',40), nextExpectedAt=text(b.nextExpectedAt,'Next expected source update',40)
  requireThat(Date.parse(observedAt)<=Date.parse(c.now) && Number.isFinite(Date.parse(observedAt)) && Number.isFinite(Date.parse(nextExpectedAt)) && Date.parse(nextExpectedAt)>Date.parse(observedAt),'Source freshness needs valid observation and later expected update times')
  requireThat(expectedPayroll.every((r:Data)=>datePeriod(workspace(c.s),r.payDate)===period),'Expected payroll dates must fall in the declared coverage month')
  const metadata={headers:raw.headers,accounts:[...new Set(raw.normal.map(r=>r.account))].sort().map(account=>({account,name:raw.normal.find(r=>r.account===account)?.accountName ?? '',types:[...new Set(raw.normal.filter(r=>r.account===account).map(r=>r.accountType))].sort()})),dimensions:[...new Set(raw.normal.map(r=>canonicalJson(r.sourceDimensions)))].sort()}
  const issues=sourceChanges(c,preview,metadata,prior)
  const guard:Data={id,label,source:id,scenario:scenario.id,month:period,sha256:preview.sha256,previewFingerprint:preview.fingerprint,metadata,expectedPayroll,observedAt,nextExpectedAt,issues,decisions:[],impacts:sourceImpacts(c,period),stagedAt:c.now,stagedBy:c.x.actor.email,revision:(prior?.revision ?? 0)+1,status:'review',history:prior?[...(prior.history ?? []),{...prior,history:undefined}]:[]}
  for(const expected of expectedPayroll)if(!payrollEvidence(c,guard,expected))issues.push({id:digest(['payroll',expected]).slice(0,20),kind:'payroll',expected,reason:`Missing payroll run ${expected.provider} on ${expected.payDate}: ${expected.rows} employee rows expected`})
  if(Date.parse(c.now)>Date.parse(nextExpectedAt))issues.push({id:'freshness',kind:'freshness',reason:`Source stopped updating: next update was expected ${nextExpectedAt}`})
  guard.fingerprint=digest({sha256:guard.sha256,metadata,expectedPayroll,observedAt,nextExpectedAt,issues,impacts:guard.impacts})
  put(c.s,'source-guard',id,guard)
  c.activity.push({action:op,record:id,scenario:scenario.id,detail:{month:period,issues:issues.length}})
  return {...get(c.s,'source-guard',id),unresolved:unresolved(c,guard)}
 }
 const guard=get(c.s,'source-guard',b.id)
 if(guard.hris)requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler,'Use a native finance session for HRIS source decisions',403)
 requireThat(guard.status!=='completed' && b.revision===guard.revision && b.fingerprint===guard.fingerprint,'The staged source or reviewed revision changed; reload and review again',409)
 requireThat(Array.isArray(b.decisions) && b.decisions.length>0,'Choose source issues to review')
 const decisions=[...guard.decisions]
 for(const decision of b.decisions) {
  const issue=currentIssues(c,guard).find((i:Data)=>i.id===decision.issue)
  requireThat(issue && (unresolved(c,guard).some((i:Data)=>i.id===issue.id) || decision.action==='evidence' && issue.kind==='payroll' && !decisions.some((d:Data)=>d.issue===issue.id)),'Choose an unresolved source issue',409)
  requireThat(!guard.hris||!['freshness','hris-mapping','hris-read'].includes(issue.kind),'Pull a fresh roster and complete its employee mapping; this finding cannot be excluded',409)
  const reason=text(decision.reason,'Finance review reason',2000)
  if(decision.action==='map') {
   requireThat(issue.kind==='account' || issue.kind==='department','Only account and department issues use mapping approval')
   setup(c,issue.kind==='account'?'account-map':'department-map',issue.kind==='account'?{account:issue.account,target:decision.target,name:issue.name}:{source:issue.source,department:decision.target})
  } else if(decision.action==='evidence') {
   requireThat(issue.kind==='payroll' && payrollEvidence(c,guard,issue.expected),'Accept the expected payroll register through the payroll file import first',409)
  } else {
   requireThat(decision.action==='exclude','Choose map, evidence or an explicit exclusion')
   if(issue.kind==='account')setup(c,'account-map',{account:issue.account,target:'excluded',name:issue.name})
   // Other exclusions waive this refresh finding only, with an actor/time/reason receipt.
  }
  decisions.push({issue:issue.id,action:decision.action,target:decision.target ?? null,reason,by:c.x.actor.email,at:c.now})
 }
 const updated:Data={...guard,issues:currentIssues(c,guard),decisions,revision:guard.revision+1}
 updated.status=unresolved(c,updated).length?'review':'ready'
 put(c.s,'source-guard',guard.id,updated)
 c.activity.push({action:op,record:guard.id,scenario:guard.scenario,detail:{decisions:decisions.slice(guard.decisions.length)}})
 return {...get(c.s,'source-guard',guard.id),unresolved:unresolved(c,updated)}
}

/** Before creating/applying the GL journal: missing data cannot be accepted around the guard. */
export function assertSourceGuardAcceptance(c:Context,sha256:string,periods:string[],entity?:string) {
 const tracked=all(c.s,'source-guard').filter(g=>!g.hris&&g.entity===entity&&periods.includes(g.month))
 requireThat(!tracked.length || tracked.some(g=>g.sha256===sha256), 'This period has a tracked source; stage the changed source file before accepting its refresh',409)
 for(const g of all(c.s,'source-guard').filter(g=>!g.hris&&g.sha256===sha256 && g.entity===entity && g.status!=='completed')) requireThat(!unresolved(c,g).length,`Resolve source review for ${g.label} before accepting these actuals`,409)
}

/** Native provider staging reuses source proposals, explicit finance decisions and stale holds. */
export function stageNetSuiteSource(c:Context,input:Data){
 authority(c)
 const prior=find(c.s,'source-guard',input.source)
 requireThat(!prior||prior.status==='completed'||!unresolved(c,prior).length,'Resolve the existing source review before replacing its observation',409)
 const issues=sourceChanges(c,input.preview,input.metadata,prior)
 const impacts=sourceImpacts(c,input.month)
 impacts.scenarios=impacts.scenarios.filter(sc=>ledgerScope(c.s,sc.id)===input.entity)
 const guard={...input,provider:'netsuite',id:input.source,issues,decisions:[],impacts,observedAt:c.now,nextExpectedAt:new Date(Date.parse(c.now)+86400000).toISOString(),stagedAt:c.now,stagedBy:c.x.actor.email,revision:(prior?.revision??0)+1,status:issues.length?'review':'ready',history:prior?[...(prior.history??[]),{...prior,history:undefined}]:[]}
 const fingerprint=digest(JSON.parse(JSON.stringify(guard)))
 put(c.s,'source-guard',input.source,{...guard,fingerprint})
 c.activity.push({action:'netsuite-source-staged',record:input.source,scenario:input.scenario,detail:{month:input.month,entity:input.entity,issues:issues.length}})
 return {...guard,fingerprint,unresolved:unresolved(c,guard)}
}

/** Provider staging retains normalized, credential-free inventory, including empty coverage. */
export function stageProviderSource(c:Context,b:Data,preview:Data,metadata:Data){
 authority(c)
 const id=text(b.source,'Source ID',200),scenario=get(c.s,'scenario',b.scenario),prior=find(c.s,'source-guard',id)
 requireThat(scenario.status!=='frozen','Choose a working source plan',409)
 requireThat(!prior||b.revision===prior.revision,'The staged source revision changed',409)
 requireThat(Array.isArray(b.expectedPayroll),'Declare expected payroll dependencies, including an empty list')
 const expectedPayroll=b.expectedPayroll.map((r:Data)=>({provider:text(r.provider,'Payroll provider',100),payDate:isoDate(r.payDate,'Expected pay date'),rows:integer(r.rows,'Expected employee rows',1,5000)}))
 const observedAt=text(b.observedAt,'Observed time',40),nextExpectedAt=text(b.nextExpectedAt,'Next expected update',40)
 requireThat(Number.isFinite(Date.parse(observedAt))&&Date.parse(observedAt)<=Date.parse(c.now)&&Date.parse(nextExpectedAt)>Date.parse(observedAt),'Declare a valid observation and later expected update')
 const impacts=sourceImpacts(c,b.month)
 impacts.scenarios=impacts.scenarios.filter(row=>row.id===scenario.id||all(c.s,'scenario').some(s=>s.id===row.id&&s.parent===scenario.id))
 impacts.packs=impacts.packs.filter(row=>all(c.s,'pack').some(p=>p.id===row.id&&impacts.scenarios.some(s=>s.id===p.forecast)))
 const issues=sourceChanges(c,preview,metadata,prior),guard:Data={id,label:'Sage Intacct',provider:'intacct',entity:b.entity,source:id,scenario:scenario.id,month:b.month,sha256:preview.sha256,sourceFingerprint:preview.sourceFingerprint,previewFingerprint:preview.fingerprint,metadata,expectedPayroll,observedAt,nextExpectedAt,issues,decisions:[],impacts,stagedAt:c.now,stagedBy:c.x.actor.email,revision:(prior?.revision??0)+1,status:'review',history:prior?[...(prior.history??[]),{...prior,history:undefined}]:[]}
 for(const expected of expectedPayroll)if(!payrollEvidence(c,guard,expected))issues.push({id:digest(['payroll',expected]).slice(0,20),kind:'payroll',expected,reason:`Missing payroll run ${expected.provider} on ${expected.payDate}`})
 guard.fingerprint=digest({sha256:guard.sha256,sourceFingerprint:guard.sourceFingerprint,metadata,expectedPayroll,observedAt,nextExpectedAt,issues,impacts})
 guard.status=unresolved(c,guard).length?'review':'ready';put(c.s,'source-guard',id,guard);c.activity.push({action:'intacct-source-staged',record:id,scenario:scenario.id,detail:{entity:b.entity,month:b.month,issues:issues.length}})
 return{...guard,unresolved:unresolved(c,guard)}
}

export { unresolved as sourceGuardIssues }
