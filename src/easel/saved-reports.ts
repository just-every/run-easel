import { ledgerEntity } from './ledger-scope'
import { gaugeFreshnessSheet } from './gauge-freshness-workbook'
import { dimensionActuals } from './dimension-actuals'
import { dimensionalCells } from './dimensions-report'
import { scopedReader } from './group-projections'
import { seesDepartmentDetail } from './access'
// Saved aggregate comparisons use the dashboard's existing audience and
// revision fences. No raw inputs, ledger rows or compensation traces leave here.
import type { Context } from './context'
import { reportVersionDefinition, reportVersions } from './saved-report-versions'
import { reportDimensionDefinition, reportDimensionSource, reportDimensionRows, reportDimensionMatch } from './saved-report-dimensions'
import { canSeeDashboard } from './dashboard-access'
import { historyOverlay } from './history-sources'
import { addMonths, month, range } from './months'
import { choice, find, get, integer, requireThat, type Data } from './types'
import { mulDiv } from './units'
import { scenarioView } from './views'
import { workbook, type Cell } from './xlsx-write'

export function reportDefinition(c: Context, value: unknown): Data | null {
 if (value === null || value === undefined) return null
 const v = value as Data
 requireThat(typeof v === 'object' && !Array.isArray(v), 'Choose a report definition')
 requireThat(Array.isArray(v.lines) && v.lines.length > 0 && v.lines.length <= 200, 'Choose one to 200 report lines')
 const lines = [...new Set(v.lines.map((id: unknown) => get(c.s, 'line', id).id))]
 return { ...reportDimensionDefinition(c, v), row: choice(v.row, ['department', 'line', 'dimension', 'hierarchy', 'stage'] as const, 'report rows'),
  metric: v.row==='stage'?'pipelineBookings':'amount',
  period: choice(v.period, ['month', 'quarter', 'year'] as const, 'report periods'),
  through: month(v.through, 'Report through'), lines,
  comparisons: reportVersionDefinition(c, v.comparisons), comparison: v.comparison ? get(c.s, 'scenario', v.comparison).id : '',
  highlightBps: integer(v.highlightBps ?? 1000, 'Highlight threshold (basis points)', 0, 1000000) }
}

function exact(values: number[]): number {
 const result = values.reduce((a, b) => a + BigInt(b), 0n)
 requireThat(result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= BigInt(Number.MIN_SAFE_INTEGER), 'Report total exceeds the supported exact range')
 return Number(result)
}
function percent(difference: number | null, base: number | null) {
 if (difference === null || base === null || base === 0) return null
 const result = mulDiv(difference, 10000, base)
 requireThat(Number.isSafeInteger(result), 'Report percentage exceeds the supported exact range')
 return result
}

