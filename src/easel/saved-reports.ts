// Saved aggregate comparisons use the dashboard's existing audience and
// revision fences. No raw inputs, ledger rows or compensation traces leave here.
import type { Context } from './context'
import { canSeeDashboard } from './dashboard-access'
import { historyOverlay } from './history-sources'
import { addMonths, month, range } from './months'
import { choice, get, integer, requireThat, type Data } from './types'
import { mulDiv } from './units'
import { scenarioView } from './views'
import { workbook, type Cell } from './xlsx-write'

export function reportDefinition(c: Context, value: unknown): Data | null {
 if (value === null || value === undefined) return null
 const v = value as Data
 requireThat(typeof v === 'object' && !Array.isArray(v), 'Choose a report definition')
 requireThat(Array.isArray(v.lines) && v.lines.length > 0 && v.lines.length <= 200, 'Choose one to 200 report lines')
 const lines = [...new Set(v.lines.map((id: unknown) => get(c.s, 'line', id).id))]
 return { row: choice(v.row, ['department', 'line'] as const, 'report rows'),
  period: choice(v.period, ['month', 'quarter', 'year'] as const, 'report periods'),
  through: month(v.through, 'Report through'), lines,
  comparison: v.comparison ? get(c.s, 'scenario', v.comparison).id : '',
  highlightBps: integer(v.highlightBps ?? 1000, 'Highlight threshold (basis points)', 0, 1000000) }
}

function exact(values: number[]): number {
 const result = values.reduce((a, b) => a + BigInt(b), 0n)
 requireThat(result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= BigInt(Number.MIN_SAFE_INTEGER), 'Report total exceeds the supported exact range')
 return Number(result)
}
const percent = (difference: number | null, base: number | null) => difference === null || base === null || base === 0 ? null : mulDiv(difference, 10000, base)

