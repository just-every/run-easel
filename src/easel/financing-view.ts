import type { FinancingCalculation } from './financing'

/** Members read funding totals and outcomes; instrument terms stay with finance. */
export function aggregateFinancing(value: FinancingCalculation): FinancingCalculation {
 return { rows: [], equityRows: [], totals: value.totals.map(row => ({ ...row,
  trace: `${row.month}: opening debt ${row.openingDebt} + draws ${row.draws} − principal ${row.repayments} = closing debt ${row.closingDebt}; equity raises ${row.equityRaised}; net financing cash ${row.financingCash}. All amounts are minor units. Scheduled interest ${row.interest}; accepted interest replaces the schedule in closed-month profit and operating cash.`,
 })), covenants: value.covenants.map(row => ({ ...row, sourceId: '',
  trace: `${row.month}: ${row.kind}; numerator ${row.numerator}, denominator ${row.denominator}, threshold ${row.threshold} ${row.thresholdUnits}; ${row.status}. ${row.kind === 'maximum-leverage' ? 'EBITDA is current-month net income plus recognized interest and noncash expense, annualized ×12; positive debt and nonpositive EBITDA breaches with no numeric ratio.' : row.kind === 'minimum-liquidity' ? 'Liquidity is closing cash plus all active undrawn credit.' : 'Cash is month-end closing cash.'}`,
 })) }
}
