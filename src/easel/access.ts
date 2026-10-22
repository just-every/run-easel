import { dimensionSummary, expanded, hasFullScope, intersectGrants, matchesGrant, mintGrants } from './access-grants'
import { boundEntity } from './entity-scope'
// Resolve current membership and groups once per loaded model revision. Groups
// add grants, never a role; dimension limits intersect department authority.
import { all, find, requireThat, type Access, type Actor, type Capability, type Data, type GrantCeiling, type State } from './types'

export const CAPABILITIES: Capability[] = ['compensation', 'connections', 'model-structure', 'approvals', 'publishing']
const unique = (ids: string[]) => [...new Set(ids)]
const intersect = (a: string[], b: string[]) => a.filter(id => b.includes(id))

function currentAccess(s: State, a: Actor): Access {
 const finance = a.baseRole === 'owner' || a.baseRole === 'admin', m = find(s, 'member', a.email)
 if (!finance && (!m?.active || m.role === 'finance')) return { actor: a, role: null, departments: [], payDetail: false }
 const role = finance ? 'finance' : m!.role
 const groups = all(s, 'access-group').filter(g => g.members.includes(a.email))
 const groupOnly = !finance && m?.groupOnly === true
 const direct = !groupOnly && role === 'contributor' ? m?.departments ?? [] : []
 const departments = role === 'contributor' ? unique([...direct, ...groups.flatMap(g => g.departments.edit)]) : []
 const readDepartments = finance ? all(s, 'department').map(d => d.id) : unique([...departments, ...groups.flatMap(g => g.departments.read)])
 const capabilities: Capability[] = role === 'viewer' ? [] : finance ? CAPABILITIES.filter(cap => cap !== 'compensation') : unique(groups.flatMap(g => g.capabilities)).filter(cap => cap !== 'compensation') as Capability[]
 const payDetail = a.baseRole === 'owner' || role !== 'viewer' && (find(s, 'pay-grant', a.email)?.granted === true || groups.some(g => g.payDetail === true))
 if (payDetail) capabilities.push('compensation')
 const directDimensions = Object.fromEntries(Object.entries(m?.dimensionMembers ?? {}).map(([id, ids]) => [id, expanded(s, id, ids as string[])]))
 const native = { id: 'direct', departments: finance || role === 'viewer' ? null : direct, dimensions: finance ? {} : directDimensions }
 const readGrants = [...(!groupOnly ? [native] : []), ...groups.map(g => ({ id: g.id, departments: unique([...g.departments.read, ...g.departments.edit]), dimensions: Object.fromEntries(Object.entries(g.dimensions).map(([id, modes]) => [id, expanded(s, id, [...(modes as Data).read, ...(modes as Data).edit])])) }))]
 const editGrants = role === 'viewer' ? [] : [...(!groupOnly ? [native] : []), ...groups.map(g => ({ id: g.id, departments: g.departments.edit, dimensions: Object.fromEntries(Object.entries(g.dimensions).map(([id, modes]) => [id, expanded(s, id, (modes as Data).edit)])) }))]
 const dimensionRead = dimensionSummary(readGrants), dimensionEdit = dimensionSummary(editGrants)
 const scenarioGrants: Record<string, 'read' | 'edit'> = {}
 for (const sc of all(s, 'scenario')) {
  const modes = [...groups.map(g => sc.sandbox?.groupGrants?.[g.id]), sc.sandbox?.grants?.[a.email], ...(sc.sandbox && sc.createdBy === a.email ? ['edit'] : [])]
  if (modes.includes('edit')) scenarioGrants[sc.id] = 'edit'
  else if (modes.includes('read')) scenarioGrants[sc.id] = 'read'
 }
 const scenarioDimensions = Object.fromEntries(all(s, 'scenario').flatMap(sc => { const e = boundEntity(s, sc); return e ? [[sc.id, { [e.dimension]: e.member }]] : [] }))
 return { readGrants, editGrants, scenarioDimensions, actor: a, role, departments, readDepartments, payDetail, capabilities, dimensionRead, dimensionEdit, groups: groups.map(g => g.id), scenarioGrants, groupOnly,
  statementDepartments: unique([...direct, ...groups.flatMap(g => g.departments.owners)]).filter(id => readDepartments.includes(id)) }
}

