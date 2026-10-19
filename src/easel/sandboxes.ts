import { requireFinance, requireMember } from './access'
import type { Context } from './context'
import { copyInputs, plan } from './plan'
import { scenarioAccess } from './scenario-access'
import { choice, find, get, put, requireThat, text, uid, type Data } from './types'

export async function sandboxes(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['sandbox-create', 'scenario-share', 'sandbox-submit', 'scenario-official'].includes(op)) return undefined
 requireMember(c.x)
 const { s, x } = c
 if (op === 'sandbox-create') {
  requireThat(x.role === 'finance' || x.role === 'contributor', 'Only planners create sandboxes', 403)
  const from = scenarioAccess(s, x, b.from)
  requireThat(from.kind !== 'proposal', 'Branch from a plan, not a proposal')
  // The existing branch copies every supported input and frozen version correctly.
  // It receives the planner's real role; the branch command explicitly allows this mode.
  return plan(c, 'branch', { ...b, privateSandbox: true })
 }
 const sc = scenarioAccess(s, x, b.scenario)
 requireThat(x.role === 'finance' || x.role === 'contributor', 'Only planners manage scenarios', 403)
 if (op === 'scenario-share') {
  requireThat(sc.sandbox && sc.createdBy === x.actor.email, 'Only the sandbox creator changes sharing', 403)
  requireThat(sc.revision === Number(b.revision), 'The scenario changed; review sharing again', 409)
  const email = text(b.email, 'Person email', 320).toLowerCase()
  requireThat(email !== sc.createdBy, 'The creator already owns this sandbox')
  const mode = choice(b.mode, ['read', 'edit', 'remove'] as const, 'read, edit or remove')
  if (mode !== 'remove') {
   const native = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{ role: string }>()
   const member = find(s, 'member', email)
   const finance = native && ['owner', 'admin'].includes(native.role)
   requireThat(native && (finance || member?.active), 'Choose an active member')
   requireThat(mode !== 'edit' || finance || member?.role !== 'viewer', 'A viewer can receive read access only', 403)
  }
  const grants = { ...sc.sandbox.grants }
  if (mode === 'remove') delete grants[email]; else grants[email] = mode
  put(s, 'scenario', sc.id, { ...sc, revision: sc.revision + 1, sandbox: { ...sc.sandbox, grants } })
  c.activity.push({ action: op, record: sc.id, scenario: sc.id, before: sc.revision, after: sc.revision + 1, detail: { email, mode } })
  return get(s, 'scenario', sc.id)
 }
 if (op === 'sandbox-submit') {
  requireThat(sc.sandbox && sc.createdBy === x.actor.email, 'Only the sandbox creator submits it', 403)
  requireThat(sc.revision === Number(b.revision), 'The sandbox changed; review it again', 409)
  const target = scenarioAccess(s, x, b.into || sc.branchedFrom?.scenario)
  const targetRevision = b.into ? Number(b.targetRevision) : sc.branchedFrom.revision
  requireThat(target.status === 'working' && !target.sandbox && target.kind !== 'proposal' && target.revision === targetRevision, 'The original working plan changed or is frozen; create a fresh sandbox', 409)
  const id = uid(), request = text(b.request, 'What should change', 2000)
  put(s, 'scenario', id, { name: sc.name, kind: 'proposal', status: 'working', revision: 1, createdBy: x.actor.email, createdAt: c.now, parent: target.id, branchedFrom: { scenario: target.id, revision: target.revision, name: target.name }, actualsThrough: sc.actualsThrough, cash: sc.cash, ...(sc.horizon ? { horizon: sc.horizon } : {}), request, proposalStatus: 'draft' })
  copyInputs(s, sc.id, id)
  c.activity.push({ action: 'proposal-create', record: id, scenario: id, after: 1, detail: { from: target.id, fromRevision: target.revision } })
  await plan(c, 'proposal-submit', { id })
  return get(s, 'scenario', id)
 }
 requireFinance(x)
 requireThat(!sc.sandbox && sc.kind !== 'proposal', 'Official cases must be company-visible plans', 409)
 requireThat(sc.revision === Number(b.revision), 'The scenario changed; review it again', 409)
 const official = choice(b.official, ['', 'budget', 'forecast', 'board-case'] as const, 'an official designation')
 // A label identifies the case; it never changes its kind, arithmetic or approval.
 put(s, 'scenario-designation', sc.id, { scenario: sc.id, official })
 c.activity.push({ action: op, record: sc.id, scenario: sc.id, detail: { official } })
 return { ...get(s, 'scenario', sc.id), official }
}