export async function savedReport(c: Context, id: string) {
 const d = get(c.s, 'dashboard', id)
 requireThat(canSeeDashboard(c.s, c.x, d), 'Dashboard not found', 404)
 requireThat(d.report, 'This dashboard has no saved report', 404)
 const definition = d.report as Data
 const source = await scenarioView(c, d.scenario)
 const through = definition.through as string
 requireThat(source.calculation.months.includes(through), 'Report through must be inside the source version horizon', 409)
 const comparison = definition.comparison ? await scenarioView(c, definition.comparison) : null
 if (comparison) {
  requireThat(!comparison.scenario.sandbox && comparison.scenario.kind !== 'proposal', 'Choose a company-visible comparison version', 409)
  requireThat(comparison.workspace.currency === source.workspace.currency, 'Report versions must use the same currency', 409)
  requireThat(JSON.stringify(comparison.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])) === JSON.stringify(source.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])), 'Report versions must use the same accounting periods', 409)
 }
 const elapsed = source.calculation.months.filter((m: string) => m <= through)
 const groups: { label: string; months: string[] }[] = definition.period === 'month'
  ? elapsed.map((m: string) => ({ label: m, months: [m] }))
  : (definition.period === 'quarter' ? source.fiscal.quarters : source.fiscal.years)
   .map(g => ({ label: g.label, months: g.periods.filter(m => m <= through) })).filter(g => g.months.length)
 const fiscalStart = Number(source.workspace.fiscalYearStart ?? 1)
 const monthNumber = Number(through.slice(5))
 const ytd = range(addMonths(through, -((monthNumber - fiscalStart + 12) % 12)), (monthNumber - fiscalStart + 12) % 12 + 1)
 const ttm = range(addMonths(through, -11), 12)
 groups.push({ label: 'YTD', months: ytd }, { label: 'TTM', months: ttm })
 const requested = [...new Set(groups.flatMap(g => [...g.months, ...g.months.map(m => addMonths(m, -12))]))]
 const actuals = await historyOverlay(c, requested)
 const unavailable = new Set([...actuals.blockedMonths, ...actuals.missingMonths])
 const selected = new Set(definition.lines as string[])
 const reportLines = source.lines.filter(l => selected.has(l.id))
 requireThat(reportLines.length === selected.size, 'A report line no longer exists in the source version', 409)
 if (d.department) requireThat(source.departments.some(dep => dep.id === d.department), 'Report department no longer exists in the source version', 409)
 const dimensions: { id: string; name: string }[] = definition.row === 'line' ? reportLines.map(l => ({ id: l.id, name: l.name }))
  : [...source.departments, { id: '', name: 'No department' }].filter(dep => !d.department || dep.id === d.department)
 const aggregate = (cells: Data[], periods: string[], dimension: string, available: (m: string) => boolean): number | null => {
  if (periods.some(m => !available(m))) return null
  const consumed = cells.filter(cell => periods.includes(cell.month) && selected.has(cell.line) &&
   (!d.department || cell.department === d.department) && (definition.row === 'line' ? cell.line === dimension : cell.department === dimension))
  if (consumed.some(cell => cell.amount === null)) return null
  return exact(consumed.map(cell => cell.amount))
 }
 const rows = groups.flatMap(group => dimensions.map(dimension => {
  const actual = aggregate(actuals.cells, group.months, dimension.id, m => !unavailable.has(m))
  const budget = aggregate(source.calculation.cells, group.months, dimension.id, m => source.calculation.months.includes(m) &&
   (source.scenario.status === 'frozen' || !source.calculation.actualsThrough || m > source.calculation.actualsThrough || !unavailable.has(m)))
  const other = comparison ? aggregate(comparison.calculation.cells, group.months, dimension.id, m => comparison.calculation.months.includes(m) &&
   (comparison.scenario.status === 'frozen' || !comparison.calculation.actualsThrough || m > comparison.calculation.actualsThrough || !unavailable.has(m))) : null
  const prior = aggregate(actuals.cells, group.months.map(m => addMonths(m, -12)), dimension.id, m => !unavailable.has(m))
  const variance = actual === null || budget === null ? null : exact([actual, -budget])
  const yoy = actual === null || prior === null ? null : exact([actual, -prior])
  const varianceBps = percent(variance, budget), yoyBps = percent(yoy, prior)
  return { row: dimension.id, name: dimension.name, period: group.label, months: group.months, actual, budget, comparison: other,
   variance, varianceBps, priorYearActual: prior, yoy, yoyBps,
   highlight: varianceBps !== null && Math.abs(varianceBps) > definition.highlightBps }
 }))
 return { name: d.name, definition, currency: source.workspace.currency, sourceName: source.scenario.name,
  comparisonName: comparison?.scenario.name ?? null, department: d.department, rows,
  missingMonths: actuals.missingMonths, blockedMonths: actuals.blockedMonths,
  units: { money: 'integer minor units', percentages: 'basis points; half away from zero; unavailable for zero denominator' } }
}

export function savedReportWorkbook(view: Data): Uint8Array {
 const rows: Cell[][] = [[`${view.name} · ${view.currency} minor units; percentages in basis points`],
  ['Row', 'Period', 'Actual', view.sourceName, view.comparisonName ?? 'No comparison', 'Variance', 'Variance bps', 'Prior-year actual', 'YoY change', 'YoY bps', 'Highlight']]
 for (const row of view.rows) {
  const n = rows.length + 1
  const formula = (text: string, value: number | null): Cell => value === null ? null : { formula: text, value }
  rows.push([row.name, row.period, row.actual, row.budget, row.comparison,
   formula(`C${n}-D${n}`, row.variance), formula(`ROUND((C${n}-D${n})*10000/D${n},0)`, row.varianceBps), row.priorYearActual,
   formula(`C${n}-H${n}`, row.yoy), formula(`ROUND((C${n}-H${n})*10000/H${n},0)`, row.yoyBps), row.highlight ? 'Above threshold' : ''])
 }
 return workbook([{ name: 'Saved report', rows }, { name: 'Availability', rows: [
  ['Unavailable values are blank, never zero. Accepted periods without this row have an observed zero.'],
  ['Missing actual periods', ...view.missingMonths], ['Blocked actual periods', ...view.blockedMonths],
 ] }])
}
