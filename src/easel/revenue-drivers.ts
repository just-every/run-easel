import type { Source } from './engine'
import { addMonths, monthLabel } from './months'
import { formatBps, formatHundredths, formatMoney, mulDiv } from './units'
import { requireThat, type Data } from './types'

export type RevenueEmission = (month: string, source: Source) => void

function safe(value: number, name: string): number {
 requireThat(Number.isSafeInteger(value) && value >= 0, `${name}: revenue calculation exceeds the supported exact range`)
 return value
}

/** Returns false only for the two legacy forms, whose arithmetic is unchanged.
 * Run from the driver's start even before the horizon so opening quantities,
 * expansion and backlog do not reset when the plan window changes. */
export function libraryRevenue(r: Data, positions: Data[], lastMonth: string, currency: string, emit: RevenueEmission): boolean {
 if (r.kind === 'volume' || r.kind === 'customers') return false
 requireThat(['seats', 'usage', 'services', 'milestones', 'backlog'].includes(r.kind), 'Unknown revenue driver')
 const money = (n: number) => formatMoney(n, currency)
 const source = (month: string, amount: number, trace: string) => emit(month, { kind: 'revenue', id: r.originId, label: r.name, amount: safe(amount, r.name), trace: `${monthLabel(month)}: ${r.name}; ${trace}` })
 if (r.kind === 'milestones') {
  for (const milestone of r.milestones) source(milestone.month, milestone.amountCents, `project milestone ${milestone.name} in ${monthLabel(milestone.month)} recognizes ${money(milestone.amountCents)}; collected ${r.collectionLag} month(s) later`)
  return true
 }
 let quantity = r.kind === 'seats' ? r.startSeats : r.startUsage
 let backlog = r.openingBacklogCents
 for (let index = 0, month = r.start; month <= lastMonth; index++, month = addMonths(month, 1)) {
  if (r.kind === 'seats' || r.kind === 'usage') {
   const seats = r.kind === 'seats', growth = seats ? r.expansionBps : r.growthBps, price = seats ? r.priceCents : r.unitPriceCents
   const prior = quantity
   if (index > 0) quantity = safe(mulDiv(quantity, 10000 + growth, 10000), r.name)
   const amount = mulDiv(quantity, price, 100)
   source(month, amount, `${seats ? 'seats' : 'usage units'} ${formatHundredths(quantity)}${index === 0 ? ' (starting quantity; expansion/growth begins next month)' : ` = prior ${formatHundredths(prior)} × (1 + ${formatBps(growth)} monthly ${seats ? 'expansion' : 'growth'}), rounded to hundredths`} × ${money(price)} per ${seats ? 'seat per month' : 'unit'} = ${money(amount)}`)
  } else if (r.kind === 'services') {
   const actual = r.gaugeActuals?.[month]
   if (actual) {
    const g = actual.source
    source(month, actual.amountCents, `Gauge agency-wide operational utilization actuals at planned rate (not ledger revenue); ${g.from} through ${g.to}; ${g.participantCount} participants; ${g.availableSeconds} available seconds; ${g.approvedBillableSeconds} approved billable seconds × ${money(actual.hourlyRateCents)} per hour / 3600 = ${money(actual.amountCents)}; rounded once half away from zero; source ${g.origin}; digest ${actual.digest}; observed ${g.asOf}`)
    continue
   }
   const count = positions.filter(p => p.department === r.department && p.start <= month && (!p.end || month <= p.end)).length
   // One mulDiv across all factors, with no intermediate billable-hours rounding.
   // Check integer products before multiplying as Numbers so precision is never lost.
   const hours = safe(Number(BigInt(count) * BigInt(r.monthlyHours)), r.name)
   const rate = safe(Number(BigInt(r.utilizationBps) * BigInt(r.hourlyRateCents)), r.name)
   const amount = mulDiv(hours, rate, 1000000)
   source(month, amount, `${count} active positions in this department × ${formatHundredths(r.monthlyHours)} available hours per position per month × ${formatBps(r.utilizationBps)} utilization × ${money(r.hourlyRateCents)} per hour = ${money(amount)}; one division rounds half away from zero to cents; all active positions in this department are assumed billable; no individual pay detail is used`)
  } else {
   const opening = backlog, available = safe(opening + r.monthlyAdditionsCents, r.name)
   const amount = Math.min(available, mulDiv(available, r.burnBps, 10000))
   backlog = available - amount
   source(month, amount, `opening backlog ${money(opening)} + additions ${money(r.monthlyAdditionsCents)} at the start of the month = available ${money(available)} × ${formatBps(r.burnBps)} recognized this month = ${money(amount)} (capped at available backlog); closing backlog ${money(backlog)}; additions are bookings, not additional revenue`)
  }
 }
 return true
}
