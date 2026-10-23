import { AuthError } from '../../modules/operator-auth/index.mjs'
import type { EnterpriseEnv } from './config'
export function check(ok: unknown, message: string, status = 400): asserts ok { if (!ok) throw new AuthError(message, status) }
export function origin(request: Request, env: EnterpriseEnv) {
 const url = new URL(request.url), host = request.headers.get('host')
 check(url.origin === env.AUTH_ORIGIN && (!host || host.toLowerCase() === url.host.toLowerCase()), 'enterprise_invalid_origin', 403)
}
export async function bodyText(request: Request, limit: number) {
 const reader = request.body?.getReader(); if (!reader) return ''
 const chunks: Uint8Array[] = []; let size = 0
 try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; check(size <= limit, 'enterprise_input_too_large', 413); chunks.push(value) } }
 finally { await reader.cancel().catch(() => {}) }
 const bytes = new Uint8Array(size); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
 return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
export async function jsonBody(request: Request) {
 check(/^application\/(?:scim\+)?json(?:;|$)/i.test(request.headers.get('content-type') ?? ''), 'Unsupported media type', 415)
 let body: any; try { body = JSON.parse(await bodyText(request, 262144)) } catch (e) { if (e instanceof AuthError) throw e; throw new AuthError('Invalid JSON', 400) }
 check(body && typeof body === 'object' && !Array.isArray(body), 'Expected an object')
 return body
}
export const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('')
export function json(value: unknown, status = 200, headers: Record<string, string> = {}) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/scim+json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } }) }
export function errorResponse(error: unknown, scim = false) {
 const known = error instanceof AuthError, status = known ? error.status : 500
 const message = known ? error.code : 'Enterprise identity unavailable'
 return scim ? json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail: message }, status) : Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } })
}
