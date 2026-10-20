// Deterministic monthly depreciation, disposal and capital expenditure rows.
import { monthsBetween } from './months'
import { formatMoney } from './units'
import { requireThat, type Data } from './types'

export type AssetMonth = {
 originId: string
 name: string
 category: string
 department: string
 line: string
 month: string
 cost: number
 openingBookValue: number
 depreciation: number
 disposalBookValue: number
 disposalProceeds: number
 closingBookValue: number
 capex: number
 expense: number
 trace: string
}

const byName = (a: Data, b: Data) => String(a.name).localeCompare(String(b.name)) || String(a.originId).localeCompare(String(b.originId))

/** Calculate exact-cent straight-line depreciation and disposal effects. */
export function calculateAssets(assets: Data[], categories: Data[], months: string[], closedThrough: string | null, currency = 'AUD', allocations: Data[] = []): AssetMonth[] {
 const categoryById = new Map(categories.map(c => [c.originId, c]))
 const requestedMonths = [...new Set(months)].sort()
 const rows: AssetMonth[] = []

 for (const asset of [...assets].sort(byName)) {
  const category = categoryById.get(asset.category)
  requireThat(category, `${asset.name}: asset category is missing`, 409)
  const life = asset.kind === 'existing' ? asset.remainingLifeMonths : category.usefulLifeMonths
  const cost = asset.costCents
  const initialBookValue = asset.kind === 'existing' ? cost - asset.openingAccumulatedCents : cost
  const baseDepreciation = Math.floor(initialBookValue / life)
  const paymentMonth = asset.kind === 'purchase' ? (asset.paymentMonth || asset.start) : ''
  const scheduleMonths = [...new Set([...requestedMonths, ...(paymentMonth ? [paymentMonth] : [])])].sort()

  for (const m of scheduleMonths) {
   const allocation = allocations.find(a => a.target === 'bs:fixed-assets' && a.originId === asset.originId)
   const imported = allocation && m > allocation.month
   const age = imported ? monthsBetween(allocation.month, m) - 1 : monthsBetween(asset.start, m)
   const book = imported ? allocation.amount : initialBookValue
   const remaining = imported ? allocation.remainingLifeMonths : life
   const monthly = imported ? Math.floor(book / remaining) : baseDepreciation
   let openingBookValue = 0
   let depreciation = 0
   let disposalBookValue = 0
   let disposalProceeds = 0
   let closingBookValue = 0
   if (age >= 0 && (!asset.disposalMonth || m <= asset.disposalMonth)) {
    openingBookValue = age >= remaining ? 0 : Math.max(0, book - monthly * age)
    const isDisposal = asset.disposalMonth === m
    if (!isDisposal && age < remaining && (!asset.disposalMonth || m < asset.disposalMonth)) {
     depreciation = age === remaining - 1 ? openingBookValue : Math.min(monthly, openingBookValue)
    }
    if (isDisposal) {
     disposalBookValue = openingBookValue
     disposalProceeds = asset.disposalProceedsCents ?? 0
     closingBookValue = 0
    } else {
     closingBookValue = Math.max(0, openingBookValue - depreciation)
    }
   }
   if (allocation && m === allocation.month) closingBookValue = allocation.amount
   const capex = m === paymentMonth ? cost : 0
   const expense = depreciation + disposalBookValue - disposalProceeds
   const activity = age < 0 && capex === 0 ? 'before the asset starts' : age >= remaining && asset.disposalMonth !== m ? 'fully depreciated' : ''
   const trace = (allocation && m >= allocation.month ? `${allocation.trace} Remaining useful life ${allocation.remainingLifeMonths} months. ` : '') + (activity
    ? `${asset.name}: ${activity}${capex ? `; capital expenditure ${formatMoney(capex, currency)}` : ''}`
    : `${asset.name}: opening book value ${formatMoney(openingBookValue, currency)}${depreciation ? ` − depreciation ${formatMoney(depreciation, currency)}` : ''}${asset.disposalMonth === m ? ` − disposal book value ${formatMoney(disposalBookValue, currency)}` : ''} = closing book value ${formatMoney(closingBookValue, currency)}${asset.disposalMonth === m ? `; disposal cash proceeds ${formatMoney(disposalProceeds, currency)}, noncash book value removed ${formatMoney(disposalBookValue, currency)}` : ''}${capex ? `; capital expenditure ${formatMoney(capex, currency)}${m <= (closedThrough ?? '') ? ' (closed month)' : ''}` : ''}`
   )
   rows.push({
    originId: asset.originId, name: asset.name, category: asset.category,
    department: asset.department, line: asset.line, month: m, cost,
    openingBookValue, depreciation, disposalBookValue, disposalProceeds,
    closingBookValue, capex, expense, trace,
   })
  }
 }
 return rows.sort((a, b) => a.month.localeCompare(b.month) || a.line.localeCompare(b.line) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name) || a.originId.localeCompare(b.originId))
}
