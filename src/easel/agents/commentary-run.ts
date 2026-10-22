import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import type { Bindings } from '../../auth.server'
import type { Context } from '../context'
import { review } from '../review'
import { all, find, get, put, requireThat, uid, type Data } from '../types'
import { commentaryPreview } from './commentary-request'
import { commentaryAllowance, commentaryAuthority, commentaryConfig, commentaryStatus, COMMENTARY_CONNECTION } from './commentary-settings'
import type { CommentaryResult } from './commentary-provider'

const personFence = (c: Context) => sha256(canonicalJson({ person: c.x.actor.id, session: c.x.actor.session, version: c.x.actor.version }))
/** API must commit this durable reservation before calling the provider. */
export async function beginCommentary(c: Context, env: Bindings, b: Data) {
 commentaryAuthority(c)
 requireThat(b.consent === true, 'Explicitly consent to sending the exact previewed request to OpenAI')
 const preview = await commentaryPreview(c, b), config = commentaryConfig(c)
 requireThat(b.fingerprint === preview.fingerprint, 'The variance, authority, model settings or key changed; preview again', 409)
 requireThat((await commentaryStatus(c, env)).connected, 'Connect the owner-provided OpenAI key before drafting', 409)
 requireThat(!all(c.s, 'commentary-run').some(r => r.fingerprint === preview.fingerprint), 'This exact request already has a recorded attempt; review its outcome in Activity', 409)
 const reserved = commentaryAllowance(c)
 requireThat(BigInt(reserved) + BigInt(preview.reserveMicroUsd) <= BigInt(config.budgetMicroUsd), 'The monthly commentary budget cannot cover this conservative allowance', 409)
 const id = uid()
 const intent = { ...preview, id, status: 'pending', billingMonth: c.now.slice(0, 7), person: c.x.actor.email, personId: c.x.actor.id, personFence: personFence(c), agent: 'Variance commentary', model: config.model, createdAt: c.now }
 put(c.s, 'commentary-run', id, intent)
 c.activity.push({ action: 'commentary-model-intent', record: id, detail: { agent: intent.agent, person: intent.person, model: intent.model, month: intent.month, line: intent.line, department: intent.department, fingerprint: intent.fingerprint, reserveMicroUsd: intent.reserveMicroUsd, costBasis: preview.costBasis, billingMonth: intent.billingMonth } })
 return intent
}
/** Re-open the native request after intent commit and fence before network. */
export async function authorizeCommentary(c: Context, intentId: string) {
 commentaryAuthority(c)
 const intent = get(c.s, 'commentary-run', intentId)
 requireThat(intent.status === 'pending' && intent.personFence === personFence(c), 'This attempt is not pending for this live person and session', 409)
 requireThat(commentaryConfig(c).revision === intent.settingsRevision && find(c.s, 'connection', COMMENTARY_CONNECTION)?.revision === intent.connectionRevision, 'Commentary settings or key changed after the request; no result can be accepted', 409)
 const preview = await commentaryPreview(c, intent)
 requireThat(preview.fingerprint === intent.fingerprint, 'The reviewed sources changed after the request', 409)
 return intent
}
/** Re-check the person, stop switch and citations before an ordinary draft save. */
export async function finishCommentary(c: Context, intentId: string, result: CommentaryResult) {
 commentaryAuthority(c)
 const intent = get(c.s, 'commentary-run', intentId)
 requireThat(intent.status === 'pending' && intent.personFence === personFence(c), 'This attempt cannot be completed by this session', 409)
 let outcome: Data = result
 if (result.status === 'received') {
  try {
   await authorizeCommentary(c, intentId)
   const source = JSON.parse(intent.request.input), accepted = new Set(source.acceptedRows.map((r: Data) => r.id))
   requireThat(result.claims.every(claim => claim.citationIds.every(id => accepted.has(id))), 'The model cited a row outside the exact reviewed variance')
   requireThat(new Set(result.claims.flatMap(claim => claim.citationIds)).size <= 100, 'The model draft cites more than 100 accepted rows')
   const prior = find(c.s, 'explanation', `${intent.month}|${intent.line}|${intent.department}`)
   requireThat(!prior || prior.status !== 'confirmed' || c.x.role === 'finance', 'The existing explanation is confirmed; finance must reopen it', 409)
  } catch (error) { outcome = { status: 'refused', reason: error instanceof Error ? error.message : 'Model draft refused' } }
 }
 if (outcome.status === 'received' && result.status === 'received') {
  const citationIds = [...new Set(result.claims.flatMap(claim => claim.citationIds))]
  const explanation = await review(c, 'explanation', { month: intent.month, line: intent.line, department: intent.department, text: result.claims.map(claim => `${claim.label === 'evidence' ? 'Evidence' : 'Hypothesis'}: ${claim.text}`).join('\n\n'), citationIds })
  put(c.s, 'explanation', explanation!.id, { ...explanation, agent: intent.agent, model: intent.model, modelRun: intent.id, claims: result.claims })
  outcome = { status: 'draft', explanation: explanation!.id, claims: result.claims }
 }
 put(c.s, 'commentary-run', intent.id, { ...intent, status: outcome.status, completedAt: c.now, reason: outcome.reason ?? null })
 c.activity.push({ action: 'commentary-model-outcome', record: intent.id, detail: { agent: intent.agent, person: intent.person, model: intent.model, status: outcome.status, reason: outcome.reason ?? null, month: intent.month, line: intent.line, department: intent.department, reserveMicroUsd: intent.reserveMicroUsd, costBasis: intent.costBasis } })
 return { id: intent.id, ...outcome, reserveMicroUsd: intent.reserveMicroUsd, costBasis: intent.costBasis }
}
