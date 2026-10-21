import { addMonths, month, monthLabel, monthsBetween } from './months'
import { requireThat } from './types'

export type CalendarWorkspace = {
 planStart: string
 horizon: number
 fiscalYearStart?: number
 calendar?: 'calendar-month' | '4-4-5' | '5-4-4'
 retailStartDate?: string
}

export type FiscalPeriod = {
 key: string
 label: string
 startDate: string
 endDate: string
 weeks: number | null
 fiscalYear: string
 quarter: number
 period: number
}

const DAY = 86_400_000
const RETAIL_YEAR = 364 * DAY
const kind = (w: CalendarWorkspace) => w.calendar === undefined ? 'calendar-month' : w.calendar

function validKey(value: string): string {
 requireThat(typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1, 'Period must be written YYYY-MM with a year from 0001 to 9999')
 return value
}

/** setUTCFullYear avoids Date.UTC's special interpretation of years 00–99. */
function utc(year: number, monthIndex: number, day: number): number {
 const date = new Date(0)
 date.setUTCFullYear(year, monthIndex, day)
 return date.getTime()
}

function isoDate(value: number): string {
 const date = new Date(value)
 requireThat(Number.isFinite(value) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999, 'Calendar date must have a year from 0001 to 9999')
 return date.toISOString().slice(0, 10)
}

function parseDate(value: string): number {
 requireThat(typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) && Number(value.slice(0, 4)) >= 1, 'Date must be a valid Gregorian date written YYYY-MM-DD')
 const time = utc(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
 requireThat(isoDate(time) === value, 'Date must be a valid Gregorian date written YYYY-MM-DD')
 return time
}

function keyAt(w: CalendarWorkspace, offset: number): string {
 const key = addMonths(w.planStart, offset)
 const [year, month] = key.split('-')
 return validKey(`${year.padStart(4, '0')}-${month}`)
}

function pattern(w: CalendarWorkspace): number[] {
 return kind(w) === '4-4-5' ? [4, 4, 5] : [5, 4, 4]
}

export function validateCalendar(w: CalendarWorkspace): void {
 month(w.planStart, 'First plan month')
 const firstMonth = w.fiscalYearStart === undefined ? Number(w.planStart.slice(5, 7)) : w.fiscalYearStart
 requireThat(Number.isInteger(firstMonth) && firstMonth >= 1 && firstMonth <= 12, 'Fiscal year start month must be a whole number from 1 to 12')
 requireThat(Number(w.planStart.slice(5, 7)) === firstMonth, 'The first plan month must be the first month of a fiscal year')
 requireThat(Number.isSafeInteger(w.horizon) && w.horizon > 0, 'Plan horizon must be a positive whole number of periods')
 requireThat(['calendar-month', '4-4-5', '5-4-4'].includes(kind(w)), 'Choose calendar-month, 4-4-5 or 5-4-4')
 if (kind(w) !== 'calendar-month' || w.retailStartDate !== undefined) {
  parseDate(w.retailStartDate as string)
  requireThat(w.retailStartDate!.slice(0, 7) === w.planStart, 'Retail start date must be within the first plan month')
 }
 keyAt(w, w.horizon - 1)
}

function describe(w: CalendarWorkspace, key: string): FiscalPeriod {
 validKey(key)
 const offset = monthsBetween(w.planStart, key)
 const yearOffset = Math.floor(offset / 12)
 const periodIndex = offset - yearOffset * 12
 const fiscalYear = `FY${String(Number(w.planStart.slice(0, 4)) + yearOffset + (Number(w.planStart.slice(5, 7)) > 1 ? 1 : 0)).padStart(4, '0')}`
 const period = periodIndex + 1
 let start: number
 let end: number
 let weeks: number | null = null
 if (kind(w) === 'calendar-month') {
  const year = Number(key.slice(0, 4))
  const monthIndex = Number(key.slice(5, 7)) - 1
  start = utc(year, monthIndex, 1)
  end = utc(year, monthIndex + 1, 0)
 } else {
  const lengths = pattern(w)
  const weeksBefore = Math.floor(periodIndex / 3) * 13 + lengths.slice(0, periodIndex % 3).reduce((sum, length) => sum + length, 0)
  weeks = lengths[periodIndex % 3]
  start = parseDate(w.retailStartDate!) + yearOffset * RETAIL_YEAR + weeksBefore * 7 * DAY
  end = start + weeks * 7 * DAY - DAY
 }
 const startDate = isoDate(start)
 const endDate = isoDate(end)
 const fiscalLabel = `${fiscalYear} P${String(period).padStart(2, '0')}`
 const label = weeks === null ? `${monthLabel(key)} · ${fiscalLabel}` : `${fiscalLabel} · ${startDate}–${endDate}`
 return { key, label, startDate, endDate, weeks, fiscalYear, quarter: Math.floor(periodIndex / 3) + 1, period }
}

/** Retail keys are ordinal aliases, not Gregorian months. Boundaries are inclusive UTC dates. */
export function periodForKey(w: CalendarWorkspace, key: string): FiscalPeriod {
 validateCalendar(w)
 return describe(w, key)
}

/** Resolve dates before and after the plan without clamping to its horizon. */
export function datePeriod(w: CalendarWorkspace, date: string): string {
 validateCalendar(w)
 const time = parseDate(date)
 if (kind(w) === 'calendar-month') return date.slice(0, 7)
 const anchor = parseDate(w.retailStartDate!)
 const yearOffset = Math.floor((time - anchor) / RETAIL_YEAR)
 let day = (time - anchor - yearOffset * RETAIL_YEAR) / DAY
 const lengths = pattern(w)
 let periodIndex = 0
 while (day >= lengths[periodIndex % 3] * 7) {
  day -= lengths[periodIndex % 3] * 7
  periodIndex++
 }
 return keyAt(w, yearOffset * 12 + periodIndex)
}

export function fiscalPeriods(w: CalendarWorkspace, keys?: readonly string[]): FiscalPeriod[] {
 validateCalendar(w)
 return keys === undefined
  ? Array.from({ length: w.horizon }, (_, index) => describe(w, keyAt(w, index)))
  : keys.map(key => describe(w, key))
}
