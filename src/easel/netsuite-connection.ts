import type { Bindings } from '../auth.server'
import { requireCapability,requireFinance } from './access'
import { scopedReader } from './group-projections'
import { openConnection,sealConnection } from './connection-seal'
import type { Context } from './context'
import { netsuiteHost,netsuiteRevoke,NETSUITE_PURPOSE,NETSUITE_READS,type NetSuiteCredentials } from './netsuite-auth'
import { netsuiteMetadata,netsuiteId,NetSuiteFailure } from './netsuite-provider'
import { readFence } from './store'
import { all,find,get,put,requireThat,text,Fault,type Data } from './types'
export function netsuiteAuthority(c:Context){requireCapability(c.x,'connections');requireFinance(c.x);requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a company-wide native finance session for NetSuite',403)}
export async function netsuiteKey(c:Context,env:Bindings):Promise<NetSuiteCredentials>{
 netsuiteAuthority(c);requireThat(find(c.s,'connection','netsuite')?.connected,'Connect NetSuite before pulling actuals',409)
 const row=await c.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='netsuite'").first<{sealed:string}>();requireThat(row,'Reconnect NetSuite after restore; credentials are excluded from archives',409)
 try{return JSON.parse(await openConnection(env.SESSION_SECRET,row.sealed,NETSUITE_PURPOSE,'NetSuite'))}catch{throw new Fault(409,'NetSuite credentials could not be opened; reconnect in Settings')}
}
export async function netsuiteStatus(c:Context){
 netsuiteAuthority(c);const row=find(c.s,'connection','netsuite'),stored=await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='netsuite'").first()
 return {...row,connected:!!(row?.connected&&stored),schedule:'Manual',operations:NETSUITE_READS,rateLimit:row?.rateLimit??null,error:row?.connected&&!stored?'Reconnect NetSuite after restore; credentials are excluded from archives':row?.error??null,bindings:all(c.s,'netsuite-subsidiary').filter(r=>r.account===row?.account),periodMappings:all(c.s,'netsuite-period').filter(r=>r.account===row?.account),months:all(c.s,'netsuite-month').filter(r=>r.account===row?.account),entities:all(c.s,'entity').map(e=>({id:e.id,name:e.name,currency:e.currency,scenario:e.scenario}))}
}
export async function netsuiteConnection(c:Context,env:Bindings,op:string,b:Data){
 netsuiteAuthority(c);const revision=(c as Context&{revision:number}).revision;requireThat(Number.isSafeInteger(revision),'Reload the native finance session before changing NetSuite',409);await readFence(c.db,c.x.actor,revision)
 const prior=find(c.s,'connection','netsuite')
 if(op==='disconnect'){
  let outcome:{status:string;httpStatus:number|null}={status:'unreadable',httpStatus:null}
  try{outcome=await netsuiteRevoke(await netsuiteKey(c,env))}catch{}
  const providerRevocation={...outcome,at:c.now}
  put(c.s,'connection','netsuite',{...prior,connected:false,disconnectedAt:c.now,providerRevocation,error:outcome.status==='confirmed'?null:'NetSuite did not confirm revocation; NetSuite Setup → Users/Roles → User Management → Access Tokens → Edit Easel’s token → Revoke'})
  c.activity.push({action:'netsuite-disconnected',record:'netsuite',detail:{providerRevocation,localCredentialDeleted:true}})
  return {extra:[c.db.prepare("DELETE FROM e_connection_secrets WHERE id='netsuite'")]}
 }
 requireThat(['connect','check','map-subsidiary','map-period'].includes(op),'Unknown NetSuite connection action',404)
 if(op==='connect'){
  const stored=await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='netsuite'").first()
  requireThat(!prior?.connected||!stored,'Disconnect NetSuite before replacing the token',409);requireThat(b.consent===true,'Explicitly approve read-only NetSuite accounting access')
  const key:NetSuiteCredentials={realm:text(b.realm,'Account realm',100),role:text(b.role,'Declared read-only role',200),consumerKey:text(b.consumerKey,'Consumer key',1000),consumerSecret:text(b.consumerSecret,'Consumer secret',1000),tokenId:text(b.tokenId,'Token ID',1000),tokenSecret:text(b.tokenSecret,'Token secret',1000)}
  netsuiteHost(key.realm);const inventory=await netsuiteMetadata(key),sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),NETSUITE_PURPOSE)
  put(c.s,'connection','netsuite',{account:key.realm,role:key.role,connected:true,suffix:key.tokenId.slice(-4),owner:c.x.actor.email,connectedAt:c.now,lastRefresh:null,lastCheck:c.now,rowCount:0,error:null,rateLimit:null,inventory})
  c.activity.push({action:'netsuite-connected',record:'netsuite',detail:{account:key.realm,role:key.role,consent:true,operations:NETSUITE_READS}})
  return {extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('netsuite',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
 }
 const key=await netsuiteKey(c,env)
 if(op==='check'){
  let health:Data;try{const inventory=await netsuiteMetadata(key);health={inventory,error:null,rateLimit:null}}catch(e){if(!(e instanceof NetSuiteFailure))throw e;health={error:e.message,rateLimit:e.rateLimit}}
  put(c.s,'connection','netsuite',{...prior,...health,lastCheck:c.now});c.activity.push({action:'netsuite-checked',record:'netsuite',detail:{error:health.error,rateLimit:health.rateLimit}});return {extra:[]}
 }
 const inventory=await netsuiteMetadata(key),book=netsuiteId(b.book);requireThat(inventory.books.some((v:Data)=>v.id===book),'Select an available accounting book')
 if(op==='map-period'){
  const period=netsuiteId(b.period),source=inventory.periods.find((p:Data)=>p.id===period);requireThat(source&&source.isyear==='F'&&source.isquarter==='F','Select a leaf accounting period')
  requireThat(typeof b.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month),'Choose an Easel month')
  const id=[key.realm,book,period].join(':'),old=find(c.s,'netsuite-period',id)
  requireThat(!old||old.month===b.month||!all(c.s,'netsuite-month').some(m=>m.account===key.realm&&m.book===book),'Accepted source periods cannot be remapped',409)
  put(c.s,'netsuite-period',id,{account:key.realm,book,period,month:b.month,name:source.name,adjustment:source.isadjust==='T'})
 }else{
  const subsidiary=netsuiteId(b.subsidiary),source=inventory.subsidiaries.find((s:Data)=>s.id===subsidiary),entity=get(c.s,'entity',b.entity)
  requireThat(source&&source.currency===entity.currency,'The subsidiary and entity currencies must agree; no FX is inferred',409)
  const id=[key.realm,book,subsidiary].join(':'),old=find(c.s,'netsuite-subsidiary',id)
  requireThat(!all(c.s,'netsuite-subsidiary').some(r=>r.id!==id&&(r.entity===entity.id||r.account===key.realm&&r.subsidiary===subsidiary)),'An entity or subsidiary already has another source binding',409)
  requireThat(!old||old.entity===entity.id,'Source bindings are immutable; accepted history cannot move to another entity',409)
  put(c.s,'netsuite-subsidiary',id,{account:key.realm,book,subsidiary,entity:entity.id,scenario:entity.scenario,currency:entity.currency,name:source.name})
 }
 c.activity.push({action:'netsuite-'+op,record:'netsuite',detail:{book,entity:b.entity??null,subsidiary:b.subsidiary??null,period:b.period??null,month:b.month??null}});return {extra:[]}
}
