import { ToolRefusal, type ToolContext, type ResourceContext } from '../modules/agent-door/index.ts'
import { nativeActor } from './people.ts'
import { credentialActor } from './credentials.ts'
import { access, requireMember } from '../easel/access'
import { agentEnabled } from '../easel/agents/governance'
import { load, readFence, save } from '../easel/store'
import { versionStructure } from '../easel/structure-versions'
import { erasedView } from '../easel/erasure'
import { Fault, type Actor, type Data } from '../easel/types'
import type { Context } from '../easel/context'
import { invokeNative } from '../easel/agent-actions'

export async function nativeContext(ctx: ToolContext | ResourceContext): Promise<Context & { before: Context['s']; revision: number }> {
 const person = await nativeActor(ctx.db, ctx.person.id)
 if (!person) throw new ToolRefusal('unauthenticated')
 const client = ctx.clientId ?? ''
 let a: Actor = { ...person, agent: { id: ctx.agent.id, name: ctx.agent.name, via: 'mcp', sponsor: { id: ctx.person.id, name: ctx.person.name }, ...('approvers' in ctx ? { approvers: [...ctx.approvers], idempotencyKey: ctx.idempotencyKey, operationId: ctx.operationId } : {}) } }
 if (client.startsWith('session:')) {
  const id = client.slice(8)
  const session = await ctx.db.prepare('SELECT id FROM oa_sessions WHERE id=? AND operator_id=? AND operator_version=? AND revoked_at IS NULL AND expires_at>unixepoch()*1000').bind(id, a.id, a.version).first()
  if (!session) throw new ToolRefusal('unauthenticated')
  a.session = id
 } else if (client.startsWith('credential:')) {
  const current = await credentialActor(ctx.db, client.slice(11), a)
  if (!current) throw new ToolRefusal('unauthenticated')
  a = current
 } else {
  a.door = { agent: ctx.agent.id, consent: 'consent' in ctx ? ctx.consent ?? null : null }
 }
 a.door = { agent: ctx.agent.id, consent: 'consent' in ctx ? ctx.consent ?? null : null }
 const { state, revision } = await load(ctx.db)
 if (!agentEnabled(state, 'mcp')) throw new ToolRefusal('agents_paused')
 const current = access(state, a)
 try { requireMember(current) } catch { throw new ToolRefusal('forbidden') }
 return { db: ctx.db, s: state, before: new Map(state), revision, x: current, activity: [], snapshots: [], now: new Date().toISOString() }
}
export async function nativeAction(name: string, args: Data, ctx: ToolContext, persist: boolean) {
 const c = await nativeContext(ctx)
 try {
  // Match the native HTTP boundary: optional undefined fields are not JSON values.
  const result = JSON.parse(JSON.stringify(await erasedView(c.db, await invokeNative(c, name, args)))) as Data
  if (persist) {
   if (c.activity.length || c.snapshots.length) {
    await versionStructure(c, c.before, c.revision)
    await save(c.db, c.x.actor, c.before, c.s, c.revision, c.activity, c.snapshots, c.x.role === 'finance')
   } else await readFence(c.db, c.x.actor, c.revision)
  }
  return { c, result }
 } catch (e) {
  if (e instanceof Fault) throw new ToolRefusal(e.status === 403 ? 'forbidden' : e.status === 404 ? 'resource_unavailable' : e.status === 409 ? 'revision_conflict' : 'invalid_arguments')
  throw e
 }
}
