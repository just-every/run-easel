import { seesDepartmentDetail } from './access'
import { scopedReader } from './group-projections'
// Report aggregates consume atomic dimension partitions internally, never traces.
import { descendants, dimensionAccess, dimensionStructure, validateDimensions, type DimensionStructure } from './dimensions'
import { dimensionalCells } from './dimensions-report'
import { workingCalculation } from './calculation'
import type { Context } from './context'
import { frozenModel } from './reforecasts'
import { get, requireThat, type Data } from './types'

export function reportDimensionDefinition(c: Context, v: Data) {
 const dimension = v.dimension ? get(c.s, 'dimension', v.dimension).id : ''
 requireThat(v.row !== 'dimension' || dimension, 'Choose the row dimension')
 return { dimension, dimensions: validateDimensions(c.s, v.dimensions) }
}

export async function reportDimensionSource(c: Context, id: string) {
 const scenario = get(c.s, 'scenario', id)
 const frozen = scenario.status === 'frozen' ? await frozenModel(c, scenario) : null
 const calculation = frozen?.calculation ?? await workingCalculation(c, id)
 const structure: DimensionStructure = frozen?.dimensionStructure ?? dimensionStructure(c.s)
 return { structure, cells: dimensionalCells(calculation.cells).filter(cell => (!scopedReader(c.x) || seesDepartmentDetail(c.x, cell.department)) && dimensionAccess(c.s, c.x, cell.dimensions, cell.department)) }
}

export function reportDimensionRows(definition: Data, structure: DimensionStructure, lines: Data[]) {
 if (definition.row === 'dimension') {
  requireThat(structure.dimension.some(d => d.id === definition.dimension), 'Row dimension is absent from this source version', 409)
  return [...structure['dimension-member'].filter(m => m.dimension === definition.dimension).map(m => ({ id: m.id, name: m.name, parent: m.parent ?? '', rollup: structure['dimension-member'].some(child => child.parent === m.id) })), { id: '', name: 'Unassigned', parent: '', rollup: false }]
 }
 if (definition.row === 'hierarchy') return [
  ...structure['line-group'].filter(g => lines.some(l => descendants(structure['line-group'], g.id).has(l.group))).map(g => ({ id: `group:${g.id}`, name: g.name, parent: g.parent ? `group:${g.parent}` : '', rollup: true })),
  ...lines.map(l => ({ id: l.id, name: l.name, parent: l.group ? `group:${l.group}` : '', rollup: false })),
 ]
 return []
}

export function reportDimensionMatch(c: Context, definition: Data, structure: DimensionStructure, cell: Data, row: string) {
 if (!dimensionAccess(c.s, c.x, cell.dimensions ?? {}, cell.department)) return false
 for (const [dimension, member] of Object.entries(definition.dimensions ?? {})) {
  requireThat(structure['dimension-member'].some(m => m.id === member && m.dimension === dimension), 'A filter member is absent from this source version', 409)
  if (!descendants(structure['dimension-member'], member as string).has(cell.dimensions?.[dimension] ?? '')) return false
 }
 if (definition.row === 'dimension') return row ? descendants(structure['dimension-member'], row).has(cell.dimensions?.[definition.dimension] ?? '') : !cell.dimensions?.[definition.dimension]
 if (definition.row === 'hierarchy') return row.startsWith('group:') ? structure.line.some(l => l.id === cell.line && descendants(structure['line-group'], row.slice(6)).has(l.group)) : row === cell.line
 return definition.row === 'line' ? cell.line === row : cell.department === row
}