export async function savedReport(c: Context, id: string) {
 const d = get(c.s, 'dashboard', id)
 requireThat(canSeeDashboard(c.s, c.x, d), 'Dashboard not found', 404)
 requireThat(d.report, 'This dashboard has no saved report', 404)
 const definition = d.report as Data
 if (d.reportAuthorDepartment && c.x.role === 'contributor') requireThat(c.x.departments.includes(d.reportAuthorDepartment), 'Report not found', 404)
 const source = await scenarioView(c, d.scenario)
 const sourceDimensions = await reportDimensionSource(c, d.scenario)
 const stageMetric=definition.row==='stage'
 if(stageMetric)sourceDimensions.cells=sourceDimensions.stageCells as any
 const through = definition.through as string
 requireThat(source.calculation.months.includes(through), 'Report through must be inside the source version horizon', 409)
 const comparison = definition.comparison ? await scenarioView(c, definition.comparison) : null
 if (comparison) {
  requireThat(!comparison.scenario.sandbox && comparison.scenario.kind !== 'proposal', 'Choose a company-visible comparison version', 409)
  requireThat(comparison.workspace.currency === source.workspace.currency, 'Report versions must use the same currency', 409)
  requireThat(JSON.stringify(comparison.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])) === JSON.stringify(source.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])), 'Report versions must use the same accounting periods', 409)
 }
 const comparisonDimensions = comparison ? await reportDimensionSource(c, definition.comparison) : null
 const versions = await reportVersions(c, definition, source)
 if(stageMetric){
  if(comparisonDimensions)comparisonDimensions.cells=comparisonDimensions.stageCells as any
  for(const version of versions)version.cells=version.stageCells as any
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
 const history = await historyOverlay(c,requested,d.scenario)
 const dimensionalActuals = await dimensionActuals(c.db,c.s,ledgerEntity(c.s,d.scenario))
 const actuals = { ...history, cells: dimensionalCells(dimensionalActuals.cells).filter(cell => !scopedReader(c.x) || seesDepartmentDetail(c.x, cell.department)) }
 const unavailable = new Set([...actuals.blockedMonths, ...actuals.missingMonths])
 const selected = new Set(definition.lines as string[])
 const reportLines = source.lines.filter(l => selected.has(l.id))
 requireThat(reportLines.length === selected.size, 'A report line no longer exists in the source version', 409)
 if (d.department) requireThat(source.departments.some(dep => dep.id === d.department), 'Report department no longer exists in the source version', 409)
 const stages=[...sourceDimensions.stageCells,...(comparisonDimensions?.stageCells??[]),...versions.flatMap(v=>v.stageCells)].filter(cell=>selected.has(cell.line)&&(!d.department||cell.department===d.department))
 const dimensions: { id: string; name: string }[] = stageMetric ? [...new Map(stages.map(cell=>[cell.stage,{id:cell.stage,name:cell.stageName}])).values()].sort((a,b)=>a.id.localeCompare(b.id)) : ['dimension', 'hierarchy'].includes(definition.row) ? reportDimensionRows(definition, sourceDimensions.structure, reportLines) : definition.row === 'line' ? reportLines.map(l => ({ id: l.id, name: l.name }))
  : [...source.departments, { id: '', name: 'No department' }].filter(dep => !d.department || dep.id === d.department)
 const aggregate = (cells: Data[], periods: string[], dimension: string, available: (m: string) => boolean, structure = sourceDimensions.structure, isActual = false): number | null => {
  if (stageMetric && isActual)return null // GL actuals have no reviewed CRM stage classification.
  if (periods.some(m => !available(m))) return null
  if (isActual && dimensionalActuals.blocked.some(issue => periods.includes(issue.month) && (!issue.line || selected.has(issue.line)) && (!d.department || !issue.department || d.department === issue.department) && (!issue.dimensions.length || (definition.row === 'dimension' && issue.dimensions.some((u: Data) => u.dimension === definition.dimension)) || issue.dimensions.some((u: Data) => Object.hasOwn(definition.dimensions ?? {}, u.dimension))))) return null
  const consumed = cells.filter(cell => periods.includes(cell.month) && selected.has(cell.line) &&
   (!d.department || cell.department === d.department) && reportDimensionMatch(c, definition, structure, cell, dimension))
  if (consumed.some(cell => cell.amount === null)) return null
  return exact(consumed.map(cell => cell.amount))
 }
 const versionValues = (periods: string[], dimension: string) => Object.fromEntries(versions.map(v => [v.id, aggregate(v.cells, periods, dimension, m => v.view.calculation.months.includes(m) && (v.view.scenario.status === 'frozen' || !v.view.calculation.actualsThrough || m > v.view.calculation.actualsThrough || !unavailable.has(m)), v.structure)]))
 const monthly = dimensions.flatMap(dimension => [...requested].sort().map(m => ({ row: dimension.id, name: dimension.name, month: m, versions: versionValues([m], dimension.id),
  actual: aggregate(actuals.cells, [m], dimension.id, key => !unavailable.has(key), sourceDimensions.structure, true),
  budget: aggregate(sourceDimensions.cells, [m], dimension.id, key => source.calculation.months.includes(key) &&
   (source.scenario.status === 'frozen' || !source.calculation.actualsThrough || key > source.calculation.actualsThrough || !unavailable.has(key))),
  comparison: comparison ? aggregate(comparisonDimensions!.cells, [m], dimension.id, key => comparison.calculation.months.includes(key) &&
   (comparison.scenario.status === 'frozen' || !comparison.calculation.actualsThrough || key > comparison.calculation.actualsThrough || !unavailable.has(key))) : null,
 })))
 const rows = groups.flatMap(group => dimensions.map(dimension => {
  const actual = aggregate(actuals.cells, group.months, dimension.id, m => !unavailable.has(m), sourceDimensions.structure, true)
  const budget = aggregate(sourceDimensions.cells, group.months, dimension.id, m => source.calculation.months.includes(m) &&
   (source.scenario.status === 'frozen' || !source.calculation.actualsThrough || m > source.calculation.actualsThrough || !unavailable.has(m)))
  const other = comparison ? aggregate(comparisonDimensions!.cells, group.months, dimension.id, m => comparison.calculation.months.includes(m) &&
   (comparison.scenario.status === 'frozen' || !comparison.calculation.actualsThrough || m > comparison.calculation.actualsThrough || !unavailable.has(m))) : null
  const prior = aggregate(actuals.cells, group.months.map(m => addMonths(m, -12)), dimension.id, m => !unavailable.has(m), sourceDimensions.structure, true)
  const variance = actual === null || budget === null ? null : exact([actual, -budget])
  const yoy = actual === null || prior === null ? null : exact([actual, -prior])
  const varianceBps = percent(variance, budget), yoyBps = percent(yoy, prior)
  return { ...dimension, row: dimension.id, name: dimension.name, period: group.label, months: group.months, versions: versionValues(group.months, dimension.id), actual, budget, comparison: other,
   variance, varianceBps, priorYearActual: prior, yoy, yoyBps,
   highlight: varianceBps !== null && Math.abs(varianceBps) > definition.highlightBps }
 }))
 const freshness = [source, ...(comparison ? [comparison] : []), ...versions.map(v => v.view)].flatMap(view => (view.gaugeFreshness ?? [])
  .filter((row: Data) => selected.has(row.line) && requested.includes(row.month) && (!d.department || row.department === d.department) &&
   dimensions.some(dimension => reportDimensionMatch(c, definition, view.dimensionStructure, row, dimension.id)))
  .map((row: Data) => ({ ...row, version: view.scenario.name })))
 const layout = find(c.s, 'dashboard-layout', `${d.id}|${c.x.actor.email}`)
 return { metric:definition.metric??'amount', gaugeFreshness: freshness, reportDisplay: layout?.definitionRevision === d.revision ? layout?.reportDisplay ?? 'table' : 'table', layoutRevision: layout?.revision ?? 0, definitionRevision: d.revision, name: d.name, definition, currency: source.workspace.currency, sourceName: source.scenario.name,
  versions: versions.map(v => ({ id: v.id, name: v.name })), comparisonName: comparison?.scenario.name ?? null, department: d.department, rows, monthly,
  missingMonths: actuals.missingMonths, blockedMonths: actuals.blockedMonths,
  units: { money: 'integer minor units', percentages: 'basis points; half away from zero; unavailable for zero denominator' } }
}

