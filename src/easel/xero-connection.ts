import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { xeroTenants, xeroExchange, xeroRevoke, XERO_PURPOSE, XERO_READS, XERO_SCOPE } from './xero-oauth'
import { xeroRequest,XeroFailure,type XeroCredentials } from './xero-provider'
import { authority, readFence, sha256 } from './store'
import { all, choice, Fault, find, put, requireThat, text, type Data } from './types'

export function xeroAuthority(c: Context) {
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a company-wide native finance session for Xero', 403)
}
export async function xeroStatus(c: Context) {
 xeroAuthority(c)
 const row = find(c.s, 'connection', 'xero'), stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('xero').first()
 return { ...row, months:all(c.s,'xero-month').filter(m=>m.realmId===row?.realmId&&m.environment===row?.environment).sort((a,b)=>a.month.localeCompare(b.month)), connected:!!(row?.connected && stored), scope:XERO_SCOPE, operations:XERO_READS, schedule:'Manual', rateLimit:row?.rateLimit ?? null,
  error:row?.connected && !stored ? 'Reconnect Xero after restore; OAuth credentials are excluded from archives' : row?.error ?? null }
}
async function stored(c: Context, env: Bindings, id = 'xero') {
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(id).first<{sealed:string}>()
 requireThat(row, 'Connect Xero before reading its books', 409)
 try { return { sealed:row.sealed, key:JSON.parse(await openConnection(env.SESSION_SECRET, row.sealed, XERO_PURPOSE, 'Xero')) } }
 catch { throw new Fault(409, 'Xero credentials could not be opened; reconnect in Settings') }
}
export async function xeroKey(c: Context, env: Bindings): Promise<XeroCredentials> {
 xeroAuthority(c)
 requireThat(find(c.s, 'connection', 'xero')?.connected, 'Connect Xero before pulling actuals', 409)
 const prior = await stored(c, env), key = prior.key as XeroCredentials
 if (key.expiresAt > Date.now() + 60000) return key
 const claim = crypto.randomUUID(), fence = authority(c.x.actor, true)
 const claimed = await c.db.prepare(`INSERT INTO e_xero_refresh(id,claim,expires_at) SELECT 'xero',?,? WHERE (${fence.sql}) ON CONFLICT(id) DO UPDATE SET claim=excluded.claim,expires_at=excluded.expires_at WHERE e_xero_refresh.expires_at<? RETURNING claim`).bind(claim, Date.now()+60000, ...fence.params, Date.now()).first<{claim:string}>()
 requireThat(claimed?.claim === claim, 'A Xero token refresh is in progress; retry this read explicitly later', 409)
 try {
  const current = await stored(c, env)
  requireThat(current.sealed === prior.sealed, 'The Xero grant changed; reload before pulling', 409)
  const renewed = { ...key, ...await xeroExchange(key.clientId, key.clientSecret, { grant_type:'refresh_token', refresh_token:key.refreshToken }) }
  const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify(renewed), XERO_PURPOSE)
  const result = await c.db.prepare(`UPDATE e_connection_secrets SET sealed=? WHERE id='xero' AND sealed=? AND EXISTS(SELECT 1 FROM e_xero_refresh WHERE id='xero' AND claim=?) RETURNING id`).bind(sealed, prior.sealed, claim).first()
  if (!result) { await xeroRevoke(renewed); throw new Fault(409, 'The Xero connection changed during token refresh; reconnect') }
  return renewed
 } finally { await c.db.prepare("DELETE FROM e_xero_refresh WHERE id='xero' AND claim=?").bind(claim).run() }
}
export async function xeroConnection(c: Context, env: Bindings, op: string, b: Data): Promise<{extra:D1PreparedStatement[]; authorizationUrl?:string}> {
 xeroAuthority(c)
 const revision=(c as Context & {revision:number}).revision
 requireThat(Number.isSafeInteger(revision),'Reload the native finance session before changing Xero',409)
 await readFence(c.db,c.x.actor,revision)
 requireThat(['begin','complete','connect','disconnect','check'].includes(op), 'Unknown Xero connection action', 404)
 const prior = find(c.s, 'connection', 'xero')
 if(op==='check'){
  const key=await xeroKey(c,env)
  let health:Data
  try{await xeroRequest(key,'Organisation');health={error:null,rateLimit:null}}catch(e){if(!(e instanceof XeroFailure))throw e;health={error:e.message,rateLimit:e.rateLimit}}
  put(c.s,'connection','xero',{...prior,...health,lastCheck:c.now})
  c.activity.push({action:'xero-checked',record:'xero',detail:health})
  return{extra:[]}
 }
 if (op === 'disconnect') {
  const secret = await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='xero'").first()
  let outcome:{status:string;httpStatus:number|null}={status:'unavailable',httpStatus:null}
  if(secret){try{outcome=await xeroRevoke((await stored(c,env)).key)}catch{outcome={status:'unreadable',httpStatus:null}}}
  const providerRevocation = { ...outcome, at:c.now }
  put(c.s, 'connection', 'xero', { ...prior, connected:false, disconnectedAt:c.now, providerRevocation, error:outcome.status === 'confirmed' ? null : 'Xero did not confirm revocation; remove Easel in Xero Connected apps' })
  c.activity.push({ action:'xero-disconnected', record:'xero', detail:{ providerRevocation, localCredentialDeleted:true } })
  return { extra:[c.db.prepare("DELETE FROM e_connection_secrets WHERE id IN ('xero','xero-pending')")] }
 }
 requireThat(!prior?.connected, 'Disconnect the current Xero company before replacing its grant', 409)
 if (op === 'begin') {
  requireThat(b.consent === true, 'Explicitly approve read-only Xero accounting access')
  const clientId=text(b.clientId,'Xero client ID',500), clientSecret=text(b.clientSecret,'Xero client secret',1000)
  const state=crypto.randomUUID()+crypto.randomUUID(), redirectUri=new URL('/api/easel/connections/xero/callback', env.AUTH_ORIGIN).href
  const pending={clientId,clientSecret,environment:'production',stateHash:await sha256(state),session:c.x.actor.session,operator:c.x.actor.id,version:c.x.actor.version,expiresAt:Date.now()+600000,redirectUri}
  const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(pending),XERO_PURPOSE)
  c.activity.push({action:'xero-oauth-started',record:'xero',detail:{scope:XERO_SCOPE,consent:true}})
  const url=new URL('https://login.xero.com/identity/connect/authorize')
  for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:XERO_SCOPE,state}))url.searchParams.set(k,v)
  return {authorizationUrl:url.href,extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('xero-pending',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
 }
 let key: XeroCredentials
 let realmId=op==='complete'?'':text(b.realmId,'Xero tenant ID',100)
 if (op === 'complete') {
  const pending=await stored(c,env,'xero-pending'), p=pending.key
  requireThat(p.expiresAt>Date.now() && p.session===c.x.actor.session && p.operator===c.x.actor.id && p.version===c.x.actor.version && p.stateHash===await sha256(text(b.state,'OAuth state',300)), 'The Xero consent expired or belongs to another session',403)
  const claimed=await c.db.prepare("DELETE FROM e_connection_secrets WHERE id='xero-pending' AND sealed=? RETURNING id").bind(pending.sealed).first()
  requireThat(claimed,'Xero consent was already used',409)
  await readFence(c.db,c.x.actor,revision)
  key={environment:p.environment,realmId,clientId:p.clientId,clientSecret:p.clientSecret,...await xeroExchange(p.clientId,p.clientSecret,{grant_type:'authorization_code',code:text(b.code,'Xero authorization code',2000),redirect_uri:p.redirectUri})}
 } else {
  requireThat(b.consent===true,'Explicitly approve read-only access through this existing Xero OAuth company grant')
  const clientId=text(b.clientId,'Xero client ID',500),clientSecret=text(b.clientSecret,'Xero client secret',1000)
  key={environment:'production',realmId,clientId,clientSecret,...await xeroExchange(clientId,clientSecret,{grant_type:'refresh_token',refresh_token:text(b.refreshToken,'Xero refresh token',3000)})}
 }
 const tenants=await xeroTenants(key)
 if(op==='complete'){requireThat(tenants.length===1,'Authorize exactly one Xero organisation or connect an existing grant with its explicit tenant ID',409);key.realmId=tenants[0].tenantId}
 requireThat(tenants.some((t:Data)=>t.tenantId===key.realmId),'The Xero grant does not authorize this tenant',403)
 requireThat(/^[A-Za-z0-9-]+$/.test(key.realmId),'Xero tenant ID is invalid')
 const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),XERO_PURPOSE)
 put(c.s,'connection','xero',{connected:true,environment:key.environment,realmId:key.realmId,suffix:key.refreshToken.slice(-4),owner:c.x.actor.email,connectedAt:c.now,scope:XERO_SCOPE,operations:XERO_READS,schedule:'Manual',lastRefresh:null,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'xero-connected',record:'xero',detail:{realmId:key.realmId,environment:key.environment,scope:XERO_SCOPE,consent:true}})
 return {extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('xero',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
}