export function grantCeiling(x: Access, s: State): GrantCeiling {
 return { readGrants: mintGrants(s, x.readGrants ?? []), editGrants: mintGrants(s, x.editGrants ?? []), readDepartments: x.readDepartments ?? x.departments, dimensionRead: Object.fromEntries(all(s, 'dimension').map(d => [d.id, x.dimensionRead?.[d.id] ?? ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]])), dimensionEdit: Object.fromEntries(all(s, 'dimension').map(d => [d.id, x.dimensionEdit?.[d.id] ?? ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]])), capabilities: x.capabilities ?? [], groups: x.groups ?? [], scenarioGrants: x.scenarioGrants ?? {}, groupOnly: x.groupOnly === true }
}
export function access(s: State, a: Actor): Access {
 const current = currentAccess(s, a)
 if (!a.token) return current
 if (current.role !== a.token.role) return { actor: a, role: null, departments: [], payDetail: false }
 const ceiling = a.token.grants
 // Old credentials never gain group, dimension or capability authority. Their
 // original department/pay ceilings still govern their legacy planning reads.
 if (!ceiling) {
  const legacy = currentAccess(new Map([...s].filter(([, row]) => row.kind !== 'access-group')), a)
  return { ...legacy, departments: intersect(legacy.departments, a.token.departments), readDepartments: intersect(legacy.readDepartments ?? [], a.token.departments), payDetail: legacy.payDetail === true && a.token.payDetail, capabilities: legacy.role === 'finance' ? legacy.capabilities ?? [] : [], dimensionLimited: all(s, 'dimension').length > 0, groups: [], scenarioGrants: {},
   readGrants: [], editGrants: [], dimensionRead: Object.fromEntries(all(s, 'dimension').map(d => [d.id, []])), dimensionEdit: Object.fromEntries(all(s, 'dimension').map(d => [d.id, []])) }
 }
 const scenarioGrants = Object.fromEntries(Object.entries(current.scenarioGrants ?? {}).filter(([id]) => ceiling.scenarioGrants[id]).map(([id, mode]) => [id, mode === 'edit' && ceiling.scenarioGrants[id] === 'edit' ? 'edit' : 'read'])) as Record<string, 'read' | 'edit'>
 const readGrants = intersectGrants(s, current.readGrants ?? [], ceiling.readGrants ?? [{ id: 'legacy-ceiling', departments: ceiling.readDepartments, dimensions: ceiling.dimensionRead }])
 const editGrants = intersectGrants(s, current.editGrants ?? [], ceiling.editGrants ?? [{ id: 'legacy-ceiling', departments: a.token.departments, dimensions: ceiling.dimensionEdit }])
 const dimensionRead = dimensionSummary(readGrants), dimensionEdit = dimensionSummary(editGrants)
 const scoped = { ...current, readGrants, editGrants }
 return { ...scoped, dimensionRead, dimensionEdit, dimensionLimited: !hasFullScope(s, scoped), payDetail: current.payDetail === true && a.token.payDetail, departments: intersect(current.departments, a.token.departments), readDepartments: intersect(current.readDepartments ?? [], ceiling.readDepartments),
  capabilities: intersect(current.capabilities ?? [], ceiling.capabilities) as Capability[], groups: intersect(current.groups ?? [], ceiling.groups), scenarioGrants,
  groupOnly: current.groupOnly || ceiling.groupOnly,
  statementDepartments: intersect(current.statementDepartments ?? [], ceiling.readDepartments) }

}
export function requireMember(x: Access) { requireThat(x.role, 'Finance has not added you to this plan yet', 403) }
export function requireFinance(x: Access) { requireThat(x.role === 'finance', 'Only finance can do this', 403) }
export function requireCapability(x: Access, capability: Capability, state?: State) {
 requireMember(x)
 requireThat(x.capabilities?.includes(capability) || !x.capabilities && x.role === 'finance' && capability !== 'compensation', `The ${capability} permission is required`, 403)
 if (state && ['approvals', 'publishing'].includes(capability)) {
  requireThat(hasFullScope(state, x), 'Company-wide approval and publishing require access to every department and dimension member', 403)
 }
}
export function requireDepartment(x: Access, department: string) {
 requireThat(x.role === 'finance' || x.role === 'contributor' && x.departments.includes(department), 'You can only change your own departments', 403)
}
export const seesDepartmentDetail = (x: Access, department: string) => x.role === 'finance' || x.role !== null && (x.readDepartments ?? (x.role === 'contributor' ? x.departments : [])).includes(department)
export function dimensionAllowed(_s: State, x: Access, tags: Record<string, string> = {}, edit = false, department?: string) {
 if (!x.role || edit && x.role === 'viewer') return false
 const paired = edit ? x.editGrants : x.readGrants
 if (paired) return paired.some(grant => matchesGrant(grant, tags, department))
 const grants = (edit ? x.dimensionEdit : x.dimensionRead) ?? {}
 return Object.entries(grants).every(([dimension, ids]) => ids.includes(tags[dimension] ?? ''))
}
export function visibleInput(x: Access, kind: string, input: Data) {
 if (!dimensionAllowed(new Map(), x, input.dimensions, false, input.department ?? input.sourceDepartment)) return false
 if (kind === 'workbook-model') return x.role === 'finance' && x.payDetail === true
 if (kind === 'position' && !seesPayDetail(x, input.department)) return false
 if (x.role === 'finance') return true
 if (kind === 'debt' || kind === 'equity' || kind === 'tax-policy') return false
 return seesDepartmentDetail(x, input.department)
}
export const seesPayDetail = (x: Access, department: string) => x.payDetail === true && x.role !== 'viewer' && seesDepartmentDetail(x, department)
export function requirePayDetail(x: Access) { requireThat(x.payDetail === true, 'Pay detail permission is required for this complete record or export', 403) }
