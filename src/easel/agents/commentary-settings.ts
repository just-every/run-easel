// Model drafting is opt-in. Credentials live only in sealed, non-archived custody.
import type { Bindings } from '../../auth.server'
import { requireCapability, requireFinance, requireMember } from '../access'
import { openConnection, sealConnection } from '../connection-seal'
import type { Context } from '../context'
import { decimal } from '../units'
import { all, find, put, requireThat, text, uid, type Data } from '../types'

export const COMMENTARY_CONNECTION = 'model:variance-commentary'
const PURPOSE = 'easel:openai:variance-commentary:v1'
export function commentaryAuthority(c: Context, finance = false) {
 requireMember(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use a native signed-in person for model commentary', 403)
 if (finance) requireFinance(c.x)
 requireThat(c.x.role !== 'viewer', 'Only a variance writer can request model commentary', 403)
}
export const commentaryConfig = (c: Context) => find(c.s, 'commentary-settings', 'main') ?? { enabled: false, stopped: true, revision: '', model: '', inputRateMicroUsd: 0, outputRateMicroUsd: 0, budgetMicroUsd: 0 }
export function commentaryAllowance(c: Context) {
 return all(c.s, 'commentary-run').filter(r => r.billingMonth === c.now.slice(0, 7)).reduce((n, r) => n + r.reserveMicroUsd, 0)
}
export async function commentaryStatus(c: Context, _env?: Bindings) {
 commentaryAuthority(c)
 const config = commentaryConfig(c), connection = find(c.s, 'connection', COMMENTARY_CONNECTION)
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(COMMENTARY_CONNECTION).first()
 return { ...config, connected: Boolean(connection?.connected && stored), reservedMicroUsd: commentaryAllowance(c), billingMonth: c.now.slice(0, 7), provider: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses', costBasis: 'Conservative allowance, not provider-reported cost', ...(connection?.connected && !stored ? { error: 'Reconnect the model key after restore; keys are excluded from archives' } : {}) }
}
export async function commentarySettings(c: Context, _env: Bindings, op: string, b: Data) {
 commentaryAuthority(c, true)
 const prior = commentaryConfig(c)
 requireThat(op === 'configure' || op === 'stop' || op === 'resume', 'Unknown commentary setting', 404)
 let settings: Data
 if (op === 'configure') {
  requireThat(b.consent === true, 'Finance must consent to sending reviewed non-pay variance requests to OpenAI')
  const model = text(b.model, 'Owner-chosen OpenAI model', 120)
  requireThat(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model), 'Enter an OpenAI model ID')
  const inputRateMicroUsd = decimal(b.inputUsdPerMillion, 'Input USD rate per million tokens', 6)
  const outputRateMicroUsd = decimal(b.outputUsdPerMillion, 'Output USD rate per million tokens', 6)
  const budgetMicroUsd = decimal(b.monthlyUsd, 'Monthly USD budget', 6)
  requireThat(inputRateMicroUsd > 0 && outputRateMicroUsd > 0 && budgetMicroUsd > 0, 'Rates and monthly budget must be greater than zero')
  settings = { model, inputRateMicroUsd, outputRateMicroUsd, budgetMicroUsd, enabled: b.enabled === true, stopped: prior.stopped, consentBy: c.x.actor.email, consentAt: c.now }
 } else settings = { ...prior, stopped: op === 'stop' }
 put(c.s, 'commentary-settings', 'main', { ...settings, revision: uid(), updatedBy: c.x.actor.email, updatedAt: c.now })
 c.activity.push({ action: `commentary-${op}`, record: 'variance-commentary', detail: { agent: 'Variance commentary', model: settings.model, enabled: settings.enabled, stopped: settings.stopped, budgetMicroUsd: settings.budgetMicroUsd } })
 return commentaryStatus(c)
}
export async function commentaryConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 commentaryAuthority(c, true); requireCapability(c.x, 'connections')
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown commentary connection action', 404)
 const connection = { connected: op === 'connect', revision: uid(), by: c.x.actor.email, at: c.now }
 let sealed = ''
 if (op === 'connect') {
  requireThat(b.consent === true, 'Confirm storage of the owner-provided OpenAI key for reviewed variance requests')
  const key = text(b.key, 'Owner-provided OpenAI API key', 1024)
  requireThat(!/[\r\n\s]/.test(key), 'The API key must not contain whitespace')
  sealed = await sealConnection(env.SESSION_SECRET, key, PURPOSE)
 }
 put(c.s, 'connection', COMMENTARY_CONNECTION, connection)
 c.activity.push({ action: `commentary-key-${op}`, record: COMMENTARY_CONNECTION, detail: { agent: 'Variance commentary', provider: 'OpenAI' } })
 return [op === 'connect' ? c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(COMMENTARY_CONNECTION, sealed) : c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(COMMENTARY_CONNECTION)]
}
export async function commentaryKey(env: Bindings) {
 const stored = await env.DB.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(COMMENTARY_CONNECTION).first<{ sealed: string }>()
 requireThat(stored, 'Connect the owner-provided OpenAI key before drafting', 409)
 return openConnection(env.SESSION_SECRET, stored.sealed, PURPOSE, 'OpenAI')
}
