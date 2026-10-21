import { fiscalPeriods, type CalendarWorkspace, type FiscalPeriod } from './fiscal-calendar'
import type { Calculation, Line } from './engine'
import { requireThat } from './types'

const sum = (values: number[]) => {
 const value = values.reduce((a, b) => a + BigInt(b), 0n)
 requireThat(value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER), 'Fiscal total exceeds the supported exact range')
 return Number(value)
}

/** Sum flows once in integer cents; opening/closing cash are boundary stocks. */
export function fiscalSummary(workspace: CalendarWorkspace, calc: Calculation, lines: Line[], department = '') {
 const periods = fiscalPeriods(workspace, calc.months)
 const cells = calc.cells.filter(c => !department || c.department === department)
 const groups = (annual: boolean) => {
  const grouped = new Map<string, FiscalPeriod[]>()
  for (const p of periods) {
   const key = annual ? p.fiscalYear : `${p.fiscalYear} Q${p.quarter}`
   grouped.set(key, [...(grouped.get(key) ?? []), p])
  }
  return [...grouped].map(([label, members]) => {
   const keys = new Set(members.map(p => p.key))
   const lineTotals = Object.fromEntries(lines.map(l => [l.id, sum(cells.filter(c => c.line === l.id && keys.has(c.month)).map(c => c.amount))]))
   const type = (type: string) => sum(lines.filter(l => l.type === type).map(l => lineTotals[l.id]))
   const revenue = type('revenue'), costOfSales = type('cost-of-sales'), operatingExpenses = type('operating-expense')
   const cash = calc.cash.filter(c => keys.has(c.month))
   const reasons = [...new Set(cash.flatMap(c => c.incompleteReasons ?? []))]
   return { label, fiscalYear: members[0].fiscalYear, quarter: annual ? null : members[0].quarter,
    periods: members.map(p => p.key), fromDate: members[0].startDate, throughDate: members.at(-1)!.endDate,
    complete: members.length === (annual ? 12 : 3), lineTotals, revenue, costOfSales, operatingExpenses,
    grossMargin: sum([revenue, -costOfSales]), profit: sum([revenue, -costOfSales, -operatingExpenses]),
    ...(!department && cash.length ? { cash: { opening: cash[0].opening, collections: sum(cash.map(c => c.collections)), payments: sum(cash.map(c => c.payments)), closing: cash.at(-1)!.closing, ...(reasons.length ? { incompleteReasons: reasons } : {}) } } : {}),
   }
  })
 }
 const boundaries = periods.map(({ startDate, endDate, ...p }) => ({ ...p, fromDate: startDate, throughDate: endDate }))
 return { calendar: workspace.calendar ?? 'calendar-month', periods: boundaries, quarters: groups(false), years: groups(true) }
}
