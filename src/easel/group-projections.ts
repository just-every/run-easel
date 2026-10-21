import { dimensionAllowed, seesDepartmentDetail } from './access'
import type { Calculation, Cell, Line } from './engine'
import type { Access, State } from './types'

export const scopedReader = (x: Access) => x.role !== 'finance' && (x.groupOnly === true || Object.keys(x.dimensionRead ?? {}).length > 0)
/** A constrained reader receives sums of authorized source slices. Company cash,
 * balance-sheet stocks and unsupported derived metrics cannot be inferred from a slice. */
export function scopedCalculation(s: State, x: Access, calc: Calculation, lines: Line[]): Calculation {
 if (!scopedReader(x)) return calc
 const cells: Cell[] = calc.cells.filter(cell => seesDepartmentDetail(x, cell.department)).map(cell => ({ ...cell, sources: cell.sources.filter(source => dimensionAllowed(s, x, source.dimensions)) })).filter(cell => cell.sources.length).map(cell => ({ ...cell, amount: cell.sources.reduce((sum, source) => sum + source.amount, 0) }))
 const lineTotals: Record<string, Record<string, number>> = {}
 for (const cell of cells) { lineTotals[cell.line] ??= {}; lineTotals[cell.line][cell.month] = (lineTotals[cell.line][cell.month] ?? 0) + cell.amount }
 const types = new Map(lines.map(line => [line.id, line.type]))
 const profit = calc.months.map(month => {
  const sum = (type: string) => cells.filter(cell => cell.month === month && types.get(cell.line) === type).reduce((sum, cell) => sum + cell.amount, 0)
  const revenue = sum('revenue'), costOfSales = sum('cost-of-sales'), operatingExpenses = sum('operating-expense')
  return { month, revenue, costOfSales, operatingExpenses, grossMargin: revenue - costOfSales, profit: revenue - costOfSales - operatingExpenses }
 })
 return { engine: calc.engine, rampRule: calc.rampRule, currency: calc.currency, months: calc.months, actualsThrough: calc.actualsThrough, cells, lineTotals, profit, cash: [], headcount: {}, warnings: ['Scoped report: company cash, balance sheet and derived headcount are unavailable for this grant.'] }
}
