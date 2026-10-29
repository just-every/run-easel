import type { ToolContext } from '../modules/agent-door/index.ts'
import type { Context } from '../easel/context'
import { requireProposalSubmission } from '../easel/plan'
import { find, requireThat, type Data } from '../easel/types'

/** A submitted proposal consumes its draft precondition. Only its original
 * native effect can admit a receipt, and today's submission grants still apply.
 * This never executes the action: the shared door owns the retained outcome. */
export async function submissionReplay(c: Context, args: Data, ctx: ToolContext): Promise<Data | null> {
 if (!ctx.idempotencyKey) return null
 const proposal = find(c.s, 'scenario', args.id)
 if (!proposal || proposal.proposalStatus === 'draft') return null
 const effect = await c.db.prepare(`SELECT 1 FROM e_activity WHERE action='proposal-submit' AND record=?
  AND json_extract(detail,'$.authority.id')=? AND json_extract(detail,'$.authority.for.id')=?
  AND json_extract(detail,'$.authority.idempotencyKey')=? LIMIT 1`)
  .bind(args.id, ctx.agent.id, ctx.person.id, ctx.idempotencyKey).first()
 if (!effect) return null
 requireThat(proposal.kind === 'proposal' && proposal.createdBy === c.x.actor.email && proposal.status === 'working' && proposal.proposalStatus === 'submitted', 'Agents may replay only their own submitted working proposal', 403)
 return requireProposalSubmission(c, proposal.id)
}
