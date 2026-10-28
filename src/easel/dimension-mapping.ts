import { requireCapability } from './access'
import type { Context } from './context'
import { validateDimensions, type DimensionTags } from './dimensions'
import { all, get, put, remove, requireThat, text, uid, type Data, type State } from './types'

export const SOURCE_DIMENSIONS = ['department', 'class', 'tracking-option','location','project','customer','vendor'] as const
/** Rules resolve live, exactly like account mappings. Conflicting rules never pick a winner. */
export function resolveDimensions(s: State, source: Record<string, string> = {}) {
 const dimensions: DimensionTags = {}, unresolved: Data[] = []
 const rules = all(s, 'dimension-map')
 for (const dimension of all(s, 'dimension')) {
  const applicable = rules.filter(r => r.dimension === dimension.id)
  const supplied = applicable.some(r => Object.hasOwn(source, r.sourceKind))
  if (!supplied) continue
  const matches = applicable.filter(r => {
   const value = source[r.sourceKind]
   return value !== undefined && (r.match === 'prefix' ? value.startsWith(r.source) : value === r.source)
  })
  const members = [...new Set(matches.map(r => r.member))]
  if (members.length === 1 && all(s, 'dimension-member').some(m => m.id === members[0] && m.dimension === dimension.id)) dimensions[dimension.id] = members[0]
  else unresolved.push({ dimension: dimension.id, name: dimension.name, sources: Object.fromEntries(applicable.map(r => [r.sourceKind, source[r.sourceKind]])), reason: members.length > 1 ? 'Conflicting dimension rules' : 'No dimension member mapping' })
 }
 return { dimensions, unresolved }
}
export function dimensionMapping(c: Context, op: string, b: Data): Data | undefined {
 if (!['dimension-map', 'dimension-map-delete'].includes(op)) return
 requireCapability(c.x, 'model-structure')
 if (op.endsWith('-delete')) {
  const rule = get(c.s, 'dimension-map', b.id); remove(c.s, 'dimension-map', rule.id)
  c.activity.push({ action: op, record: rule.id, detail: rule }); return { removed: rule.id }
 }
 const dimension = get(c.s, 'dimension', b.dimension).id
 const member = validateDimensions(c.s, { [dimension]: b.member })[dimension]
 requireThat(SOURCE_DIMENSIONS.includes(b.sourceKind)||/^udd:[A-Za-z][A-Za-z0-9_]{0,99}$/.test(b.sourceKind),'Choose a supported source dimension')
 requireThat(!b.match || ['exact', 'prefix'].includes(b.match), 'Choose exact or prefix matching')
 const id = b.id ? get(c.s, 'dimension-map', b.id).id : uid()
 put(c.s, 'dimension-map', id, { dimension, member, sourceKind: b.sourceKind, source: text(b.source, 'Source value', 200), match: b.match ?? 'exact' })
 c.activity.push({ action: op, record: id, detail: get(c.s, 'dimension-map', id) })
 return get(c.s, 'dimension-map', id)
}
