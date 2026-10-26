import { cashHealth } from './cash-health'
import type { Calculation } from './engine'
import { monthLabel } from './months'
import { requireThat, type Data } from './types'

function exact(value: bigint): number {
 const amount = Number(value)
 requireThat(Number.isSafeInteger(amount), 'Dashboard metric exceeds the supported exact range')
 return amount
}

const sum = (values: number[]) => exact(values.reduce((total, value) => total + BigInt(value), 0n))

/** The caller resolves scenario access and supplies its raw saved/calculated
 * sources server-side. Only these aggregate values leave this projection. */
export function dashboardMetrics(view: Data, subscriptions: Data[], department: string): Data[] {
 const calc = view.calculation as Calculation
 const lineTypes = new Map<string, string>(view.lines.map((line: Data) => [line.id, line.type]))
 const recurring = subscriptions.filter(r => ['customers', 'seats'].includes(r.kind) &&
  lineTypes.get(r.line) === 'revenue' && (!department || r.department === department))
 const scopedCells = calc.cells.filter(cell => !department || cell.department === department)
 const cash = new Map(cashHealth(calc.cash, calc.actualsThrough, calc.currency).months.map(row => [row.month, row]))
 const missing = new Set(calc.months.filter(month => calc.warnings.includes(`${monthLabel(month)} is closed but has no accepted actuals`)))
 const firstMissing = calc.months.find(month => missing.has(month))

 return calc.months.map(month => {
  const cells = scopedCells.filter(cell => cell.month === month)
  const total = (type: string) => sum(cells.filter(cell => lineTypes.get(cell.line) === type).map(cell => cell.amount))
  const revenue = missing.has(month) ? null : total('revenue')
  const grossMargin = revenue === null ? null : exact(BigInt(revenue) - BigInt(total('cost-of-sales')))
  const headcount = sum(Object.entries(calc.headcount).filter(([id]) => !department || id === department).map(([, months]) => months[month] ?? 0))
  let arr: number | null = null
  let arrBasis = 'No subscription driver'
  const observed = recurring.filter(r => r.start <= month && r.billingActuals?.[month])
  if (observed.length && observed.length === recurring.filter(r => r.start <= month).length) {
   arr = sum(observed.map(r => r.billingActuals[month].arrCents))
   arrBasis = 'Accepted billing end-month recurring run rate × 12'
  } else if (calc.actualsThrough && month <= calc.actualsThrough) {
   arrBasis = missing.has(month) ? 'Missing accepted actuals' : 'Actuals have no subscription classification'
  } else if (recurring.length) {
   const active = recurring.filter(r => r.start <= month)
   const amounts: number[] = []
   let complete = true
   for (const driver of active) {
    const sources = cells.filter(cell => cell.line === driver.line && cell.department === driver.department)
     .flatMap(cell => cell.sources).filter(source => source.kind === 'revenue' && source.id === driver.originId)
    if (!sources.length) complete = false
    amounts.push(...sources.map(source => source.amount))
   }
   if (complete) {
    arr = exact(BigInt(sum(amounts)) * 12n)
    arrBasis = active.length ? 'Monthly customer and seat revenue × 12' : 'Subscription drivers have not started'
   } else arrBasis = 'Subscription source amounts unavailable'
  }
  const cashMonth = cash.get(month)
  const incompleteCash = !!cashMonth?.incompleteReasons?.length
  const cashBlocked = (!!firstMissing && month >= firstMissing) || incompleteCash
  const companyCash = !department && !cashBlocked && !!cashMonth
  return {
   month, revenue, grossMargin, headcount, arr,
   burn: companyCash ? cashMonth.netBurnCents : null,
   runway: companyCash ? cashMonth.runwayBasis === 'cash-exhausted' ? 0 : cashMonth.runwayHundredths : null,
   closingCash: companyCash ? cashMonth.closing : null,
   arrBasis,
   runwayBasis: department ? 'Company cash only' : incompleteCash ? 'Incomplete contract receipt allocation; known cash schedule only' : cashBlocked ? 'Missing accepted actuals' : cashMonth?.runwayBasis ?? 'Cash unavailable',
  }
 })
}
