// Financing assumptions are decimal at the boundary and integer cents/basis
// points in storage. Schedules remain assumptions, never executed payments.
import { addMonths, month, range } from './months'
import { calculateFinancing } from './financing'
import { cents, decimal, percentBps } from './units'
import { choice, get, integer, requireThat, text, type Data, type State } from './types'

function monthlyValues(value: unknown, label: string, parse: (v: unknown, label: string) => number): Record<string, number> {
 requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must contain monthly values`)
 const result: Record<string, number> = {}
 for (const [m, v] of Object.entries(value)) result[month(m, `${label} month`)] = parse(v, `${label} for ${m}`)
 return result
}

/** Validate and normalize one debt facility or planned equity event. */
export function validateFinancingInput(s: State, kind: 'debt' | 'equity', b: Data, scenario: string): Data {
 const w = get(s, 'workspace', 'main'), planStart = month(w.planStart, 'Plan start month')
 const horizon = get(s, 'scenario', scenario).horizon ?? w.horizon
 const name = text(b.name, kind === 'debt' ? 'Debt name' : 'Equity event name')
 if (kind === 'equity') {
  const eventMonth = month(b.month, 'Equity month'), amountCents = cents(b.amount, 'Equity amount')
  requireThat(eventMonth >= planStart, 'Equity month cannot be before the plan start')
  requireThat(amountCents > 0, 'Equity amount must be positive')
  return { name, month: eventMonth, amountCents }
 }

 const selectedLine = get(s, 'line', b.line, 'interest expense line')
 requireThat(['operating-expense', 'cost-of-sales'].includes(selectedLine.type) && selectedLine.payroll !== true && selectedLine.nonCash !== true, 'Interest must use a cash, non-payroll expense line')
 const department = get(s, 'department', b.department, 'department').id
 const debtKind = choice(b.debtKind, ['term', 'credit', 'venture'] as const, 'a debt kind')
 const start = month(b.start ?? planStart, 'Debt start month'), maturity = month(b.maturity, 'Maturity month')
 requireThat(start >= planStart, 'Debt cannot start before the plan start')
 requireThat(maturity >= start, 'Maturity cannot be before the debt starts')
 const openingCents = cents(b.opening ?? '0', 'Opening principal estimate')
 requireThat(openingCents === 0 || start === planStart, 'Opening principal requires the debt to start at the plan start')
 const limitCents = debtKind === 'credit' ? cents(b.limit, 'Credit limit') : 0
 const rateKind = choice(b.rateKind ?? 'fixed', ['fixed', 'variable'] as const, 'a rate kind')
 const rate = rateKind === 'fixed'
  ? { annualRateBps: percentBps(b.annualRate ?? '0', 'Annual interest rate %') }
  : { baseName: text(b.baseName, 'Base rate name'), baseRatesBps: monthlyValues(b.baseRates ?? {}, 'Base rates', percentBps), spreadBps: percentBps(b.spreadPercent ?? '0', 'Rate spread %') }
 const drawsCents = monthlyValues(b.draws ?? {}, 'Draws', cents)
 const repaymentsCents = monthlyValues(b.repayments ?? {}, 'Extra principal repayments', cents)
 for (const [label, values] of [['Draw', drawsCents], ['Repayment', repaymentsCents]] as const) {
  for (const m of Object.keys(values)) requireThat(m >= start && m <= maturity, `${label} month ${m} must be between debt start and maturity`)
 }
 const amortization = choice(b.amortization ?? 'interest-only', ['interest-only', 'equal-principal'] as const, 'an amortization schedule')
 const amortizationStart = month(b.amortizationStart ?? start, 'First amortization month')
 const termMonths = integer(b.termMonths ?? 12, 'Amortization term (months)', 1, 3600)
 if (amortization === 'equal-principal') {
  requireThat(amortizationStart >= start, 'Amortization cannot start before the debt')
  requireThat(addMonths(amortizationStart, termMonths - 1) <= maturity, 'Amortization must finish by maturity')
  requireThat(!Object.entries(drawsCents).some(([m, amount]) => m > amortizationStart && amount > 0), 'Equal-principal debt cannot draw after its first payment month')
 }
 const covenants: Data = {}
 if (b.covenants !== undefined) {
  requireThat(b.covenants !== null && typeof b.covenants === 'object' && !Array.isArray(b.covenants), 'Covenants must be an object')
  if (b.covenants.minimumCash !== undefined) covenants.minimumCashCents = cents(b.covenants.minimumCash, 'Minimum cash')
  if (b.covenants.minimumLiquidity !== undefined) covenants.minimumLiquidityCents = cents(b.covenants.minimumLiquidity, 'Minimum liquidity')
  if (b.covenants.maximumLeverage !== undefined) covenants.maximumLeverageBps = decimal(b.covenants.maximumLeverage, 'Maximum debt / EBITDA ratio', 4)
 }
 const result = { name, debtKind, line: selectedLine.id, department, start, maturity, openingCents, limitCents, rateKind, ...rate, drawsCents, repaymentsCents, amortization, amortizationStart, termMonths, covenants }
 // Principal validation covers the entire contractual schedule, while rate
 // coverage is required for every live month of the current plan horizon.
 calculateFinancing([{ ...result, originId: b.originId ?? 'new-debt' }], [], range(planStart, horizon), w.currency)
 return result
}
