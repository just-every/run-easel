import type { Bindings } from '../auth.server'
import { Fault, requireThat, text, type Data } from './types'

export type SpendProvider = 'ramp' | 'purse'
export function spendProvider(value: string): SpendProvider {
 requireThat(value === 'ramp' || value === 'purse', 'Unknown spend provider', 404)
 return value
}
export function spendOrigin(env: Bindings, provider: SpendProvider) {
 if (provider === 'ramp') return 'https://api.ramp.com'
 let url: URL
 try { url = new URL(env.PURSE_ORIGIN ?? '') } catch { throw new Fault(503, 'Configure PURSE_ORIGIN before connecting') }
 requireThat(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (url.protocol === 'https:' || env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)), 'Purse requires an HTTPS origin; local development permits loopback', 503)
 return url.origin
}
export const spendOwnerStep = (p: SpendProvider) => `Revoke this credential in ${p === 'ramp' ? 'Ramp developer settings' : 'Purse Settings → Integration tokens'}; Easel deletes only its local copy and cannot confirm provider revocation`
export async function spendRequest(origin: string, token: string, path: string) {
 const url = new URL(path, origin)
 requireThat(url.origin === origin && !url.username && !url.password && !url.hash, 'Unsafe spend pagination URL', 502)
 let response: Response
 try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ['application','json'].join('/') }, redirect: 'manual', signal: AbortSignal.timeout(10000) }) }
 catch { throw new Fault(502, 'Spend provider could not be reached; no data was accepted') }
 if (response.status !== 200) { await response.body?.cancel(); throw new Fault(502, `Spend provider refused the read (HTTP ${response.status}); no data was accepted`) }
 const reader = response.body?.getReader(); requireThat(reader, 'Spend provider returned no body', 502)
 const chunks: Uint8Array[] = []; let size = 0
 for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2000000) { await reader.cancel(); throw new Fault(502, 'Spend response exceeds the manual read limit') } chunks.push(part.value) }
 const bytes = new Uint8Array(size); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
 let value: Data
 try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Fault(502, 'Spend provider returned unreadable data') }
 requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Spend provider returned an invalid response', 502)
 return value
}
const sourceId = (v: unknown) => { const id = text(v, 'Source ID', 120); requireThat(/^[A-Za-z0-9_-]+$/.test(id), 'Invalid spend source ID', 502); return id }
const minor = (n: unknown) => { requireThat(typeof n === 'number' && Number.isSafeInteger(n) && n >= 0, 'Spend source requires nonnegative exact minor units', 502); return n }
export async function readSpend(provider: SpendProvider, origin: string, token: string, ids: string[]) {
 const rows: Data[] = []
 if (provider === 'purse') {
  requireThat(ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length, 'Choose one to twenty distinct Purse PO IDs')
  for (const id of ids) {
   const { order } = await spendRequest(origin, token, '/api/purse/integration/orders/' + sourceId(id))
   requireThat(order && order.id === id && ['issued', 'closed'].includes(order.status) && typeof order.currency === 'string' && Array.isArray(order.lines) && Array.isArray(order.bills), 'Purse did not return a complete issued PO', 502)
   // Bill evidence alone is never treated as a payment or a released obligation.
   requireThat(order.status === 'issued', 'Closed Purse orders require explicit remaining-balance qualification', 409)
   rows.push({ id: sourceId(order.id), provider, currency: order.currency, amount: minor(order.totalMinor), reference: text(order.number, 'PO number'), revision: order.revision, sourceDate: order.needDate, kind: 'commitment' })
  }
 } else {
  let next: string | null = '/developer/v1/transactions?page_size=100'
  const seen = new Set<string>(), pages = new Set<string>()
  while (next) {
   requireThat(!pages.has(next) && pages.size < 20, 'Ramp pagination did not complete', 502); pages.add(next)
   const url = new URL(next, origin); requireThat(url.origin === origin && url.pathname === '/developer/v1/transactions', 'Unsafe Ramp pagination', 502)
   const value = await spendRequest(origin, token, url.href)
   requireThat(Array.isArray(value.data) && value.data.length <= 100 && value.page && 'next' in value.page, 'Ramp pagination is incomplete', 502)
   for (const item of value.data) {
    const id = sourceId(item.id); requireThat(!seen.has(id), 'Ramp returned duplicate transactions', 502); seen.add(id)
    requireThat(['CLEARED', 'PENDING', 'DECLINED', 'COMPLETION', 'ERROR', 'PENDING_INITIATION'].includes(item.state), 'Unsupported Ramp transaction state', 502)
    if (item.state !== 'CLEARED') continue
    requireThat(item.entity_amount && typeof item.entity_amount.currency === 'string' && typeof item.user_transaction_time === 'string', 'Ramp transaction is incomplete', 502)
    const date = item.user_transaction_time.slice(0,10)
    requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date, 'Ramp returned an invalid transaction date', 502)
    const amount = minor(item.entity_amount.value)
    rows.push({ id, provider, currency: item.entity_amount.currency, amount, reference: id, sourceDate: item.user_transaction_time, kind: 'actual' })
   }
   requireThat(value.page.next === null || typeof value.page.next === 'string' && value.page.next.length > 0, 'Invalid Ramp next page', 502)
   next = value.page.next
  }
 }
 return rows.sort((a, b) => a.id.localeCompare(b.id))
}
