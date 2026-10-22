import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { scopedReader } from './group-projections'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { plaidCredentials, plaidRequest, readPlaidCash, PlaidFailure, PLAID_PURPOSE, PLAID_SCOPE, type PlaidCredentials } from './plaid-provider'
import { Fault, find, put, requireThat, type Data } from './types'
export const PLAID_REVOCATION_WARNING = 'Plaid did not confirm removal; remove this item in your Plaid dashboard or bank access settings'
export function bankCashAuthority(c: Context) {
 requireFinance(c.x)
 requireThat(!scopedReader(c.x), 'Company-wide finance access is required for bank cash', 403)
}
export function plaidAuthority(c: Context) {
 requireCapability(c.x, 'connections')
 requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a native finance session with company-wide access for Plaid bank cash', 403)
}
export async function plaidStatus(c: Context) {
 plaidAuthority(c)
 const row = find(c.s, 'connection', 'plaid')
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('plaid').first()
 return { ...(row ?? {}), connected: Boolean(stored && row?.connected), scope: PLAID_SCOPE, schedule: 'Manual', snapshot: find(c.s, 'plaid-cash', 'main') ?? null, error: row?.connected && !stored ? 'Reconnect Plaid after restore; credentials are excluded from archives' : row?.error ?? null }
}
async function credentials(c: Context, env: Bindings): Promise<PlaidCredentials> {
 const stored = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('plaid').first<{ sealed: string }>()
 requireThat(find(c.s, 'connection', 'plaid')?.connected && stored, 'Connect Plaid in Settings before reading bank cash', 409)
 try { return plaidCredentials(JSON.parse(await openConnection(env.SESSION_SECRET, stored.sealed, PLAID_PURPOSE, 'Plaid'))) }
 catch { throw new Fault(409, 'Plaid credentials could not be opened; reconnect in Connections') }
}
/** Aggregate source only: no account identities, merchant names or transaction originals persist. */
export async function plaidCashSource(c: Context) {
 const connection = find(c.s, 'connection', 'plaid'), source = find(c.s, 'plaid-cash', 'main')
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('plaid').first()
 requireThat(connection?.connected && stored && source, 'Refresh a connected Plaid item before using bank cash', 409)
 requireThat(!connection.error, 'Bank cash is unavailable after a failed refresh; refresh Plaid explicitly again', 409)
 requireThat(Date.parse(c.now) >= Date.parse(source.asOf) && Date.parse(c.now) - Date.parse(source.asOf) <= 86400000, 'Bank cash is older than 24 hours; refresh Plaid explicitly', 409)
 return source
}
export async function plaidConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 plaidAuthority(c)
 requireThat(['connect', 'refresh', 'disconnect'].includes(op), 'Unknown Plaid connection action', 404)
 const prior = find(c.s, 'connection', 'plaid')
 if (op === 'connect') {
  requireThat(!prior?.connected, 'Disconnect the current Plaid item before connecting another one', 409)
  requireThat(b.consent === true, 'Explicitly approve read-only balances and transactions for this item')
  const key = plaidCredentials(b)
  // Validate the grant before storing it, with no automatic refresh or data exposure.
  await plaidRequest(key, '/accounts/balance/get')
  const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify(key), PLAID_PURPOSE)
  put(c.s, 'connection', 'plaid', { connected: true, environment: key.environment, owner: c.x.actor.email, connectedAt: c.now, suffix: key.accessToken.slice(-4), scope: PLAID_SCOPE, schedule: 'Manual', lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
  c.s.delete('plaid-cash:main')
  c.activity.push({ action: 'plaid-connected', record: 'plaid', detail: { environment: key.environment, consent: true, scope: PLAID_SCOPE } })
  return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('plaid', sealed)]
 }
 if (op === 'disconnect') {
  const providerRevocation = { status: 'not-confirmed', at: c.now, httpStatus: null as number | null }
  try {
   const key = await credentials(c, env)
   await plaidRequest(key, '/item/remove'); providerRevocation.status = 'confirmed'; providerRevocation.httpStatus = 200
  } catch (error) { if (error instanceof PlaidFailure) providerRevocation.httpStatus = error.httpStatus }
  put(c.s, 'connection', 'plaid', { ...prior, connected: false, disconnectedAt: c.now, providerRevocation, error: providerRevocation.status === 'confirmed' ? null : PLAID_REVOCATION_WARNING, rateLimit: null })
  c.activity.push({ action: 'plaid-disconnected', record: 'plaid', detail: { providerRevocation } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('plaid')]
 }
 const key = await credentials(c, env)
 try {
  const source = await readPlaidCash(key, c.now)
  put(c.s, 'plaid-cash', 'main', source)
  put(c.s, 'connection', 'plaid', { ...prior, lastRefresh: c.now, rowCount: source.rowCount, lastChecked: c.now, error: null, rateLimit: null })
  c.activity.push({ action: 'plaid-cash-refreshed', record: 'plaid', detail: { accountCount: source.accountCount, rowCount: source.rowCount } })
 } catch (error) {
  if (!(error instanceof Fault)) throw error
  put(c.s, 'connection', 'plaid', { ...prior, lastChecked: c.now, error: error.message, rateLimit: error instanceof PlaidFailure ? error.rateLimit : null })
  c.activity.push({ action: 'plaid-cash-refresh-failed', record: 'plaid', detail: { error: error.message } })
 }
 return []
}
