// Deterministic financing schedules. Draws happen before monthly interest;
// explicit extra principal is reserved before automatic month-end repayment.
import { addMonths, month, monthsBetween } from './months'
import { formatBps, formatMoney, mulDiv } from './units'
import { integer, requireThat, type Data } from './types'

export type DebtMonth = {
 originId: string; name: string; kind: string; month: string
 opening: number; draw: number; interest: number; repayment: number; closing: number
 annualRateBps: number; limit: number; trace: string
}
export type FinancingMonth = {
 month: string; openingDebt: number; draws: number; interest: number; repayments: number; closingDebt: number
 equityRaised: number; cumulativeEquity: number; financingCash: number; trace: string
}
export type FinancingCalculation = {
 rows: DebtMonth[]
 equityRows: { originId: string; name: string; month: string; amount: number; trace: string }[]
 totals: FinancingMonth[]
 covenants: Data[]
}

const ordered = (a: Data, b: Data) => String(a.name).localeCompare(String(b.name)) || String(a.originId).localeCompare(String(b.originId))
const amount = (v: unknown, label: string) => integer(v, label, 0, Number.MAX_SAFE_INTEGER)
const exact = (value: bigint, label: string): number => {
 requireThat(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER), `${label} exceeds the supported integer range`)
 return Number(value)
}
const sum = (values: number[], label: string) => exact(values.reduce((a, b) => a + BigInt(b), 0n), label)

function debtRows(debt: Data, months: string[], currency: string): DebtMonth[] {
 const start = month(debt.start, 'Debt start month'), maturity = month(debt.maturity, 'Maturity month')
 requireThat(start >= months[0] && maturity >= start, `${debt.name}: invalid debt dates`)
 requireThat(['term', 'credit', 'venture'].includes(debt.debtKind), `${debt.name}: invalid debt kind`)
 requireThat(['fixed', 'variable'].includes(debt.rateKind), `${debt.name}: invalid rate kind`)
 requireThat(['interest-only', 'equal-principal'].includes(debt.amortization), `${debt.name}: invalid amortization schedule`)
 let principal = amount(debt.openingCents, `${debt.name}: opening principal`)
 requireThat(principal === 0 || start === months[0], `${debt.name}: opening principal must start with the plan`)
 const limit = debt.debtKind === 'credit' ? amount(debt.limitCents, `${debt.name}: credit limit`) : 0
 const draws = debt.drawsCents as Record<string, number>, extras = debt.repaymentsCents as Record<string, number>
 for (const [label, values] of [['Draw', draws], ['Repayment', extras]] as const) {
  requireThat(values && typeof values === 'object' && !Array.isArray(values), `${debt.name}: ${label} schedule is required`)
  for (const [m, value] of Object.entries(values)) {
   month(m, `${label} month`)
   amount(value, `${debt.name}: ${label} in ${m}`)
   requireThat(m >= start && m <= maturity, `${debt.name}: ${label} in ${m} is outside the debt term`)
  }
 }
 const equal = debt.amortization === 'equal-principal'
 const amortizationStart = equal ? month(debt.amortizationStart, 'First amortization month') : start
 const term = equal ? integer(debt.termMonths, 'Amortization term (months)', 1, 3600) : 1
 if (equal) {
  requireThat(amortizationStart >= start && addMonths(amortizationStart, term - 1) <= maturity, `${debt.name}: amortization must finish by maturity`)
  requireThat(!Object.entries(draws).some(([m, v]) => m > amortizationStart && v > 0), `${debt.name}: equal-principal draws cannot follow the first payment month`)
 }
 const money = (v: number) => formatMoney(v, currency), requested = new Set(months)
 const end = months[months.length - 1] > maturity ? months[months.length - 1] : maturity
 const rows: DebtMonth[] = []
 let tranche = 0
 for (let m = months[0]; m <= end; m = addMonths(m, 1)) {
  const active = m >= start && m <= maturity, opening = principal
  const draw = active ? draws[m] ?? 0 : 0, extra = active ? extras[m] ?? 0 : 0
  const available = sum([opening, draw], `${debt.name}: principal`)
  requireThat(debt.debtKind !== 'credit' || available <= limit, `${debt.name}: principal exceeds its credit limit in ${m}`)
  requireThat(extra <= available, `${debt.name}: extra principal repayment exceeds available principal in ${m}`)
  if (equal && m === amortizationStart) tranche = available
  const age = monthsBetween(amortizationStart, m)
  const instalment = equal && age >= 0 && age < term
   ? (age === term - 1 ? tranche - Number(BigInt(tranche) / BigInt(term)) * (term - 1) : Number(BigInt(tranche) / BigInt(term))) : 0
  const scheduled = Math.min(available - extra, instalment)
  const balloon = m === maturity ? available - extra - scheduled : 0
  const repayment = sum([extra, scheduled, balloon], `${debt.name}: repayment`)
  principal = available - repayment
  if (!requested.has(m)) continue
  let annualRateBps = 0, rateTrace = 'no outstanding principal'
  if (active && available > 0) {
   if (debt.rateKind === 'fixed') {
    annualRateBps = amount(debt.annualRateBps, `${debt.name}: annual rate`)
    rateTrace = `fixed annual rate ${formatBps(annualRateBps)}`
   } else {
    requireThat(typeof debt.baseName === 'string' && debt.baseName.trim(), `${debt.name}: base rate name is required`)
    requireThat(Object.hasOwn(debt.baseRatesBps ?? {}, m), `${debt.name}: ${debt.baseName} base rate is missing for ${m}`)
    const base = amount(debt.baseRatesBps[m], `${debt.name}: base rate in ${m}`), spread = amount(debt.spreadBps, `${debt.name}: rate spread`)
    annualRateBps = sum([base, spread], `${debt.name}: annual rate`)
    rateTrace = `${debt.baseName} ${formatBps(base)} + spread ${formatBps(spread)} = annual rate ${formatBps(annualRateBps)}`
   }
  }
  const interest = mulDiv(available, annualRateBps, 120000)
  requireThat(Number.isSafeInteger(interest), `${debt.name}: interest exceeds the supported integer range`)
  rows.push({ originId: debt.originId, name: debt.name, kind: debt.debtKind, month: m, opening, draw, interest, repayment, closing: principal, annualRateBps, limit: active ? limit : 0,
   trace: `${debt.name} (${debt.originId}), ${m}: opening principal ${money(opening)} (initial opening is an estimate) + beginning-month draw ${money(draw)} = interest-bearing principal ${money(available)}; ${rateTrace}; principal × annual basis points ÷ 120000 = interest ${money(interest)}, paid this month. Month-end extra principal ${money(extra)} is reserved first; ${equal ? `fixed tranche ${money(tranche)} over ${term} months, exact remainder in final payment month; automatic principal ${money(scheduled)}` : 'interest-only schedule, no automatic principal before maturity'}; maturity principal ${money(balloon)}; total repayment ${money(repayment)}; closing principal ${money(principal)}. These are planned payments.` })
 }
 return rows
}

