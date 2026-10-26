import { Fault, requireThat } from './types'

export const QBO_PURPOSE = 'easel:qbo:accounting:oauth:v1'
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting'
export const QBO_READS = 'Read accounts, dimensions, parties, general ledger and trial balance; no accounting writes'

export async function qboExchange(clientId: string, clientSecret: string, form: Record<string,string>) {
 let response: Response
 try {
  response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method:'POST', redirect:'manual', signal:AbortSignal.timeout(15000),
   headers:{ Authorization:`Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'content-type':'application/x-www-form-urlencoded', Accept:'application/json' }, body:new URLSearchParams(form) })
 } catch { throw new Fault(502, 'Intuit token exchange could not be confirmed; reconnect explicitly, no automatic retry was made') }
 if (!response.ok) { await response.body?.cancel(); throw new Fault(502, `Intuit refused the token exchange (HTTP ${response.status})`) }
 let value: any
 try { value = await response.json() } catch { throw new Fault(502, 'Intuit returned an unreadable token exchange') }
 requireThat(typeof value.access_token === 'string' && typeof value.refresh_token === 'string' && Number.isSafeInteger(value.expires_in) && value.expires_in > 0 && value.token_type?.toLowerCase() === 'bearer', 'Intuit returned an incomplete token exchange', 502)
 return { accessToken:value.access_token, refreshToken:value.refresh_token, expiresAt:Date.now() + value.expires_in * 1000 }
}

export async function qboRevoke(key: { clientId:string; clientSecret:string; refreshToken:string }) {
 try {
  const response = await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', { method:'POST', redirect:'manual', signal:AbortSignal.timeout(15000),
   headers:{ Authorization:`Basic ${btoa(`${key.clientId}:${key.clientSecret}`)}`, 'content-type':'application/json', Accept:'application/json' }, body:JSON.stringify({ token:key.refreshToken }) })
  await response.body?.cancel()
  return { status:response.ok ? 'confirmed' : 'refused', httpStatus:response.status }
 } catch { return { status:'unreachable', httpStatus:null } }
}
