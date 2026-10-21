// Day-level hiring dates are explicit; monthly starts never invent a day.
import { all, optionalText, requireThat, type Data, type State } from './types'
import { percentBps } from './units'
import { datePeriod } from './fiscal-calendar'
import { workspace } from './model'

export function headcountInput(s: State, b: Data, scenario: string, start: string) {
 const plannedStartDate = optionalText(b.plannedStartDate, 'Planned start date', 10)
 if (plannedStartDate) {
  const date = new Date(`${plannedStartDate}T00:00:00Z`)
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(plannedStartDate) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === plannedStartDate, 'Use a real ISO planned start date')
  const w = workspace(s)
  requireThat(datePeriod(w, plannedStartDate) === start, w.calendar && w.calendar !== 'calendar-month' ? 'Planned start date must be in the selected start period' : 'Planned start date must be in the start month')
 }
 const backfillOrigin = optionalText(b.backfillOrigin, 'Backfilled position', 100)
 if (backfillOrigin) {
  const prior = all(s,'position').find(p => p.scenario === scenario && p.originId === backfillOrigin)
  requireThat(prior && prior.department === b.department && prior.originId !== b.originId, 'Choose a different existing position in this department to backfill')
  let ancestor: Data | undefined = prior
  const seen = new Set<string>()
  while (ancestor) {
   requireThat(ancestor.originId !== b.originId && !seen.has(ancestor.originId), 'Backfill links cannot form a cycle')
   seen.add(ancestor.originId)
   ancestor = all(s,'position').find(p => p.scenario === scenario && p.originId === ancestor!.backfillOrigin)
  }
  requireThat(prior.start < start, 'A backfill must start after the replaced position start month')
 }
 for (const next of all(s,'position').filter(p => p.scenario === scenario && p.backfillOrigin === b.originId)) requireThat(next.department === b.department && start < next.start, 'Keep the replaced position in the backfill department and before its start month')
 return { plannedStartDate, backfillOrigin, attritionBps: percentBps(b.attritionPercent ?? '0', 'Monthly attrition assumption %') }
}
