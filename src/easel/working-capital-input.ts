import { addMonths, month } from './months'
import { cents, percentBps } from './units'
import { choice, integer, requireThat, type Data } from './types'

const supplied = (v: unknown) => v !== undefined && v !== null && v !== ''
/** Timing is opt-in. Absence preserves the existing monthly cash convention. */
export function collectionInput(b: Data): Data {
 const method = choice(b.collectionMethod ?? (supplied(b.dsoDays) && b.kind !== 'contract' ? 'dso' : b.collectionCurve ? 'curve' : 'lag'), ['lag', 'dso', 'curve'] as const, 'a collection method')
 if (method === 'lag') {
  requireThat(!b.collectionCurve && (b.kind === 'contract' || !supplied(b.dsoDays)), 'Choose DSO or a collection curve to enter day-based collection timing')
  return {}
 }
 requireThat(method === 'curve' || !b.collectionCurve, 'Choose either DSO or a collection curve')
 if (method === 'dso') return { collectionMethod: method, dsoDays: integer(b.dsoDays, 'DSO (days)', 0, 365) }
 requireThat(!supplied(b.dsoDays) || (b.kind === 'contract' && Number(b.dsoDays) === 0), 'Choose either DSO or a collection curve')
 requireThat(Array.isArray(b.collectionCurve) && b.collectionCurve.length > 0 && b.collectionCurve.length <= 24, 'Enter 1 to 24 collection curve installments')
 const curve = b.collectionCurve.map((r: Data) => {
  requireThat(r && typeof r === 'object' && !Array.isArray(r), 'Each collection installment needs days and percent')
  return { days: integer(r.days, 'Collection days', 0, 365), bps: percentBps(r.percent, 'Collection share %') }
 })
 requireThat(curve.every((r: Data) => r.bps > 0), 'Collection shares must be positive')
 requireThat(new Set(curve.map((r: Data) => r.days)).size === curve.length, 'Each collection day may appear once')
 requireThat(curve.reduce((n: number, r: Data) => n + r.bps, 0) === 10000, 'Collection shares must add up to exactly 100%')
 return { collectionMethod: method, collectionCurve: curve.sort((a: Data, b: Data) => a.days - b.days) }
}
export function paymentInput(b: Data): Data {
 const method = choice(b.paymentMethod ?? (supplied(b.dpoDays) ? 'dpo' : supplied(b.paymentTermDays) ? 'terms' : 'lag'), ['lag', 'dpo', 'terms', 'date'] as const, 'a payment method')
 requireThat(method === 'date' || !supplied(b.paymentDate), 'Choose an explicit planned payment date to enter a date')
 if (method === 'date') {
  requireThat(b.kind === 'one-off', 'An explicit planned payment date requires a one-off expense')
  requireThat(!supplied(b.dpoDays) && !supplied(b.paymentTermDays), 'Choose a payment date or vendor days, never both')
  requireThat(typeof b.paymentDate === 'string', 'Enter a planned payment date YYYY-MM-DD')
  return { paymentMethod: method, paymentDate: b.paymentDate }
 }
 requireThat(!(supplied(b.dpoDays) && supplied(b.paymentTermDays)), 'Choose either DPO or vendor payment terms')
 if (method === 'lag') { requireThat(!supplied(b.dpoDays) && !supplied(b.paymentTermDays), 'Choose day-based payment timing to enter DPO or terms'); return {} }
 return method === 'dpo' ? { paymentMethod: method, dpoDays: integer(b.dpoDays, 'DPO (days)', 0, 365) } : { paymentMethod: method, paymentTermDays: integer(b.paymentTermDays, 'Days after invoice month end', 0, 365) }
}
export function payrollInput(b: Data): Data {
 if (!supplied(b.payDay) && !supplied(b.payMonthOffset) && !supplied(b.secondPayDay)) return {}
 const payDay = integer(b.payDay, 'Payroll pay day', 1, 31)
 const secondPayDay = supplied(b.secondPayDay) ? integer(b.secondPayDay, 'Second payroll pay day', 1, 31) : undefined
 requireThat(secondPayDay === undefined || secondPayDay > payDay, 'The second payroll pay day must be later than the first')
 return { payDay, ...(secondPayDay === undefined ? {} : { secondPayDay }), payMonthOffset: integer(b.payMonthOffset ?? 0, 'Payroll pay month offset', 0, 3) }
}
export function workingExpenseInput(b: Data, base: Data): Data | undefined {
 if (b.kind === 'prepaid') {
  const paymentMonth = month(b.paymentMonth || base.start, 'Prepayment month')
  requireThat(paymentMonth <= base.start, 'An expense prepayment must be paid no later than its first service month')
  requireThat(monthsDistance(paymentMonth, base.start) <= 120, 'Prepayment cannot precede service by more than 120 months')
  requireThat(!b.paymentMethod || b.paymentMethod === 'lag', 'Prepayments use their entered payment month, not vendor terms')
  return { ...base, kind: 'prepaid', amountCents: cents(b.amount, 'Total prepaid amount'), amortizationMonths: integer(b.amortizationMonths, 'Amortization months', 1, 120), paymentMonth }
 }
 if (b.kind === 'bonus') {
  const payMonth = month(b.payMonth, 'First bonus pay month')
  requireThat(payMonth >= addMonths(base.start, 2) && payMonth <= addMonths(base.start, 14), 'First bonus pay month must be at or within twelve months after the first quarter end')
  requireThat(!b.paymentMethod || b.paymentMethod === 'lag', 'Bonuses use their entered pay month, not vendor terms')
  return { ...base, kind: 'bonus', amountCents: cents(b.amount, 'Quarterly bonus'), payMonth }
 }
}
const monthsDistance = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))
