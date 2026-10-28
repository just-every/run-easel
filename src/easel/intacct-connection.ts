import type { Bindings } from '../auth.server'
import { requireCapability,requireFinance } from './access'
import { sealConnection,openConnection } from './connection-seal'
import type { Context } from './context'
import { entityAllowed } from './entity-access'
import { boundEntity } from './entity-scope'
import { scopedReader } from './group-projections'
import { intacctEntities,IntacctFailure,INTACCT_PURPOSE,INTACCT_READS,type IntacctCredentials } from './intacct-provider'
import { readFence } from './store'
import { all,find,get,put,requireThat,text,type Data } from './types'
export function intacctAuthority(c:Context){requireCapability(c.x,'connections');requireFinance(c.x);requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a company-wide native finance session for Intacct',403)}
export async function intacctKey(c:Context,env:Bindings):Promise<IntacctCredentials>{
 intacctAuthority(c);requireThat(find(c.s,'connection','intacct')?.connected,'Connect Intacct before pulling actuals',409)
 const r=await c.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='intacct'").first<{sealed:string}>();requireThat(r,'Reconnect Intacct after restore; credentials are excluded from archives',409)
 try{return JSON.parse(await openConnection(env.SESSION_SECRET,r.sealed,INTACCT_PURPOSE,'Intacct'))}catch{throw new IntacctFailure('Intacct credentials could not be opened; reconnect in Settings')}
}
export async function intacctStatus(c:Context){
 intacctAuthority(c);const row=find(c.s,'connection','intacct'),secret=await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='intacct'").first()
 return{...row,connected:!!(row?.connected&&secret),operations:INTACCT_READS,schedule:'Manual',book:'ACCRUAL',bindings:all(c.s,'intacct-entity-map'),months:all(c.s,'intacct-month').sort((a,b)=>a.sourceEntity.localeCompare(b.sourceEntity)||a.month.localeCompare(b.month)),error:row?.connected&&!secret?'Reconnect Intacct after restore; credentials are excluded from archives':row?.error??null}
}
const REVOCATION='Deactivate the dedicated Web Services user in Intacct and remove this sender ID from Company → Company → Security → Web Services authorizations. Easel cannot revoke these credentials remotely.'
export async function intacctConnection(c:Context,env:Bindings,op:string,b:Data):Promise<{extra:D1PreparedStatement[]}>{
 intacctAuthority(c);const revision=(c as Context&{revision:number}).revision;requireThat(Number.isSafeInteger(revision),'Reload the native finance session',409);await readFence(c.db,c.x.actor,revision)
 requireThat(['connect','check','disconnect','bind'].includes(op),'Unknown Intacct connection action',404)
 const prior=find(c.s,'connection','intacct')
 if(op==='disconnect'){
  const providerRevocation={status:'unsupported',at:c.now,ownerStep:REVOCATION}
  put(c.s,'connection','intacct',{...prior,connected:false,disconnectedAt:c.now,providerRevocation,error:REVOCATION})
  c.activity.push({action:'intacct-disconnected',record:'intacct',detail:{providerRevocation,localCredentialDeleted:true}})
  return{extra:[c.db.prepare("DELETE FROM e_connection_secrets WHERE id='intacct'")]}
 }
 if(op==='check'){
  const key=await intacctKey(c,env);let health:Data
  try{const entities=await intacctEntities(key);health={entities,error:null,rateLimit:null}}catch(e){if(!(e instanceof IntacctFailure))throw e;health={error:e.message,rateLimit:e.rateLimit}}
  put(c.s,'connection','intacct',{...prior,...health,lastCheck:c.now});c.activity.push({action:'intacct-checked',record:'intacct',detail:{error:health.error,rateLimit:health.rateLimit}});return{extra:[]}
 }
 if(op==='bind'){
  const key=await intacctKey(c,env),source=(await intacctEntities(key)).find(e=>e.id===b.sourceEntity);requireThat(source,'Choose a legal entity authorized by Intacct',403)
  const entity=get(c.s,'entity',b.entity),scenario=get(c.s,'scenario',entity.scenario)
  requireThat(entityAllowed(c.s,c.x,entity)&&boundEntity(c.s,scenario)?.id===entity.id,'The entity source plan is unavailable',403)
  requireThat(source.currency===entity.currency,'The provider and Easel entity base currencies must agree',409)
  const id=JSON.stringify([key.companyId,'ACCRUAL',source.id]),old=find(c.s,'intacct-entity-map',id)
  requireThat(!old||old.entity===entity.id&&old.currency===entity.currency&&old.scenario===entity.scenario,'An accepted entity binding cannot silently change',409)
  requireThat(!all(c.s,'intacct-entity-map').some(r=>r.id!==id&&r.entity===entity.id),'Each Easel entity needs one provider entity',409)
  put(c.s,'intacct-entity-map',id,{company:key.companyId,book:'ACCRUAL',sourceEntity:source.id,entity:entity.id,scenario:entity.scenario,currency:source.currency,name:source.name})
  c.activity.push({action:'intacct-entity-bound',record:id,scenario:entity.scenario,detail:{sourceEntity:source.id,entity:entity.id,currency:source.currency}});return{extra:[]}
 }
 requireThat(!prior?.connected,'Disconnect Intacct before replacing credentials',409);requireThat(b.consent===true,'Explicitly approve read-only Intacct Web Services access')
 const key:IntacctCredentials={senderId:text(b.senderId,'Sender ID',200),senderPassword:text(b.senderPassword,'Sender password',1000),companyId:text(b.companyId,'Company ID',200),userId:text(b.userId,'Dedicated read-only Web Services user',200),userPassword:text(b.userPassword,'User password',1000)}
 requireThat(key.senderPassword.length>=8&&key.userPassword.length>=8,'Use complete Web Services passwords of at least eight characters')
 const entities=await intacctEntities(key);requireThat(entities.length>0,'Intacct returned no authorized legal entities',409)
 const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),INTACCT_PURPOSE)
 put(c.s,'connection','intacct',{connected:true,company:key.companyId,user:key.userId,sender:key.senderId,suffix:key.userPassword.slice(-4),senderSuffix:key.senderPassword.slice(-4),entities,owner:c.x.actor.email,connectedAt:c.now,schedule:'Manual',operations:INTACCT_READS,lastRefresh:null,lastCheck:c.now,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'intacct-connected',record:'intacct',detail:{company:key.companyId,consent:true,operations:INTACCT_READS}})
 return{extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('intacct',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
}
