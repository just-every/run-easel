// Slack Web API only: no owner-entered address, redirects, retries or raw errors.
import { requireThat, type Data } from '../types'

type Method = 'auth.test' | 'auth.revoke' | 'users.info' | 'conversations.open' | 'conversations.info' | 'chat.postMessage'
const METHODS: Method[] = ['auth.test', 'auth.revoke', 'users.info', 'conversations.open', 'conversations.info', 'chat.postMessage']
const REFUSALS = new Set(['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'token_expired', 'missing_scope', 'no_permission', 'not_allowed_token_type', 'channel_not_found', 'not_in_channel', 'user_not_found', 'user_not_visible', 'user_disabled', 'is_archived', 'restricted_action', 'restricted_action_read_only_channel', 'restricted_action_non_threadable_channel', 'rate_limited', 'ratelimited', 'msg_too_long', 'invalid_arguments', 'invalid_arg_name', 'invalid_array_arg', 'invalid_blocks', 'invalid_metadata_format', 'invalid_metadata_schema', 'invalid_post_type', 'invalid_form_data', 'ekm_access_denied', 'access_denied', 'team_access_not_granted'])
export class SlackRefused extends Error {}
export async function slackCall(method: Method, token: string, body: Data = {}): Promise<Data> {
 requireThat(METHODS.includes(method), 'Unknown Slack method')
 const query = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]))
 const read = ['users.info', 'conversations.info', 'auth.revoke'].includes(method)
 const response = await fetch(`https://slack.com/api/${method}${read && query.size ? `?${query}` : ''}`, {
  method: read ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(8_000),
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
  ...(!read ? { body: JSON.stringify(body) } : {}),
 })
 if (response.status >= 300 && response.status < 400 || [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(response.status)) {
  await response.body?.cancel(); throw new SlackRefused('Slack refused the request')
 }
 requireThat(response.ok, 'Slack outcome unknown')
 const reader = response.body?.getReader(); requireThat(reader, 'Empty Slack response')
 const chunks: Uint8Array[] = []; let size = 0
 try {
  for (;;) {
   const next = await reader.read(); if (next.done) break
   size += next.value.length; requireThat(size <= 32_000, 'Slack response too large'); chunks.push(next.value)
  }
 } finally { await reader.cancel().catch(() => {}) }
 const bytes = new Uint8Array(size); let at = 0
 for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
 const value = JSON.parse(new TextDecoder().decode(bytes)) as Data
 requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Invalid Slack response')
 if (value.ok === false) {
  // Only known refusals permit explicit retry. Unknown errors may have sent.
  if (REFUSALS.has(value.error)) throw new SlackRefused('Slack refused the request')
  throw new Error('Slack outcome unknown')
 }
 requireThat(value.ok === true, 'Invalid Slack result')
 return value
}

export const slackId = (value: unknown): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9]{1,79}$/.test(value)
export async function slackIdentity(token: string) {
 const value = await slackCall('auth.test', token)
 requireThat(slackId(value.team_id) && slackId(value.bot_id) && slackId(value.user_id), 'Slack must identify a workspace bot', 409)
 return { team: value.team_id as string, bot: value.bot_id as string, botUser: value.user_id as string }
}
export async function slackHuman(token: string, team: string, user: string, email: string) {
 const result = await slackCall('users.info', token, { user }), u = result.user
 requireThat(u && u.id === user && u.team_id === team && u.deleted === false && u.is_bot === false && u.is_app_user === false && u.is_restricted === false && u.is_ultra_restricted === false && !u.bot_id && u.is_stranger !== true, 'Slack identity must be an active human member of the connected workspace', 409)
 requireThat(typeof u.profile?.email === 'string' && u.profile.email.length > 0 && u.profile.email === email, 'Slack profile email must exactly match the native account email', 409)
 return { user, team, email }
}
export async function slackIm(token: string, team: string, user: string) {
 const opened = await slackCall('conversations.open', token, { users: user, return_im: true })
 requireThat(slackId(opened.channel?.id), 'Slack did not return a conversation', 409)
 const result = await slackCall('conversations.info', token, { channel: opened.channel.id }), ch = result.channel
 requireThat(ch && ch.id === opened.channel.id && ch.is_im === true && ch.user === user && !ch.is_mpim && !ch.is_channel && !ch.is_group && !ch.is_shared && !ch.is_org_shared && !ch.is_ext_shared && !ch.is_pending_ext_shared && !ch.is_archived && (!ch.context_team_id || ch.context_team_id === team) && (!ch.shared_team_ids || ch.shared_team_ids.every((id: string) => id === team)), 'Slack did not prove an exact private conversation with this person', 409)
 return ch.id as string
}
