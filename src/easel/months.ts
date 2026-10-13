import { requireThat } from './types'

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A calendar month as YYYY-MM. */
export function month(v: unknown, label = 'Month'): string {
 requireThat(typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 2200, `${label} must be a month written YYYY-MM`)
 return v
}

export function addMonths(m: string, n: number): string {
 const index = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n
 return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export const monthsBetween = (from: string, to: string) =>
 (Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)))

export const range = (start: string, count: number) => Array.from({ length: count }, (_, i) => addMonths(start, i))

export const monthLabel = (m: string) => `${NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Australian-style fiscal year label: the year in which it ends (FY2027 = Jul 2026–Jun 2027). */
export function fiscalYearLabel(start: string): string {
 const end = addMonths(start, 11)
 return `FY${end.slice(0, 4)}`
}

/** Reads month names like "Jul-26", "Jul 2026", "2026-07" or an Excel date serial. */
export function parseMonthHeader(v: string | number): string | null {
 if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
 }
 const s = String(v).trim()
 if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s
 const m = /^([A-Za-z]{3})[a-z]*[\s\-']+(\d{2}|\d{4})$/.exec(s)
 if (!m) return null
 const index = NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase())
 if (index < 0) return null
 const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
 return `${year}-${String(index + 1).padStart(2, '0')}`
}
