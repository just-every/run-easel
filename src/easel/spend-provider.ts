import type { Bindings } from '../auth.server'
import { Fault, requireThat, text, type Data } from './types'

export type SpendProvider = 'ramp' | 'purse' | 'coaster'
export function spendProvider(value: string): SpendProvider {
 requireThat(value === 'ramp' || value === 'purse' || value === 'coaster', 'Unknown spend provider', 404)
 return value
}
export function spendOrigin(env: Bindings, provider: SpendProvider) {
 if (provider === 'ramp') return 'https://api.ramp.com'
 let url: URL
 const configured = provider === 'purse' ? env.PURSE_ORIGIN : env.COASTER_ORIGIN
 try { url = new URL(configured ?? '') } catch { throw new Fault(503, `Configure ${provider.toUpperCase()}_ORIGIN before connecting`) }
 requireThat(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (url.protocol === 'https:' || env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)), 'Spend connections require an HTTPS origin; local development permits loopback', 503)
 return url.origin
}
export const spendOwnerStep = (p: SpendProvider) => `Revoke this credential in ${p === 'ramp' ? 'Ramp developer settings' : p === 'purse' ? 'Purse Settings → Integration tokens' : 'Coaster Settings → API keys'}; Easel deletes only its local copy and cannot confirm provider revocation`
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
const signedMinor = (n: unknown) => { requireThat(typeof n === 'number' && Number.isSafeInteger(n), 'Spend source requires exact signed minor units', 502); return n }
const sourceId = (v: unknown) => { const id = text(v, 'Source ID', 120); requireThat(/^[A-Za-z0-9_-]+$/.test(id), 'Invalid spend source ID', 502); return id }
const minor = (n: unknown) => { requireThat(typeof n === 'number' && Number.isSafeInteger(n) && n >= 0, 'Spend source requires nonnegative exact minor units', 502); return n }
export async function readSpend(provider: SpendProvider, origin: string, token: string, ids: string[]) {
 const rows: Data[] = []
 if (provider === 'coaster') {
  requireThat(ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length, 'Choose one to twenty distinct Coaster report IDs')
  for (const id of ids) {
   const report = await spendRequest(origin, token, '/api/coaster/public-api/v1/claims/' + sourceId(id) + '/final-report')
   requireThat(report.claim?.id === id && ['approved','batched','reimbursed'].includes(report.claim.status) && Number.isSafeInteger(report.revision) && report.snapshot && Array.isArray(report.snapshot.items) && report.snapshot.items.length > 0 && Array.isArray(report.decisions) && report.decisions.some((d: Data) => d.revision === report.revision && d.final_approval === 1), 'Coaster did not return final approved report evidence', 502)
   const amount = minor(report.snapshot.total_minor)
   requireThat(report.snapshot.items.reduce((n: number, r: Data) => minor(n + minor(r.amount_minor)), 0) === amount && typeof report.snapshot.currency === 'string', 'Coaster report totals do not reconcile', 502)
   rows.push({ id: sourceId(id), provider, currency: report.snapshot.currency, amount, reference: text(report.claim.number, 'Report number'), revision: report.revision, sourceDate: report.submitted_at, kind: report.claim.status === 'reimbursed' ? 'actual' : 'commitment', status: report.claim.status, snapshot: text(report.snapshot_sha256, 'Approved report fingerprint'), payment: report.payment ? { reference: report.payment.reference, date: report.payment.paid_on, source: report.payment.source } : null })
  }
 } else if (provider === 'purse') {
  requireThat(ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length, 'Choose one to twenty distinct Purse PO IDs')
  for (const id of ids) {
   const { order } = await spendRequest(origin, token, '/api/purse/integration/orders/' + sourceId(id))
   requireThat(order && order.id === id && ['issued', 'closed'].includes(order.status) && typeof order.currency === 'string' && Array.isArray(order.lines) && Array.isArray(order.bills), 'Purse did not return a complete issued PO', 502)
   const total = minor(order.totalMinor)
   rows.push({ id: sourceId(order.id), provider, currency: order.currency, amount: total, reference: text(order.number, 'PO number'), revision: order.revision, sourceDate: order.needDate, kind: 'commitment', status: order.status })
   const billIds = new Set<string>()
   for (const bill of order.bills) {
    const billId = sourceId(bill.id); requireThat(!billIds.has(billId), 'Purse returned duplicate bills', 502); billIds.add(billId)
    if (bill.paymentStatus !== 'paid') continue
    requireThat(bill.currency === order.currency && typeof bill.paymentStatusAt === 'string' && Number.isFinite(Date.parse(bill.paymentStatusAt)), 'Purse paid bill lacks authenticated settlement evidence', 502)
    rows.push({ id: sourceId(order.id + '--' + billId), provider, currency: bill.currency, amount: minor(bill.totalMinor), reference: text(bill.reference, 'Bill reference'), sourceDate: bill.paymentStatusAt, kind: 'actual', order: order.id, bill: billId, settlementBasis: 'Last authenticated Pantry return in Purse; refresh Purse for changes' })
   }
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
    const amount = signedMinor(item.entity_amount.value)
    rows.push({ id, provider, currency: item.entity_amount.currency, amount, reference: id, sourceDate: item.user_transaction_time, kind: 'actual' })
   }
   requireThat(value.page.next === null || typeof value.page.next === 'string' && value.page.next.length > 0, 'Invalid Ramp next page', 502)
   next = value.page.next
  }
 }
 return rows.sort((a, b) => a.id.localeCompare(b.id))
}
