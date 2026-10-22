import { bankCashAuthority, plaidCashSource } from './plaid-connection'
// FIN-007: a dated plan schedule, distinct from bank balances or open-item actuals.
import { requireFinance } from './access'
import type { Context } from './context'
import { periodForKey } from './fiscal-calendar'
import { requireEditable } from './model'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { scenarioView } from './views'
import { cents } from './units'
import { requireThat, text, type Data } from './types'
const day = 86400000
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * day).toISOString().slice(0, 10)
export function cashDate(value: unknown): string {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200 && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value, 'Use a valid cash date YYYY-MM-DD')
 return value
}
export async function weeklyCash(c: Context, id: string, requested?: string, requestedBasis = 'plan') {
 requireThat(['plan', 'bank'].includes(requestedBasis), 'Choose plan or bank cash basis')
 if (requestedBasis === 'bank') bankCashAuthority(c)
 const v = await scenarioView(c, id), calc = v.calculation
 const bank = requestedBasis === 'bank' ? await plaidCashSource(c) : null
 if (bank) {
  requireThat(v.scenario.status === 'working', 'Bank cash is a current observation; captured versions retain their planned cash', 409)
  requireThat(bank.currency === calc.currency, 'Bank and scenario currencies differ; no exchange rate is inferred', 409)
 }
 const anchor = bank ? addDays(bank.asOf.slice(0, 10), 1) : null
 const start = cashDate(requested || anchor || periodForKey(v.workspace, calc.months.find(m => m > (calc.actualsThrough ?? '')) ?? calc.months[0]).startDate)
 const first = periodForKey(v.workspace, calc.months[0]).startDate, last = periodForKey(v.workspace, calc.months.at(-1)!).endDate
 requireThat(start >= first && start <= last, 'Start within the captured plan horizon')
 if (!calc.dailyCash) return { available: false, reason: 'This captured version predates dated cash schedules; its monthly cash remains available.', currency: calc.currency, start, weeks: [], reconciliation: [] }
 if (anchor) requireThat(start >= anchor, 'Start bank cash after its observed balance date', 409)
 const rows = anchor ? calc.dailyCash.filter(r => r.date >= anchor) : calc.dailyCash, overrides = v.scenario.weeklyCashOverrides ?? {}
 const netThrough = (date: string) => rows.filter(r => r.date <= date).reduce((n, r) => n + r.collections - r.payments, 0)
 const changes = Object.entries(overrides).map(([from, value]) => ({ adjustmentCents: (value as Data).adjustmentCents as number, note: (value as Data).note as string, date: addDays(from, 6) })).filter(r => !anchor || r.date >= anchor)
 const adjustmentThrough = (date: string) => changes.filter(r => r.date <= date).reduce((n, r) => n + r.adjustmentCents, 0)
 const baseline = bank ? bank.balanceCents : calc.cash[0].opening
 let opening = baseline + netThrough(addDays(start, -1)) + adjustmentThrough(addDays(start, -1))
 const weeks = Array.from({ length: 13 }, (_, i) => {
  const from = addDays(start, i * 7), end = addDays(from, 6), available = end <= last
  if (!available) return { start: from, end, available: false }
  const events = rows.filter(r => r.date >= from && r.date <= end)
  const collections = events.reduce((n, r) => n + r.collections, 0), payments = events.reduce((n, r) => n + r.payments, 0)
  const applied = changes.filter(r => r.date >= from && r.date <= end)
  const adjustment = applied.reduce((n, r) => n + r.adjustmentCents, 0)
  const closing = opening + collections - payments + adjustment
  const row = { start: from, end, available: true, opening, collections, payments, adjustment, closing, note: applied.map(r => r.note).join('; '), assumedDates: events.some(r => r.assumed) }
  opening = closing
  return row
 })
 const end = addDays(start, 90)
 const reconciliation = calc.cash.flatMap(m => {
  const date = periodForKey(v.workspace, m.month).endDate
  if (date < start || date > end) return []
  // Week overrides settle on the final day, never silently backdated to a month end.
  const adjustment = adjustmentThrough(date)
  const scheduled = baseline + netThrough(date), weekly = scheduled + adjustment
  return [{ month: m.month, date, monthly: m.closing, scheduled, adjustment, weekly, difference: weekly - m.closing, incomplete: !!m.incompleteReasons?.length }]
 })
 return { available: true, currency: calc.currency, start, weeks, reconciliation, ...(bank ? { bank: { asOf: bank.asOf, balanceCents: bank.balanceCents, accountCount: bank.accountCount }, bankBasis: true } : {}), basis: bank ? `Planning estimate from Plaid bank balance observed ${bank.asOf}, ${bank.accountCount} depository accounts; not ledger actuals. Forecast events start the next UTC day; posted historical movements are not counted again. Monthly differences remain visible. Overrides before the bank observation are excluded.` : 'Planning estimate from forecast schedules; no bank balance or open invoice/bill feed. Undated cash uses period end; debt draws use period start. Overrides adjust weekly cash only and settle on week end.' }
}
export async function weeklyCashCommand(c: Context, op: string, b: Data) {
 if (op !== 'weekly-cash-override') return undefined
 requireFinance(c.x)
 const sc = scenarioAccess(c.s, c.x, b.scenario)
 requireEditable(c.s, c.x, sc, null)
 const start = cashDate(b.start), note = text(b.note, 'Override note', 1000)
 const adjustmentCents = cents(b.adjustment, 'Weekly adjustment', { negative: true })
 const preview = await weeklyCash(c, sc.id, start)
 requireThat(preview.available && preview.weeks[0]?.available, 'A weekly override needs a complete week within a dated plan', 409)
 const weeklyCashOverrides = { ...sc.weeklyCashOverrides, [start]: { adjustmentCents, note } }
 bump(c, { ...sc, weeklyCashOverrides }, op, sc.id, { start, adjustmentCents, note })
 return { start, adjustmentCents, note }
}
