import { workingCapitalSheet } from './working-capital-workbook'
import { contractSheets } from './contract-workbook'
import { statementSheets } from './statements-workbook'
import { financingSheets } from './financing-workbook'
// An Excel review workbook rendered only from the immutable published pack.
import { workbook, type Sheet, type Cell } from './xlsx-write'
import type { Data } from './types'
import { versionComparisonSheet } from './version-comparison-workbook'
import { monthLabel } from './months'

const amount = (value: unknown): number => {
 if (!Number.isSafeInteger(value)) throw new Error('Published pack contains an invalid minor-unit amount')
 return value as number
}
const formula = (expression: string, value: number): Cell => ({ formula: expression, value })
const sum = (column: string, first: number, last: number, value: number): Cell =>
 first > last ? formula('=0', 0) : formula(`=SUM(${column}${first}:${column}${last})`, value)

const types = [
 { key: 'revenue', label: 'Revenue' },
 { key: 'cost-of-sales', label: 'Cost of sales' },
 { key: 'operating-expense', label: 'Operating expenses' },
] as const

export function packWorkbook(sn: Data): Uint8Array {
 const b = sn.body
 const pnl: Cell[][] = [
  ['Profit and loss · amounts in integer minor units', '', '', '', ''],
  ['Line / subtotal', 'Actual · minor units', 'Budget · minor units', 'YTD actual · minor units', 'YTD budget · minor units'],
 ]
 const subtotals: Record<string, { row: number; values: number[] }> = {}

 for (const type of types) {
  pnl.push([type.label, '', '', '', ''])
  const first = pnl.length + 1
  const items = (b.lines ?? []).filter((line: Data) => line.type === type.key)
  for (const line of items) pnl.push([line.line, amount(line.actual), amount(line.budget), amount(line.ytdActual), amount(line.ytdBudget)])
  const last = pnl.length
  const values = [
   items.reduce((total: number, line: Data) => total + amount(line.actual), 0),
   items.reduce((total: number, line: Data) => total + amount(line.budget), 0),
   items.reduce((total: number, line: Data) => total + amount(line.ytdActual), 0),
   items.reduce((total: number, line: Data) => total + amount(line.ytdBudget), 0),
  ]
  const row = pnl.length + 1
  pnl.push([
   `${type.label} subtotal`,
   sum('B', first, last, values[0]), sum('C', first, last, values[1]),
   sum('D', first, last, values[2]), sum('E', first, last, values[3]),
  ])
  subtotals[type.key] = { row, values }
 }

 const revenue = subtotals.revenue, cost = subtotals['cost-of-sales'], expense = subtotals['operating-expense']
 const calcProfit = (index: number) => revenue.values[index] - cost.values[index] - expense.values[index]
 pnl.push([
  'Profit',
  formula(`=B${revenue.row}-B${cost.row}-B${expense.row}`, amount(b.profit?.month?.profit ?? 0)),
  formula(`=C${revenue.row}-C${cost.row}-C${expense.row}`, amount(b.profit?.budget?.profit ?? 0)),
  formula(`=D${revenue.row}-D${cost.row}-D${expense.row}`, calcProfit(2)),
  formula(`=E${revenue.row}-E${cost.row}-E${expense.row}`, calcProfit(3)),
 ])
 const variances: Cell[][] = [[
  'Variances · amounts in integer minor units', '', '', '', '', '', '', '', '',
 ], [
  'Line', 'Department', 'Actual · minor units', 'Budget · minor units', 'Variance · minor units',
  'Prior forecast · minor units', 'Favourable', 'Explanation', 'Status', 'Evidence',
 ]]
 for (const v of b.variances ?? []) {
  const row = variances.length + 1
  variances.push([
   v.line, v.department, amount(v.actual), amount(v.budget),
   formula(`=C${row}-D${row}`, amount(v.variance)),
   v.priorForecast === null || v.priorForecast === undefined ? null : amount(v.priorForecast),
   v.favourable === null ? '' : v.favourable ? 'Favourable' : 'Unfavourable',
   v.explanation?.text ?? '', v.explanation?.status ?? '', (v.evidence ?? []).join('; '),
  ])
 }

 const cash: Cell[][] = [[
  'Cash · amounts in integer minor units', '', '', '',
 ], ['Month', 'Forecast closing cash · minor units', 'Budget closing cash · minor units', 'Difference · minor units', 'Completeness']]
 for (const m of b.cash ?? []) {
  const row = cash.length + 1
  cash.push([
   m.month, amount(m.closing), m.budget === null || m.budget === undefined ? null : amount(m.budget),
   m.budget === null || m.budget === undefined ? null : formula(`=B${row}-C${row}`, amount(m.closing) - amount(m.budget)), m.incompleteReasons?.join('\n') ?? '',
  ])
 }

 const decisions: Cell[][] = [['Decision and actions'], ['Decision or action', 'Owner', 'Due', 'Status']]
 for (const d of b.decisions ?? []) decisions.push([d.text, d.owner, d.due, d.status ?? 'open'])

 const sources: Cell[][] = [['Sources'], ['Accepted import', 'SHA-256', 'Rows', 'Accepted by', 'Accepted at']]
 for (const source of b.sources ?? []) sources.push([source.file, source.sha256, amount(source.rows), source.acceptedBy, source.acceptedAt])

 const metadata: Cell[][] = [
  ['Published review pack metadata'],
  ['Field', 'Value'],
  ['Title', b.title], ['Company', b.company], ['Month', b.month], ['Period', b.label ?? monthLabel(b.month)], ['Template', b.template ?? 'default'], ['Currency', b.currency],
  ['Status', b.status], ['Snapshot ID', sn.id], ['Snapshot SHA-256', sn.sha256],
  ['Published by', b.publishedBy.name], ['Publisher email', b.publishedBy.email], ['Published at', b.publishedAt],
  ['Budget revision', b.budget.revision], ['Budget snapshot SHA-256', b.budget.sha256],
  ['Budget approved by', b.budget.approvedBy?.name ?? ''], ['Budget approved at', b.budget.approvedAt ?? ''],
  ['Forecast name', b.forecast.name], ['Forecast revision', b.forecast.revision], ['Actuals through', b.forecast.actualsThrough],
  ['Money convention', 'All monetary values are integer minor units (for example, cents).'],
 ]

 const has = (section: string) => !b.sections || b.sections.includes(section)
 const kpis: Cell[][] = [['Key figures · money in integer minor units, headcount in people'], ['KPI', 'Actual', 'Budget', 'Difference']]
 for (const k of b.kpis ?? []) { const row = kpis.length + 1; kpis.push([k.label, k.actual === null ? null : amount(k.actual), k.budget === null ? null : amount(k.budget), k.actual === null || k.budget === null ? null : formula(`=B${row}-C${row}`, amount(k.actual) - amount(k.budget))]) }
 const charts: Cell[][] = [['Chart data · integer minor units']]
 for (const chart of b.charts ?? []) { charts.push([chart.title], ['Month', ...chart.series.map((x: Data) => x.name)]); chart.months.forEach((m: string, i: number) => charts.push([m, ...chart.series.map((x: Data) => amount(x.values[i]))])); charts.push(['']) }
 const sheets: Sheet[] = [
  ...(has('statements') ? [{ name: 'Profit and loss', rows: pnl }, { name: 'Cash', rows: cash }] : []),
  ...(has('kpis') ? [{ name: 'Key figures', rows: kpis }] : []),
  ...(has('charts') ? [{ name: 'Chart data', rows: charts }] : []),
  ...(has('commentary') ? [{ name: 'Variances', rows: variances }] : []),
  ...(has('decisions') ? [{ name: 'Decisions', rows: decisions }] : []),
  ...(has('appendix') ? [{ name: 'Sources', rows: sources }] : []),
  { name: 'Metadata', rows: metadata },
 ]
 if (has('appendix') && b.workingCapital) sheets.push(workingCapitalSheet(b.workingCapital, b.currency))
 if (has('appendix') && b.contracts) sheets.push(...contractSheets(b.contracts, b.currency, ''))
 if (has('statements') && b.balanceSheet && b.cashFlow) sheets.push(...statementSheets(b.balanceSheet, b.cashFlow, b.cash, b.currency, ''))
 if (has('statements') && b.financing) sheets.push(...financingSheets(b.financing, b.currency))
 if (has('commentary') && b.versionComparison) sheets.push(versionComparisonSheet(b.versionComparison))
 if (has('statements') && b.assets?.length) sheets.push({ name: 'Fixed assets', rows: [['Fixed assets · amounts in integer minor units'], ['Month','Opening book value','Depreciation','Disposal book value','Closing book value','Capex cash','Disposal cash'], ...b.assets.map((a: Data, i: number) => [a.month,a.openingBookValue,a.depreciation,a.disposalBookValue,formula(`B${i+3}-C${i+3}-D${i+3}`,a.closingBookValue),a.capex,a.disposalProceeds])] })
 return workbook(sheets)
}
