import type { Calculation, Cell } from './engine'
import { descendants, type DimensionStructure, type DimensionTags } from './dimensions'
import { requireThat, type Data } from './types'

export type DimensionCell = { line: string; department: string; month: string; dimensions: DimensionTags; amount: number; basis: 'plan' | 'actual' }
export const dimensionKey = (tags: DimensionTags = {}) => JSON.stringify(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)))

/** Source amounts, including allocation reversals, partition the existing cells
 * exactly. Untagged values remain visible as an explicit unassigned bucket. */
export function dimensionalCells(cells: Cell[]): DimensionCell[] {
 const result = new Map<string, DimensionCell>(), tagKeys = new WeakMap<DimensionTags, string>()
 for (const cell of cells) for (const source of cell.sources) {
  const dimensions = source.dimensions ?? {}
  let tags = tagKeys.get(dimensions)
  if (tags === undefined) { tags = dimensionKey(dimensions); tagKeys.set(dimensions, tags) }
  const key = JSON.stringify([cell.line, cell.department, cell.month, tags])
  const row = result.get(key) ?? { line: cell.line, department: cell.department, month: cell.month, basis: cell.basis, dimensions, amount: 0 }
  row.amount += source.amount
  result.set(key, row)
 }
 return [...result.values()].map(row => ({ row, sort: JSON.stringify(row) })).sort((a, b) => a.sort.localeCompare(b.sort)).map(item => item.row)
}

export function dimensionReport(calculation: Calculation, structure: DimensionStructure, dimension?: string) {
 if (dimension) requireThat(structure.dimension.some(d => d.id === dimension), 'Dimension not found', 404)
 const cells = dimensionalCells(calculation.cells)
 const selected = dimension ? structure.dimension.filter(d => d.id === dimension) : structure.dimension
 const dimensions = selected.map(d => {
  const members = structure['dimension-member'].filter(m => m.dimension === d.id)
  const buckets = [...members, { id: '', name: 'Unassigned', parent: '', dimension: d.id }].map(member => {
   const included = member.id ? descendants(members, member.id) : new Set([''])
   const matching = cells.filter(c => included.has(c.dimensions[d.id] ?? ''))
   return { ...member, id: String(member.id), name: String(member.name), parent: member.parent ?? '', rollup: members.some(m => m.parent === member.id && member.id), ...totals(matching, calculation.months) }
  })
  return { ...d, id: String(d.id), name: String(d.name), members: buckets, ...totals(cells, calculation.months) }
 })
 const accountHierarchy = structure['line-group'].map(group => {
  const included = descendants(structure['line-group'], group.id)
  const lines = structure.line.filter(line => included.has(line.group)).map(line => line.id)
  return { ...group, id: String(group.id), name: String(group.name), parent: group.parent ?? '', lines, ...totals(cells.filter(c => lines.includes(c.line)), calculation.months) }
 })
 return { currency: calculation.currency, months: calculation.months, cells, dimensions, accountHierarchy, ...totals(cells, calculation.months) }
}

function totals(cells: DimensionCell[], months: string[]) {
 const lineTotals: Record<string, Record<string, number>> = {}, amounts = Object.fromEntries(months.map(m => [m, 0]))
 for (const cell of cells) {
  lineTotals[cell.line] ??= Object.fromEntries(months.map(m => [m, 0]))
  lineTotals[cell.line][cell.month] = (lineTotals[cell.line][cell.month] ?? 0) + cell.amount
  amounts[cell.month] = (amounts[cell.month] ?? 0) + cell.amount
 }
 return { amounts, lineTotals }
}

/** Version effects include roll-up identity, so reparenting records moved cells
 * even when the aggregate profit-and-loss cell is unchanged. */
export function dimensionVersionCells(calculation: Calculation, structure: DimensionStructure): Data[] {
 if (!structure.dimension.length && !structure['line-group'].length) return []
 const rows = new Map<string, Data>()
 const ancestors = (members: Data[]) => {
  const index = new Map<string, string[]>()
  for (const parent of members) for (const child of descendants(members, parent.id)) {
   const group = index.get(child) ?? []; group.push(parent.id); index.set(child, group)
  }
  return index
 }
 const dimensionAncestors = new Map(structure.dimension.map(d => [d.id, ancestors(structure['dimension-member'].filter(m => m.dimension === d.id))]))
 const lineAncestors = ancestors(structure['line-group']), lineById = new Map(structure.line.map(line => [line.id, line]))
 const add = (cell: DimensionCell, group: Data) => {
  const address = { line: cell.line, department: cell.department, month: cell.month, ...group }
  const key = JSON.stringify(address)
  const prior = rows.get(key)
  rows.set(key, { ...address, amount: (prior?.amount ?? 0) + cell.amount })
 }
 for (const cell of dimensionalCells(calculation.cells)) {
  for (const dimension of structure.dimension) {
   const member = cell.dimensions[dimension.id]
   if (!member) { add(cell, { dimension: dimension.id, member: '' }); continue }
   for (const parent of dimensionAncestors.get(dimension.id)?.get(member) ?? []) add(cell, { dimension: dimension.id, member: parent })
  }
  const line = lineById.get(cell.line)
  if (line?.group) for (const group of lineAncestors.get(line.group) ?? []) add(cell, { lineGroup: group })
 }
 return [...rows.values()]
}
