import { apportion, cents, decimal, mulDiv } from './units'
import { choice, requireThat, type Data } from './types'

/** Integer-only selection operations; remainder cents follow selection order. */
export function gridAmounts(b: Data, current: number[], prior: number[]): number[] {
 const op = choice(b.operation, ['even', 'proportional', 'prior-year', 'percent', 'amount', 'copy'] as const, 'a grid operation')
 if (op === 'copy') return current.map(() => cents(b.value, 'Copied value', { negative: true }))
 if (op === 'percent') {
  const rate = decimal(b.percent, 'Change %', 2, { negative: true, max: 100000n })
  return current.map(value => mulDiv(value, 10000 + rate, 10000))
 }
 const amount = cents(b.amount, 'Amount', { negative: true })
 if (op === 'amount') return current.map(value => value + amount)
 const weights = op === 'even' ? current.map(() => 1) : op === 'proportional' ? current.map(Math.abs) : prior.map(Math.abs)
 requireThat(weights.some(weight => weight > 0), 'The spread has no nonzero source weights')
 return apportion(amount, weights)
}