export function savedReportWorkbook(view: Data): Uint8Array {
 const versions = view.versions ?? []
 const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26)
 const rows: Cell[][] = [[`${view.name} · ${view.currency} minor units; percentages in basis points`],
  ['Row', 'Period', 'Actual', view.sourceName, view.comparisonName ?? 'No comparison', 'Variance', 'Variance bps', 'Prior-year actual', 'YoY change', 'YoY bps', 'Highlight', ...versions.map((v: Data) => v.name)]]
 const monthly: Cell[][] = [['Row', 'Month', 'Actual', view.sourceName, view.comparisonName ?? 'No comparison', ...versions.map((v: Data) => v.name)],
  ...view.monthly.map((m: Data) => [m.name, m.month, m.actual, m.budget, m.comparison, ...versions.map((v: Data) => m.versions[v.id])])]
 const rollup = (row: Data, col: string, periods: string[], value: number | null): Cell => {
  if (value === null) return null
  const refs = view.monthly.flatMap((m: Data, i: number) => m.row === row.row && periods.includes(m.month) ? [i + 2] : [])
  return { formula: `SUM('Monthly'!${col}${refs[0]}:${col}${refs.at(-1)})`, value }
 }
 for (const row of view.rows) {
  const n = rows.length + 1
  const formula = (text: string, value: number | null): Cell => value === null ? null : { formula: text, value }
  rows.push([row.name, row.period, rollup(row, 'C', row.months, row.actual), rollup(row, 'D', row.months, row.budget), rollup(row, 'E', row.months, row.comparison),
   formula(`C${n}-D${n}`, row.variance), formula(`ROUND((C${n}-D${n})*10000/D${n},0)`, row.varianceBps), rollup(row, 'C', row.months.map((m: string) => addMonths(m, -12)), row.priorYearActual),
   formula(`C${n}-H${n}`, row.yoy), formula(`ROUND((C${n}-H${n})*10000/H${n},0)`, row.yoyBps), row.highlight ? 'Above threshold' : '', ...versions.map((v: Data, i: number) => rollup(row, column(5 + i), row.months, row.versions[v.id]))])
 }
 return workbook([gaugeFreshnessSheet(view.gaugeFreshness), { name: 'Saved report', rows }, { name: 'Monthly', rows: monthly }, { name: 'Availability', rows: [
  ['Unavailable values are blank, never zero. Accepted periods without this row have an observed zero.'],
  ['Missing actual periods', ...view.missingMonths], ['Blocked actual periods', ...view.blockedMonths],
 ] }])
}
