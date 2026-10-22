// A selected private route remains selected after revocation, so it blocks rather
// than silently falling back to a shared channel or email.
import type { Bindings } from '../../auth.server'
import type { Context } from '../context'
import { authority } from '../store'
import { find, requireThat, type Data } from '../types'
import { PRIVATE_SLACK_CONNECTION, privateSlackConfig, privateSlackKey, privateSlackMember } from './private-slack-settings'
import { SlackRefused, slackCall, slackHuman, slackIdentity, slackIm } from './private-slack-provider'
export { privateSlackConnection, privateSlackStatus } from './private-slack-settings'
export { privateSlackBinding } from './private-slack-binding'

export const PRIVATE_SLACK_ACCEPTED = 'Accepted by Slack for the private conversation; delivery and reading are not confirmed'
export function privateSlackRoute(c: Context, n: Data) {
 return ['owner-question', 'cash-alert'].includes(n.event) && !!find(c.s, 'slack-private-binding', n.recipient)
}
export function privateSlackCapture(c: Context, email: string) {
 const binding = find(c.s, 'slack-private-binding', email), connection = privateSlackConfig(c)
 return { connectionRevision: connection?.revision ?? '', bindingRevision: binding?.revision ?? '', consentAt: binding?.consent?.at ?? '', team: binding?.team ?? '', user: binding?.user ?? '' }
}
async function current(c: Context, email: string, expected?: Data) {
 const config = privateSlackConfig(c), binding = find(c.s, 'slack-private-binding', email)
 if (!config?.connected || !binding?.active || !binding.optedIn || binding.connectionRevision !== config.revision || binding.team !== config.team || binding.consent?.revision !== binding.revision || binding.consent.connectionRevision !== config.revision || binding.consent.by !== email) return false
 const capture = privateSlackCapture(c, email)
 if (expected && Object.keys(capture).some(k => capture[k as keyof typeof capture] !== expected[k])) return false
 const native = await privateSlackMember(c, email)
 if (native.id !== binding.nativeId || native.id !== binding.consent.nativeId || native.version !== binding.consent.nativeVersion) return false
 const auth = authority(c.x.actor)
 // Compare live records after network reads, including any concurrent consent,
 // membership, connection or native-session change.
 const live = await c.db.prepare(`SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')) AND EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.email=? AND o.version=? AND o.status='active' AND (o.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM e_records m WHERE m.kind='member' AND m.id=o.email AND json_extract(m.value,'$.active')=1 AND json_extract(m.value,'$.role') IN ('contributor','viewer')))) AND EXISTS(SELECT 1 FROM e_records WHERE kind='connection' AND id=? AND value=?) AND EXISTS(SELECT 1 FROM e_records WHERE kind='slack-private-binding' AND id=? AND value=?) AND EXISTS(SELECT 1 FROM e_connection_secrets WHERE id=?) THEN 1 ELSE 0 END AS ok`).bind(...auth.params, config.by, native.id, email, binding.consent.nativeVersion, PRIVATE_SLACK_CONNECTION, JSON.stringify(c.s.get(`connection:${PRIVATE_SLACK_CONNECTION}`)!.value), email, JSON.stringify(c.s.get(`slack-private-binding:${email}`)!.value), PRIVATE_SLACK_CONNECTION).first<{ ok: number }>()
 return live?.ok === 1
}
export async function privateSlackReady(c: Context, _env: Bindings, email: string, expected?: Data) {
 try { return await current(c, email, expected) } catch { return false }
}
export async function sendPrivateSlack(c: Context, env: Bindings, email: string, key: string, message: Data): Promise<{ status: 'accepted' | 'rejected' | 'uncertain'; code?: string }> {
 let posting = false
 try {
  requireThat(message.privateSlack && typeof message.privateSlack === 'object', 'Capture the exact private identity before recording send intent')
  requireThat(await current(c, email, message.privateSlack), 'Private route is no longer authorized')
  requireThat(typeof message.text === 'string' && message.text.length > 0 && message.text.length <= 30_000 && typeof key === 'string' && key.length <= 100, 'Invalid private notification')
  const token = await privateSlackKey(c, env), config = privateSlackConfig(c)!, binding = find(c.s, 'slack-private-binding', email)!
  const identity = await slackIdentity(token)
  requireThat(identity.team === config.team && identity.bot === config.bot && identity.botUser === config.botUser && binding.user !== identity.botUser, 'Slack bot identity changed')
  await slackHuman(token, config.team, binding.user, email)
  const channel = await slackIm(token, config.team, binding.user)
  requireThat(await current(c, email, message.privateSlack), 'Private route authority changed')
  posting = true
  const result = await slackCall('chat.postMessage', token, { channel, text: message.text, client_msg_id: key, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false })
  if (result.channel !== channel || typeof result.ts !== 'string' || !result.ts) return { status: 'uncertain', code: 'slack_private_result_unverified' }
  return { status: 'accepted' }
 } catch (error) {
  return { status: posting && !(error instanceof SlackRefused) ? 'uncertain' : 'rejected', code: posting ? error instanceof SlackRefused ? 'slack_private_refused' : 'slack_private_outcome_unknown' : 'slack_private_identity_or_authority_unverified' }
 }
}
