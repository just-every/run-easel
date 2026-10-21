import { requireMember } from './access'
import { dimensionActuals } from './dimension-actuals'
import { dimensionReport } from './dimensions-report'
import { descendants, dimensionStructure, type DimensionStructure } from './dimensions'
import type { Context } from './context'
import type { Calculation } from './engine'
import { frozenModel } from './reforecasts'
import { scenarioView } from './views'
import { get, requireThat, type Data } from './types'
import { workbook, type Cell as XlsxCell } from './xlsx-write'

export async function dimensionView(c: Context, scenario: string, dimension?: string, member?: string) {
 requireMember(c.x)
 let structure = dimensionStructure(c.s), calc: Calculation, blocked: Data[] = []
 if (scenario === 'actuals') {
  const actuals = await dimensionActuals(c.db, c.s); blocked = actuals.blocked
  calc = { cells: actuals.cells, months: actuals.months, currency: get(c.s, 'workspace', 'main').currency } as Calculation
 } else {
  const view = await scenarioView(c, scenario)
  calc = view.calculation
  const sc = get(c.s, 'scenario', scenario)
  if (sc.status === 'frozen') {
   const frozen = await frozenModel(c, sc)
   structure = (frozen as Data).dimensionStructure ?? { dimension: [], 'dimension-member': [], 'line-group': [], line: frozen.lines }
  }
 }
 if (member) {
  requireThat(dimension, 'Choose a dimension to filter')
  const members = structure['dimension-member'].filter(m => m.dimension === dimension)
  requireThat(members.some(m => m.id === member), 'Member not found', 404)
  const included = descendants(members, member)
  calc = { ...calc, cells: calc.cells.map(cell => ({ ...cell, sources: cell.sources.filter(source => included.has(source.dimensions?.[dimension!] ?? '')) })).map(cell => ({ ...cell, amount: cell.sources.reduce((sum, source) => sum + source.amount, 0) })) }
 }
 const report = dimensionReport(calc, structure as DimensionStructure, dimension)
 // An unresolved class may belong to any member of that dimension. Block that
 // line/month, preserving independent line conclusions instead of inventing zero.
 const affects = (line: string, month: string) => blocked.some(b => b.month === month && (!b.line || b.line === line) && (!dimension || !b.dimensions.length || b.dimensions.some((d: Data) => d.dimension === dimension)))
 const values = (row: Data, selectedLines = structure.line) => {
  const lineTotals: Data = Object.fromEntries(selectedLines.map(line => [line.id, Object.fromEntries(report.months.map(month => [month, affects(line.id, month) ? null : row.lineTotals[line.id]?.[month] ?? 0]))]))
  return { ...row, lineTotals, amounts: Object.fromEntries(report.months.map(month => [month, Object.values(lineTotals).some((months: any) => months[month] === null) ? null : Object.values(lineTotals).reduce((sum: number, months: any) => sum + months[month], 0)])) }
 }
 return { ...values(report), dimensions: report.dimensions.map(d => ({ ...values(d), members: d.members.map(member => values(member)) })), accountHierarchy: report.accountHierarchy.map(group => ({ ...group, ...values(group, structure.line.filter(line => group.lines.includes(line.id))) })), blocked, structure, scenario }
}

/** Totals use live formulas over visible parts, in integer minor units. */
export function dimensionWorkbook(view: Data) {
 const column = (n: number): string => n < 26 ? String.fromCharCode(65 + n) : column(Math.floor(n / 26) - 1) + column(n % 26)
 const facts: XlsxCell[][] = [['Line', 'Department', 'Dimensions', 'Month', `Amount (${view.currency} minor units)`], ...view.cells.map((cell: Data) => [cell.line, cell.department, JSON.stringify(cell.dimensions), cell.month, cell.amount])]
 const sheets = view.dimensions.map((dimension: Data) => ({ name: dimension.name, rows: [
  [dimension.name, ...view.months, 'Total'],
  ...dimension.members.map((member: Data, i: number) => {
   const members = member.id ? descendants(view.structure['dimension-member'].filter((m: Data) => m.dimension === dimension.id), member.id) : new Set([''])
   const cells = view.months.map((month: string) => {
    if (member.amounts[month] === null) return null
    const refs = view.cells.flatMap((cell: Data, row: number) => cell.month === month && members.has(cell.dimensions[dimension.id] ?? '') ? [`'Cells'!E${row + 2}`] : [])
    return { formula: refs.length ? `SUM(${refs.join(',')})` : '0', value: member.amounts[month] }
   })
   return [member.name, ...cells, cells.includes(null) ? null : { formula: `SUM(B${i + 2}:${column(view.months.length)}${i + 2})`, value: view.months.reduce((sum: number, month: string) => sum + member.amounts[month], 0) }]
  }),
 ] as XlsxCell[][] }))
 sheets.push({ name: 'Accounts', rows: [
  ['Account hierarchy', ...view.months],
  ...view.accountHierarchy.map((group: Data) => [group.name, ...view.months.map((month: string) => {
   if (group.amounts[month] === null) return null
   const refs = view.cells.flatMap((cell: Data, row: number) => cell.month === month && group.lines.includes(cell.line) ? [`'Cells'!E${row + 2}`] : [])
   return { formula: refs.length ? `SUM(${refs.join(',')})` : '0', value: group.amounts[month] }
  })]),
 ] as XlsxCell[][] }, { name: 'Cells', rows: facts })
 return workbook(sheets)
}
