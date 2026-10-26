import type { BillingObservation } from './billing-provider'
import { addMonths, month } from './months'
import { mulDiv } from './units'
import { requireThat } from './types'

export type BillingBridgeRow = {
 month: string
 currency: string
 openingMrrCents: number
 newMrrCents: number
 expansionMrrCents: number
 contractionMrrCents: number
 churnMrrCents: number
 reactivationMrrCents: number
 endingMrrCents: number
 arrCents: number
 activeCustomers: number
 grossRevenueRetentionBps: number | null
 netRevenueRetentionBps: number | null
 revenueCents: number
 deferredCents: number
 refundsCents: number
 taxCents: number
}

export type BillingCohortRow = {
 cohortMonth: string
 month: string
 currency: string
 customers: number
 activeCustomers: number
 mrrCents: number
}

const add = (a: number, b: number) => {
 const total = a + b
 requireThat(Number.isSafeInteger(total), 'Billing metrics exceed exact integer precision')
 return total
}

export function calculateBilling(observations: BillingObservation[], months: string[]): { bridge: BillingBridgeRow[]; cohorts: BillingCohortRow[] } {
 requireThat(Array.isArray(observations) && Array.isArray(months) && months.length > 0, 'Choose billing observations and months')
 const selected = [...new Set(months.map(m => month(m)))].sort()
 requireThat(selected.length === months.length && selected.every((m, i) => i === 0 || m === addMonths(selected[i - 1], 1)), 'Billing months must be unique and consecutive')
 const earliest = observations.reduce((result, row) => row.month < result ? row.month : result, selected[0])
 const currencies = new Set<string>()
 const customers = new Map<string, Map<string, number>>()
 const totals = new Map<string, { revenueCents: number; deferredCents: number; refundsCents: number; taxCents: number }>()
 const seen = new Set<string>()
 for (const row of observations) {
  month(row.month)
  requireThat(typeof row.customerId === 'string' && !!row.customerId && typeof row.subscriptionId === 'string' && !!row.subscriptionId, 'Billing observation needs customer and subscription identifiers')
  requireThat(typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency), 'Billing observation needs an ISO currency')
  for (const field of ['mrrCents', 'revenueCents', 'deferredCents', 'refundsCents', 'taxCents'] as const) requireThat(Number.isSafeInteger(row[field]) && (field === 'mrrCents' || field === 'refundsCents' || field === 'taxCents' ? row[field] >= 0 : true), `Billing observation has an invalid ${field}`)
  const unique = JSON.stringify([row.month, row.currency, row.customerId, row.subscriptionId])
  requireThat(!seen.has(unique), 'Billing observation contains a duplicate subscription month')
  seen.add(unique)
  currencies.add(row.currency)
  const key = JSON.stringify([row.currency, row.month])
  const customer = JSON.stringify([row.currency, row.customerId])
  const byCustomer = customers.get(key) ?? new Map<string, number>()
  byCustomer.set(customer, add(byCustomer.get(customer) ?? 0, row.mrrCents))
  customers.set(key, byCustomer)
  const current = totals.get(key) ?? { revenueCents: 0, deferredCents: 0, refundsCents: 0, taxCents: 0 }
  current.revenueCents = add(current.revenueCents, row.revenueCents)
  current.deferredCents = add(current.deferredCents, row.deferredCents)
  current.refundsCents = add(current.refundsCents, row.refundsCents)
  current.taxCents = add(current.taxCents, row.taxCents)
  totals.set(key, current)
 }
 const bridge: BillingBridgeRow[] = []
 const cohorts: BillingCohortRow[] = []
 for (const currency of [...currencies].sort()) {
  const firstActive = new Map<string, string>()
  const everActive = new Set<string>()
  let prior = new Map<string, number>()
  for (let value = earliest; value <= selected[selected.length - 1]; value = addMonths(value, 1)) {
   const key = JSON.stringify([currency, value])
   const current = customers.get(key) ?? new Map<string, number>()
   let openingMrrCents = 0, newMrrCents = 0, expansionMrrCents = 0, contractionMrrCents = 0, churnMrrCents = 0, reactivationMrrCents = 0, endingMrrCents = 0, activeCustomers = 0
   for (const previous of prior.values()) openingMrrCents = add(openingMrrCents, previous)
   for (const customer of new Set([...prior.keys(), ...current.keys()])) {
    const before = prior.get(customer) ?? 0, after = current.get(customer) ?? 0
    if (after > 0) {
     endingMrrCents = add(endingMrrCents, after)
     activeCustomers++
     if (!everActive.has(customer)) firstActive.set(customer, value)
    }
    if (before === 0 && after > 0) {
     if (everActive.has(customer)) reactivationMrrCents = add(reactivationMrrCents, after)
     else newMrrCents = add(newMrrCents, after)
    } else if (before > 0 && after === 0) churnMrrCents = add(churnMrrCents, before)
    else if (before > 0 && after > before) expansionMrrCents = add(expansionMrrCents, after - before)
    else if (before > after && after > 0) contractionMrrCents = add(contractionMrrCents, before - after)
    if (after > 0) everActive.add(customer)
   }
   requireThat(endingMrrCents === add(add(add(openingMrrCents, newMrrCents), expansionMrrCents), reactivationMrrCents) - contractionMrrCents - churnMrrCents, 'Billing MRR bridge does not reconcile')
   if (selected.includes(value)) {
    const source = totals.get(key) ?? { revenueCents: 0, deferredCents: 0, refundsCents: 0, taxCents: 0 }
    bridge.push({ month: value, currency, openingMrrCents, newMrrCents, expansionMrrCents, contractionMrrCents, churnMrrCents, reactivationMrrCents, endingMrrCents, arrCents: add(0, endingMrrCents * 12), activeCustomers, grossRevenueRetentionBps: openingMrrCents ? mulDiv(openingMrrCents - contractionMrrCents - churnMrrCents, 10000, openingMrrCents) : null, netRevenueRetentionBps: openingMrrCents ? mulDiv(openingMrrCents + expansionMrrCents - contractionMrrCents - churnMrrCents, 10000, openingMrrCents) : null, ...source })
    for (const cohortMonth of [...new Set(firstActive.values())].sort()) {
     const members = [...firstActive].filter(([, first]) => first === cohortMonth).map(([id]) => id)
     cohorts.push({ cohortMonth, month: value, currency, customers: members.length, activeCustomers: members.filter(id => (current.get(id) ?? 0) > 0).length, mrrCents: members.reduce((sum, id) => add(sum, current.get(id) ?? 0), 0) })
    }
   }
   prior = current
  }
 }
 return { bridge, cohorts }
}
