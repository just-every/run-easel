import { sourceImpacts } from './agents/source-guard-detection'
import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { NETSUITE_PURPOSE, NETSUITE_READS, netsuiteHost, netsuiteInventory, NetsuiteFailure, type NetsuiteCredentials } from './netsuite-provider'
import { readFence } from './store'
import { all, Fault, find, get, put, requireThat, text, type Data } from './types'

export function netsuiteAuthority(c:Context){requireCapability(c.x,'connections');requireFinance(c.x);requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a company-wide native finance session for NetSuite',403)}
export async function netsuiteStatus(c:Context){
 netsuiteAuthority(c)
 const row=find(c.s,'connection','netsuite'),stored=await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='netsuite'").first()
 return{...row,connected:!!(row?.connected&&stored),scope:'Token-based authentication · finance-attested read-only role',operations:NETSUITE_READS,schedule:'Manual',entities:all(c.s,'entity').map(e=>({id:e.id,name:e.name,currency:e.currency})),observations:all(c.s,'netsuite-observation').filter(o=>o.realmId===row?.realmId).map(o=>({...o,impacts:sourceImpacts(c,o.month),status:find(c.s,'netsuite-month',o.id)?.sourceDigest===o.sourceDigest&&!o.error?'accepted':'review required'})),months:all(c.s,'netsuite-month').filter(m=>m.realmId===row?.realmId).sort((a,b)=>a.month.localeCompare(b.month)||a.subsidiaryId.localeCompare(b.subsidiaryId)),error:row?.connected&&!stored?'Reconnect NetSuite after restore; credentials are excluded from archives':row?.error??null}
}
export async function netsuiteKey(c:Context,env:Bindings):Promise<NetsuiteCredentials>{
 netsuiteAuthority(c);requireThat(find(c.s,'connection','netsuite')?.connected,'Connect NetSuite before pulling actuals',409)
 const row=await c.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='netsuite'").first<{sealed:string}>();requireThat(row,'Reconnect NetSuite after restore',409)
 try{return JSON.parse(await openConnection(env.SESSION_SECRET,row.sealed,NETSUITE_PURPOSE,'NetSuite'))}catch{throw new Fault(409,'NetSuite credentials could not be opened; reconnect in Settings')}
}
export async function netsuiteConnection(c:Context,env:Bindings,op:string,b:Data):Promise<D1PreparedStatement[]>{
 netsuiteAuthority(c);await readFence(c.db,c.x.actor,(c as Context&{revision:number}).revision)
 requireThat(['connect','check','map','disconnect'].includes(op),'Unknown NetSuite connection action',404)
 const prior=find(c.s,'connection','netsuite')
 if(op==='disconnect'){
  const providerRevocation={status:'owner-action-required',httpStatus:null,at:c.now}
  put(c.s,'connection','netsuite',{...prior,connected:false,disconnectedAt:c.now,providerRevocation,error:'Local credentials deleted. Revoke this access token in NetSuite: Setup → Users/Roles → Access Tokens. Token-based authentication has no remote self-revocation endpoint.'})
  c.activity.push({action:'netsuite-disconnected',record:'netsuite',detail:{providerRevocation,localCredentialDeleted:true}})
  return[c.db.prepare("DELETE FROM e_connection_secrets WHERE id='netsuite'")]
 }
 if(op==='map'){
  requireThat(prior?.connected,'Connect NetSuite before mapping subsidiaries',409)
  requireThat(prior.inventory.subsidiaries.some((s:Data)=>s.id===b.subsidiaryId),'Choose an available subsidiary')
  const entity=get(c.s,'entity',b.entity),subsidiary=prior.inventory.subsidiaries.find((s:Data)=>s.id===b.subsidiaryId)
  requireThat(entity.currency===subsidiary.currency,'The subsidiary and entity local currencies must agree',409)
  const maps={...prior.subsidiaryEntities},before=maps[b.subsidiaryId]
  requireThat(!Object.entries(maps).some(([id,value])=>id!==b.subsidiaryId&&value===entity.id),'Each subsidiary requires its own entity',409)
  requireThat(!before||before===entity.id||!all(c.s,'netsuite-month').some(m=>m.realmId===prior.realmId&&m.subsidiaryId===b.subsidiaryId),'An accepted subsidiary cannot move to another entity',409)
  maps[b.subsidiaryId]=entity.id
  put(c.s,'dimension-map',`netsuite:${prior.realmId}:${b.subsidiaryId}`,{dimension:entity.dimension,member:entity.member,sourceKind:'subsidiary',source:`${prior.realmId}:${b.subsidiaryId}`,match:'exact'})
  put(c.s,'connection','netsuite',{...prior,subsidiaryEntities:maps})
  c.activity.push({action:'netsuite-subsidiary-mapped',record:b.subsidiaryId,detail:{entity:entity.id}});return[]
 }
 if(op==='check'){
  const key=await netsuiteKey(c,env);let health:Data
  try{const inventory=await netsuiteInventory(key);health={inventory,error:null,rateLimit:null}}catch(e){if(!(e instanceof Fault)||![409,502].includes(e.status))throw e;health={error:e.message,rateLimit:e instanceof NetsuiteFailure?e.rateLimit:null}}
  put(c.s,'connection','netsuite',{...prior,...health,lastCheck:c.now});c.activity.push({action:'netsuite-checked',record:'netsuite',detail:{error:health.error,rateLimit:health.rateLimit}});return[]
 }
 requireThat(!prior?.connected,'Disconnect NetSuite before replacing its grant',409)
 requireThat(b.consent===true&&b.readOnlyRole===true,'Explicitly approve SuiteQL reads and confirm the token belongs to a read-only NetSuite role')
 const realmId=text(b.realmId,'NetSuite account ID',100);netsuiteHost(realmId)
 requireThat(!all(c.s,'netsuite-month').some(m=>m.realmId!==realmId),'This installation already holds another NetSuite account; use a separate installation',409)
 const key:NetsuiteCredentials={realmId,environment:realmId.includes('_')?'sandbox':'production',consumerKey:text(b.consumerKey,'Consumer key',2000),consumerSecret:text(b.consumerSecret,'Consumer secret',2000),tokenId:text(b.tokenId,'Token ID',2000),tokenSecret:text(b.tokenSecret,'Token secret',2000),roleId:text(b.roleId,'Read-only role ID',100)}
 const inventory=await netsuiteInventory(key),sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),NETSUITE_PURPOSE)
 put(c.s,'connection','netsuite',{connected:true,realmId,environment:key.environment,roleId:key.roleId,suffix:key.tokenId.slice(-4),owner:c.x.actor.email,connectedAt:c.now,inventory,subsidiaryEntities:prior?.realmId===realmId?prior.subsidiaryEntities??{}:{},lastRefresh:null,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'netsuite-connected',record:'netsuite',detail:{realmId,roleId:key.roleId,readOnlyRole:true,consent:true}})
 return[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('netsuite',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]
}
