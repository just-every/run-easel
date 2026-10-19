import type { ActualCell } from './engine'
import { addMonths } from './months'
import { formatBps, formatMoney } from './units'
import { requireThat, type Data } from './types'

export const referenceMonths = (history: Data, month: string): string[] =>
 Array.from({ length: history.window }, (_, index) => addMonths(month, -history.offset - index)).reverse()

/** One exact division across both averaging and growth, including negatives. */
function amount(sum: bigint, growthBps: number, window: number): number {
 const numerator = sum * BigInt(10000 + growthBps), denominator = 10000n * BigInt(window)
 const magnitude = numerator < 0n ? -numerator : numerator
 const rounded = (magnitude * 2n + denominator) / (denominator * 2n)
 const result = Number(numerator < 0n ? -rounded : rounded)
 requireThat(Number.isSafeInteger(result), 'Actuals-based schedule exceeds the supported exact range', 409)
 return result
}

export function historySchedule(schedule: Data, actuals: ActualCell[], months: string[], currency: string): { month: string; amount: number; trace: string }[] {
 const history = schedule.history as Data
 const source = new Map<string, ActualCell[]>()
 for (const cell of actuals) {
  if (cell.line !== history.sourceLine || cell.department !== history.sourceDepartment) continue
  source.set(cell.month, [...(source.get(cell.month) ?? []), cell])
 }
 return months.map(month => {
  let total = 0n
  const citations = referenceMonths(history, month).map(reference => {
   const cells = source.get(reference)
   requireThat(cells?.length, `Missing accepted actuals for ${reference}, line ${history.sourceLine}, department ${history.sourceDepartment}`, 409)
   const parts = cells.map(cell => {
    requireThat(Number.isSafeInteger(cell.amount), `Actuals amount is outside the exact range for ${reference}`, 409)
    total += BigInt(cell.amount)
    return `${formatMoney(cell.amount, currency)} from ${cell.rows} accepted row(s), batches ${[...cell.batches].sort().join(', ')}`
   })
   return `Actuals ${reference}, line ${history.sourceLine}, department ${history.sourceDepartment}: ${parts.join(' + ')}`
  })
  const result = amount(total, history.growthBps, history.window)
  return { month, amount: result, trace: `${month}: ${citations.join('; ')}. Sum in minor units ${total} × (10000 + ${history.growthBps} growth bps, ${formatBps(history.growthBps)}) ÷ (10000 × ${history.window} month(s)) = ${formatMoney(result, currency)}; one division rounds half away from zero to cents.` }
 })
}
