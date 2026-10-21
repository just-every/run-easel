// Only the configured Gauge origin receives the scoped key. No user URL or
// redirect can forward it. Project/person/pay payloads are never retained.
import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { gaugeKey } from './gauge-connection'
import { periodForKey } from './fiscal-calendar'
import { workspace } from './model'
import { Fault, requireThat, type Data } from './types'

export class GaugeFailure extends Fault {
 constructor(message: string, public rateLimit: string | null = null) { super(502, message) }
}

export async function gaugeSource(c: Context, env: Bindings, month: string) {
 const { origin, key } = await gaugeKey(c, env)
 const { startDate: from, endDate: to } = periodForKey(workspace(c.s), month)
 const url = new URL('/api/gauge/state', origin)
 url.searchParams.set('from', from); url.searchParams.set('to', to)
 let response: Response
 try { response = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000) }) }
 catch { throw new Fault(502, 'Gauge could not be reached; no utilization was imported') }
 if (!response.ok) {
  const retry = response.headers.get('retry-after')
  const rateLimit = response.status === 429 ? (retry && /^\d{1,6}$/.test(retry) ? `Retry after ${Number(retry)} seconds` : 'Rate limited; try later') : null
  throw new GaugeFailure(`Gauge returned HTTP ${response.status}; no utilization was imported${response.status === 429 ? '; rate limited, try later' : ''}`, rateLimit)
 }
 requireThat(Number(response.headers.get('content-length') ?? 0) <= 16384, 'Gauge aggregate response is too large', 502)
 const reader = response.body?.getReader(); requireThat(reader, 'Gauge returned an empty response', 502)
 let raw = '', bytes = 0
 const decoder = new TextDecoder()
 while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 16384) { await reader.cancel(); throw new Fault(502, 'Gauge aggregate response is too large') }; raw += decoder.decode(part.value, { stream: true }) }
 raw += decoder.decode()
 let source: Data
 try { source = JSON.parse(raw) } catch { throw new Fault(502, 'Gauge returned invalid aggregate JSON') }
 requireThat(source && source.scope === 'utilization:read' && source.from === from && source.to === to && typeof source.asOf === 'string' && Number.isFinite(Date.parse(source.asOf)), 'Gauge aggregate scope or period does not match the requested accounting period', 502)
 for (const field of ['participantCount', 'knownAvailableSeconds', 'missingCalendarDays', 'approvedBillableSeconds']) requireThat(Number.isSafeInteger(source[field]) && source[field] >= 0, `Gauge returned invalid ${field}`, 502)
 requireThat(source.missingCalendarDays === 0 && Number.isSafeInteger(source.availableSeconds) && source.availableSeconds >= 0 && source.availableSeconds === source.knownAvailableSeconds, 'Gauge capacity is missing for this month; import is blocked, never treated as zero', 409)
 requireThat(source.availableSeconds > 0 || source.approvedBillableSeconds === 0, 'Gauge has billable time but zero capacity; resolve the source before importing', 409)
 return { origin, from, to, participantCount: source.participantCount, availableSeconds: source.availableSeconds, approvedBillableSeconds: source.approvedBillableSeconds, knownAvailableSeconds: source.knownAvailableSeconds, missingCalendarDays: source.missingCalendarDays, asOf: source.asOf }
}
