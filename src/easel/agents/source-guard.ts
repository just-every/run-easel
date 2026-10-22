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
function unresolved(c:Context,g:Data) {
 return g.issues.filter((i:Data)=>{
  const d=[...g.decisions].reverse().find((d:Data)=>d.issue===i.id)
  if(i.kind==='payroll' && payrollEvidence(c,g,i.expected))return false
  if(!d)return true
  if(d.action==='evidence')return true
  if(i.kind==='account')return find(c.s,'account-map',i.account)?.target!==(d.action==='exclude'?'excluded':d.target)
  if(i.kind==='department' && d.action==='map')return find(c.s,'department-map',i.source)?.department!==d.target
  return false
 })
}

export function sourceGuardView(c:Context) { authority(c); return {guards:all(c.s,'source-guard').map((g):Data=>({...g,unresolved:unresolved(c,g)})).sort((a,b)=>b.stagedAt.localeCompare(a.stagedAt))} }
export function sourceGuardBlock(c:Context,forecast:Data,rule?:Data):string|null {
 if(rule?.kind==='bank-below-plan')return null
 const guard=all(c.s,'source-guard').find(g=>g.status!=='completed' && g.scenario===forecast.id && unresolved(c,g).length)
 return guard ? `Source refresh ${guard.label} for ${guard.month} is blocked: ${unresolved(c,guard).map((i:Data)=>i.reason).join('; ')}` : null
}
/** Called after actuals journal completion, in the same fenced save as batch acceptance. */
export function completeSourceGuards(c:Context,batch:Data) {
 for(const g of all(c.s,'source-guard').filter(g=>g.sha256===batch.sha256 && g.status!=='completed')) {
  requireThat(!unresolved(c,g).length,`Resolve source review for ${g.label} before accepting these actuals`,409)
  put(c.s,'source-guard',g.id,{...g,status:'completed',completedAt:c.now,revision:g.revision+1})
  c.activity.push({action:'source-guard-completed',record:g.id})
 }
}
export async function sourceGuardCommands(c:Context,op:string,b:Data):Promise<Data|undefined> {
 if(!['source-guard-stage','source-guard-review'].includes(op))return
 authority(c)
 if(op==='source-guard-stage') {
  const id=text(b.source,'Source ID',100), label=text(b.label,'Source label'), period=month(b.month,'Coverage month'), scenario=get(c.s,'scenario',b.scenario)
  requireThat(scenario.kind==='forecast' && scenario.status!=='frozen','Choose a working forecast')
  const prior=find(c.s,'source-guard',id)
  requireThat(!prior || b.revision===prior.revision,'The source review changed; reload before staging again',409)
  requireThat(!prior || prior.status==='completed' || !unresolved(c,prior).length,'Resolve the existing source issues before replacing its refresh',409)
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
 requireThat(guard.status!=='completed' && b.revision===guard.revision && b.fingerprint===guard.fingerprint,'The staged source or reviewed revision changed; reload and review again',409)
 requireThat(Array.isArray(b.decisions) && b.decisions.length>0,'Choose source issues to review')
 const decisions=[...guard.decisions]
 for(const decision of b.decisions) {
  const issue=guard.issues.find((i:Data)=>i.id===decision.issue)
  requireThat(issue && (unresolved(c,guard).some((i:Data)=>i.id===issue.id) || decision.action==='evidence' && issue.kind==='payroll' && !decisions.some((d:Data)=>d.issue===issue.id)),'Choose an unresolved source issue',409)
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
 const updated:Data={...guard,decisions,revision:guard.revision+1}
 updated.status=unresolved(c,updated).length?'review':'ready'
 put(c.s,'source-guard',guard.id,updated)
 c.activity.push({action:op,record:guard.id,scenario:guard.scenario,detail:{decisions:decisions.slice(guard.decisions.length)}})
 return {...get(c.s,'source-guard',guard.id),unresolved:unresolved(c,updated)}
}

/** Before creating/applying the GL journal: missing data cannot be accepted around the guard. */
export function assertSourceGuardAcceptance(c:Context,sha256:string) {
 for(const g of all(c.s,'source-guard').filter(g=>g.sha256===sha256 && g.status!=='completed')) requireThat(!unresolved(c,g).length,`Resolve source review for ${g.label} before accepting these actuals`,409)
}
