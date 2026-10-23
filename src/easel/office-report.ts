// Office links export the same aggregate, live-authorized saved report as Excel.
// Bindings carry selectors only; neither authority nor a cached value is a grant.
import type { Context } from './context'
import { savedReport, savedReportWorkbook } from './saved-reports'
import { choice, get, requireThat, type Data } from './types'
import { formatMoney } from './units'

export async function officeReport(c: Context, id: string, input: Data) {
 const view = await savedReport(c, id), definition = get(c.s, 'dashboard', id)
 const period = String(input.period ?? '')
 const kind = choice(input.kind ?? 'table', ['table', 'chart', 'number'] as const, 'Office content')
 const metric = choice(input.metric ?? 'budget', ['budget', 'actual', 'comparison', 'variance', 'priorYearActual', 'yoy'] as const, 'Office value')
 requireThat(!input.source || input.source === definition.scenario, 'The linked report source version changed; insert a new link explicitly', 409)
 requireThat(!input.through || input.through === definition.report.through, 'The linked report horizon changed; insert a new link explicitly', 409)
 const rows = view.rows.filter((r: Data) => r.period === period)
 requireThat(rows.length > 0, 'The linked period is unavailable in this report', 409)
 const row = kind === 'number' ? String(input.row ?? '') : 'all'
 const selected = kind === 'number' ? rows.filter((r: Data) => (r.row || 'unassigned') === row) : rows
 requireThat(selected.length > 0, 'The linked row is unavailable in your current report view', 409)
 requireThat(kind !== 'number' || selected.length === 1, 'Choose one report row', 409)
 const amount = (n: number | null | undefined) => n === null || n === undefined ? 'Unavailable' : formatMoney(n, view.currency)
 const metricLabel = { budget: view.sourceName, actual: 'Actual', comparison: view.comparisonName ?? 'Comparison', variance: 'Variance', priorYearActual: 'Prior-year actual', yoy: 'YoY change' }[metric]
 return { binding: { schema: 1, report: id, source: definition.scenario, through: definition.report.through, period, kind, metric, row },
  title: `${view.name} · ${period} · ${metricLabel}`, currency: view.currency, revision: definition.revision,
  table: [['Row', `${metricLabel} (${view.currency})`], ...selected.map((r: Data) => [r.name, amount(r[metric])])],
  number: amount(selected[0][metric]), chart: { categories: selected.map((r: Data) => r.name), values: selected.map((r: Data) => r[metric] ?? null) } }
}

export async function officeWorkbook(c: Context, id: string, input: Data) {
 // Check the exact binding before exporting the report's existing live formulas.
 await officeReport(c, id, input)
 return savedReportWorkbook(await savedReport(c, id))
}
