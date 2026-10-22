// Google-only transport. Credentials never enter URLs, persisted errors or logs.
import { Fault, requireThat, type Data } from './types'

export const SHEET_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
export type SheetCredentials = { clientId: string; clientSecret: string; refreshToken: string }
export class SheetFailure extends Fault {
 constructor(message: string, public rateLimit: string | null = null) { super(502, message) }
}

export function sheetCredentials(b: Data): SheetCredentials {
 requireThat(typeof b.clientId === 'string' && /^[A-Za-z0-9._-]{1,300}$/.test(b.clientId), 'Use the Google OAuth client ID for the offline read-only grant')
 for (const field of ['clientSecret', 'refreshToken']) requireThat(typeof b[field] === 'string' && /^[\x21-\x7e]{1,4096}$/.test(b[field]), 'The Google offline OAuth client secret and refresh token are required')
 return { clientId: b.clientId, clientSecret: b.clientSecret, refreshToken: b.refreshToken }
}

/** Bounded JSON with an absolute request/body deadline and no provider body in errors. */
export async function sheetJSON(url: URL | string, init: RequestInit, limit = 262144): Promise<Data> {
 const target = new URL(url)
 requireThat(target.protocol === 'https:' && !target.username && !target.password && !target.port &&
  (target.hostname === 'oauth2.googleapis.com' && ['/token', '/tokeninfo'].includes(target.pathname) && !target.search ||
   target.hostname === 'sheets.googleapis.com' && /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+$/.test(target.pathname)), 'Invalid Google Sheets provider endpoint', 500)
 let response: Response | undefined
 try {
  response = await fetch(target, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
   const retry = response.headers.get('retry-after')
   const rateLimit = response.status === 429 ? retry && /^\d{1,6}$/.test(retry) ? `Retry after ${Number(retry)} seconds` : 'Rate limited; try later' : null
   throw new SheetFailure(`Google Sheets returned HTTP ${response.status}; no sheet values were imported`, rateLimit)
  }
  const size = response.headers.get('content-length')
  requireThat(size === null || /^\d+$/.test(size) && Number(size) <= limit, 'Google Sheets response is too large', 502)
  const reader = response.body?.getReader()
  requireThat(reader, 'Google Sheets returned an empty response', 502)
  let bytes = 0, raw = ''
  const decoder = new TextDecoder()
  while (true) {
   const part = await reader.read()
   if (part.done) break
   bytes += part.value.byteLength
   if (bytes > limit) { await reader.cancel(); throw new SheetFailure('Google Sheets response is too large') }
   raw += decoder.decode(part.value, { stream: true })
  }
  raw += decoder.decode()
  let result: unknown
  try { result = JSON.parse(raw) } catch { throw new SheetFailure('Google Sheets returned invalid JSON') }
  requireThat(result && typeof result === 'object' && !Array.isArray(result), 'Google Sheets returned invalid data', 502)
  return result as Data
 } catch (error) {
  if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {})
  if (error instanceof Fault) throw error
  throw new SheetFailure('Google Sheets could not be reached; no sheet values were imported')
 }
}

export async function refreshSheetToken(credentials: SheetCredentials): Promise<string> {
 const result = await sheetJSON('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }),
 }, 16384)
 requireThat(typeof result.token_type === 'string' && /^Bearer$/i.test(result.token_type) && typeof result.access_token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(result.access_token) && Number.isSafeInteger(result.expires_in) && result.expires_in > 0, 'Google returned an invalid access token; reconnect Google Sheets', 502)
 // Google can omit scope on refresh. Its own auth library checks tokeninfo by
 // POST with an Authorization header, keeping the token out of query strings.
 let scope = result.scope
 if (scope === undefined) {
  const info = await sheetJSON('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', headers: { authorization: `Bearer ${result.access_token}`, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' } }, 16384)
  requireThat(info.aud === credentials.clientId, 'Google OAuth grant does not belong to this client; reconnect Google Sheets', 409)
  scope = info.scope
 }
 requireThat(typeof scope === 'string' && scope.trim() === SHEET_SCOPE, 'Use a Google offline grant with only the spreadsheets.readonly scope; reconnect Google Sheets', 409)
 return result.access_token
}
