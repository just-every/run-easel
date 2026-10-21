import { requireFinance } from './access'
import type { Context } from './context'
import { all, find, get, put, remove, requireThat, text, uid, type Access, type Data, type State } from './types'

export type DimensionTags = Record<string, string>
export type DimensionStructure = { dimension: Data[]; 'dimension-member': Data[]; 'line-group': Data[]; line: Data[] }
export const DIMENSION_KINDS = ['dimension', 'dimension-member', 'line-group', 'dimension-map', 'dimension-rule']
export const dimensionStructure = (s: State): DimensionStructure => ({ dimension: all(s, 'dimension'), 'dimension-member': all(s, 'dimension-member'), 'line-group': all(s, 'line-group'), line: all(s, 'line') })

export function descendants(rows: Data[], id: string): Set<string> {
 const result = new Set([id])
 for (let changed = true; changed;) {
  changed = false
  for (const row of rows) if (row.parent && result.has(row.parent) && !result.has(row.id)) { result.add(row.id); changed = true }
 }
 return result
}

export function validateDimensions(s: State, value: unknown): DimensionTags {
 if (value === undefined || value === null) return {}
 requireThat(typeof value === 'object' && !Array.isArray(value), 'Dimensions must name a member for each dimension')
 const tags: DimensionTags = {}
 for (const [dimension, member] of Object.entries(value)) {
  get(s, 'dimension', dimension)
  const row = get(s, 'dimension-member', member, 'dimension member')
  requireThat(row.dimension === dimension, 'The member belongs to another dimension')
  tags[dimension] = row.id
 }
 return tags
}

/** Live grants are intersected with department authority by each caller. A grant
 * on a group includes its descendants, and follows later hierarchy changes. */
export function dimensionAccess(s: State, x: Access, tags: DimensionTags = {}) {
 if (x.role === 'finance') return true
 if (x.role !== 'contributor') return false
 const grants = find(s, 'member', x.actor.email)?.dimensionMembers
 if (!grants) return true
 return Object.entries(grants).every(([dimension, ids]) => tags[dimension] && Array.isArray(ids) && ids.some(id => descendants(all(s, 'dimension-member').filter(m => m.dimension === dimension), id).has(tags[dimension])))
}
export function requireDimensionAccess(s: State, x: Access, tags: DimensionTags = {}) {
 requireThat(dimensionAccess(s, x, tags), 'You can only change your assigned dimension members', 403)
}
export function validateDimensionGrants(s: State, value: unknown) {
 if (value === undefined || value === null) return undefined
 requireThat(typeof value === 'object' && !Array.isArray(value), 'Dimension grants must name member lists')
 const grants: Record<string, string[]> = {}
 for (const [dimension, ids] of Object.entries(value)) {
  get(s, 'dimension', dimension)
  requireThat(Array.isArray(ids), 'Choose the allowed dimension members')
  grants[dimension] = [...new Set(ids.map(id => validateDimensions(s, { [dimension]: id })[dimension]))]
 }
 return grants
}

function unused(s: State, kind: string, id: string) {
 const used = [...s.values()].some(row => {
  if (row.kind === kind && row.id === id) return false
  const v = row.value
  return kind === 'dimension' ? v.dimension === id || v.dimensions?.[id] !== undefined || v.dimensionMembers?.[id] !== undefined
   : kind === 'dimension-member' ? v.parent === id || Object.values(v.dimensions ?? {}).includes(id) || v.member === id || Object.values(v.dimensionMembers ?? {}).some(ids => Array.isArray(ids) && ids.includes(id))
   : v.parent === id || v.group === id
 })
 requireThat(!used, 'This definition is used by plans, mappings, members or children; move those first', 409)
}

export function dimensionCommands(c: Context, op: string, b: Data): Data | undefined {
 if (!['dimension', 'dimension-delete', 'dimension-member', 'dimension-member-delete', 'line-group', 'line-group-delete', 'line-hierarchy'].includes(op)) return undefined
 requireFinance(c.x)
 const { s } = c
 if (op === 'line-hierarchy') {
  const line = get(s, 'line', b.line ?? b.id)
  const group = b.parent || b.group ? get(s, 'line-group', b.parent || b.group) : undefined
  requireThat(!group || group.type === line.type, 'A line and its account group must have the same line type')
  put(s, 'line', line.id, { ...line, group: group?.id ?? '' })
  c.activity.push({ action: op, record: line.id, detail: { group: group?.id ?? '' } })
  return get(s, 'line', line.id)
 }
 const deleting = op.endsWith('-delete'), kind = deleting ? op.slice(0, -7) : op
 const id = deleting || b.id ? get(s, kind, b.id).id : uid()
 if (deleting) {
  unused(s, kind, id); remove(s, kind, id)
  c.activity.push({ action: op, record: id, detail: {} }); return { removed: id }
 }
 const name = text(b.name, kind === 'dimension' ? 'Dimension name' : 'Member name')
 const prior = find(s, kind, id)
 const value: Data = { name }
 if (kind === 'dimension-member') {
  value.dimension = get(s, 'dimension', b.dimension ?? prior?.dimension).id
  requireThat(!prior || prior.dimension === value.dimension, 'A member cannot move to another dimension')
 }
 if (kind === 'line-group') {
  value.type = b.type ?? prior?.type
  requireThat(['revenue', 'cost-of-sales', 'operating-expense'].includes(value.type), 'Choose an account group line type')
  requireThat(!prior || prior.type === value.type, 'An account group cannot change line type')
 }
 if (kind !== 'dimension') {
  value.parent = b.parent ?? prior?.parent ?? ''
  if (value.parent) {
   const parent = get(s, kind, value.parent, 'parent')
   requireThat(kind === 'dimension-member' ? parent.dimension === value.dimension : parent.type === value.type, 'Parent must belong to the same dimension or account type')
   requireThat(!descendants(all(s, kind), id).has(parent.id), 'A hierarchy cannot contain a cycle')
  }
 }
 requireThat(!all(s, kind).some(row => row.id !== id && row.name.toLowerCase() === name.toLowerCase() && row.dimension === value.dimension && (row.parent ?? '') === (value.parent ?? '')), 'A definition with this name already exists')
 put(s, kind, id, value)
 c.activity.push({ action: op, record: id, detail: value })
 return get(s, kind, id)
}

/** Adds editable starter segmentation without changing any of its arithmetic. */
export function installStarterDimensions(s: State, scenario: string, starter: string) {
 const names: Record<string, [string, string[]]> = { saas: ['Customer segment', ['Small business', 'Enterprise']], services: ['Practice', ['Advisory', 'Delivery']], project: ['Project portfolio', ['Implementation', 'Support']], wholesale: ['Channel', ['Direct', 'Reseller']] }
 requireThat(names[starter], 'Choose a supported starter model')
 const [name, members] = names[starter]
 const dimension = uid(); put(s, 'dimension', dimension, { name })
 const parent = uid(); put(s, 'dimension-member', parent, { dimension, name: 'All ' + name.toLowerCase(), parent: '' })
 const ids = members.map(name => { const id = uid(); put(s, 'dimension-member', id, { dimension, name, parent }); return id })
 for (const row of [...s.values()].filter(row => row.value.scenario === scenario && row.value.originId)) put(s, row.kind, row.id, { ...row.value, dimensions: { ...row.value.dimensions, [dimension]: ids[0] } })
 return { dimension: get(s, 'dimension', dimension), members: all(s, 'dimension-member').filter(m => m.dimension === dimension) }
}
