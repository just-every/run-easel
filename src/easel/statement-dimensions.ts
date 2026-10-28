import { ledgerEntity } from './ledger-scope'
import { dimensionAllowed } from './access'
import { hasFullScope } from './access-grants'
import { dimensionActuals } from './dimension-actuals'
import { dimensionalCells } from './dimensions-report'
import type { Context } from './context'
import { snapshot } from './store'
import { requireThat, type Data } from './types'

/** Persist atomic actual/budget amounts with the statement; changing grants
 * changes only the projection, never the captured closing figures. */
export async function captureStatementDimensions(c: Context, statement: Data, budgetSnapshot: string) {
 const budget=await snapshot(c.db,budgetSnapshot),actual=await dimensionActuals(c.db,c.s,ledgerEntity(c.s,statement.forecast??budget.body.scenario.id))
 const include = (cell: Data) => cell.month === statement.month && cell.department === statement.department
 return { actual: dimensionalCells(actual.cells).filter(include), budget: dimensionalCells(budget.body.calculation.cells).filter(include), blocked: actual.blocked.filter(issue => issue.month === statement.month && (!issue.department || issue.department === statement.department)) }
}
export function scopedStatementRows(c: Context, statement: Data): Data[] {
 if (hasFullScope(c.s, c.x, {}, statement.department)) return statement.rows ?? []
 const dimensions = [...new Set((c.x.readGrants ?? []).filter(g => g.departments === null || g.departments.includes(statement.department)).flatMap(g => Object.keys(g.dimensions)))]
 requireThat(statement.dimensionCells, 'This older statement has no captured dimension slices', 409)
 requireThat(!statement.dimensionCells.blocked.some((issue: Data) => !issue.dimensions.length || issue.dimensions.some((d: Data) => dimensions.includes(d.dimension))), 'Statement dimension sources need mapping', 409)
 return (statement.rows ?? []).map((row: Data) => {
  const amount = (kind: string) => statement.dimensionCells[kind].filter((cell: Data) => cell.line === row.line && dimensionAllowed(c.s, c.x, cell.dimensions, false, statement.department)).reduce((total: number, cell: Data) => total + cell.amount, 0)
  const actual = amount('actual'), budget = amount('budget')
  return { ...row, actual, budget, variance: actual - budget }
 })
}
