// Shared chat channels for planning reminders. Chat messages carry only the
// generic reminder text and a sign-in link; details go to the rechecked
// assignee by email. Slack and Teams incoming webhooks are deployment secrets;
// Nook uses an owner-pasted integration token, sealed and never archived.
// Every destination follows the owner-entered EGRESS RULE (see egress.ts).
import { runtimeBindings, type Bindings } from '../auth.server'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { egressFetch, ownerDestination } from './egress'
import { Fault, choice, find, put, requireThat, text, type Data } from './types'

export const CHAT_CHANNELS = ['slack', 'teams', 'nook'] as const
export type ChatChannel = typeof CHAT_CHANNELS[number]
export const CHAT_TEXT = 'Easel planning task reminder'
const NOOK = 'easel:nook:messages:v1'
export const ACCEPTED_LABEL: Record<string, string> = {
 email: 'Accepted by the mail provider; delivery is not confirmed',
 slack: 'Accepted by the Slack webhook; delivery to the channel is not confirmed',
 teams: 'Accepted by the Teams workflow; delivery to the channel is not confirmed',
 nook: 'Accepted by Nook; reading by the channel is not confirmed',
}

function webhook(env: Bindings, channel: 'slack' | 'teams') {
 const raw = channel === 'slack' ? env.SLACK_WEBHOOK_URL : env.TEAMS_WEBHOOK_URL
 if (!raw) return { configured: false, error: null, url: null }
 try { return { configured: true, error: null, url: ownerDestination(raw, channel === 'slack' ? 'SLACK_WEBHOOK_URL' : 'TEAMS_WEBHOOK_URL') } }
 catch (e) { return { configured: true, error: (e as Error).message, url: null } }
}

export async function channelStatus(c: Context, env: Bindings) {
 const nook = find(c.s, 'connection', 'nook')
 const sealed = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('nook').first()
 const view = (channel: 'slack' | 'teams') => { const w = webhook(env, channel); return { configured: w.configured, host: w.url?.host ?? null, error: w.error } }
 return {
  slack: view('slack'), teams: view('teams'),
  nook: { configured: Boolean(sealed && nook?.connected), origin: nook?.origin ?? null, conversation: nook?.conversation ?? null, suffix: nook?.suffix ?? null, connectedBy: nook?.connectedBy ?? null, error: nook?.connected && !sealed ? 'Reconnect Nook after restore; integration tokens are excluded from archives' : null },
 }
}

/** Owner-only: the Nook origin is owner-entered, so only owner-level authority may set it. */
export async function nookConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 requireThat(c.x.actor.baseRole === 'owner' && !c.x.actor.token, 'Only the owner, in a signed-in session, connects Nook', 403)
 choice(op, ['connect', 'disconnect'] as const, 'Nook action')
 if (op === 'disconnect') {
  put(c.s, 'connection', 'nook', { ...(find(c.s, 'connection', 'nook') ?? {}), connected: false, disconnectedAt: c.now })
  c.activity.push({ action: 'nook-disconnected', record: 'nook' })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('nook')]
 }
 const url = ownerDestination(b.origin, 'Nook address')
 requireThat(url.pathname === '/' && !url.search, 'Enter only the Nook origin, like https://nook.example.com')
 const conversation = text(b.conversation, 'Nook channel ID', 100)
 requireThat(/^[A-Za-z0-9_-]+$/.test(conversation), 'Use the Nook channel ID shown in Nook')
 const token = text(b.token, 'Nook integration token', 300)
 requireThat(/^nookit_[A-Za-z0-9_-]{16,}$/.test(token), 'Paste a Nook integration token (nookit_…), never a session cookie')
 put(c.s, 'connection', 'nook', { origin: url.origin, conversation, suffix: token.slice(-4), connected: true, connectedBy: c.x.actor.email, connectedAt: c.now })
 c.activity.push({ action: 'nook-connected', record: 'nook', detail: { origin: url.origin, conversation, suffix: token.slice(-4) } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('nook', await sealConnection(env.SESSION_SECRET, token, NOOK))]
}

export async function chatReady(c: Context, env: Bindings, channel: ChatChannel) {
 const status = await channelStatus(c, env)
 return status[channel].configured && !status[channel].error
}

type Outcome = { status: 'accepted' | 'rejected' | 'uncertain'; code?: string }
const outcome = (r: Response): Outcome => r.status >= 200 && r.status < 300 ? { status: 'accepted' } : { status: 'rejected', code: r.status >= 300 && r.status < 400 ? 'redirect_refused' : `http_${r.status}` }

/** One generic message; `key` is the delivery's idempotency key. */
export async function sendChat(c: Context, original: Bindings, channel: ChatChannel, key: string, notice = CHAT_TEXT): Promise<Outcome> {
 const env = runtimeBindings(original), link = `${env.AUTH_ORIGIN}/app`
 let url: URL, init: RequestInit
 if (channel === 'nook') {
  const row = find(c.s, 'connection', 'nook'), sealed = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('nook').first<{ sealed: string }>()
  if (!row?.connected || !sealed) return { status: 'rejected', code: 'nook_not_connected' }
  url = new URL(`/api/conversations/${encodeURIComponent(row.conversation)}/messages`, ownerDestination(row.origin, 'Nook address'))
  init = { method: 'POST', headers: { authorization: `Bearer ${await openConnection(env.SESSION_SECRET, sealed.sealed, NOOK, 'Nook')}`, 'idempotency-key': key.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 64), 'content-type': 'application/json' }, body: JSON.stringify({ body: `${notice}\n${link}` }) }
 } else {
  const w = webhook(env, channel)
  if (!w.url) return { status: 'rejected', code: w.error ? 'webhook_invalid' : 'webhook_not_configured' }
  url = w.url
  const body = channel === 'slack' ? { text: `${notice}: <${link}|Sign in to Easel>` } : { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', version: '1.4', body: [{ type: 'TextBlock', text: notice, wrap: true }], actions: [{ type: 'Action.OpenUrl', title: 'Sign in to Easel', url: link }] } }] }
  init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
 }
 try { return outcome(await egressFetch(url, init)) }
 catch (e) { if (e instanceof Fault) return { status: 'rejected', code: 'destination_refused' }; return { status: 'uncertain', code: 'chat_outcome_unknown' } }
}
