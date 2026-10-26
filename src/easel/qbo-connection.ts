import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { qboExchange, qboRevoke, QBO_PURPOSE, QBO_READS, QBO_SCOPE } from './qbo-oauth'
import { qboRequest,QboFailure,type QboCredentials } from './qbo-provider'
import { authority, readFence, sha256 } from './store'
import { all, choice, Fault, find, put, requireThat, text, type Data } from './types'

export function qboAuthority(c: Context) {
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a company-wide native finance session for QuickBooks', 403)
}
export async function qboStatus(c: Context) {
 qboAuthority(c)
 const row = find(c.s, 'connection', 'qbo'), stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('qbo').first()
 return { ...row, months:all(c.s,'qbo-month').filter(m=>m.realmId===row?.realmId&&m.environment===row?.environment).sort((a,b)=>a.month.localeCompare(b.month)), connected:!!(row?.connected && stored), scope:QBO_SCOPE, operations:QBO_READS, schedule:'Manual', rateLimit:row?.rateLimit ?? null,
  error:row?.connected && !stored ? 'Reconnect QuickBooks after restore; OAuth credentials are excluded from archives' : row?.error ?? null }
}
async function stored(c: Context, env: Bindings, id = 'qbo') {
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(id).first<{sealed:string}>()
 requireThat(row, 'Connect QuickBooks before reading its books', 409)
 try { return { sealed:row.sealed, key:JSON.parse(await openConnection(env.SESSION_SECRET, row.sealed, QBO_PURPOSE, 'QuickBooks')) } }
 catch { throw new Fault(409, 'QuickBooks credentials could not be opened; reconnect in Settings') }
}
export async function qboKey(c: Context, env: Bindings): Promise<QboCredentials> {
 qboAuthority(c)
 requireThat(find(c.s, 'connection', 'qbo')?.connected, 'Connect QuickBooks before pulling actuals', 409)
 const prior = await stored(c, env), key = prior.key as QboCredentials
 if (key.expiresAt > Date.now() + 60000) return key
 const claim = crypto.randomUUID(), fence = authority(c.x.actor, true)
 const claimed = await c.db.prepare(`INSERT INTO e_qbo_refresh(id,claim,expires_at) SELECT 'qbo',?,? WHERE (${fence.sql}) ON CONFLICT(id) DO UPDATE SET claim=excluded.claim,expires_at=excluded.expires_at WHERE e_qbo_refresh.expires_at<? RETURNING claim`).bind(claim, Date.now()+60000, ...fence.params, Date.now()).first<{claim:string}>()
 requireThat(claimed?.claim === claim, 'A QuickBooks token refresh is in progress; retry this read explicitly later', 409)
 try {
  const current = await stored(c, env)
  requireThat(current.sealed === prior.sealed, 'The QuickBooks grant changed; reload before pulling', 409)
  const renewed = { ...key, ...await qboExchange(key.clientId, key.clientSecret, { grant_type:'refresh_token', refresh_token:key.refreshToken }) }
  const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify(renewed), QBO_PURPOSE)
  const result = await c.db.prepare(`UPDATE e_connection_secrets SET sealed=? WHERE id='qbo' AND sealed=? AND EXISTS(SELECT 1 FROM e_qbo_refresh WHERE id='qbo' AND claim=?) RETURNING id`).bind(sealed, prior.sealed, claim).first()
  if (!result) { await qboRevoke(renewed); throw new Fault(409, 'The QuickBooks connection changed during token refresh; reconnect') }
  return renewed
 } finally { await c.db.prepare("DELETE FROM e_qbo_refresh WHERE id='qbo' AND claim=?").bind(claim).run() }
}
export async function qboConnection(c: Context, env: Bindings, op: string, b: Data): Promise<{extra:D1PreparedStatement[]; authorizationUrl?:string}> {
 qboAuthority(c)
 const revision=(c as Context & {revision:number}).revision
 requireThat(Number.isSafeInteger(revision),'Reload the native finance session before changing QuickBooks',409)
 await readFence(c.db,c.x.actor,revision)
 requireThat(['begin','complete','connect','disconnect','check'].includes(op), 'Unknown QuickBooks connection action', 404)
 const prior = find(c.s, 'connection', 'qbo')
 if(op==='check'){
  const key=await qboKey(c,env)
  let health:Data
  try{await qboRequest(key,'companyinfo');health={error:null,rateLimit:null}}catch(e){if(!(e instanceof QboFailure))throw e;health={error:e.message,rateLimit:e.rateLimit}}
  put(c.s,'connection','qbo',{...prior,...health,lastCheck:c.now})
  c.activity.push({action:'qbo-checked',record:'qbo',detail:health})
  return{extra:[]}
 }
 if (op === 'disconnect') {
  const secret = await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id='qbo'").first()
  let outcome:{status:string;httpStatus:number|null}={status:'unavailable',httpStatus:null}
  if(secret){try{outcome=await qboRevoke((await stored(c,env)).key)}catch{outcome={status:'unreadable',httpStatus:null}}}
  const providerRevocation = { ...outcome, at:c.now }
  put(c.s, 'connection', 'qbo', { ...prior, connected:false, disconnectedAt:c.now, providerRevocation, error:outcome.status === 'confirmed' ? null : 'Intuit did not confirm revocation; remove Easel access in QuickBooks My apps' })
  c.activity.push({ action:'qbo-disconnected', record:'qbo', detail:{ providerRevocation, localCredentialDeleted:true } })
  return { extra:[c.db.prepare("DELETE FROM e_connection_secrets WHERE id IN ('qbo','qbo-pending')")] }
 }
 requireThat(!prior?.connected, 'Disconnect the current QuickBooks company before replacing its grant', 409)
 if (op === 'begin') {
  requireThat(b.consent === true, 'Explicitly approve read-only QuickBooks accounting access')
  const clientId=text(b.clientId,'Intuit client ID',500), clientSecret=text(b.clientSecret,'Intuit client secret',1000)
  const state=crypto.randomUUID()+crypto.randomUUID(), redirectUri=new URL('/api/easel/connections/qbo/callback', env.AUTH_ORIGIN).href
  const pending={clientId,clientSecret,environment:choice(b.environment,['sandbox','production'] as const,'QuickBooks environment'),stateHash:await sha256(state),session:c.x.actor.session,operator:c.x.actor.id,version:c.x.actor.version,expiresAt:Date.now()+600000,redirectUri}
  const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(pending),QBO_PURPOSE)
  c.activity.push({action:'qbo-oauth-started',record:'qbo',detail:{scope:QBO_SCOPE,consent:true}})
  const url=new URL('https://appcenter.intuit.com/connect/oauth2')
  for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:QBO_SCOPE,state}))url.searchParams.set(k,v)
  return {authorizationUrl:url.href,extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('qbo-pending',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
 }
 let key: QboCredentials
 const realmId=text(b.realmId,'QuickBooks company realm',100)
 requireThat(/^[A-Za-z0-9-]+$/.test(realmId),'Intuit company realm is invalid')
 if (op === 'complete') {
  const pending=await stored(c,env,'qbo-pending'), p=pending.key
  requireThat(p.expiresAt>Date.now() && p.session===c.x.actor.session && p.operator===c.x.actor.id && p.version===c.x.actor.version && p.stateHash===await sha256(text(b.state,'OAuth state',300)), 'The QuickBooks consent expired or belongs to another session',403)
  const claimed=await c.db.prepare("DELETE FROM e_connection_secrets WHERE id='qbo-pending' AND sealed=? RETURNING id").bind(pending.sealed).first()
  requireThat(claimed,'QuickBooks consent was already used',409)
  await readFence(c.db,c.x.actor,revision)
  key={environment:p.environment,realmId,clientId:p.clientId,clientSecret:p.clientSecret,...await qboExchange(p.clientId,p.clientSecret,{grant_type:'authorization_code',code:text(b.code,'Intuit authorization code',2000),redirect_uri:p.redirectUri})}
 } else {
  requireThat(b.consent===true,'Explicitly approve read-only access through this existing Intuit OAuth company grant')
  const clientId=text(b.clientId,'Intuit client ID',500),clientSecret=text(b.clientSecret,'Intuit client secret',1000)
  key={environment:choice(b.environment,['sandbox','production'] as const,'QuickBooks environment'),realmId,clientId,clientSecret,...await qboExchange(clientId,clientSecret,{grant_type:'refresh_token',refresh_token:text(b.refreshToken,'Intuit refresh token',3000)})}
 }
 requireThat(/^[A-Za-z0-9-]+$/.test(key.realmId),'Intuit company realm is invalid')
 const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),QBO_PURPOSE)
 put(c.s,'connection','qbo',{connected:true,environment:key.environment,realmId:key.realmId,suffix:key.refreshToken.slice(-4),owner:c.x.actor.email,connectedAt:c.now,scope:QBO_SCOPE,operations:QBO_READS,schedule:'Manual',lastRefresh:null,rowCount:0,error:null,rateLimit:null})
 c.activity.push({action:'qbo-connected',record:'qbo',detail:{realmId:key.realmId,environment:key.environment,scope:QBO_SCOPE,consent:true}})
 return {extra:[c.db.prepare("INSERT INTO e_connection_secrets(id,sealed) VALUES('qbo',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed").bind(sealed)]}
}