/** Calculate schedules independently of the displayed horizon's end. */
export function calculateFinancing(debts: Data[], equity: Data[], months: string[], currency: string): FinancingCalculation {
 if (!months.length) return { rows: [], equityRows: [], totals: [], covenants: [] }
 const requested = [...new Set(months.map(m => month(m)))].sort()
 requireThat(requested.every((m, i) => m === addMonths(requested[0], i)), 'Financing requires consecutive plan months')
 const rows = [...debts].sort(ordered).flatMap(d => debtRows(d, requested, currency))
 const debtByMonth = new Map(requested.map(m => [m, [] as DebtMonth[]]))
 for (const row of rows) debtByMonth.get(row.month)!.push(row)
 const equityRows = [...equity].sort(ordered).flatMap(e => {
  const m = month(e.month, 'Equity month'), value = amount(e.amountCents, `${e.name}: equity amount`)
  requireThat(m >= requested[0] && value > 0, `${e.name}: equity must be positive and no earlier than the plan start`)
  return requested.includes(m) ? [{ originId: e.originId, name: e.name, month: m, amount: value, trace: `${e.name} (${e.originId}): planned equity cash contribution ${formatMoney(value, currency)} in ${m}; increases contributed equity, not income.` }] : []
 }).sort((a, b) => a.month.localeCompare(b.month) || ordered(a, b))
 let cumulativeEquity = 0
 const totals = requested.map(m => {
  const debt = debtByMonth.get(m)!, events = equityRows.filter(r => r.month === m)
  const total = (key: 'opening' | 'draw' | 'interest' | 'repayment' | 'closing') => sum(debt.map(r => r[key]), `${m}: total debt ${key}`)
  const openingDebt = total('opening'), draws = total('draw'), interest = total('interest'), repayments = total('repayment'), closingDebt = total('closing')
  const equityRaised = sum(events.map(r => r.amount), `${m}: equity raised`)
  cumulativeEquity = sum([cumulativeEquity, equityRaised], `${m}: cumulative equity`)
  const financingCash = sum([draws, -repayments, equityRaised], `${m}: financing cash`)
  return { month: m, openingDebt, draws, interest, repayments, closingDebt, equityRaised, cumulativeEquity, financingCash,
   trace: `${m}: opening debt ${formatMoney(openingDebt, currency)} + draws ${formatMoney(draws, currency)} − principal repayments ${formatMoney(repayments, currency)} = closing debt ${formatMoney(closingDebt, currency)}. Draws − principal repayments + equity ${formatMoney(equityRaised, currency)} = financing cash ${formatMoney(financingCash, currency)}; interest ${formatMoney(interest, currency)} is paid through operating cash. Sources: ${[...debt, ...events].map(r => `${r.name} (${r.originId})`).join(', ') || 'none'}.` }
 })
 return { rows: rows.sort((a, b) => a.month.localeCompare(b.month) || ordered(a, b)), equityRows, totals, covenants: [] }
}

