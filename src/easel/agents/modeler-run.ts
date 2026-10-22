import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import type { Bindings } from '../../auth.server'
import type { Context } from '../context'
import { all, get, put, requireThat, uid, type Data } from '../types'
import { modelerAuthority, modelerAllowance, modelerConfig } from './modeler-settings'
import { modelerPreview, modelerSourceFingerprint } from './modeler-request'
import { buildModelerProposal } from './modeler-build'
import type { ModelerResult } from './modeler-provider'

const fence = (c: Context) => sha256(canonicalJson({ id: c.x.actor.id, session: c.x.actor.session, version: c.x.actor.version }))
/** Root commits this intent and allowance before any network call. */
export async function beginModeler(c: Context, _env: Bindings, b: Data) {
 modelerAuthority(c)
 requireThat(b.consent === true, 'Explicitly consent to sending this exact planning request and reserving its allowance')
 const preview = await modelerPreview(c, b), settings = modelerConfig(c)
 requireThat(b.fingerprint === preview.fingerprint, 'The source plan, settings or authority changed; preview again', 409)
 requireThat(!all(c.s, 'modeler-run').some(r => r.fingerprint === preview.fingerprint), 'This request already has a recorded attempt; review its outcome before another request', 409)
 requireThat(BigInt(modelerAllowance(c)) + BigInt(preview.reserveMicroUsd) <= BigInt(settings.budgetMicroUsd), 'The monthly modeler budget cannot cover this conservative allowance', 409)
 const intent = { ...preview, id: uid(), status: 'pending', billingMonth: c.now.slice(0, 7), person: c.x.actor.email, personFence: fence(c), agent: 'Modeler', model: preview.request.model, createdAt: c.now }
 put(c.s, 'modeler-run', intent.id, intent)
 c.activity.push({ action: 'modeler-intent', record: intent.id, scenario: intent.from, detail: { agent: 'Modeler', person: intent.person, model: intent.model, fingerprint: intent.fingerprint, sourceRevision: intent.sourceRevision, reserveMicroUsd: intent.reserveMicroUsd, costBasis: intent.costBasis } })
 return intent
}
export async function authorizeModeler(c: Context, id: string) {
 modelerAuthority(c)
 const intent = get(c.s, 'modeler-run', id)
 requireThat(intent.status === 'pending' && intent.personFence === fence(c), 'This modeler attempt is not pending for this live person and session', 409)
 const current = await modelerPreview(c, { from: intent.from, request: intent.requestText })
 requireThat(current.fingerprint === intent.fingerprint, 'The source, authority, model, key or modeler settings changed after review', 409)
 return intent
}
export async function finishModeler(c: Context, id: string, result: ModelerResult) {
 modelerAuthority(c)
 const intent = get(c.s, 'modeler-run', id)
 requireThat(intent.status === 'pending' && intent.personFence === fence(c), 'This modeler attempt cannot be completed by this session', 409)
 let outcome: Data = result
 if (result.status === 'received') {
  try {
   await authorizeModeler(c, id)
   const built = await buildModelerProposal(c, intent, result.proposal)
   c.s = built.context.s
   c.activity.push(...built.context.activity.map(event => ({ ...event, detail: { ...event.detail, agent: 'Modeler', model: intent.model, run: intent.id } })))
   outcome = { status: 'draft', proposal: built.proposal.id, proposalRevision: built.proposal.revision, proof: built.proof }
  } catch (error) { outcome = { status: 'refused', reason: error instanceof Error ? error.message : 'The model proposal was refused' } }
 }
 put(c.s, 'modeler-run', id, { ...intent, status: outcome.status, completedAt: c.now, proposal: outcome.status === 'draft' ? outcome.proposal : null, reason: outcome.reason ?? null })
 c.activity.push({ action: 'modeler-outcome', record: id, scenario: outcome.status === 'draft' ? outcome.proposal : intent.from, detail: { agent: 'Modeler', person: intent.person, model: intent.model, status: outcome.status, proposal: outcome.status === 'draft' ? outcome.proposal : null, reason: outcome.reason ?? null, reserveMicroUsd: intent.reserveMicroUsd, costBasis: intent.costBasis } })
 return { id, ...outcome, reserveMicroUsd: intent.reserveMicroUsd, costBasis: intent.costBasis }
}
export async function modelerProposal(c: Context, id: string) {
 modelerAuthority(c)
 const proposal = get(c.s, 'scenario', id), proof = get(c.s, 'modeler-proof', id)
 requireThat(proposal.kind === 'proposal' && proposal.modelerRun === proof.run, 'This is not a modeler proposal', 404)
 const source = get(c.s, 'scenario', proof.from)
 const sourceStale = source.status !== 'working' || await modelerSourceFingerprint(c, proof.from) !== proof.sourceFingerprint
 return { ...proof, currentRevision: proposal.revision, stale: proposal.revision !== proof.proposalRevision || sourceStale, sourceStale }
}
