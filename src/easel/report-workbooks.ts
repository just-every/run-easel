import { fiscalSheets } from './fiscal-workbook'
import { workingCapitalSheet } from './working-capital-workbook'
import { contractSheets } from './contract-workbook'
import { historySheet } from './history-workbook'
import { financingSheets } from './financing-workbook'
import { cashHealthSheet } from './cash-health-workbook'
import { versionComparisonSheet } from './version-comparison-workbook'
import { statementSheets } from './statements-workbook'
// Spreadsheet projections of the same role-filtered read models as the app.
import { columnName } from './xlsx'
import { workbook, type Cell, type Sheet } from './xlsx-write'
import type { Data } from './types'

const formula = (formula: string, value: number): Cell => ({ formula, value })
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const total = (rows: number[], col: string, value: number): Cell => formula(rows.length ? rows.map(r => `${col}${r}`).join('+') : '0', value)

export function scenarioSheets(view: Data, prefix = '', department = ''): Sheet[] {
 const { calculation: calc, scenario, workspace, lines, departments, inputs } = view
 const months: string[] = calc.months
 const cells: Data[] = calc.cells.filter((c: Data) => !department || c.department === department)
 const amount = (line: string, month: string) => sum(cells.filter(c => c.line === line && c.month === month).map(c => c.amount))
 const rows: Cell[][] = [[`${scenario.name} · ${workspace.currency} minor units (100 = 1 currency unit)`], ['Line', ...months, 'Total']]
 const subtotals: { row: number; values: number[] }[] = []
 for (const type of ['revenue', 'cost-of-sales', 'operating-expense']) {
  const refs: number[] = [], values = months.map(() => 0)
  for (const line of lines.filter((l: Data) => l.type === type)) {
   const amounts = months.map((m, i) => { const n = amount(line.id, m); values[i] += n; return n })
   refs.push(rows.length + 1)
   rows.push([line.name, ...amounts, formula(`SUM(B${rows.length + 1}:${columnName(months.length + 1)}${rows.length + 1})`, sum(amounts))])
  }
  const row = rows.length + 1
  rows.push([`Total ${type}`, ...values.map((n, i) => total(refs, columnName(i + 2), n)), formula(`SUM(B${row}:${columnName(months.length + 1)}${row})`, sum(values))])
  subtotals.push({ row, values })
 }
 const profitRow = rows.length + 1
 const profits = months.map((_, i) => subtotals[0].values[i] - subtotals[1].values[i] - subtotals[2].values[i])
 rows.push(['Profit', ...profits.map((n, i) => { const col = columnName(i + 2); return formula(`${col}${subtotals[0].row}-${col}${subtotals[1].row}-${col}${subtotals[2].row}`, n) }), formula(`SUM(B${profitRow}:${columnName(months.length + 1)}${profitRow})`, sum(profits))])
 const sheets: Sheet[] = [{ name: `${prefix}Profit and loss`, rows }]
 if (!department) {
  const cashRows: Cell[][] = [[`${scenario.name} · ${workspace.currency} minor units`], ['Month', 'Opening', 'Collections', 'Payments', 'Closing', 'Completeness']]
  for (const c of calc.cash) { const r = cashRows.length + 1; cashRows.push([c.month, r === 3 ? c.opening : formula(`E${r - 1}`, c.opening), c.collections, c.payments, formula(`B${r}+C${r}-D${r}`, c.closing), c.incompleteReasons?.join('\n') ?? 'Complete planning schedule']) }
  sheets.push({ name: `${prefix}Cash`, rows: cashRows })
  if (calc.balanceSheet && calc.cashFlow) sheets.push(...statementSheets(calc.balanceSheet, calc.cashFlow, calc.cash, workspace.currency, prefix))
  if (calc.workingCapital) sheets.push(workingCapitalSheet(calc.workingCapital, workspace.currency, prefix))
  if (calc.contracts) sheets.push(...contractSheets(calc.contracts, workspace.currency, prefix))
  if (calc.financing) sheets.push(...financingSheets(calc.financing, workspace.currency, prefix))
  if (view.cashHealth) sheets.push(cashHealthSheet(view.cashHealth, calc.cash, workspace.currency, prefix))
 }
 sheets.push({ name: `${prefix}Cells`, rows: [['Amounts in minor units; restricted detail is removed by the server'], ['Month', 'Line', 'Department', 'Amount', 'Basis', 'Sources'], ...cells.map(c => [c.month, lines.find((l: Data) => l.id === c.line)?.name ?? c.line, departments.find((d: Data) => d.id === c.department)?.name ?? '', c.amount, c.basis, c.sources.map((s: Data) => s.trace).join('\n')])] })
 sheets.push({ name: `${prefix}Inputs`, rows: [['Only inputs visible to this reader; money fields ending Cents are minor units'], ['Kind', 'Name', 'Definition'], ...Object.entries(inputs).flatMap(([kind, records]) => (records as Data[]).filter(i => !department || i.department === department).map(i => [kind, i.name ?? i.title ?? '', JSON.stringify(i)]))] })
 if (calc.assets?.length) sheets.push({ name: `${prefix}Fixed assets`, rows: [[`${workspace.currency} minor units`], ['Month','Asset','Opening book value','Depreciation','Disposal book value','Closing book value','Capex cash','Disposal cash'], ...calc.assets.filter((a: Data) => !department || a.department === department).map((a: Data, i: number) => [a.month,a.name,a.openingBookValue,a.depreciation,a.disposalBookValue,formula(`C${i+3}-D${i+3}-E${i+3}`,a.closingBookValue),a.capex,a.disposalProceeds])] })
 sheets.push(...fiscalSheets(view, rows, prefix, department))
 const historical = historySheet(view, prefix, department)
 if (historical) sheets.push(historical)
 return sheets
}
export const scenarioWorkbook = (view: Data, department = '') => workbook(scenarioSheets(view, '', department))

