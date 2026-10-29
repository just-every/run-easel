// A fixed installation-owned gateway runs Base NodePinnedTransport. This
// Worker never sends directly to an owner-entered receiver or falls back.
import type { Bindings } from '../auth.server'
import type { WireRequest } from '@runeditrun/rer/internal/modules/integrations/core/types.ts'
import { Fault, requireThat } from './types'

export function webhookGateway(env: Bindings) {
 let url: URL
 try { url = new URL(env.EASEL_WEBHOOK_EGRESS_URL ?? '') } catch { throw new Fault(503, 'Configure the pinned webhook egress gateway') }
 requireThat(url.protocol === 'https:' && url.pathname === '/send' && !url.username && !url.password && !url.search && !url.hash && (!url.port || url.port === '443'), 'Configure an HTTPS pinned webhook egress gateway at /send', 503)
 requireThat(typeof env.EASEL_WEBHOOK_EGRESS_TOKEN === 'string' && /^[A-Za-z0-9_-]{32,200}$/.test(env.EASEL_WEBHOOK_EGRESS_TOKEN), 'Configure the webhook egress gateway authentication', 503)
 return url.href
}
export async function sendWebhook(env: Bindings, wire: WireRequest): Promise<{ status: number; retryAfter: string } | null> {
 const response = await fetch(webhookGateway(env), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EASEL_WEBHOOK_EGRESS_TOKEN}` }, body: JSON.stringify(wire) })
 if (!response.ok) { await response.body?.cancel(); return null }
 const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let length = 0
 if (reader) for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 1000) { await reader.cancel(); return null }; chunks.push(part.value) }
 const bytes = new Uint8Array(length); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
 const body = new TextDecoder().decode(bytes)
 let result
 try { result = JSON.parse(body) } catch { return null }
 return result.outcome === 'response' && Number.isInteger(result.status) && result.status >= 200 && result.status <= 599 && typeof result.retryAfter === 'string' && result.retryAfter.length <= 100 ? result : null
}
