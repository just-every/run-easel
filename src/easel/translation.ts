// ENTITY-002 translated statements: profit and loss at each month's average
// rate, the balance sheet at its month-end rate, and the translation
// adjustment that makes them agree. Every amount is translated from the plan's
// own integer cents once (half away from zero) and totals are sums of
// translated parts. A month without the rate it needs is unavailable, never
// guessed or read as zero.
import type { Context } from './context'
import { addMonths } from './months'
import { RATE_SCALE, formatRate, rateTable, type RateKind, type RateRow, type RateTable } from './currency-rates'
import { variance } from './review'
import { requireMember } from './access'
import { scenarioView } from './views'
import { mulDiv } from './units'
import { workspace } from './model'
import type { Data } from './types'

const move = (cents: number, rate: number) => mulDiv(cents, rate, RATE_SCALE)
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

const ASSETS = ['cash', 'receivables', 'unbilledRevenue', 'inventory', 'prepaid', 'capitalPrepayments', 'fixedAssets'] as const
const LIABILITIES = ['payables', 'capitalPayables', 'nonCashReserve', 'deferredRevenue', 'salesTaxPayable', 'accruedLiabilities', 'debt'] as const

function status(table: RateTable | undefined, local: string) {
 if (!table) return 'not-set'
 return table.local === local ? 'applied' : 'different-plan-currency'
}

const rateText = (row: RateRow | undefined) => Object.fromEntries((['budget', 'average', 'monthEnd'] as RateKind[]).map(k => [k, row?.[k] === undefined ? null : formatRate(row[k]!)]))

export function translate(calc: Data, table: RateTable | undefined, local: string) {
 const state = status(table, local)
 const rates = state === 'applied' ? table!.rates : {}
 const months: string[] = calc.months
 const missingAverage: string[] = []
 let cumulativeProfit: number | null = 0, cumulativeContribution: number | null = 0, previousContribution = 0
 const opening = rates[addMonths(months[0], -1)]?.monthEnd
 const openingEquity = calc.balanceSheet?.[0]?.openingEquity
 const statements = months.map((month, i) => {
  const row: RateRow | undefined = rates[month]
  const profit = calc.profit[i], bs = calc.balanceSheet?.[i]
  const missing: string[] = []
  if (row?.average === undefined) missing.push(`average rate for ${month}`)
  if (bs && row?.monthEnd === undefined) missing.push(`month-end rate for ${month}`)
  const pl = row?.average === undefined ? null : (() => {
   const revenue = move(profit.revenue, row.average), costOfSales = move(profit.costOfSales, row.average), operatingExpenses = move(profit.operatingExpenses, row.average)
   const grossMargin = revenue - costOfSales
   return { revenue, costOfSales, operatingExpenses, grossMargin, profit: grossMargin - operatingExpenses }
  })()
  // Equity components accumulate at the average rate of the month they arose in.
  cumulativeProfit = cumulativeProfit === null || !pl ? null : cumulativeProfit + pl.profit
  const contribution = bs ? bs.contributedEquity - previousContribution : 0
  cumulativeContribution = cumulativeContribution === null || row?.average === undefined ? null : cumulativeContribution + move(contribution, row.average)
  if (bs) previousContribution = bs.contributedEquity
  let balanceSheet: Data | null = null
  if (bs && row?.monthEnd !== undefined) {
   if (opening === undefined) missing.push(`month-end rate for ${addMonths(months[0], -1)} (opening equity)`)
   const t = (key: string) => move(bs[key] ?? 0, row.monthEnd!)
   const assetLines = Object.fromEntries(ASSETS.map(k => [k, t(k)])), liabilityLines = Object.fromEntries(LIABILITIES.map(k => [k, t(k)]))
   const assets = sum(Object.values(assetLines)), liabilities = sum(Object.values(liabilityLines))
   if (opening !== undefined && cumulativeProfit !== null && cumulativeContribution !== null) {
    const translatedOpening = move(openingEquity ?? 0, opening)
    const equity = translatedOpening + cumulativeProfit + cumulativeContribution
    // The plan's own balance difference is carried, never absorbed by the adjustment.
    const unreconciled = move(bs.balanceDifference, row.monthEnd)
    balanceSheet = { ...assetLines, assets, ...liabilityLines, liabilities, openingEquity: translatedOpening, retainedEarnings: cumulativeProfit, contributedEquity: cumulativeContribution, equity, unreconciled, translationAdjustment: assets - liabilities - equity - unreconciled }
   }
  }
  return { month, rates: rateText(row), profit: pl, balanceSheet, ...(missing.length ? { unavailable: missing } : {}) }
 })
 let previous = 0
 for (const m of statements) {
  const cta = m.balanceSheet?.translationAdjustment
  if (cta === undefined) continue
  m.balanceSheet!.translationAdjustmentMovement = cta - previous
  previous = cta
 }
 return { status: state, planCurrency: local, reportingCurrency: table?.reporting ?? null, rateBasis: 'Profit and loss at each month’s average rate; balance sheet at its month-end rate; opening equity at the month-end rate before the plan; profit and equity contributions at the average rate of the month they arose in. Translation adjustment = translated assets − liabilities − equity (and the plan’s own balance difference, carried unchanged).', months: statements, ...(state === 'applied' ? { rates: Object.fromEntries(Object.entries(rates).map(([m, r]) => [m, rateText(r)])), enteredBy: table!.by, enteredAt: table!.at } : {}) }
}