export function comparisonWorkbook(left: Data, right: Data): Uint8Array {
 const sameCurrency = left.workspace.currency === right.workspace.currency
 const rows: Cell[][] = [['Scenario comparison · minor units; difference = to − from'], ['Month', `Profit ${left.scenario.name}`, `Profit ${right.scenario.name}`, 'Difference', `Closing cash ${left.scenario.name}`, `Closing cash ${right.scenario.name}`, 'Difference']]
 const months: string[] = [...new Set<string>([...left.calculation.months, ...right.calculation.months])].sort()
 for (const m of months) {
  const a = left.calculation.profit.find((p: Data) => p.month === m)?.profit, b = right.calculation.profit.find((p: Data) => p.month === m)?.profit
  const c = left.calculation.cash.find((p: Data) => p.month === m)?.closing, d = right.calculation.cash.find((p: Data) => p.month === m)?.closing, r = rows.length + 1
  rows.push([m, a ?? null, b ?? null, sameCurrency && a !== undefined && b !== undefined ? formula(`C${r}-B${r}`, b - a) : null, c ?? null, d ?? null, sameCurrency && c !== undefined && d !== undefined ? formula(`F${r}-E${r}`, d - c) : null])
 }
 return workbook([...scenarioSheets(left, 'From '), ...scenarioSheets(right, 'To '), { name: 'Comparison', rows }])
}
export function varianceWorkbook(view: Data): Uint8Array {
 const rows: Cell[][] = [[`${view.label} · ${view.currency} minor units; variance = actual − budget`], ['Line', 'Department', 'Actual', 'Budget', 'Variance', 'Prior forecast', 'Forecast variance', 'Explanation', 'Evidence']]
 for (const v of view.rows) { const r = rows.length + 1; rows.push([v.lineName, v.departmentName, v.actual, v.budget, formula(`C${r}-D${r}`, v.variance), v.priorForecast, v.priorForecast === null ? null : formula(`C${r}-F${r}`, v.forecastVariance), v.explanation?.text ?? '', v.citations.map((c: Data) => `${c.file} line ${c.line}`).join('; ')]) }
 const r = rows.length + 1
 rows.push(['Total', '', ...['C', 'D', 'E', 'F', 'G'].map((col, i) => total(Array.from({ length: r - 3 }, (_, n) => n + 3), col, sum(view.rows.map((v: Data) => [v.actual, v.budget, v.variance, v.priorForecast ?? 0, v.forecastVariance ?? 0][i]))))])
 return workbook([{ name: 'Variances', rows }, ...(view.versions?.length ? [versionComparisonSheet(view)] : [])])
}
export function scenarioCsv(view: Data): string {
 const quote = (v: unknown) => { const s = String(v ?? ''); return `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` }
 return [['month', 'line', 'department', 'amount_minor', 'basis'], ...view.calculation.cells.map((c: Data) => [c.month, view.lines.find((l: Data) => l.id === c.line)?.name ?? c.line, view.departments.find((d: Data) => d.id === c.department)?.name ?? '', c.amount, c.basis])].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n'
}