/** Monthly covenant tests use current monthly EBITDA annualized by ×12. */
export function evaluateCovenants(financing: FinancingCalculation, debts: Data[], profit: { month: string; profit: number }[], cash: { month: string; closing: number }[], nonCashByMonth: Record<string, number>): Data[] {
 const profitByMonth = new Map(profit.map(r => [r.month, r])), cashByMonth = new Map(cash.map(r => [r.month, r]))
 const debtByMonth = new Map(financing.totals.map(t => [t.month, [] as DebtMonth[]]))
 for (const row of financing.rows) debtByMonth.get(row.month)!.push(row)
 const tests: Data[] = []
 for (const debt of [...debts].sort(ordered)) {
  const rules = debt.covenants ?? {}
  for (const [kind, field] of [['minimum-cash', 'minimumCashCents'], ['minimum-liquidity', 'minimumLiquidityCents'], ['maximum-leverage', 'maximumLeverageBps']] as const) {
   if (rules[field] === undefined) continue
   const threshold = amount(rules[field], `${debt.name}: covenant threshold`), ruleRows: Data[] = []
   for (const total of financing.totals.filter(t => t.month >= debt.start && t.month <= debt.maturity)) {
    const m = total.month, c = cashByMonth.get(m), p = profitByMonth.get(m)
    requireThat(c && p, `Covenant inputs are missing for ${m}`, 409)
    const sources = debtByMonth.get(m)!
    let numerator: number, denominator = 1, breach: boolean, trace: string, ratioBps: number | null = null
    if (kind === 'maximum-leverage') {
     numerator = total.closingDebt
     const nonCash = nonCashByMonth[m] ?? 0
     const recognizedInterest = (total as Data).recognizedInterest ?? total.interest
     denominator = exact(BigInt(sum([p.profit, recognizedInterest, nonCash], `${m}: EBITDA`)) * 12n, `${m}: annualized EBITDA`)
     breach = numerator > 0 && (denominator <= 0 || BigInt(numerator) * 10000n > BigInt(threshold) * BigInt(denominator))
     if (denominator > 0) {
      const calculated = mulDiv(numerator, 10000, denominator)
      if (Number.isSafeInteger(calculated)) ratioBps = calculated
     }
     trace = `Total closing debt ${numerator} cents / annualized current monthly EBITDA: 12 × (net income ${p.profit} + recognized interest ${recognizedInterest} + noncash expense ${nonCash}) = ${denominator} cents. Maximum ratio ${threshold}/10000. Comparison uses exact cross-multiplied integers.${denominator <= 0 ? (numerator > 0 ? ' Positive debt with nonpositive EBITDA breaches; no numeric ratio is available.' : ' Zero debt meets the test; no numeric ratio is available.') : ''}`
    } else {
     const unusedCredit = sum(sources.filter(r => r.kind === 'credit' && r.limit > 0).map(r => r.limit - r.closing), `${m}: unused credit`)
     numerator = kind === 'minimum-cash' ? c.closing : sum([c.closing, unusedCredit], `${m}: liquidity`)
     breach = numerator < threshold
     trace = kind === 'minimum-cash' ? `Closing cash ${c.closing} cents compared with minimum ${threshold} cents.` : `Liquidity = closing cash ${c.closing} cents + all unused active credit limits ${unusedCredit} cents = ${numerator} cents; minimum ${threshold} cents.`
    }
    ruleRows.push({ month: m, sourceId: debt.originId, kind, numerator, denominator, threshold, thresholdUnits: kind === 'maximum-leverage' ? 'ratio-basis-points' : 'cents', ...(kind === 'maximum-leverage' ? { ratioBps } : {}), status: breach ? 'breach' : 'pass', trace: `${debt.name} (${debt.originId}), ${m}: ${trace} Debt sources: ${sources.map(r => `${r.name} (${r.originId})`).join(', ') || 'none'}.` })
   }
   const firstBreachMonth = ruleRows.find(r => r.status === 'breach')?.month
   tests.push(...ruleRows.map(r => ({ ...r, ...(firstBreachMonth ? { firstBreachMonth } : {}) })))
  }
 }
 return tests.sort((a, b) => a.month.localeCompare(b.month) || a.sourceId.localeCompare(b.sourceId) || a.kind.localeCompare(b.kind))
}
