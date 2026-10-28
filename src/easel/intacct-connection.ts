import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { INTACCT_PURPOSE, INTACCT_READS, intacctEntities, IntacctFailure, type IntacctCredentials } from './intacct-provider'
import { readFence } from './store'
import { all, find, get, put, requireThat, text, type Data } from './types'

export function intacctAuthority(c:Context) {
 requireCapability(c.x,'connections');requireFinance(c.x)
 requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a company-wide native finance session for Intacct',403)
}
export async function intacctStatus(c:Context) {
 intacctAuthority(c)
 const row=find(c.s,'connection','intacct'),stored=await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='intacct'").first()
 return{...row,connected:!!(row?.connected&&stored),scope:INTACCT_READS,operations:INTACCT_READS,schedule:'Manual',months:all(c.s,'intacct-month').filter(m=>m.realmId.startsWith(row?.realmId+':')),bindings:all(c.s,'intacct-entity'),error:row?.connected&&!stored?'Reconnect Intacct after restore; credentials are excluded from archives':row?.error??null}
}
export async function intacctKey(c:Context,env:Bindings):Promise<IntacctCredentials> {
 intacctAuthority(c);requireThat(find(c.s,'connection','intacct')?.connected,'Connect Intacct before pulling actuals',409)
 const stored=await c.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='intacct'").first<{sealed:string}>()
 requireThat(stored,'Reconnect Intacct after restore',409)
 return JSON.parse(await openConnection(env.SESSION_SECRET,stored.sealed,INTACCT_PURPOSE,'Intacct'))
}
export async function intacctConnection(c:Context,env:Bindings,op:string,b:Data) {
 intacctAuthority(c);await readFence(c.db,c.x.actor,(c as Context&{revision:number}).revision)
 requireThat(['connect','disconnect','check','entity-map'].includes(op),'Unknown Intacct action',404)
 const prior=find(c.s,'connection','intacct')
 if(op==='disconnect') {
  const providerRevocation={status:'unsupported',httpStatus:null,at:c.now}
  put(c.s,'connection','intacct',{...prior,connected:false,providerRevocation,error:'Local credentials deleted. Disable the Web Services user and revoke sender authorization in Sage Intacct Company → Web Services authorizations.'})
  c.activity.push({action:'intacct-disconnected',record:'intacct',detail:{providerRevocation,localCredentialDeleted:true}})
  return[c.db.prepare("DELETE FROM e_connection_secrets WHERE id='intacct'")]
 }
 if(op==='entity-map') {
  const key=await intacctKey(c,env),entities=await intacctEntities(key),source=text(b.source,'Intacct entity ID'),entity=get(c.s,'entity',b.entity),remote=entities.find(e=>e.id===source)
  requireThat(remote&&remote.currency===entity.currency,'Source entity and plan currencies must agree; no rate is inferred',409)
  const id=key.companyId+':'+source,existing=find(c.s,'intacct-entity',id)
  requireThat(!existing||existing.entity===entity.id,'An imported source entity cannot move to another plan',409)
  requireThat(!all(c.s,'intacct-entity').some(r=>r.id!==id&&r.entity===entity.id),'Each plan binds exactly one source entity',409)
  put(c.s,'intacct-entity',id,{realmId:key.companyId,source,entity:entity.id,currency:remote.currency})
  c.activity.push({action:'intacct-entity-mapped',record:id,detail:{entity:entity.id,source,currency:remote.currency}})
  return[]
 }
 if(op==='check') {
  try { const entities=await intacctEntities(await intacctKey(c,env));put(c.s,'connection','intacct',{...prior,entities,lastCheck:c.now,error:null,rateLimit:null}) }
  catch(e) { if(!(e instanceof IntacctFailure))throw e;put(c.s,'connection','intacct',{...prior,lastCheck:c.now,error:e.message,rateLimit:e.rateLimit}) }
  c.activity.push({action:'intacct-checked',record:'intacct'});return[]
 }
 requireThat(!prior?.connected,'Disconnect Intacct before replacing its credentials',409)
 requireThat(b.consent===true,'Approve read-only Intacct access with a read-only Web Services user')
 const key:IntacctCredentials={companyId:text(b.companyId,'Company ID',100),senderId:text(b.senderId,'Sender ID',100),senderPassword:text(b.senderPassword,'Sender password',1000),userId:text(b.userId,'Web Services user',100),password:text(b.password,'Web Services password',1000)}
 requireThat(!prior?.realmId||prior.realmId===key.companyId||!all(c.s,'intacct-month').length,'Accepted Intacct history belongs to another company; use a separate installation',409)
 const entities=await intacctEntities(key),sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),INTACCT_PURPOSE)
 put(c.s,'connection','intacct',{connected:true,realmId:key.companyId,suffix:key.password.slice(-4),entities,owner:c.x.actor.email,connectedAt:c.now,scope:INTACCT_READS,schedule:'Manual',lastRefresh:null,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'intacct-connected',record:'intacct',detail:{companyId:key.companyId,consent:true,scope:INTACCT_READS}})
 return[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('intacct',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]
}
