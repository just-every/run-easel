import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { scopedReader } from './group-projections'
import { hrisCredentials, HrisFailure, hrisName, hrisPurpose, HRIS_SCOPE, readHris, type Hris, type HrisKey } from './hris-provider'
import { canSeeScenario } from './scenario-access'
import { all, Fault, find, get, put, requireThat, type Data } from './types'

export function hrisAuthority(c:Context){
 requireCapability(c.x,'connections');requireFinance(c.x);requirePayDetail(c.x)
 requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a native finance session with company-wide Pay detail for HRIS connections',403)
}
const recordId=(id:Hris)=>`hris:${id}`
const instructions:Record<Hris,string>={
 rippling:'Revoke the read-only grant in Rippling → App management. Imported bearer credentials cannot revoke their issuing app from Easel.',
 willow:'Revoke the credential or OAuth client in Willow → API credentials. Willow has no credential-authenticated self-revocation endpoint.',
 bamboohr:'Delete this API key in BambooHR → API Keys. BambooHR has no API-key self-revocation endpoint.',
 adp:'Disable the client or certificate in ADP API Central. The short-lived client-credentials token is not a revocable refresh grant.',
}
export async function hrisStatus(c:Context,id:Hris){
 hrisAuthority(c)
 const row=find(c.s,'connection',recordId(id)),stored=await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(recordId(id)).first()
 return {...row,provider:id,name:hrisName[id],connected:Boolean(row?.connected&&stored),scope:HRIS_SCOPE,schedule:'Manual',revocationInstruction:instructions[id],error:row?.connected&&!stored?'Reconnect after restore; credentials are excluded from archives':row?.error??null,
  imports:all(c.s,'payroll-import').filter(i=>i.source===recordId(id)&&canSeeScenario(c.x,get(c.s,'scenario',i.scenario))).map(i=>({id:i.id,scenario:i.scenario,asOf:i.asOf,status:i.status,rows:i.rows,createdAt:i.createdAt}))}
}
export async function hrisStoredCredentials(c:Context,env:Bindings,id:Hris):Promise<HrisKey>{
 hrisAuthority(c)
 const stored=await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(recordId(id)).first<{sealed:string}>()
 requireThat(find(c.s,'connection',recordId(id))?.connected&&stored,'Connect this HRIS in Settings first',409)
 try{return JSON.parse(await openConnection(env.SESSION_SECRET,stored.sealed,hrisPurpose(id),hrisName[id]))}
 catch{throw new Fault(409,'HRIS credential could not be opened; reconnect in Settings')}
}
export async function hrisConnection(c:Context,env:Bindings,id:Hris,op:string,b:Data):Promise<D1PreparedStatement[]>{
 hrisAuthority(c);requireThat(['connect','disconnect','check'].includes(op),'Unknown HRIS connection action',404)
 const name=recordId(id),prior=find(c.s,'connection',name)
 if(op==='disconnect'){
  put(c.s,'connection',name,{...prior,connected:false,keySuffix:null,disconnectedAt:c.now,revocation:'owner-action-required',revocationInstruction:instructions[id],error:null})
  c.activity.push({action:'hris-disconnected',record:name,detail:{provider:id,localCredentialDeleted:true,revocation:'owner-action-required'}})
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(name)]
 }
 if(op==='check'){
  const key=await hrisStoredCredentials(c,env,id)
  try{
   const data=await readHris(id,key,env,c.now.slice(0,10))
   put(c.s,'connection',name,{...prior,lastAttempt:c.now,lastRefresh:c.now,rowCount:data.employeeCount,error:null,rateLimited:false,httpStatus:200})
  }catch(error){
   put(c.s,'connection',name,{...prior,lastAttempt:c.now,error:error instanceof HrisFailure?error.message:'HRIS roster is incomplete or unreadable; no observations accepted',rateLimited:error instanceof HrisFailure&&error.httpStatus===429,httpStatus:error instanceof HrisFailure?error.httpStatus:null})
  }
  const health=get(c.s,'connection',name)
  c.activity.push({action:'hris-checked',record:name,detail:{provider:id,httpStatus:health.httpStatus,failed:Boolean(health.error)}})
  return []
 }
 requireThat(!prior?.connected,'Disconnect this provider before replacing its company or credentials',409)
 requireThat(b.consent===true,'Explicitly approve manual read-only roster and compensation access')
 const key=hrisCredentials(id,b),data=await readHris(id,key,env,c.now.slice(0,10))
 const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),hrisPurpose(id))
 put(c.s,'connection',name,{provider:id,connected:true,tenant:key.tenant,owner:c.x.actor.email,connectedAt:c.now,scope:HRIS_SCOPE,schedule:'Manual',keySuffix:(key.credential||key.clientSecret!).length>8?(key.credential||key.clientSecret!).slice(-4):null,lastRefresh:c.now,rowCount:data.employeeCount,error:null,rateLimited:false,httpStatus:200})
 c.activity.push({action:'hris-connected',record:name,detail:{provider:id,consent:true,scope:HRIS_SCOPE}})
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(name,sealed)]
}
