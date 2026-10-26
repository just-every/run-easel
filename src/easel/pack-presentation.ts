import { monthLabel } from './months'
import { usDate } from './date-format'
import type { Data } from './types'

/** Format captured dates without changing the evidence stored in the snapshot. */
export function packDate(body: Data, value?: string | null): string {
 if (!value) return '—'
 const timestamp = value.includes('T'), date = new Date(timestamp ? value : `${value}T00:00:00Z`)
 if (!Number.isFinite(date.getTime())) return value
 if (!timestamp) return usDate(value, body.presentation?.dateFormat)
 const timeZone = body.presentation?.timeZone ?? 'UTC'
 const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date)
 const part = (type: string) => parts.find(p => p.type === type)!.value
 const day = usDate(`${part('year')}-${part('month')}-${part('day')}`, body.presentation?.dateFormat)
 const time = new Intl.DateTimeFormat(body.presentation?.locale ?? 'en-AU', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone }).format(date)
 return `${day} at ${time}`
}

export const packChartMonth = (month: string) => monthLabel(month).replace(/ (\d{2})(\d{2})$/, ' $2')
