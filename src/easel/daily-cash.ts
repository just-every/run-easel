// The dated, aggregate counterpart of monthly cash. No input identities or pay detail.
import type { Model } from './engine'
import type { TaggedCash } from './cash-drivers'
import type { FinancingCalculation } from './financing'
import { periodForKey } from './fiscal-calendar'
export type DailyCash = { date: string; collections: number; payments: number; assumed: boolean }
export function dailyCash(model: Model, months: string[], cash: TaggedCash[], financing: FinancingCalculation): DailyCash[] {
 const daily = new Map<string, DailyCash>()
 const post = (date: string, collections: number, payments: number, assumed: boolean) => {
  if (!collections && !payments) return
  const row = daily.get(date) ?? { date, collections: 0, payments: 0, assumed: false }
  row.collections += collections; row.payments += payments; row.assumed ||= assumed
  daily.set(date, row)
 }
 for (const e of cash.filter(e => months.includes(e.month))) post(e.date ?? periodForKey(model.workspace, e.month).endDate, e.collection ? e.amount : 0, e.collection ? 0 : e.amount, !e.date || !!e.assumedDate)
 for (const [i, m] of months.entries()) {
  const period = periodForKey(model.workspace, m), f = financing.totals[i]
  post(period.startDate, f.draws, 0, true)
  post(period.endDate, f.equityRaised + (i === 0 ? model.scenario.cash?.receivablesCents ?? 0 : 0), f.repayments + (i === 0 ? model.scenario.cash?.payablesCents ?? 0 : 0), true)
 }
 return [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))
}
