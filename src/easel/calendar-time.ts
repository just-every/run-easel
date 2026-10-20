// Planning-calendar schedule semantics in the saved IANA company zone.
// A reminder is due at 09:00 local time on the calendar day before the due
// date; an open task escalates at 09:00 local time on the first weekday
// (Monday to Friday) after it. Daylight saving changes move the UTC instant.

function zoneOffsetMs(instant: number, timeZone: string) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]))
 return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(instant / 1000) * 1000
}

/** The UTC instant of a local wall-clock time on a YYYY-MM-DD date in `timeZone`. */
export function zonedInstant(date: string, hour: number, timeZone: string) {
 const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour)
 let instant = wall - zoneOffsetMs(wall, timeZone)
 instant = wall - zoneOffsetMs(instant, timeZone)
 return new Date(instant).toISOString()
}

export const addDays = (date: string, days: number) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days)).toISOString().slice(0, 10)
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

export function firstWeekdayAfter(date: string) {
 let next = addDays(date, 1)
 while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1)
 return next
}

export const REMINDER_HOUR = 9
export const reminderAt = (due: string, zone: string) => zonedInstant(addDays(due, -1), REMINDER_HOUR, zone)
export const escalationAt = (due: string, zone: string) => zonedInstant(firstWeekdayAfter(due), REMINDER_HOUR, zone)

/** Local wall time and zone abbreviation for showing a recorded instant. */
export function zonedLabel(instant: string, timeZone: string) {
 return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant))
}
