import { requireThat } from './types'

export const FORMULA_LIMITS = { cells: 50_000, tokens: 4096, depth: 128, range: 20_000, dependencies: 500_000, bits: 4096, exponent: 100 } as const
export type Constant = string | number | boolean | null
export type Expression =
 | { kind: 'number'; value: string }
 | { kind: 'literal'; value: string | boolean | null }
 | { kind: 'ref'; sheet: string; ref: string }
 | { kind: 'range'; sheet: string; first: string; last: string }
 | { kind: 'unary'; op: '+' | '-'; value: Expression }
 | { kind: 'binary'; op: string; left: Expression; right: Expression }
 | { kind: 'call'; name: 'SUM' | 'IF' | 'VLOOKUP' | 'XLOOKUP'; args: Expression[] }
export type FormulaCell = { sheet: string; ref: string; value: Constant; formula?: string; expression?: Expression; cachedReason?: string; error?: string }
export type WorkbookGraph = { version: 1; sheets: string[]; cells: Record<string, FormulaCell> }
export type FormulaReport = { sheet: string; cell: string; formula: string; status: 'translated' | 'cached'; reason?: string }

/** Only this error permits an explicit cached-value translation report. */
export class UnsupportedFormula extends Error {}

export function normalizeCellRef(ref: string): string {
 const normalized = ref.replace(/\$/g, '').toUpperCase()
 requireThat(/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(normalized), `Invalid workbook cell reference: ${ref}`)
 const { row, col } = cellPosition(normalized)
 requireThat(row <= 1_048_576 && col <= 16_384, `Workbook cell reference is outside Excel's grid: ${ref}`)
 return normalized
}

export const workbookCellKey = (sheet: string, ref: string): string => `${sheet}!${normalizeCellRef(ref)}`
export function cellPosition(ref: string): { row: number; col: number } {
 const parts = /^([A-Z]+)(\d+)$/.exec(ref)
 requireThat(parts, `Invalid workbook cell reference: ${ref}`)
 return { row: Number(parts[2]), col: [...parts[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) }
}
function columnName(col: number): string {
 let result = ''
 while (col > 0) { result = String.fromCharCode(65 + (col - 1) % 26) + result; col = Math.floor((col - 1) / 26) }
 return result
}
export function rangeRows(range: Extract<Expression, { kind: 'range' }>): string[][] {
 const a = cellPosition(range.first), b = cellPosition(range.last)
 requireThat(a.row <= b.row && a.col <= b.col, 'Workbook ranges must run from top left to bottom right')
 requireThat((b.row - a.row + 1) * (b.col - a.col + 1) <= FORMULA_LIMITS.range, 'A workbook formula range is too large')
 const rows: string[][] = []
 for (let row = a.row; row <= b.row; row++) {
  const refs: string[] = []
  for (let col = a.col; col <= b.col; col++) refs.push(workbookCellKey(range.sheet, `${columnName(col)}${row}`))
  rows.push(refs)
 }
 return rows
}
