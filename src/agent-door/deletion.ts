import { ToolRefusal, type ToolContext } from '../modules/agent-door/index.ts'
import { nativeContext } from './native.ts'
import { requireInputRemoval } from '../easel/input-removal'
import { requireAgentDraft } from '../easel/agent-actions'
import { INPUT_KINDS } from '../easel/model'
import { choice, find, Fault, type Data } from '../easel/types'

/** A deleted input's native before-image admits only its original once-only receipt.
 * New keys cannot use it. Current sponsor, proposal, department and Pay grants
 * pass the very same native removal checks before any retained facts are used. */
export async function deletionReplay(args: Data, ctx: ToolContext): Promise<{ input: Data; c: Awaited<ReturnType<typeof nativeContext>> } | null> {
 if (!ctx.idempotencyKey) return null
 const c = await nativeContext(ctx)
 try {
  const kind = choice(args.kind, INPUT_KINDS, 'an input kind')
  if (find(c.s, kind, args.id)) return null
  const row = await ctx.db.prepare(`SELECT detail FROM e_activity WHERE action='record-changed' AND record=?
   AND json_extract(detail,'$.kind')=? AND json_extract(detail,'$.after') IS NULL
   AND json_extract(detail,'$.authority.id')=? AND json_extract(detail,'$.authority.for.id')=?
   AND json_extract(detail,'$.authority.idempotencyKey')=? ORDER BY seq DESC LIMIT 1`)
   .bind(args.id, kind, ctx.agent.id, ctx.person.id, ctx.idempotencyKey).first<{detail:string}>()
  if (!row) return null
  const before = JSON.parse(row.detail).before
  if (!before) return null
  const input = { ...before, id: args.id }
  requireAgentDraft(c, input.scenario)
  requireInputRemoval(c, kind, input)
  return { input, c }
 } catch (e) {
  if (e instanceof Fault) throw new ToolRefusal(e.status === 403 ? 'forbidden' : 'resource_unavailable')
  throw e
 }
}