/** Current finance rates applied to this scenario, whether working or frozen. */
export async function translationView(c: Context, id: string) {
 requireMember(c.x)
 const view = await scenarioView(c, id)
 return translate(view.calculation, rateTable(c.s), view.workspace.currency)
}

/** Closed-month budget-versus-actual in the reporting currency: budget at its budget rate, actual at the month's average rate and again at the budget rate (constant currency). Variance = actual − budget. */
export async function constantCurrencyVariance(c: Context, month: string) {
 const v = await variance(c, month)
 const table = rateTable(c.s), local = workspace(c.s).currency, state = status(table, local)
 const row = state === 'applied' ? table!.rates[month] : undefined
 const unavailable = state !== 'applied' ? `No rate table for ${local}` : [row?.budget === undefined ? `budget rate for ${month}` : '', row?.average === undefined ? `average rate for ${month}` : ''].filter(Boolean).join(' and ')
 const base = { month, status: state, planCurrency: local, reportingCurrency: table?.reporting ?? null, rates: rateText(row), forecast: v.forecast, budget: v.budget }
 if (state !== 'applied' || row?.budget === undefined || row.average === undefined) return { ...base, unavailable: state === 'applied' ? `Enter the ${unavailable}` : unavailable, rows: [], totals: null }
 const rows = v.rows.map((r: Data) => {
  const sign = r.lineType === 'revenue' ? 1 : -1
  const budget = move(r.budget, row.budget!), actual = move(r.actual, row.average!), actualAtBudgetRate = move(r.actual, row.budget!)
  return { line: r.line, lineName: r.lineName, lineType: r.lineType, department: r.department, departmentName: r.departmentName, sign, budget, actual, actualAtBudgetRate, variance: actual - budget, constantCurrencyVariance: actualAtBudgetRate - budget, currencyEffect: actual - actualAtBudgetRate }
 })
 const total = (pick: (r: Data) => number) => sum(rows.map((r: Data) => r.sign * pick(r)))
 const totals = Object.fromEntries(['budget', 'actual', 'actualAtBudgetRate', 'variance', 'constantCurrencyVariance', 'currencyEffect'].map(k => [k, total(r => r[k])]))
 return { ...base, rateBasis: 'Budget at the month’s budget rate; actual at its average rate and, for constant currency, at the budget rate. Variance = actual − budget; reported variance = constant-currency variance + currency effect. Totals are profit (revenue − costs) from rounded rows.', rows, totals }
}
