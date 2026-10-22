import type { Bindings } from '../../auth.server'
import { requireCapability, requireFinance, requirePayDetail } from '../access'
import type { Context } from '../context'
import { scopedReader } from '../group-projections'
import { decimal } from '../units'
import { all, find, put, requireThat, uid, type Data } from '../types'
import { commentaryConfig, COMMENTARY_CONNECTION } from './commentary-settings'

export function modelerAuthority(c: Context) {
 requireFinance(c.x); requirePayDetail(c.x); requireCapability(c.x, 'model-structure')
 requireThat(!scopedReader(c.x) && !c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use a native finance session with complete model and pay access for modeler proposals', 403)
}
export const modelerConfig = (c: Context) => find(c.s, 'modeler-settings', 'main') ?? { enabled: false, stopped: true, budgetMicroUsd: 0, revision: '' }
export const modelerAllowance = (c: Context) => all(c.s, 'modeler-run').filter(r => r.billingMonth === c.now.slice(0, 7)).reduce((n, r) => n + r.reserveMicroUsd, 0)
export async function modelerStatus(c: Context) {
 modelerAuthority(c)
 const provider = commentaryConfig(c), connection = find(c.s, 'connection', COMMENTARY_CONNECTION)
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(COMMENTARY_CONNECTION).first()
 return { ...modelerConfig(c), provider: 'OpenAI', model: provider.model, inputRateMicroUsd: provider.inputRateMicroUsd, outputRateMicroUsd: provider.outputRateMicroUsd, providerConfigured: Boolean(provider.consentBy && provider.model && provider.inputRateMicroUsd > 0 && provider.outputRateMicroUsd > 0), connected: Boolean(connection?.connected && stored), reservedMicroUsd: modelerAllowance(c), billingMonth: c.now.slice(0, 7), costBasis: 'Conservative allowance, not provider-reported cost' }
}
export async function modelerSettings(c: Context, _env: Bindings, op: string, b: Data) {
 modelerAuthority(c)
 requireThat(['configure', 'stop', 'resume'].includes(op), 'Unknown modeler setting', 404)
 const prior = modelerConfig(c)
 let settings: Data = { ...prior, stopped: op === 'stop' }
 if (op === 'configure') {
  requireThat(b.consent === true, 'Finance must consent to reusing the owner-chosen OpenAI model and sealed key for reviewed planning requests, including pay assumptions')
  const budgetMicroUsd = decimal(b.monthlyUsd, 'Monthly modeler USD budget', 6)
  requireThat(budgetMicroUsd > 0, 'The monthly modeler budget must be greater than zero')
  settings = { enabled: b.enabled === true, stopped: prior.stopped, budgetMicroUsd, consentBy: c.x.actor.email, consentAt: c.now }
 }
 put(c.s, 'modeler-settings', 'main', { ...settings, revision: uid(), updatedBy: c.x.actor.email, updatedAt: c.now })
 c.activity.push({ action: `modeler-${op}`, record: 'modeler', detail: { agent: 'Modeler', enabled: settings.enabled, stopped: settings.stopped, budgetMicroUsd: settings.budgetMicroUsd } })
 return modelerStatus(c)
}
/** Called by the ordinary proposal-promote command, independently of generation authority. */
export function requireModelerPromotion(c: Context, proposal: Data) {
 if (proposal.modelerRun) requireCapability(c.x, 'model-structure')
}
