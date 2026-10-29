import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { ownerDestination } from './egress'
import { authority, readFence, sha256 } from './store'
import { pipelineExchange, pipelineProvider, salesforceOrigin, type PipelineKey, type PipelineProvider } from './pipeline-provider'
import { find, put, requireThat, text, type Data } from './types'

export const pipelineId = (p: string) => `pipeline-${p}`
const purpose = (p: string) => `easel:pipeline:${p}:read:v1`
export function pipelineAuthority(c: Context) {
 requireFinance(c.x); requireCapability(c.x,'connections')
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a company-wide native finance session for CRM administration and pulls', 403)
}
const ownerAction = (p: string) => p === 'hubspot' ? 'Uninstall Easel in HubSpot Settings → Integrations → Connected apps.' : p === 'salesforce' ? 'Revoke Easel in Salesforce Settings → Connected Apps OAuth Usage.' : 'Revoke this scoped token in Orbit API credentials.'
export async function pipelineStatus(c: Context, name: unknown) {
 pipelineAuthority(c); const p = pipelineProvider(name), id = pipelineId(p), row = find(c.s,'connection',id)
 const secret = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(id).first()
 return { ...row, provider:p, connected:!!(row?.connected && secret), scope:p === 'orbit' ? 'deal.read; explicitly scoped deal records' : 'Read-only deals, stages and products; Salesforce fiscal periods', schedule:'Manual reviewed pulls', ownerAction:ownerAction(p),
  error: row?.connected && !secret ? 'Reconnect after restore; CRM credentials are excluded from archives' : row?.error ?? null }
}
async function stored(c: Context, env: Bindings, p: PipelineProvider, pending = false) {
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(pipelineId(p) + (pending ? '-pending' : '')).first<{sealed:string}>()
 requireThat(row,'Connect the CRM in Pipeline before reading deals',409)
 return { sealed:row!.sealed, key:JSON.parse(await openConnection(env.SESSION_SECRET,row!.sealed,purpose(p),p)) as PipelineKey }
}
export async function pipelineKey(c: Context, env: Bindings, p: PipelineProvider) {
 pipelineAuthority(c)
 requireThat(find(c.s,'connection',pipelineId(p))?.connected,'Connect this CRM first',409)
 const prior = await stored(c,env,p)
 if (p === 'orbit' || prior.key.expiresAt > Date.now() + 60000) return prior.key
 const claim = crypto.randomUUID(), fence = authority(c.x.actor,true), id = pipelineId(p)
 const lease = await c.db.prepare('INSERT INTO e_pipeline_refresh(id,claim,expires_at) SELECT ?,?,? WHERE ('+fence.sql+') ON CONFLICT(id) DO UPDATE SET claim=excluded.claim,expires_at=excluded.expires_at WHERE e_pipeline_refresh.expires_at<? RETURNING claim').bind(id,claim,Date.now()+60000,...fence.params,Date.now()).first<{claim:string}>()
 requireThat(lease?.claim === claim,'A CRM token refresh is in progress; retry explicitly later',409)
 try {
  const current = await stored(c,env,p)
  requireThat(current.sealed === prior.sealed,'CRM custody changed; reconnect',409)
  const key = { ...prior.key,...await pipelineExchange(prior.key) }, sealed = await sealConnection(env.SESSION_SECRET,JSON.stringify(key),purpose(p))
  await readFence(c.db,c.x.actor,(c as Context & {revision:number}).revision)
  const result = await c.db.prepare('UPDATE e_connection_secrets SET sealed=? WHERE id=? AND sealed=? AND EXISTS(SELECT 1 FROM e_pipeline_refresh WHERE id=? AND claim=?) AND ('+fence.sql+') RETURNING id').bind(sealed,id,prior.sealed,id,claim,...fence.params).first()
  requireThat(result,'CRM disconnected during refresh; renewed grant was not retained',409)
  return key
 } finally { await c.db.prepare('DELETE FROM e_pipeline_refresh WHERE id=? AND claim=?').bind(id,claim).run() }
}

