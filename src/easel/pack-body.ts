import { ledgerEntity } from './ledger-scope'
// REPORT-003: the numbers of a board pack for a closed month or quarter, built
// from the working forecast, the approved budget and the kept forecasts. A
// draft shows them live and records their fingerprint; publication freezes
// exactly the fingerprinted numbers into an immutable snapshot.
import { workingCalculation } from './calculation'
import { fiscalSummary } from './fiscal-summary'
import { aggregateFinancing } from './financing-view'
import type { Context } from './context'
import { departments as allDepartments, lines as allLines, workspace } from './model'
import { addMonths, monthLabel, monthsBetween, range } from './months'
import { sha256, snapshot } from './store'
import { variance } from './review'
import { all, requireThat, type Data } from './types'
import { PACK_SECTIONS, type PackSection } from './pack-template'

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const sumOrNull = (values: (number | null)[]) => values.some(v => v === null || v === undefined) ? null : sum(values as number[])

/** The months a pack covers: one closed month, or one complete closed fiscal quarter. */
export async function packPeriod(c: Context, forecast: Data, b: Data) {
 const month = typeof b.month === 'string' ? b.month : ''
 if (b.period !== 'quarter') return { period: 'month' as const, months: [month], label: monthLabel(month) }
 const w = workspace(c.s), calc = await workingCalculation(c, forecast.id)
 const quarter = fiscalSummary({ ...w, horizon: calc.months.length } as any, calc, allLines(c.s)).quarters.find(q => q.periods.includes(month))
 requireThat(quarter, 'Choose a month inside a plan quarter', 400)
 requireThat(quarter.complete, `${quarter.label} does not have its three periods in the plan`, 409)
 requireThat(forecast.actualsThrough && quarter.periods.at(-1)! <= forecast.actualsThrough, `${quarter.label} is not closed yet`, 409)
 return { period: 'quarter' as const, months: quarter.periods as string[], label: quarter.label as string }
}

type Rows = Awaited<ReturnType<typeof variance>>
async function monthRows(c: Context, months: string[],scenario?:string): Promise<Rows[]> {
 const parts: Rows[] = []
 for (const m of months) parts.push(await variance(c,m,scenario))
 return parts
}

function periodRows(parts: Rows[], months: string[]): Rows {
 if (parts.length === 1) return parts[0]
 const last = parts.at(-1)!, keys = [...new Set(parts.flatMap(p => p.rows.map(r => r.key)))]
 const rows = keys.map(key => {
  const mine = parts.map((p, i) => ({ month: months[i], row: p.rows.find(r => r.key === key) }))
  const first = mine.find(x => x.row)!.row!
  const actual = sum(mine.map(x => x.row?.actual ?? 0)), budget = sum(mine.map(x => x.row?.budget ?? 0))
  const confirmed = mine.filter(x => x.row?.explanation?.status === 'confirmed' && !first.payroll)
  const variances = actual - budget
  return { ...first, actual, budget, variance: variances, favourable: variances === 0 ? null : first.lineType === 'revenue' ? variances > 0 : variances < 0,
   priorForecast: mine.every(x => x.row?.priorForecast !== null && x.row?.priorForecast !== undefined) ? sum(mine.map(x => x.row!.priorForecast!)) : null,
   citations: mine.flatMap(x => x.row?.citations ?? []),
   explanation: confirmed.length ? { text: confirmed.map(x => `${monthLabel(x.month)}: ${x.row!.explanation!.text}`).join(' '), status: 'confirmed', citationIds: confirmed.flatMap(x => x.row!.explanation!.citationIds ?? []), confirmedBy: [...new Set(confirmed.map(x => x.row!.explanation!.confirmedBy))].join(', ') } : null,
   comparisons: (first.comparisons ?? []).map((cmp: Data, i: number) => ({ id: cmp.id, amount: sumOrNull(mine.map(x => x.row ? x.row.comparisons[i].amount : 0)), variance: sumOrNull(mine.map(x => x.row ? x.row.comparisons[i].variance : 0)) })) } as Rows['rows'][number]
 })
 rows.sort((p, q) => Math.abs(q.variance) - Math.abs(p.variance) || p.key.localeCompare(q.key))
 return { ...last, rows, month: months.at(-1)!, label: monthLabel(months.at(-1)!) }
}

