import { ToolRefusal, type ToolContext, type ResourceContext, type ClassAndFacts } from '../modules/agent-door/index.ts'
import { nativeActor } from './people.ts'
import { credentialActor } from './credentials.ts'
import { access, requireMember } from '../easel/access'
import { agentEnabled } from '../easel/agents/governance'
import { load, readFence, save } from '../easel/store'
import { versionStructure } from '../easel/structure-versions'
import { erasedView } from '../easel/erasure'
import { Fault, find, get, put, type Actor, type Data } from '../easel/types'
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
export type NativeAdmission = { revision: number; person: string; version: number; role: Actor['baseRole'] }
export const nativeAdmission = (c: Awaited<ReturnType<typeof nativeContext>>): NativeAdmission => ({ revision: c.revision, person: c.x.actor.id, version: c.x.actor.version, role: c.x.actor.baseRole })

export async function nativeAction(name: string, args: Data, ctx: ToolContext | ResourceContext, persist: boolean, expected?: NativeAdmission, completed = false) {
 const c = await nativeContext(ctx)
 try {
  if (expected && (c.revision !== expected.revision || c.x.actor.id !== expected.person || c.x.actor.version !== expected.version || c.x.actor.baseRole !== expected.role)) throw new ToolRefusal('revision_conflict', 'The native plan or authority changed', { current_revision: c.revision })
  let proposed = args
  if (!persist && completed && args.revision !== undefined && ctx.idempotencyKey) {
   // A completed effect advances its own native revision. Re-admit its receipt
   // under today's native grants, without treating that advancement as a stale
   // first execution. The actual write always keeps the original precondition.
   const written = await ctx.db.prepare(`SELECT 1 FROM e_activity WHERE
    json_extract(detail,'$.authority.id')=? AND json_extract(detail,'$.authority.for.id')=?
    AND json_extract(detail,'$.authority.idempotencyKey')=? LIMIT 1`)
    .bind(ctx.agent.id, ctx.person.id, ctx.idempotencyKey).first()
   const scenario = written && typeof args.scenario === 'string' ? find(c.s, 'scenario', args.scenario) : null
   if (scenario) proposed = { ...args, revision: typeof args.revision === 'string' ? String(scenario.revision) : scenario.revision }
  }
  if (!persist && completed && name === 'formula' && !args.id) {
   // Creating a formula consumes its unique name. Re-admit the existing native
   // record as an edit, so current Pay, department, dimension and source grants
   // still run without trying to create that name a second time.
   const row = await ctx.db.prepare(`SELECT record FROM e_activity WHERE action='record-changed'
    AND json_extract(detail,'$.kind')='formula' AND json_extract(detail,'$.after') IS NOT NULL
    AND json_extract(detail,'$.authority.id')=? AND json_extract(detail,'$.authority.for.id')=?
    AND json_extract(detail,'$.authority.idempotencyKey')=? LIMIT 1`)
    .bind(ctx.agent.id, ctx.person.id, ctx.idempotencyKey).first<{record:string}>()
   if (!row || !find(c.s, 'formula', row.record)) throw new ToolRefusal('resource_unavailable')
   proposed = { ...proposed, id: row.record }
  }
  if (!persist && completed && name === 'proposal-submit') {
   // Only the shared door's completed, argument-matched receipt reaches here.
   // Re-run native submission authority against today's proposal and inputs;
   // the consumed draft precondition applies only to a new effect.
   const proposal = get(c.s, 'scenario', args.id)
   if (proposal.proposalStatus !== 'submitted') throw new ToolRefusal('resource_unavailable')
   put(c.s, 'scenario', proposal.id, { ...proposal, proposalStatus: 'draft' })
  }
  // Match the native HTTP boundary: optional undefined fields are not JSON values.
  const result = JSON.parse(JSON.stringify(await erasedView(c.db, await invokeNative(c, name, proposed)))) as Data
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

/** Only native payroll and identity fields trigger sensitive; caller labels have no authority. */
function sensitiveRecords(value: unknown): number {
 if (!value || typeof value !== 'object') return 0
 if (Array.isArray(value)) return value.reduce((n, item) => n + sensitiveRecords(item), 0)
 const object = value as Data
 if (Object.hasOwn(object, 'annualSalaryCents') || Object.hasOwn(object, 'annualSalary') || Object.hasOwn(object, 'holder') && !!object.holder) return 1
 return Object.values(object).reduce<number>((n, item) => n + sensitiveRecords(item), 0)
}
export function recordClasses(value: unknown): ClassAndFacts[] {
 const view = value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null
 const payrollLines = new Set<string>((view?.lines ?? []).filter((line: Data) => line.payroll).map((line: Data) => line.id))
 const payrollInputs = Object.entries(view?.inputs ?? {}).filter(([kind]) => kind !== 'position')
  .flatMap(([, inputs]) => inputs as Data[]).filter(input => payrollLines.has(input.line)).length
 const n = sensitiveRecords(value) + payrollInputs
 return [{ class: 'standard', facts: { measure: 1 } }, ...(n ? [{ class: 'sensitive' as const, facts: { measure: n, kind: 'payroll' } }] : [])]
}
