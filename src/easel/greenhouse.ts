import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { requireCapability, requireFinance, requirePayDetail } from './access'
import { scopedReader } from './group-projections'
import { openConnection, sealConnection } from './connection-seal'
import { GREENHOUSE_PURPOSE, GREENHOUSE_SCOPE, greenhouseKey, greenhouseId, greenhouseObservation, greenhouseRead, GreenhouseFailure } from './greenhouse-provider'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { plan } from './plan'
import { validateInput } from './model'
import { cents } from './units'
import { scenarioAccess, requireScenarioEdit } from './scenario-access'
import { all, find, get, put, requireThat, type Data } from './types'
export function greenhouseAuthority(c:Context) {
 requireCapability(c.x,'connections');requireFinance(c.x);requirePayDetail(c.x)
 requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a native finance session with company-wide pay access for Greenhouse',403)
}
const instruction='Delete the Harvest API key in Greenhouse Dev Center → API Credential Management. Easel cannot revoke a Harvest key.'
export async function greenhouseStatus(c:Context) {
 greenhouseAuthority(c)
 const row=find(c.s,'connection','greenhouse'),secret=await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('greenhouse').first()
 return {...row,connected:Boolean(row?.connected&&secret),scope:GREENHOUSE_SCOPE,schedule:'Manual',revocationInstruction:instruction,error:row?.connected&&!secret?'Reconnect Greenhouse after restore; credentials are excluded from archives':row?.error??null}
}
async function key(c:Context,env:Bindings) {
 greenhouseAuthority(c)
 const row=await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('greenhouse').first<{sealed:string}>()
 requireThat(row&&find(c.s,'connection','greenhouse')?.connected,'Connect Greenhouse in Settings first',409)
 return openConnection(env.SESSION_SECRET,row.sealed,GREENHOUSE_PURPOSE,'Greenhouse')
}
export async function greenhouseConnection(c:Context,env:Bindings,op:string,b:Data) {
 greenhouseAuthority(c);requireThat(['connect','disconnect','check'].includes(op),'Unknown Greenhouse action',404)
 if(op==='check'){
  const credential=await key(c,env),prior=get(c.s,'connection','greenhouse')
  try {
   const read=await greenhouseRead(credential,'jobs?per_page=1&page=1');requireThat(Array.isArray(read.value),'Greenhouse did not return jobs',502)
   put(c.s,'connection','greenhouse',{...prior,lastRefresh:c.now,rowCount:read.value.length,error:null,rateLimited:false,httpStatus:200})
  }catch(error){
   put(c.s,'connection','greenhouse',{...prior,lastAttempt:c.now,error:error instanceof GreenhouseFailure?error.message:'Greenhouse check failed; no plan changes were accepted',rateLimited:error instanceof GreenhouseFailure&&error.httpStatus===429,httpStatus:error instanceof GreenhouseFailure?error.httpStatus:null})
  }
  c.activity.push({action:'greenhouse-checked',record:'greenhouse',detail:{httpStatus:get(c.s,'connection','greenhouse').httpStatus}})
  return []
 }
 if(op==='disconnect'){
  put(c.s,'connection','greenhouse',{...find(c.s,'connection','greenhouse'),connected:false,keySuffix:null,disconnectedAt:c.now,revocation:'unsupported',revocationInstruction:instruction})
  c.activity.push({action:'greenhouse-disconnected',record:'greenhouse',detail:{localCredentialDeleted:true,revocation:'unsupported',ownerStep:instruction}})
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('greenhouse')]
 }
 requireThat(!find(c.s,'connection','greenhouse')?.connected,'Disconnect before replacing this Greenhouse key',409)
 requireThat(b.consent===true,'Approve manual read-only ATS observations explicitly')
 const credential=greenhouseKey(b.apiKey)
 const check=await greenhouseRead(credential,'jobs?per_page=1&page=1');requireThat(Array.isArray(check.value),'Greenhouse did not return jobs',502)
 const sealed=await sealConnection(env.SESSION_SECRET,credential,GREENHOUSE_PURPOSE)
 put(c.s,'connection','greenhouse',{connected:true,owner:c.x.actor.email,connectedAt:c.now,scope:GREENHOUSE_SCOPE,schedule:'Manual',keySuffix:credential.slice(-4),lastRefresh:null,rowCount:0,error:null,rateLimited:false,httpStatus:200})
 c.activity.push({action:'greenhouse-connected',record:'greenhouse',detail:{consent:true,scope:GREENHOUSE_SCOPE}})
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('greenhouse',sealed)]
}
export async function greenhousePreview(c:Context,env:Bindings,b:Data) {
 greenhouseAuthority(c)
 const sc=scenarioAccess(c.s,c.x,b.scenario);requireScenarioEdit(c.x,sc)
 requireThat(sc.status==='working'&&sc.kind!=='proposal'&&!sc.sandbox,'Choose a working company plan',409)
 requireThat(get(c.s,'workspace','main').currency==='USD','Greenhouse salary import requires a USD plan',409)
 const department=get(c.s,'department',b.department),line=get(c.s,'line',b.line)
 requireThat(line.payroll,'Choose a payroll line')
 const source=await greenhouseObservation(await key(c,env),greenhouseId(b.jobId),b.openingId?greenhouseId(b.openingId):undefined)
 const matches=all(c.s,'position').filter(p=>p.scenario===sc.id&&p.ats?.jobId===source.id&&p.ats?.openingId===source.sourceOpeningId&&p.ats?.provider==='greenhouse')
 requireThat(matches.length<=1,'Multiple plan positions reference this requisition',409)
 const prior=matches[0]
 requireThat(!prior||prior.department===department.id&&prior.line===line.id,'Keep the requisition on its reviewed department and payroll line',409)
 requireThat(source.status!=='closed'||prior,'No imported position exists for this closed requisition',409)
 const value={scenario:sc.id,revision:sc.revision,department:department.id,line:line.id,source,prior:prior??null,action:source.status==='closed'?'remove':prior?'update':'add'}
 return {...value,fingerprint:sha256(canonicalJson(value))}
}
export async function greenhousePropose(c:Context,env:Bindings,b:Data) {
 const p=await greenhousePreview(c,env,b)
 requireThat(b.fingerprint===p.fingerprint,'Greenhouse source, mapping or plan changed; preview again',409)
 const duplicate=all(c.s,'scenario').find(s=>s.atsFingerprint===p.fingerprint&&s.proposalStatus!=='declined')
 requireThat(!duplicate,'This observation already has a proposal; review it in Scenarios',409)
 const source=p.source,proposal=(await plan(c,'proposal-create',{from:p.scenario,name:`Greenhouse · ${source.title}`,request:`Review ${p.action} for Greenhouse requisition ${source.id}; official plan unchanged until finance promotion.`}))!
 const current=all(c.s,'position').find(row=>row.scenario===proposal.id&&row.originId===p.prior?.originId)
 if(p.action==='remove')await plan(c,'input-delete',{kind:'position',id:current!.id})
 else {
  // Existing on-cost and compensation assumptions remain in the copied plan.
  // Only the reviewed salary, person, level and dates change.
  const salaryCents=cents(source.annualSalary,'Reviewed annual salary')
  const validated=validateInput(c.s,'position',{originId:current?.originId,backfillOrigin:current?.backfillOrigin,end:current?.end,department:p.department,line:p.line,title:source.title,holder:source.holder,start:source.start.slice(0,7),plannedStartDate:source.start,annualSalary:source.annualSalary},proposal.id)
  if(current) {
   requireThat(current.payBasis!=='hourly','Review hourly conversion manually before importing an annual ATS salary',409)
   put(c.s,'position',current.id,{...current,title:source.title,holder:source.holder,start:validated.start,plannedStartDate:validated.plannedStartDate,annualSalaryCents:salaryCents,ats:{provider:'greenhouse',jobId:source.id,openingId:source.sourceOpeningId,opening:source.opening,level:source.level,sourceDigest:p.fingerprint}})
  } else {
   const row=(await plan(c,'position',{scenario:proposal.id,department:p.department,line:p.line,title:source.title,holder:source.holder,start:source.start.slice(0,7),plannedStartDate:source.start,annualSalary:source.annualSalary}))!
   put(c.s,'position',row.id,{...get(c.s,'position',row.id),ats:{provider:'greenhouse',jobId:source.id,openingId:source.sourceOpeningId,opening:source.opening,level:source.level,sourceDigest:p.fingerprint}})
  }
 }
 put(c.s,'scenario',proposal.id,{...get(c.s,'scenario',proposal.id),atsFingerprint:p.fingerprint,atsSource:{jobId:source.id,opening:source.opening,status:source.status},revision:get(c.s,'scenario',proposal.id).revision+1})
 put(c.s,'connection','greenhouse',{...get(c.s,'connection','greenhouse'),lastRefresh:c.now,rowCount:1,error:null,rateLimited:false,httpStatus:200})
 c.activity.push({action:'greenhouse-proposal-created',record:proposal.id,scenario:proposal.id,detail:{jobId:source.id,action:p.action,sourceDigest:p.fingerprint}})
 return {proposal:get(c.s,'scenario',proposal.id)}
}
