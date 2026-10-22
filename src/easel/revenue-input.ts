// Fixed revenue forms. Stored quantities are hundredths, money cents and
// percentages basis points; explicit forms never masquerade as customers.
import { contractDate } from './contract-revenue'
import { month } from './months'
import { datePeriod, type CalendarWorkspace } from './fiscal-calendar'
import { cents, decimal, hundredths, percentBps } from './units'
import { choice, integer, requireThat, text, type Data } from './types'

export function libraryRevenueInput(b: Data, base: Data, workspace: CalendarWorkspace): Data | undefined {
 if (b.kind === 'contract') {
  const startDate = contractDate(b.startDate)
  requireThat(datePeriod(workspace, startDate) === base.start, workspace.calendar && workspace.calendar !== 'calendar-month' ? 'Contract start date must be in the selected start period' : 'Contract start date must be in the start month')
  return { ...base, kind: 'contract', startDate, contractValueCents: cents(b.contractValue, 'Total contract value'), termMonths: integer(b.termMonths, 'Contract term (months)', 1, 120), billingCadence: choice(b.billingCadence, ['monthly', 'quarterly', 'annual'] as const, 'an upfront billing cadence'), dsoDays: integer(b.dsoDays ?? 0, 'DSO (days)', 0, 365) }
 }
 if (b.kind === 'seats') return { ...base, kind: 'seats', startSeats: hundredths(b.startSeats, 'Starting seats'), expansionBps: percentBps(b.expansionPercent ?? '0', 'Monthly seat expansion %', 1000), priceCents: cents(b.price, 'Monthly price per seat') }
 if (b.kind === 'usage') {
  const growthBps = decimal(b.growthPercent ?? '0', 'Monthly usage growth %', 2, { negative: true, max: 100000n })
  requireThat(growthBps >= -10000, 'Monthly usage growth cannot be below -100%')
  const metric = typeof b.warehouseMetric === 'string' ? b.warehouseMetric.trim() : ''
  requireThat(!metric || /^[a-z][a-z0-9_]{0,59}$/.test(metric), 'Warehouse metric names use lowercase letters, digits and underscores')
  return { ...base, kind: 'usage', startUsage: hundredths(b.startUsage, 'Starting monthly usage'), growthBps, unitPriceCents: cents(b.unitPrice, 'Price per usage unit'), ...(metric ? { warehouseMetric: metric } : {}) }
 }
 if (b.kind === 'services') return { ...base, kind: 'services', monthlyHours: hundredths(b.monthlyHours, 'Monthly available hours per active position'), utilizationBps: percentBps(b.utilizationPercent, 'Billable utilization %'), hourlyRateCents: cents(b.hourlyRate, 'Billable hourly rate') }
 if (b.kind === 'milestones') {
  requireThat(Array.isArray(b.milestones) && b.milestones.length > 0 && b.milestones.length <= 200, 'Enter 1 to 200 project milestones')
  const milestones = b.milestones.map((entry: unknown) => {
   requireThat(entry && typeof entry === 'object' && !Array.isArray(entry), 'Each milestone needs a name, month and amount')
   const row = entry as Data, period = month(row.month, 'Milestone month')
   requireThat(period >= base.start, 'A milestone cannot precede the revenue start month')
   return { name: text(row.name, 'Milestone name'), month: period, amountCents: cents(row.amount, 'Milestone amount') }
  })
  requireThat(new Set(milestones.map(m => m.name.toLowerCase())).size === milestones.length, 'Give every milestone a distinct name')
  requireThat(Number.isSafeInteger(milestones.reduce((sum, m) => sum + m.amountCents, 0)), 'Total milestone revenue is too large')
  return { ...base, kind: 'milestones', milestones }
 }
 if (b.kind === 'backlog') return { ...base, kind: 'backlog', openingBacklogCents: cents(b.openingBacklog, 'Opening backlog'), monthlyAdditionsCents: cents(b.monthlyAdditions ?? '0', 'Monthly backlog additions'), burnBps: percentBps(b.burnPercent, 'Monthly backlog recognition %') }
 return undefined
}