/** Everything a pack states about its numbers; decisions and publication details are added at publication. */
export async function packNumbers(c: Context, pack: Data) {
 const s = c.s, w = workspace(s), months: string[] = pack.months ?? [pack.month], last = months.at(-1)!
 const parts = await monthRows(c,months,pack.forecast), v = periodRows(parts, months)
 for (const mv of parts) {
  for (const row of mv.rows) {
   if (row.payroll || row.explanation?.status !== 'confirmed') continue
   const ids = row.explanation.citationIds ?? [], visible = new Set(row.citations.map(source => source.id))
   requireThat(Array.isArray(ids) && ids.every((id: unknown) => typeof id === 'string' && visible.has(id)), 'An explanation citation changed; review its sources before publishing', 409)
  }
 }
 const forecast = all(s, 'scenario').find(x => x.id === pack.forecast)!
 const forecastCalc = await workingCalculation(c, forecast.id, forecast.actualsThrough)
 const budget = await snapshot(c.db, forecast.budgetSnapshot)
 const fiscalStart = addMonths(w.planStart, Math.floor(monthsBetween(w.planStart, last) / 12) * 12)
 const ytd = range(fiscalStart, 12).filter(m => m <= last)
 const reportLines: Data[] = [...new Map([...allLines(s), ...budget.body.lines].map(l => [l.id, l])).values()]
 const total = (calc: Data, id: string, ms: string[]) => sum(ms.map(m => calc.lineTotals[id]?.[m] ?? 0))
 const lineRows = reportLines.map(l => ({ line: l.name, type: l.type, actual: total(forecastCalc, l.id, months), budget: total(budget.body.calculation, l.id, months), ytdActual: total(forecastCalc, l.id, ytd), ytdBudget: total(budget.body.calculation, l.id, ytd) }))
 const profitOf = (calc: Data) => { const rows = calc.profit.filter((p: Data) => months.includes(p.month)); return rows.length === 1 ? rows[0] : { month: last, ...Object.fromEntries(['revenue', 'costOfSales', 'operatingExpenses', 'grossMargin', 'profit'].map(k => [k, sum(rows.map((r: Data) => r[k]))])) } }
 const batches = all(s, 'batch').filter(x => x.status === 'accepted' && x.entity===ledgerEntity(s,pack.forecast) && x.periods.some((p: string) => months.includes(p))).map(x => ({ file: x.file, sha256: x.sha256, rows: x.accepted, acceptedBy: x.acceptedBy, acceptedAt: x.acceptedAt }))
 const cashRow = (m: string) => forecastCalc.cash.find(x => x.month === m)
 const budgetCash = (m: string) => budget.body.calculation.cash.find((b: Data) => b.month === m)?.closing ?? null
 const headcount = (calc: Data, m: string) => sum(Object.values(calc.headcount as Record<string, Record<string, number>>).map(byMonth => byMonth[m] ?? 0))
 const revenueIds = reportLines.filter(l => l.type === 'revenue').map(l => l.id)
 const chartMonths = ytd
 const numbers = {
  presentation: { locale: w.locale, timeZone: w.timeZone, dateFormat: w.dateFormat },
  versionComparison: { currency: w.currency, versions: v.versions, rows: v.rows.map(r => ({ key: r.key, lineName: r.lineName, departmentName: r.departmentName, actual: r.actual, comparisons: r.comparisons })) },
  budget: v.budget, forecast: { id: forecast.id, name: forecast.name, revision: forecast.revision, actualsThrough: forecast.actualsThrough }, priorForecast: v.priorForecast,
  lines: lineRows, profit: { month: profitOf(forecastCalc), budget: profitOf(budget.body.calculation) },
  kpis: [
   { key: 'revenue', label: 'Revenue', actual: sum(lineRows.filter(l => l.type === 'revenue').map(l => l.actual)), budget: sum(lineRows.filter(l => l.type === 'revenue').map(l => l.budget)), unit: 'money' },
   { key: 'grossMargin', label: 'Gross margin', actual: profitOf(forecastCalc).grossMargin, budget: profitOf(budget.body.calculation).grossMargin, unit: 'money' },
   { key: 'profit', label: 'Profit', actual: profitOf(forecastCalc).profit, budget: profitOf(budget.body.calculation).profit, unit: 'money' },
   { key: 'closingCash', label: 'Closing cash', actual: cashRow(last)?.closing ?? null, budget: budgetCash(last), unit: 'money' },
   { key: 'headcount', label: 'Planned headcount', actual: headcount(forecastCalc, last), budget: headcount(budget.body.calculation, last), unit: 'count' },
  ],
  charts: [
   { id: 'revenue', title: 'Revenue by month, actual against budget', kind: 'bars', months: chartMonths, series: [
    { name: 'Actual', values: chartMonths.map(m => sum(revenueIds.map(id => forecastCalc.lineTotals[id]?.[m] ?? 0))) },
    { name: 'Budget', values: chartMonths.map(m => sum(revenueIds.map(id => budget.body.calculation.lineTotals[id]?.[m] ?? 0))) }] },
   { id: 'cash', title: 'Closing cash by month, forecast against budget', kind: 'bars', months: chartMonths, series: [
    { name: 'Forecast', values: chartMonths.map(m => cashRow(m)?.closing ?? 0) },
    { name: 'Budget', values: chartMonths.map(m => budgetCash(m) ?? 0) }] },
  ],
  ...(forecastCalc.formulaValues?.length ? { nativeDefinitions: { scenario: { id: forecast.id, name: forecast.name, revision: forecast.revision }, inputs: all(s, 'formula').filter(f => f.scenario === forecast.id), formulaValues: forecastCalc.formulaValues, sources: forecastCalc.nativeSources ?? {} } } : {}),
  ...(forecastCalc.contracts ? { contracts: { ...forecastCalc.contracts, rows: [], invoices: [] }, balanceSheet: forecastCalc.balanceSheet, cashFlow: forecastCalc.cashFlow } : {}),
  ...(forecastCalc.workingCapital ? { workingCapital: { ...forecastCalc.workingCapital, rows: [], issues: [] } } : {}),
  ...(forecastCalc.financing ? { financing: aggregateFinancing(forecastCalc.financing) } : {}),
  assets: forecastCalc.months.map(month => ({ month, ...Object.fromEntries(['openingBookValue', 'depreciation', 'disposalBookValue', 'closingBookValue', 'capex', 'disposalProceeds'].map(key => [key, (forecastCalc.assets ?? []).filter(a => a.month === month).reduce((n, a) => n + Number(a[key as keyof typeof a]), 0)])) })),
  cash: forecastCalc.cash.map(m => ({ ...(m.incompleteReasons ? { incompleteReasons: m.incompleteReasons } : {}), month: m.month, closing: m.closing, budget: budgetCash(m.month) })),
  // Pack audience projections omit private native definitions and individual pay detail.
  variances: v.rows.map(r => ({ line: r.lineName, department: r.departmentName, actual: r.actual, budget: r.budget, priorForecast: r.priorForecast, variance: r.variance, favourable: r.favourable,
   explanation: !r.payroll && r.explanation?.status === 'confirmed' ? { text: r.explanation.text, status: r.explanation.status, citationIds: r.explanation.citationIds ?? [], confirmedBy: r.explanation.confirmedBy ?? null } : null,
   evidence: [...allLines(s), ...budget.body.lines].some(l => l.id === r.line && l.payroll) ? [] : r.citations.map((x: Data) => `${x.file} line ${x.line}`) })),
  sources: batches,
 }
 const figures = { lines: numbers.lines, profit: numbers.profit, cash: numbers.cash, kpis: numbers.kpis, charts: numbers.charts, versions: numbers.versionComparison, variances: numbers.variances.map(r => [r.line, r.department, r.actual, r.budget, r.priorForecast]), balanceSheet: numbers.balanceSheet ?? null, cashFlow: numbers.cashFlow ?? null, contracts: numbers.contracts?.months ?? null, sources: batches.map(b => [b.file, b.sha256]) }
 return { numbers, fingerprint: await sha256(JSON.stringify([months, pack.template ?? 'default', figures])), departments: allDepartments(s).length }
}

const SECTION_KEYS: Record<PackSection, string[]> = {
 statements: ['lines', 'profit', 'cash', 'balanceSheet', 'cashFlow', 'financing', 'assets'],
 kpis: ['kpis'], charts: ['charts'], commentary: ['variances', 'versionComparison'], decisions: [], appendix: ['contracts', 'workingCapital', 'sources'],
}
/** Keeps only the sections the template names; budget, forecast and native definitions are provenance and always stay. */
export function templateBody(numbers: Data, sections: readonly string[]): Data {
 const dropped = new Set(PACK_SECTIONS.filter(s => !sections.includes(s)).flatMap(s => SECTION_KEYS[s]))
 const body: Data = {}
 for (const [k, value] of Object.entries(numbers)) if (!dropped.has(k)) body[k] = value
 return body
}
