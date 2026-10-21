import { access, CAPABILITIES, requireFinance, requireMember } from './access'
import type { Context } from './context'
import { canSeeScenario } from './scenario-access'
import { all, choice, find, get, integer, put, remove, requireThat, text, uid, type Data } from './types'

function list(value: unknown, label: string): string[] {
 requireThat(value === undefined || Array.isArray(value), `${label} must be a list`)
 return [...new Set((value ?? []).map((id: unknown) => text(id, label, 320)))]
}
function exact(group: Data, revision: unknown) {
 requireThat(group.revision === integer(revision, 'Group revision', 1, Number.MAX_SAFE_INTEGER), 'The group changed; review it again', 409)
}
function owner(c: Context) {
 requireThat(c.x.actor.baseRole === 'owner' && !c.x.actor.agent && !c.x.actor.token, 'Only the signed-in owner grants group Pay detail', 403)
}

/** Group edits are administrative, separate from the capabilities they grant. */
export async function groups(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['group-save', 'group-delete', 'group-pay'].includes(op)) return undefined
 requireFinance(c.x)
 requireThat(!c.x.actor.agent && !c.x.actor.token, 'Use your signed-in session to administer groups', 403)
 const prior = b.id ? get(c.s, 'access-group', b.id, 'group') : undefined
 if (prior) exact(prior, b.revision)
 if (op === 'group-delete') {
  requireThat(prior, 'Choose a group')
  if (prior.payDetail) owner(c)
  remove(c.s, 'access-group', prior.id)
  // Remove dangling scenario shares, so recreating a group never revives access.
  for (const sc of all(c.s, 'scenario').filter(sc => sc.sandbox?.groupGrants?.[prior.id])) {
   const groupGrants = { ...sc.sandbox.groupGrants }; delete groupGrants[prior.id]
   put(c.s, 'scenario', sc.id, { ...sc, revision: sc.revision + 1, sandbox: { ...sc.sandbox, groupGrants } })
  }
  c.activity.push({ action: op, record: prior.id, detail: { name: prior.name } })
  return { removed: prior.id }
 }
 if (op === 'group-pay') {
  owner(c); requireThat(prior, 'Choose a group')
  requireThat(typeof b.granted === 'boolean', 'Choose whether Pay detail is granted')
  put(c.s, 'access-group', prior.id, { ...prior, revision: prior.revision + 1, payDetail: b.granted, payGrantedBy: c.x.actor.email, payGrantedAt: c.now })
  c.activity.push({ action: op, record: prior.id, detail: { granted: b.granted } })
  return get(c.s, 'access-group', prior.id)
 }
 requireThat(b.payDetail === undefined, 'Use the owner-only group-pay action for compensation grants', 403)
 // Adding members to a compensation-enabled group is itself a pay grant.
 if (prior?.payDetail) owner(c)
 const name = text(b.name, 'Group name', 120), id = prior?.id ?? uid()
 requireThat(!all(c.s, 'access-group').some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase()), 'A group with this name already exists')
 const members = list(b.members, 'Group members').map(email => email.toLowerCase())
 for (const email of members) {
  const member = find(c.s, 'member', email)
  const native = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{ role: string }>()
  requireThat(native && (['owner', 'admin'].includes(native.role) || member?.active && member.role !== 'finance'), 'Choose an active planning member')
 }
 const departments: Data = {}
 requireThat(b.departments === undefined || b.departments && typeof b.departments === 'object' && !Array.isArray(b.departments), 'Department grants must be an object')
 for (const mode of ['read', 'edit', 'owners']) departments[mode] = list(b.departments?.[mode], 'Departments').map(id => get(c.s, 'department', id).id)
 requireThat(departments.owners.every((id: string) => departments.read.includes(id) || departments.edit.includes(id)), 'Statement ownership requires department read or edit')
 const dimensions: Data = {}
 requireThat(b.dimensions === undefined || b.dimensions && typeof b.dimensions === 'object' && !Array.isArray(b.dimensions), 'Dimension grants must be an object')
 for (const [dimension, value] of Object.entries(b.dimensions ?? {})) {
  get(c.s, 'dimension', dimension)
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Dimension grants must name read and edit lists')
  const modes: Data = {}
  for (const mode of ['read', 'edit']) modes[mode] = list((value as Data)[mode], 'Dimension members').map(id => {
   const member = get(c.s, 'dimension-member', id)
   requireThat(member.dimension === dimension, 'The member belongs to another dimension')
   return member.id
  })
  dimensions[dimension] = modes
 }
 const capabilities = list(b.capabilities, 'Capabilities').map(cap => choice(cap, CAPABILITIES.filter(cap => cap !== 'compensation'), 'a capability'))
 put(c.s, 'access-group', id, { name, members: [...new Set(members)], departments, dimensions, capabilities, payDetail: prior?.payDetail === true,
  ...(prior?.payGrantedBy ? { payGrantedBy: prior.payGrantedBy, payGrantedAt: prior.payGrantedAt } : {}), revision: (prior?.revision ?? 0) + 1, updatedBy: c.x.actor.email, updatedAt: c.now })
 c.activity.push({ action: op, record: id, detail: { name, members, departments, dimensions, capabilities } })
 return get(c.s, 'access-group', id)
}

/** Resolve the report through the exact same authority function as requests. */
export async function accessReport(c: Context) {
 requireMember(c.x); requireFinance(c.x)
 const { results } = await c.db.prepare("SELECT id,email,display_name AS name,role,version FROM oa_operators WHERE status='active' ORDER BY email").all<{ id: string; email: string; name: string; role: 'owner' | 'admin' | 'member'; version: number }>()
 const people = results.map(person => {
  const x = access(c.s, { ...person, baseRole: person.role, session: '' })
  return { email: person.email, name: person.name, role: x.role, groups: x.groups ?? [], departments: { read: x.readDepartments ?? [], edit: x.role === 'finance' ? all(c.s, 'department').map(d => d.id) : x.departments, owners: x.statementDepartments ?? [] },
   dimensions: { read: x.dimensionRead ?? {}, edit: x.dimensionEdit ?? {} }, capabilities: x.capabilities ?? [], payDetail: x.payDetail === true, groupOnly: x.groupOnly === true,
   scenarios: all(c.s, 'scenario').filter(sc => canSeeScenario(x, sc)).map(sc => ({ id: sc.id, name: sc.name, mode: sc.sandbox ? sc.createdBy === person.email || sc.sandbox.grants?.[person.email] === 'edit' || x.scenarioGrants?.[sc.id] === 'edit' ? 'edit' : 'read' : x.role === 'viewer' ? 'read' : 'edit' })) }
 }).filter(person => person.role)
 return { groups: all(c.s, 'access-group'), people }
}