export async function pipelineConnection(c: Context, env: Bindings, name: unknown, op: string, b: Data): Promise<{extra:D1PreparedStatement[];authorizationUrl?:string}> {
 pipelineAuthority(c); const p = pipelineProvider(name), id = pipelineId(p), prior = find(c.s,'connection',id)
 const revision = (c as Context & {revision:number}).revision
 await readFence(c.db,c.x.actor,revision)
 requireThat(['connect','begin','complete','disconnect'].includes(op),'Unknown CRM connection action',404)
 if (op === 'disconnect') {
  let outcome = { status:'unsupported',httpStatus:null as number|null,ownerAction:ownerAction(p) }
  if (p === 'salesforce' && await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(id).first()) {
   try {
    const {key} = await stored(c,env,p)
    const response = await fetch(key.origin+'/services/oauth2/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:key.refreshToken!}),redirect:'manual',signal:AbortSignal.timeout(10000)})
    outcome = {...outcome,status:response.ok?'confirmed':'unconfirmed',httpStatus:response.status}; await response.body?.cancel()
   } catch { outcome = {...outcome,status:'unconfirmed'} }
  }
  const providerRevocation = {...outcome,at:c.now}
  put(c.s,'connection',id,{...prior,connected:false,disconnectedAt:c.now,providerRevocation,error:outcome.status === 'confirmed' ? null : ownerAction(p)})
  c.activity.push({action:'pipeline-disconnected',record:id,detail:{providerRevocation,localCredentialDeleted:true}})
  return {extra:[c.db.prepare('DELETE FROM e_connection_secrets WHERE id IN (?,?)').bind(id,id+'-pending')]}
 }
 requireThat(!prior?.connected,'Disconnect before replacing a CRM grant',409)
 let key: PipelineKey
 if (op === 'complete') {
  const pending = await stored(c,env,p,true), k = pending.key
  requireThat(k.expiresAt > Date.now() && k.session === c.x.actor.session && k.operator === c.x.actor.id && k.version === c.x.actor.version && k.stateHash === await sha256(text(b.state,'OAuth state',300)),'CRM OAuth consent expired or belongs to another session',403)
  const consumed = await c.db.prepare('DELETE FROM e_connection_secrets WHERE id=? AND sealed=? RETURNING id').bind(id+'-pending',pending.sealed).first()
  requireThat(consumed,'CRM OAuth consent was already used',409)
  await readFence(c.db,c.x.actor,revision)
  key = {provider:p,origin:k.origin,currency:k.currency,clientId:k.clientId,clientSecret:k.clientSecret,termField:k.termField,...await pipelineExchange(k,{grant_type:'authorization_code',code:text(b.code,'Authorization code',2000),redirect_uri:k.redirectUri})}
 } else {
  requireThat(b.consent === true && b.readOnly === true,'Approve CRM reads and confirm the provider grant has only read permission')
  const currency = text(b.currency,'CRM reporting currency',3).toUpperCase(); requireThat(/^[A-Z]{3}$/.test(currency),'Choose a three-letter CRM currency')
  let origin = 'https://api.hubapi.com'
  if (p === 'salesforce') origin = salesforceOrigin(b.instance)
  if (p === 'orbit') { const u = ownerDestination(env.ORBIT_ORIGIN,'Installation Orbit origin'); requireThat(u.pathname === '/' && !u.search,'Configure only the Orbit origin'); origin=u.origin }
  key = {provider:p,origin,currency}
  if (p === 'orbit') { requireThat(op === 'connect','Orbit uses a scoped read-only token'); key.accessToken=text(b.key,'Orbit scoped read-only token',2000) }
  else {
   Object.assign(key,{clientId:text(b.clientId,'CRM client ID',500),clientSecret:text(b.clientSecret,'CRM client secret',2000)})
   if (p === 'salesforce') { key.termField=text(b.termField ?? 'Subscription_Term__c','Salesforce line-item term field',80); requireThat(/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key.termField!),'Choose a Salesforce field API name') }
   if (op === 'begin') {
    const state = crypto.randomUUID()+crypto.randomUUID(), redirectUri = new URL(`/api/easel/connections/pipeline/${p}/callback`,env.AUTH_ORIGIN).href
    const pending = {...key,stateHash:await sha256(state),redirectUri,session:c.x.actor.session,operator:c.x.actor.id,version:c.x.actor.version,expiresAt:Date.now()+600000}
    const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(pending),purpose(p)), url=new URL(p === 'hubspot'?'https://app.hubspot.com/oauth/authorize':origin+'/services/oauth2/authorize')
    const scope=p === 'hubspot'?'crm.objects.deals.read crm.objects.line_items.read crm.objects.owners.read':'api refresh_token'
    for (const [k,v] of Object.entries({client_id:key.clientId!,redirect_uri:redirectUri,response_type:'code',scope,state})) url.searchParams.set(k,v)
    c.activity.push({action:'pipeline-oauth-started',record:id,detail:{provider:p,consent:true,readOnly:true}})
    return {authorizationUrl:url.href,extra:[c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id+'-pending',sealed)]}
   }
   key = {...key,refreshToken:text(b.refreshToken,'CRM OAuth refresh token',3000)}
   key = {...key,...await pipelineExchange(key)}
  }
 }
 requireThat(!/\s/.test(key.accessToken!),'CRM credential contains whitespace')
 const sealed = await sealConnection(env.SESSION_SECRET,JSON.stringify(key),purpose(p))
 put(c.s,'connection',id,{provider:p,origin:key.origin,connected:true,suffix:(key.refreshToken ?? key.accessToken!).slice(-4),owner:c.x.actor.email,connectedAt:c.now,lastRefresh:null,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'pipeline-connected',record:id,detail:{provider:p,origin:key.origin,consent:true,readOnly:true}})
 return {extra:[c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id,sealed)]}
}
