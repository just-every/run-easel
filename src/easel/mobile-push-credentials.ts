import type { Bindings } from '../auth.server'

const encode = (value: string | Uint8Array) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)))
function privateBytes(pem: string) {
 const content = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '')
 return Uint8Array.from(atob(content), c => c.charCodeAt(0))
}
async function jwt(header: unknown, claims: unknown, pem: string, algorithm: 'ES256' | 'RS256') {
 const ec = algorithm === 'ES256'
 const key = await crypto.subtle.importKey('pkcs8', privateBytes(pem), ec ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
 const unsigned = `${part(header)}.${part(claims)}`
 const signature = await crypto.subtle.sign(ec ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned))
 return `${unsigned}.${encode(new Uint8Array(signature))}`
}
export type PushCredentials = { bearer: string; destination: string }
let appleAssertion: { configuration: string; issuedAt: number; bearer: string } | undefined

/** Keys remain deployment secrets; short-lived provider assertions never enter the model. */
export async function pushCredentials(env: Bindings, platform: string): Promise<PushCredentials> {
 const now = Math.floor(Date.now() / 1000)
 if (platform === 'ios') {
  if (!env.EASEL_APNS_PRIVATE_KEY || !/^[A-Z0-9]{10}$/.test(env.EASEL_APNS_TEAM_ID ?? '') || !/^[A-Z0-9]{10}$/.test(env.EASEL_APNS_KEY_ID ?? '') || !/^[A-Za-z0-9.-]{1,255}$/.test(env.EASEL_APNS_TOPIC ?? '')) throw new Error('apns-not-configured')
  const configuration = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([env.EASEL_APNS_PRIVATE_KEY, env.EASEL_APNS_KEY_ID, env.EASEL_APNS_TEAM_ID])))))
  if (!appleAssertion || appleAssertion.configuration !== configuration || now < appleAssertion.issuedAt || now - appleAssertion.issuedAt >= 45 * 60) {
   appleAssertion = { configuration, issuedAt: now, bearer: await jwt({ alg: 'ES256', kid: env.EASEL_APNS_KEY_ID }, { iss: env.EASEL_APNS_TEAM_ID, iat: now }, env.EASEL_APNS_PRIVATE_KEY, 'ES256') }
  }
  return { bearer: appleAssertion.bearer, destination: env.EASEL_APNS_TOPIC! }
 }
 const account = JSON.parse(env.EASEL_FCM_SERVICE_ACCOUNT ?? '{}')
 if (typeof account.private_key !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(account.client_email ?? '') || !/^[a-z][a-z0-9-]{4,62}$/.test(account.project_id ?? '')) throw new Error('fcm-not-configured')
 const assertion = await jwt({ alg: 'RS256', typ: 'JWT' }, { iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, account.private_key, 'RS256')
 let response: Response
 try {
  response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), redirect: 'manual', signal: AbortSignal.timeout(15_000) })
 } catch { throw new Error('fcm-authorization-network') }
 if (!response.ok) throw new Error('fcm-authorization-refused')
 const value = await response.json() as { access_token?: string; token_type?: string; expires_in?: number }
 if (typeof value.access_token !== 'string' || !value.access_token || value.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(value.expires_in) || value.expires_in! <= 0) throw new Error('fcm-authorization-unverified')
 return { bearer: value.access_token, destination: account.project_id }
}
