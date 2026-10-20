// Reviewed origin allocations replace schedule openings at the actual boundary.
import type { LedgerContext } from './ledger-context'
import { requireThat, type Data } from './types'
import { apportion } from './units'
import type { ContractCalculation } from './contract-revenue'

export function scheduleAllocations(ledger: LedgerContext | undefined, through: string | null | undefined) {
 if (!ledger || !through) return [] as Data[]
 const trial = ledger.trials.find(t => t.period === through)
 return ledger.allocations.filter(a => a.month === through).flatMap(entry => {
  const balance = trial?.balances.find((b: Data) => b.target === entry.target)
  requireThat(balance && balance.amount === entry.amount && JSON.stringify(balance.sources) === JSON.stringify(entry.sources), 'Accepted balances changed after the schedule allocation; review and allocate the current source again', 409)
  return entry.allocations.map((a: Data) => ({ ...a, target: entry.target, month: through, trace: `Imported ${entry.target} opening at ${through}; ${balance.sources.map((s: Data) => `account ${s.account}, ${s.rows} rows, imports ${s.batches.join(', ')}`).join('; ')}.` }))
 })
}

export function openContracts(calc: ContractCalculation, allocations: Data[]) {
 for (const a of allocations.filter(a => a.target === 'bs:deferred-revenue')) {
  const boundary = calc.rows.find(r => r.originId === a.originId && r.month === a.month)
  const future = calc.rows.filter(r => r.originId === a.originId && r.month > a.month && r.revenue > 0)
  requireThat(boundary && future.length, 'Deferred opening needs remaining service on its contract', 409)
  const delta = a.amount - boundary.deferredRevenue
  const recognition = future.reduce((n, row) => n + row.revenue, 0) + delta
  requireThat(recognition >= 0, 'Imported deferred opening cannot produce negative remaining service recognition; review the contract attribution', 409)
  const parts = apportion(recognition, future.map(r => r.revenue))
  const revised = new Map(future.map((row, i) => [row.month, parts[i]]))
  let balance = a.amount - boundary.unbilledRevenue
  boundary.deferredRevenue = a.amount; boundary.trace += ` ${a.trace}`
  for (const row of calc.rows.filter(r => r.originId === a.originId && r.month > a.month)) {
   row.revenue = revised.get(row.month) ?? 0
   balance += row.billings - row.revenue
   row.deferredRevenue = Math.max(0, balance); row.unbilledRevenue = Math.max(0, -balance)
   row.trace += ` ${a.trace} Remaining recognition adjusts by the imported opening difference and apportions by the existing service schedule; largest remainder conserves cents. Entered future invoices and collection dates are unchanged. Recognition ${row.revenue}, deferred ${row.deferredRevenue}, unbilled ${row.unbilledRevenue}.`
  }
 }
 for (const month of calc.months) {
  const rows = calc.rows.filter(r => r.month === month.month)
  for (const key of ['revenue', 'deferredRevenue', 'unbilledRevenue'] as const) month[key] = rows.reduce((n, r) => n + r[key], 0)
 }
}
