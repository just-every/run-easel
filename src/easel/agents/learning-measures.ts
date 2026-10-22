// AGENT-004 measures. Each measure is one assumption the company's own history
// can contradict, a whole-day miss measured from reviewed history, and a pure
// revision of a kept forecast's inputs. Easel calls no model: every figure is
// integer arithmetic over rows people reviewed.
import { addDays } from '../calendar-time'
import { datePeriod } from '../fiscal-calendar'
import type { Calculation } from '../engine'
import type { Data } from '../types'
import { daysBetween } from './deal-outcomes'

export type MeasureKey = 'close-slippage' | 'hire-slippage' | 'collection-lag'
export const MEASURES: { key: MeasureKey; label: string; unit: string }[] = [
 { key: 'close-slippage', label: 'Deal close-date slippage', unit: 'days' },
 { key: 'hire-slippage', label: 'Hire start-date slippage', unit: 'days' },
 { key: 'collection-lag', label: 'Collection lag beyond planned DSO', unit: 'days' },
]
/** A mean needs this many reviewed observations; fewer is noise, never a suggestion. */
export const MIN_SAMPLES = 3
/** Backtests use the last six to twelve kept forecasts. */
export const MIN_KEPT = 6, MAX_KEPT = 12

/** Mean rounded half away from zero, in whole days. */
export const meanDays = (values: number[]) => {
 const n = values.length, sum = values.reduce((a, b) => a + b, 0)
 return Math.sign(sum) * Math.floor((2 * Math.abs(sum) + n) / (2 * n))
}
const medianDays = (values: number[]) => { const v = [...values].sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : meanDays([v[m - 1], v[m]]) }
const spread = (values: number[]) => ({ samples: values.length, meanDays: meanDays(values), medianDays: medianDays(values), minDays: Math.min(...values), maxDays: Math.max(...values) })

export type Observed = { key: MeasureKey; samples: number; meanDays: number; medianDays: number; minDays: number; maxDays: number; evidence: string }

export function closeSlippage(deals: Data[]): Observed | null {
 const days = deals.map(d => daysBetween(d.plannedClose, d.actualClose))
 return days.length ? { key: 'close-slippage', ...spread(days), evidence: `${days.length} reviewed deals: expected close date against actual close date` } : null
}

export function hireSlippage(history: Data[]): Observed | null {
 const seen = new Map<string, number>()
 for (const h of history) if (h.slippageDays !== null && h.slippageDays !== undefined) seen.set(`${h.employeeId}|${h.plannedStartDate}|${h.actualStartDate}`, h.slippageDays)
 const days = [...seen.values()]
 return days.length ? { key: 'hire-slippage', ...spread(days), evidence: `${days.length} accepted roster hires: planned start date against actual start date` } : null
}

/** Observed days from invoice to payment, less the DSO the linked contract planned. */
export function collectionLag(deals: Data[], contracts: Data[]): Observed | null {
 const dso = new Map(contracts.filter(c => c.kind === 'contract').map(c => [c.originId, c.dsoDays as number]))
 const days = deals.filter(d => d.contract && d.invoiceDate && d.paidDate && dso.has(d.contract)).map(d => daysBetween(d.invoiceDate, d.paidDate) - dso.get(d.contract)!)
 return days.length ? { key: 'collection-lag', ...spread(days), evidence: `${days.length} paid invoices linked to contracts: observed days to payment against each contract's planned DSO` } : null
}

export type Change = { kind: 'revenue' | 'position'; originId: string; name: string; field: string; from: string | number; to: string | number }
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The revised inputs for a forecast whose first open month is `firstOpen`.
 * Only inputs that have not started by then move; started work is history. */
export function revise(key: MeasureKey, days: number, inputs: Data, workspace: Data, firstOpen: string): { inputs: Data; changes: Change[] } {
 const changes: Change[] = []
 const revised = { ...inputs }
 if (key === 'close-slippage') revised.revenue = (inputs.revenue ?? []).map((r: Data) => {
  if (r.kind !== 'contract' || r.start < firstOpen) return r
  const startDate = addDays(r.startDate, days), start = datePeriod(workspace as any, startDate)
  changes.push({ kind: 'revenue', originId: r.originId, name: r.name, field: 'startDate', from: r.startDate, to: startDate })
  return { ...r, startDate, start }
 })
 if (key === 'hire-slippage') revised.position = (inputs.position ?? []).map((p: Data) => {
  if (p.start < firstOpen) return p
  const from = p.plannedStartDate || `${p.start}-01`, plannedStartDate = addDays(from, days), start = datePeriod(workspace as any, plannedStartDate)
  changes.push({ kind: 'position', originId: p.originId, name: p.title, field: 'start', from: p.start, to: start })
  return { ...p, start, ...(p.plannedStartDate ? { plannedStartDate } : {}), ...(p.end && p.end < start ? { end: start } : {}) }
 })
 if (key === 'collection-lag') revised.revenue = (inputs.revenue ?? []).map((r: Data) => {
  if (r.kind !== 'contract' || r.start < firstOpen) return r
  const dsoDays = clamp(r.dsoDays + days, 0, 365)
  if (dsoDays === r.dsoDays) return r
  changes.push({ kind: 'revenue', originId: r.originId, name: r.name, field: 'dsoDays', from: r.dsoDays, to: dsoDays })
  return { ...r, dsoDays }
 })
 return { inputs: revised, changes }
}

/** Per-contract forecast collections by month, for the collection-lag backtest. */
export const collectionsByMonth = (calc: Calculation, contracts: Set<string>) => {
 const out = new Map<string, number>()
 for (const r of calc.contracts?.rows ?? []) if (contracts.has(r.originId) && r.collections) out.set(r.month, (out.get(r.month) ?? 0) + r.collections)
 return out
}
