// The cash behind each month, split the way finance reads it: collections in, payroll and other spend out, and
// financing (draws, equity, principal repayments and interest). Every planned or accepted cash event the engine
// times is tagged with its line, department and input, so the drivers of any month's closing cash add up to that
// month's cash row exactly. Payroll stays per line and department, never per position.
import type { Line } from './engine'

export type Driver = 'collections' | 'payroll' | 'spend' | 'financing'
/** One cash event as the engine times it; `source` is the input's origin id where one input caused it. */
export type TaggedCash = { month: string; date?: string; assumedDate?: boolean; amount: number; collection: boolean; label: string; line?: string; department?: string; source?: string }
/** Signed: collections and financing inflows positive, payments negative. */
export type CashDriver = { month: string; driver: Driver; line: string; department: string; source: string; label: string; amount: number }

export function cashDrivers(events: TaggedCash[], lines: Line[], interestLines: Set<string>, months: string[]): CashDriver[] {
 const byId = new Map(lines.map(l => [l.id, l])), inHorizon = new Set(months)
 const out = new Map<string, CashDriver>()
 for (const e of events) {
  if (!inHorizon.has(e.month) || e.amount === 0) continue
  const line = e.line ? byId.get(e.line) : undefined
  const driver: Driver = e.line && interestLines.has(e.line) ? 'financing' : e.collection ? 'collections' : line?.payroll ? 'payroll' : 'spend'
  // Payroll is reported per line and department so no position's pay is recoverable from a total.
  const source = driver === 'payroll' ? '' : e.source ?? ''
  const label = driver === 'payroll' ? line?.name ?? e.label : e.label
  const key = [e.month, driver, e.line ?? '', e.department ?? '', source, source || e.line ? '' : label].join('|')
  const row = out.get(key) ?? { month: e.month, driver, line: e.line ?? '', department: e.department ?? '', source, label, amount: 0 }
  row.amount += e.collection ? e.amount : -e.amount
  out.set(key, row)
 }
 return [...out.values()].filter(r => r.amount !== 0).sort((a, b) => a.month.localeCompare(b.month) || a.driver.localeCompare(b.driver) || b.amount - a.amount)
}

/** A reader without finance sees financing as one total and other departments' cash without its inputs. */
export function restrictDrivers(rows: CashDriver[], finance: boolean, seesDepartment: (department: string) => boolean): CashDriver[] {
 if (finance) return rows
 const out = new Map<string, CashDriver>()
 for (const row of rows) {
  const hidden = row.driver === 'financing' ? { line: '', department: '', source: '', label: 'Financing' } : row.department && !seesDepartment(row.department) ? { source: '', label: 'Detail restricted to finance and this department' } : {}
  const next = { ...row, ...hidden }
  const key = [next.month, next.driver, next.line, next.department, next.source, next.label].join('|')
  const prior = out.get(key)
  out.set(key, prior ? { ...prior, amount: prior.amount + next.amount } : next)
 }
 return [...out.values()]
}
