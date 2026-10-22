import type { Bindings } from '../../auth.server'
import type { Context } from '../context'
import { choice, find, put, requireThat, text, uid, type Data } from '../types'
import { privateSlackConfig, privateSlackKey, privateSlackMember, privateSlackNative } from './private-slack-settings'
import { slackHuman, slackId, slackIdentity } from './private-slack-provider'

export async function privateSlackBinding(c: Context, env: Bindings, op: string, b: Data) {
 choice(op, ['bind', 'unbind', 'consent', 'revoke'], 'private Slack action')
 privateSlackNative(c, ['bind', 'unbind'].includes(op))
 const email = text(b.email, 'Native account email', 254), prior = find(c.s, 'slack-private-binding', email)
 if (op === 'consent' || op === 'revoke') requireThat(email === c.x.actor.email, 'Only this native person may consent or revoke their private Slack identity', 403)
 requireThat(b.revision === (prior?.revision ?? ''), 'Private Slack identity changed; reload and review it', 409)
 let binding: Data
 if (op === 'bind' || op === 'consent') {
  const native = await privateSlackMember(c, email), config = privateSlackConfig(c)
  requireThat(config?.connected, 'Connect a Slack bot first', 409)
  requireThat(b.connectionRevision === config.revision, 'Slack connection changed; reload', 409)
  const user = op === 'bind' ? text(b.user, 'Slack user ID', 80) : prior?.user
  requireThat(slackId(user), 'Enter one Slack user ID')
  if (op === 'consent') requireThat(prior?.active && prior.team === config.team && b.team === prior.team && b.user === prior.user && b.consent === true, 'Review and consent to your exact mapped Slack identity and team', 409)
  try {
   const token = await privateSlackKey(c, env), identity = await slackIdentity(token)
   requireThat(identity.team === config.team && identity.bot === config.bot && identity.botUser === config.botUser, 'Connected bot changed', 409)
   requireThat(user !== identity.botUser, 'Choose a human Slack member', 409)
   await slackHuman(token, config.team, user, native.email)
  } catch { requireThat(false, 'Slack could not verify an active human with this exact native account email in the connected team', 409) }
  if (op === 'bind') binding = { email, user, team: config.team, connectionRevision: config.revision, nativeId: native.id, active: true, revision: uid(), consent: null, optedIn: prior?.optedIn === true, by: c.x.actor.email, at: c.now }
  else {
   requireThat(prior!.nativeId === native.id && prior!.connectionRevision === config.revision, 'Finance must rebind this identity to the current connection', 409)
   const revision = uid()
   binding = { ...prior, revision, optedIn: true, consent: { revision, connectionRevision: config.revision, nativeId: native.id, nativeVersion: native.version, by: email, at: c.now } }
  }
 } else {
  requireThat(prior, 'Private Slack binding not found', 404)
  binding = { ...prior, active: op !== 'unbind' && prior.active, consent: null, revision: uid(), stoppedBy: c.x.actor.email, stoppedAt: c.now }
 }
 put(c.s, 'slack-private-binding', email, binding)
 c.activity.push({ action: `slack-private-${op}`, record: email, detail: { team: binding.team, user: binding.user, revision: binding.revision } })
 return { email, revision: binding.revision, active: binding.active, consented: !!binding.consent }
}
