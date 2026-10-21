// Resolve current membership and groups once per loaded model revision. Groups
// add grants, never a role; dimension limits intersect department authority.
import { all, find, requireThat, type Access, type Actor, type Capability, type Data, type GrantCeiling, type State } from './types'

export const CAPABILITIES: Capability[] = ['compensation', 'connections', 'model-structure', 'approvals', 'publishing']
const unique = (ids: string[]) => [...new Set(ids)]
const intersect = (a: string[], b: string[]) => a.filter(id => b.includes(id))

function expanded(s: State, dimension: string, ids: string[]) {
 const result = new Set(ids), rows = all(s, 'dimension-member').filter(m => m.dimension === dimension)
 for (let changed = true; changed;) {
  changed = false
  for (const row of rows) if (row.parent && result.has(row.parent) && !result.has(row.id)) { result.add(row.id); changed = true }
 }
 return [...result]
}

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
 const dimensionRead: Record<string, string[]> = {}, dimensionEdit: Record<string, string[]> = {}
 if (!finance) for (const d of all(s, 'dimension')) {
  const directIds = m?.dimensionMembers?.[d.id]
  const grants = groups.filter(g => g.dimensions[d.id])
  if (groupOnly || directIds !== undefined || grants.length) {
   const directGrant = !groupOnly && Array.isArray(directIds) ? directIds : []
   dimensionRead[d.id] = expanded(s, d.id, unique([...directGrant, ...grants.flatMap(g => [...g.dimensions[d.id].read, ...g.dimensions[d.id].edit])]))
   dimensionEdit[d.id] = role === 'contributor' ? expanded(s, d.id, unique([...directGrant, ...grants.flatMap(g => g.dimensions[d.id].edit)])) : []
  }
 }
 const scenarioGrants: Record<string, 'read' | 'edit'> = {}
 for (const sc of all(s, 'scenario')) {
  const modes = [...groups.map(g => sc.sandbox?.groupGrants?.[g.id]), sc.sandbox?.grants?.[a.email], ...(sc.sandbox && sc.createdBy === a.email ? ['edit'] : [])]
  if (modes.includes('edit')) scenarioGrants[sc.id] = 'edit'
  else if (modes.includes('read')) scenarioGrants[sc.id] = 'read'
 }
 return { actor: a, role, departments, readDepartments, payDetail, capabilities, dimensionRead, dimensionEdit, groups: groups.map(g => g.id), scenarioGrants, groupOnly,
  statementDepartments: unique([...direct, ...groups.flatMap(g => g.departments.owners)]).filter(id => readDepartments.includes(id)) }
}

// A missing key means unrestricted on that dimension, while [] means denied.
function intersectDimensions(a: Record<string, string[]>, b: Record<string, string[]>) {
 return Object.fromEntries(unique([...Object.keys(a), ...Object.keys(b)]).map(id => [id, a[id] === undefined ? b[id] : b[id] === undefined ? a[id] : intersect(a[id], b[id])]))
}
export function grantCeiling(x: Access, s: State): GrantCeiling {
 return { readDepartments: x.readDepartments ?? x.departments, dimensionRead: Object.fromEntries(all(s, 'dimension').map(d => [d.id, x.dimensionRead?.[d.id] ?? ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]])), dimensionEdit: Object.fromEntries(all(s, 'dimension').map(d => [d.id, x.dimensionEdit?.[d.id] ?? ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]])), capabilities: x.capabilities ?? [], groups: x.groups ?? [], scenarioGrants: x.scenarioGrants ?? {}, groupOnly: x.groupOnly === true }
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
   dimensionRead: Object.fromEntries(all(s, 'dimension').map(d => [d.id, []])), dimensionEdit: Object.fromEntries(all(s, 'dimension').map(d => [d.id, []])) }
 }
 const scenarioGrants = Object.fromEntries(Object.entries(current.scenarioGrants ?? {}).filter(([id]) => ceiling.scenarioGrants[id]).map(([id, mode]) => [id, mode === 'edit' && ceiling.scenarioGrants[id] === 'edit' ? 'edit' : 'read'])) as Record<string, 'read' | 'edit'>
 const dimensionRead = intersectDimensions(current.dimensionRead ?? {}, Object.fromEntries(all(s, 'dimension').map(d => [d.id, ceiling.dimensionRead[d.id] ?? []])))
 const dimensionLimited = all(s, 'dimension').some(d => ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)].some(id => !dimensionRead[d.id]?.includes(id)))
 return { ...current, dimensionRead, dimensionLimited, payDetail: current.payDetail === true && a.token.payDetail, departments: intersect(current.departments, a.token.departments), readDepartments: intersect(current.readDepartments ?? [], ceiling.readDepartments),
  capabilities: intersect(current.capabilities ?? [], ceiling.capabilities) as Capability[], groups: intersect(current.groups ?? [], ceiling.groups), scenarioGrants,
  groupOnly: current.groupOnly || ceiling.groupOnly, dimensionEdit: intersectDimensions(current.dimensionEdit ?? {}, Object.fromEntries(all(s, 'dimension').map(d => [d.id, ceiling.dimensionEdit[d.id] ?? []]))),
  statementDepartments: intersect(current.statementDepartments ?? [], ceiling.readDepartments) }
}
export function requireMember(x: Access) { requireThat(x.role, 'Finance has not added you to this plan yet', 403) }
export function requireFinance(x: Access) { requireThat(x.role === 'finance', 'Only finance can do this', 403) }
export function requireCapability(x: Access, capability: Capability, state?: State) {
 requireMember(x)
 requireThat(x.capabilities?.includes(capability) || !x.capabilities && x.role === 'finance' && capability !== 'compensation', `The ${capability} permission is required`, 403)
 if (state && ['approvals', 'publishing'].includes(capability)) {
  const departments = all(state, 'department').every(d => seesDepartmentDetail(x, d.id))
  const dimensions = all(state, 'dimension').every(d => x.dimensionRead?.[d.id] === undefined || ['', ...all(state, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)].every(id => x.dimensionRead![d.id].includes(id)))
  requireThat(departments && dimensions, 'Company-wide approval and publishing require access to every department and dimension member', 403)
 }
}
export function requireDepartment(x: Access, department: string) {
 requireThat(x.role === 'finance' || x.role === 'contributor' && x.departments.includes(department), 'You can only change your own departments', 403)
}
export const seesDepartmentDetail = (x: Access, department: string) => x.role === 'finance' || x.role !== null && (x.readDepartments ?? (x.role === 'contributor' ? x.departments : [])).includes(department)
export function dimensionAllowed(_s: State, x: Access, tags: Record<string, string> = {}, edit = false) {
 if (!x.role || edit && x.role === 'viewer') return false
 const grants = (edit ? x.dimensionEdit : x.dimensionRead) ?? {}
 return Object.entries(grants).every(([dimension, ids]) => ids.includes(tags[dimension] ?? ''))
}
export function visibleInput(x: Access, kind: string, input: Data) {
 if (!dimensionAllowed(new Map(), x, input.dimensions)) return false
 if (kind === 'workbook-model') return x.role === 'finance' && x.payDetail === true
 if (kind === 'position' && !seesPayDetail(x, input.department)) return false
 if (x.role === 'finance') return true
 if (kind === 'debt' || kind === 'equity' || kind === 'tax-policy') return false
 return seesDepartmentDetail(x, input.department)
}
export const seesPayDetail = (x: Access, department: string) => x.payDetail === true && x.role !== 'viewer' && seesDepartmentDetail(x, department)
export function requirePayDetail(x: Access) { requireThat(x.payDetail === true, 'Pay detail permission is required for this complete record or export', 403) }
