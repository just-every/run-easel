import { decimalText, money, monthLabel, type D } from './shared'
import { semanticEqual } from '../easel/semantic'

const labels: Record<string, string> = {
 payBasis: 'pay basis', expectedHours: 'expected hours per period', benefitsCents: 'benefits per person per period', retirementMatchBps: '401(k) employer match estimate',
 commissionPosition: 'commission position (planning estimate)', commissionRateBps: 'commission rate (planning estimate)', startDate: 'contract start date', contractValueCents: 'total contract value', termMonths: 'contract term', billingCadence: 'upfront billing cadence', dsoDays: 'DSO',
 startSeats: 'starting seats', expansionBps: 'monthly seat expansion', priceCents: 'monthly price per seat', startUsage: 'starting monthly usage', unitPriceCents: 'price per usage unit', monthlyHours: 'monthly available hours per position', utilizationBps: 'billable utilization', hourlyRateCents: 'billable hourly rate', milestones: 'project milestones', openingBacklogCents: 'opening backlog', monthlyAdditionsCents: 'monthly backlog additions', burnBps: 'monthly backlog recognition',
 name: 'name', title: 'title', holder: 'person', line: 'planning line', department: 'department', sourceDepartment: 'shared department', repDepartment: 'hiring department', kind: 'driver', start: 'start month', end: 'end month', collectionLag: 'collection timing', startVolume: 'starting volume', growthBps: 'monthly growth', rateCents: 'rate per unit', startCustomers: 'starting customers', newPerMonth: 'new customers per month', newPerRep: 'new customers per ramped hire', rampMonths: 'ramp months', churnBps: 'monthly churn', arpaCents: 'monthly revenue per customer', annualSalaryCents: 'annual salary', onCostBps: 'on-costs', amountCents: 'amount', basis: 'allocation basis', targets: 'receiving departments', values: 'monthly amounts',
}
const words: Record<string, string> = { contract: 'Contract bookings and upfront billing', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', volume: 'Volume × rate', customers: 'Customers × revenue per customer', seats: 'Seats × price with expansion', usage: 'Usage × unit price', services: 'Billable headcount × utilization × rate', milestones: 'Project milestones', backlog: 'Backlog burn-down', recurring: 'Recurring', 'one-off': 'One-off', headcount: 'Headcount', fixed: 'Fixed shares' }
const lookup = (side: D, key: string, id: string) => side[key]?.find((r: D) => r.id === id)?.name ?? (key === 'lines' ? 'Deleted planning line' : 'Deleted department')
function format(key: string, value: any, side: D): string {
 if (value === undefined || value === null || value === '') return '—'
 if (key === 'line') return lookup(side, 'lines', value)
 if (['department', 'sourceDepartment', 'repDepartment'].includes(key)) return lookup(side, 'departments', value)
 if (key === 'start' || key === 'end') return monthLabel(value)
 if (key.endsWith('Cents')) return money(value, side.workspace.currency)
 if (key.endsWith('Bps')) return `${decimalText(value)}%`
 if (['startVolume', 'startCustomers', 'newPerMonth', 'newPerRep', 'startSeats', 'startUsage', 'monthlyHours', 'expectedHours'].includes(key)) return decimalText(value)
 if (key === 'milestones') return value.map((m: D) => `${m.name}: ${monthLabel(m.month)} ${money(m.amountCents, side.workspace.currency)}`).join('; ')
 if (key === 'collectionLag' || key === 'rampMonths' || key === 'termMonths') return `${value} ${value === 1 ? 'month' : 'months'}`
 if (key === 'dsoDays') return `${value} ${value === 1 ? 'day' : 'days'}`
 if (key === 'targets') return value.map((t: D) => `${lookup(side, 'departments', t.department)}${t.bps === undefined ? '' : ` ${decimalText(t.bps)}%`}`).join(', ')
 if (key === 'values') return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([m, n]) => `${monthLabel(m)} ${money(n as number, side.workspace.currency)}`).join('; ')
 return words[value] ?? String(value)
}
/** Only editable assumptions are shown: provenance and identity metadata stay out. */
export function assumptionText(change: D, comparison: D) {
 const before = change.before ?? {}, after = change.after ?? {}
 const fields = Object.keys(labels).filter(key => (key in before || key in after) && !semanticEqual(before[key], after[key]))
 const details = fields.map(key => `${key === 'kind' && change.kind === 'expense' ? 'expense type' : labels[key]} ${format(key, before[key], comparison.left)} → ${format(key, after[key], comparison.right)}`)
 const verb = change.change === 'added' ? 'Added' : change.change === 'removed' ? 'Removed' : 'Changed'
 return `${verb} ${change.kind}: ${change.name ?? 'Unnamed assumption'}${details.length ? `, ${details.join('; ')}` : ''}`
}
