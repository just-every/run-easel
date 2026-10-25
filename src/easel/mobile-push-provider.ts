import type { Bindings } from '../auth.server'
import { pushCredentials } from './mobile-push-credentials'

export const PUSH_NOTICE = 'Easel notification'
export type PushOutcome = { status: 'accepted' | 'refused' | 'uncertain'; reason: string; invalidDevice?: boolean }

/** Provider acceptance never asserts that an operating system displayed a notice. */
export async function sendMobilePush(env: Bindings, platform: string, token: string, id: string, current: () => Promise<boolean>): Promise<PushOutcome> {
 let credentials
 try { credentials = await pushCredentials(env, platform) } catch (error) {
  const safe = error instanceof Error && /^(apns-not-configured|fcm-not-configured|fcm-authorization-network|fcm-authorization-refused|fcm-authorization-unverified)$/.test(error.message)
  return { status: 'refused', reason: safe ? error.message : `push-authorization-unavailable-${error instanceof Error ? error.name.replace(/[^a-z]/gi, '').slice(0, 40) : 'unknown'}` }
 }
 if (!await current()) return { status: 'refused', reason: 'native-authority-changed' }
 let url: string, headers: Record<string, string>, body: unknown
 if (platform === 'ios') {
  const origin = env.EASEL_APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  url = `${origin}/3/device/${encodeURIComponent(token)}`
  headers = { authorization: `bearer ${credentials.bearer}`, 'content-type': 'application/json', 'apns-topic': credentials.destination, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': '0', 'apns-id': id }
  body = { aps: { alert: { title: PUSH_NOTICE, body: PUSH_NOTICE }, sound: 'default' } }
 } else {
  url = `https://fcm.googleapis.com/v1/projects/${credentials.destination}/messages:send`
  headers = { authorization: `Bearer ${credentials.bearer}`, 'content-type': 'application/json' }
  body = { message: { token, data: { notice: PUSH_NOTICE, id }, android: { priority: 'HIGH', ttl: '0s' } } }
 }
 try {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (response.status >= 500 || response.status === 408) return { status: 'uncertain', reason: 'provider-outcome-unknown' }
  if (platform === 'ios') return response.status === 200 ? { status: 'accepted', reason: 'Accepted by Apple; device display is not confirmed' } : { status: 'refused', reason: `apns-refused-${response.status}`, invalidDevice: response.status === 410 }
  if (response.ok) {
   const result = await response.json().catch(() => null) as { name?: string } | null
   return result?.name?.startsWith(`projects/${credentials.destination}/messages/`) ? { status: 'accepted', reason: 'Accepted by Firebase; device display is not confirmed' } : { status: 'uncertain', reason: 'fcm-acceptance-unverified' }
  }
  const result = await response.json().catch(() => null) as { error?: { details?: { errorCode?: string }[] } } | null
  return { status: 'refused', reason: `fcm-refused-${response.status}`, invalidDevice: result?.error?.details?.some(d => d.errorCode === 'UNREGISTERED') === true }
 } catch { return { status: 'uncertain', reason: 'provider-outcome-unknown' } }
}
