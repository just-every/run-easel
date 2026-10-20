import { requireThat, type Data } from './types'
import type { XlsxSheet } from './xlsx'
import { directWorkbookDependencies } from './workbook-formula-evaluator'
import { parseWorkbookFormula } from './workbook-formula-parser'
import { decimalRational } from './workbook-formula-rational'
import { FORMULA_LIMITS, UnsupportedFormula, normalizeCellRef, workbookCellKey, type FormulaReport, type WorkbookGraph } from './workbook-formula-types'

export { evaluateWorkbook, workbookDependencies } from './workbook-formula-evaluator'
export { workbookCellKey } from './workbook-formula-types'
export type { FormulaReport, WorkbookGraph, FormulaCell, Expression } from './workbook-formula-types'

/** Compile every worksheet cell; unsupported formulas explicitly retain their Excel cache. */
export function compileWorkbook(sheets: XlsxSheet[]): { graph: Data; report: FormulaReport[] } {
 requireThat(sheets.length > 0 && sheets.length <= 256, 'Workbook must contain between one and 256 worksheets')
 requireThat(sheets.reduce((total, sheet) => total + sheet.cells.length, 0) <= FORMULA_LIMITS.cells, 'Workbook has too many cells for formula translation')
 const names = new Map<string, string>()
 for (const sheet of sheets) {
  requireThat(sheet.name.length > 0 && !names.has(sheet.name.toLowerCase()), 'Workbook worksheet names must be unique')
  names.set(sheet.name.toLowerCase(), sheet.name)
 }
 const graph: WorkbookGraph = { version: 1, sheets: sheets.map(sheet => sheet.name), cells: {} }, report: FormulaReport[] = []
 let dependencyCount = 0
 const dependencies = new Map<string, string[]>()
 for (const sheet of sheets) for (const cell of sheet.cells) {
  const ref = normalizeCellRef(cell.ref), key = workbookCellKey(sheet.name, ref)
  requireThat(!Object.hasOwn(graph.cells, key), `Workbook contains a duplicate cell ${key}`)
  if (typeof cell.value === 'number') decimalRational(cell.value)
  const entry = graph.cells[key] = { sheet: sheet.name, ref, value: cell.value, ...(cell.formula !== undefined ? { formula: cell.formula } : {}), ...(cell.error ? { error: cell.error } : {}) } as WorkbookGraph['cells'][string]
  if (cell.formula === undefined) continue
  try {
   entry.expression = parseWorkbookFormula(cell.formula, sheet.name, names)
   const refs = directWorkbookDependencies(entry.expression)
   dependencyCount += refs.length
   requireThat(dependencyCount <= FORMULA_LIMITS.dependencies, 'Workbook formula dependency graph is too large')
   dependencies.set(key, refs)
   report.push({ sheet: sheet.name, cell: ref, formula: cell.formula, status: 'translated' })
  } catch (error) {
   if (!(error instanceof UnsupportedFormula)) throw error
   entry.cachedReason = error.message
   report.push({ sheet: sheet.name, cell: ref, formula: cell.formula, status: 'cached', reason: error.message })
  }
 }
 // Include both branches and lookup ranges: a supported circular formula is never accepted,
 // even if its currently cached inputs would happen to choose another branch.
 const complete = new Set<string>(), active = new Set<string>()
 function visit(key: string, depth: number) {
  if (complete.has(key)) return
  requireThat(depth <= FORMULA_LIMITS.depth, 'Workbook formula dependency chain is too deep')
  requireThat(!active.has(key), `Workbook formula cycle at ${key}`)
  active.add(key)
  for (const ref of dependencies.get(key) ?? []) if (dependencies.has(ref)) visit(ref, depth + 1)
  active.delete(key); complete.add(key)
 }
 for (const key of dependencies.keys()) visit(key, 0)
 return { graph, report }
}
