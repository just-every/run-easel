import { all, type Access, type ScopeGrant, type State } from './types'

const unique = (ids: string[]) => [...new Set(ids)]
export function expanded(s: State, dimension: string, ids: string[]) {
 const result = new Set(ids), rows = all(s, 'dimension-member').filter(m => m.dimension === dimension)
 for (let changed = true; changed;) {
  changed = false
  for (const row of rows) if (row.parent && result.has(row.parent) && !result.has(row.id)) { result.add(row.id); changed = true }
 }
 return [...result]
}
export function matchesGrant(grant: ScopeGrant, tags: Record<string, string>, department?: string) {
 return (department === undefined || grant.departments === null || grant.departments.includes(department)) && Object.entries(grant.dimensions).every(([id, members]) => members.includes(tags[id] ?? ''))
}
/** Summaries are for navigation only. Source authority always evaluates a whole grant. */
export function dimensionSummary(grants: ScopeGrant[]) {
 const keys = unique(grants.flatMap(g => Object.keys(g.dimensions)))
 return Object.fromEntries(keys.filter(id => grants.every(g => g.dimensions[id] !== undefined)).map(id => [id, unique(grants.flatMap(g => g.dimensions[id]))]))
}
export function mintGrants(s: State, grants: ScopeGrant[]) {
 return grants.map(g => ({ ...g, departments: g.departments ?? all(s, 'department').map(d => d.id), dimensions: Object.fromEntries(all(s, 'dimension').map(d => [d.id, g.dimensions[d.id] ?? ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]])) }))
}
/** Intersect unions pairwise, retaining the pairing in both live and issuance authority. */
export function intersectGrants(s: State, live: ScopeGrant[], ceiling: ScopeGrant[]) {
 return live.flatMap(a => ceiling.map(b => ({ id: a.id, departments: a.departments === null ? b.departments : b.departments === null ? a.departments : a.departments.filter(id => b.departments!.includes(id)),
  dimensions: Object.fromEntries(all(s, 'dimension').map(d => [d.id, a.dimensions[d.id] === undefined ? b.dimensions[d.id] ?? [] : a.dimensions[d.id].filter(id => (b.dimensions[d.id] ?? []).includes(id))])) }))).filter(g => g.departments === null || g.departments.length > 0)
}
export function hasFullScope(s: State, x: Access) {
 const grants = x.readGrants
 if (!grants) return false
 const dimensions = all(s, 'dimension').map(d => [d.id, ['', ...all(s, 'dimension-member').filter(m => m.dimension === d.id).map(m => m.id)]] as const)
 const covers = (rows: ScopeGrant[], index: number): boolean => {
  if (!rows.length) return false
  if (rows.some(g => dimensions.slice(index).every(([id, members]) => g.dimensions[id] === undefined || members.every(m => g.dimensions[id].includes(m))))) return true
  if (index === dimensions.length) return true
  const [id, members] = dimensions[index]
  return members.every(member => covers(rows.filter(g => g.dimensions[id] === undefined || g.dimensions[id].includes(member)), index + 1))
 }
 return all(s, 'department').every(d => covers(grants.filter(g => g.departments === null || g.departments.includes(d.id)), 0))
}
