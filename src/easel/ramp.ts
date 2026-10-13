// The hiring ramp rule. A new quota-carrying hire reaches full productivity
// linearly over `rampMonths`: in their first month they deliver 1/rampMonths,
// in the second 2/rampMonths, and so on up to 100%. Returned in basis points.
// Approved budgets keep the numbers they were approved with; changing this
// rule changes working scenarios only.
import { mulDiv } from './units'

export const RAMP_RULE = 'linear ramp to full productivity over the hire\'s ramp months'

export function rampFactorBps(monthsSinceStart: number, rampMonths: number): number {
 if (monthsSinceStart < 0) return 0
 if (rampMonths <= 1) return 10000
 return Math.min(10000, mulDiv(monthsSinceStart + 1, 10000, rampMonths))
}
