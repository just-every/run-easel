import type { Data } from './types'
import { columnName } from './xlsx'
import { workbook, type Cell } from './xlsx-write'

const formula = (formula: string, value: number): Cell => ({ formula, value })

/** Uses the same cents, basis points and cached results as the annual-plan view. */
export function longRangeWorkbook(view: Data): Uint8Array {
 const { plan, source } = view
 const years: Data[] = view.rows
 const assumptions: Cell[][] = [
  [`${plan.name} · Assumptions`],
  [`${view.currency} integer minor units (100 = 1 currency unit); rates in basis points (100 = 1%); headcount in whole people`],
  [],
  ['Operating budget', source.name],
  ['Source revision', source.revision],
  ['Source status', source.status],
  ['Source snapshot', source.snapshot ?? ''],
  ['Source SHA-256', source.sha256 ?? ''],
  [],
 ]
 const assumption = (label: string, value: number): string => {
  assumptions.push([label, value])
  return `'Assumptions'!$B$${assumptions.length}`
 }
 assumption('Plan years', plan.years)
 const priorRevenue = assumption('Prior-year revenue', plan.priorYearRevenueCents)
 const targetGrowth = assumption('Target annual revenue growth (bps)', plan.targets.growthBps)
 const targetMargin = assumption('Target profit margin (bps)', plan.targets.marginBps)
 const targetHeadcount = assumption('Target headcount (people)', plan.targets.headcount)
 const targetCash = assumption('Target closing cash', plan.targets.cashCents)
 assumptions.push([], ['Annual drivers', ...years.slice(1).map(year => `Year ${year.year}`)])
 const driverRefs: Record<string, number> = {}
 for (const [key, label] of [
  ['growthBps', 'Revenue growth (bps)'],
  ['marginBps', 'Profit margin (bps)'],
  ['headcountChange', 'Headcount change (people)'],
  ['cashChangeCents', 'Cash change'],
 ]) {
  driverRefs[key] = assumptions.length + 1
  assumptions.push([label, ...years.slice(1).map(year => plan.drivers[year.year - 2][key])])
 }
 assumptions.push(
  [],
  ['Calculation notes'],
  ['Year one', 'Annual operating budget values from the named source revision or snapshot.'],
  ['Future revenue', 'Previous annual revenue × (10000 + annual growth bps) ÷ 10000.'],
  ['Future profit and costs', 'Revenue × annual margin bps ÷ 10000; costs = revenue − profit.'],
  ['Future headcount', 'Previous annual headcount + annual headcount change.'],
  ['Cash', 'Opening cash = previous closing cash; closing cash = opening cash + annual cash change.'],
  ['Revenue target', 'Compounds each year from prior-year revenue using target annual growth.'],
  ['Profit target', 'Annual revenue target × target margin bps ÷ 10000.'],
  ['Other targets', 'Headcount and closing-cash targets remain fixed across the plan.'],
  ['Gaps', 'Operating budget or projection − target.'],
  ['Rounding', 'ROUND(value, 0), half away from zero, after each multiplication and division.'],
 )

 const rows: Cell[][] = [
  [plan.name],
  [`${view.currency} integer minor units (100 = 1 currency unit); rates in basis points; headcount in whole people`],
  ['Annual plan', ...years.map(year => `Year ${year.year}`)],
  ['Period start', ...years.map(year => year.start)],
  ['Period end', ...years.map(year => year.end)],
 ]
 const refs: Record<string, number> = {}
 const line = (key: string, label: string) => { refs[key] = rows.length + 1; rows.push([label]) }
 rows.push([], ['Operating budget and projections'])
 line('revenue', 'Revenue')
 line('costs', 'Costs')
 line('profit', 'Profit')
 line('marginBps', 'Profit margin (bps)')
 line('headcount', 'Headcount (people)')
 rows.push([], ['Cash'])
 line('openingCash', 'Opening cash')
 line('cashChange', 'Cash change')
 line('closingCash', 'Closing cash')
 rows.push([], ['Long-range targets'])
 line('targetRevenue', 'Revenue target')
 line('targetProfit', 'Profit target')
 line('targetHeadcount', 'Headcount target (people)')
 line('targetCash', 'Closing cash target')
 rows.push([], ['Reconciliation · operating budget or projection minus target'])
 line('revenueGap', 'Revenue gap')
 line('profitGap', 'Profit gap')
 line('headcountGap', 'Headcount gap (people)')
 line('cashGap', 'Closing cash gap')
 rows.push([], ['Evidence'])
 line('trace', 'Calculation trace')

 years.forEach((year, index) => {
  const col = columnName(index + 2), previous = columnName(index + 1)
  const cell = (key: string) => `${col}${refs[key]}`
  const previousCell = (key: string) => `${previous}${refs[key]}`
  const driver = (key: string) => `'Assumptions'!${columnName(index + 1)}${driverRefs[key]}`
  const set = (key: string, value: Cell) => { rows[refs[key] - 1].push(value) }
  if (index === 0) {
   for (const key of ['revenue', 'costs', 'profit', 'marginBps', 'headcount', 'openingCash', 'cashChange']) set(key, year[key])
  } else {
   set('revenue', formula(`ROUND(${previousCell('revenue')}*(10000+${driver('growthBps')})/10000,0)`, year.revenue))
   set('profit', formula(`ROUND(${cell('revenue')}*${driver('marginBps')}/10000,0)`, year.profit))
   set('costs', formula(`${cell('revenue')}-${cell('profit')}`, year.costs))
   set('marginBps', year.marginBps === null ? null : formula(`ROUND(${cell('profit')}*10000/${cell('revenue')},0)`, year.marginBps))
   set('headcount', formula(`${previousCell('headcount')}+${driver('headcountChange')}`, year.headcount))
   set('openingCash', formula(previousCell('closingCash'), year.openingCash))
   set('cashChange', formula(driver('cashChangeCents'), year.cashChange))
  }
  set('closingCash', formula(`${cell('openingCash')}+${cell('cashChange')}`, year.closingCash))
  set('targetRevenue', formula(`ROUND(${index === 0 ? priorRevenue : previousCell('targetRevenue')}*(10000+${targetGrowth})/10000,0)`, year.targetRevenue))
  set('targetProfit', formula(`ROUND(${cell('targetRevenue')}*${targetMargin}/10000,0)`, year.targetProfit))
  set('targetHeadcount', formula(targetHeadcount, year.targetHeadcount))
  set('targetCash', formula(targetCash, year.targetCash))
  for (const [gap, actual, target] of [
   ['revenueGap', 'revenue', 'targetRevenue'],
   ['profitGap', 'profit', 'targetProfit'],
   ['headcountGap', 'headcount', 'targetHeadcount'],
   ['cashGap', 'closingCash', 'targetCash'],
  ]) set(gap, formula(`${cell(actual)}-${cell(target)}`, year[gap]))
  set('trace', typeof year.trace === 'string' ? year.trace : JSON.stringify(year.trace))
 })
 return workbook([{ name: 'Annual plan', rows }, { name: 'Assumptions', rows: assumptions }])
}
