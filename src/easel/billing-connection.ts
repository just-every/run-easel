import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { scopedReader } from './group-projections'
import { checkStripeBillingKey, StripeBillingFailure } from './billing-provider'
import { Fault, find, put, requireThat, text, type Data } from './types'

const PURPOSE = 'easel:stripe:billing:read:v1'
export const BILLING_SCOPE = 'Read subscriptions, invoices, recurring prices, credit notes, invoice payments and refunds; manual refresh'
export const STRIPE_REVOKE = 'Local credential deleted. Delete the restricted key in Stripe Developers → API keys to revoke provider access.'

export function billingAuthority(c: Context) {
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a company-wide native finance session for billing connections and imports', 403)
}
export async function billingStatus(c: Context) {
 billingAuthority(c)
 const row = find(c.s, 'connection', 'stripe')
 const secret = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('stripe').first()
 return { ...row, connected: !!(row?.connected && secret), scope: BILLING_SCOPE, schedule: 'Manual', rateLimit: row?.rateLimit ?? null,
  error: row?.connected && !secret ? 'Reconnect Stripe after restore; credentials are excluded from archives' : row?.error ?? null }
}
export async function billingKey(c: Context, env: Bindings) {
 billingAuthority(c)
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('stripe').first<{sealed:string}>()
 requireThat(find(c.s, 'connection', 'stripe')?.connected && row, 'Connect Stripe in Settings before pulling billing observations', 409)
 try { return await openConnection(env.SESSION_SECRET, row.sealed, PURPOSE, 'Stripe') }
 catch { throw new Fault(409, 'Reconnect Stripe; its credential could not be opened') }
}
export async function billingConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 billingAuthority(c)
 requireThat(['connect', 'disconnect','check'].includes(op), 'Unknown billing connection action', 404)
 const prior = find(c.s, 'connection', 'stripe')
 if(op==='check'){
  let health:Data
  try{health={...await checkStripeBillingKey(await billingKey(c,env)),error:null}}catch(e){if(!(e instanceof StripeBillingFailure))throw e;health={error:e.message,rateLimit:e.rateLimit}}
  put(c.s,'connection','stripe',{...prior,...health,lastCheck:c.now})
  c.activity.push({action:'stripe-checked',record:'stripe',detail:health})
  return []
 }
 if (op === 'disconnect') {
  put(c.s, 'connection', 'stripe', { ...prior, connected: false, disconnectedAt: c.now, providerRevocation: { status: 'unsupported', at: c.now, ownerAction: STRIPE_REVOKE } })
  c.activity.push({ action: 'stripe-disconnected', record: 'stripe', detail: { localCredentialDeleted: true, providerRevocation: 'unsupported', ownerAction: STRIPE_REVOKE } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('stripe')]
 }
 requireThat(!prior?.connected, 'Disconnect the current Stripe source before replacing its key', 409)
 requireThat(b.consent === true, 'Explicitly approve read-only subscription billing access')
 const token = text(b.key, 'Stripe restricted read-only key', 512)
 requireThat(!/\s/.test(token) && !/^(sk|pk)_/.test(token), 'Use a restricted read-only Stripe key, never an unrestricted secret or publishable key')
 await checkStripeBillingKey(token)
 const sealed = await sealConnection(env.SESSION_SECRET, token, PURPOSE)
 put(c.s, 'connection', 'stripe', { connected: true, suffix: token.slice(-4), owner: c.x.actor.email, connectedAt: c.now, scope: BILLING_SCOPE, schedule: 'Manual', lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
 c.activity.push({ action: 'stripe-connected', record: 'stripe', detail: { consent: true, scope: BILLING_SCOPE, suffix: token.slice(-4) } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('stripe', sealed)]
}
