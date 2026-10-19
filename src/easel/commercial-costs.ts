import type { ActualCell, Model, Source } from './engine'
import { addMonths, monthLabel, monthsBetween } from './months'
import { rampFactorBps } from './ramp'
import { formatHundredths, formatMoney, mulDiv } from './units'
import { requireThat, type Data } from './types'

export type InventoryMonth = { month: string; opening: number; costOfSales: number; purchases: number; closing: number; trace: string }
export type CommercialCost = { month: string; line: string; department: string; source: Source; inventory: boolean; purchases: number }
const active = (p: Data, month: string) => p.start <= month && (!p.end || month <= p.end)
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
const safe = (amount: number) => { requireThat(Number.isSafeInteger(amount) && amount >= 0 && amount <= 1e13, 'Linked cost exceeds the supported exact range'); return amount }

/** Costs follow the live revenue assumptions; inventory is an actual asset,
 * not a renamed payment lag. Source amounts remain under normal cell filtering. */
export function commercialCosts(model: Model, months: string[], actuals: ActualCell[]): { costs: CommercialCost[]; inventory: InventoryMonth[] } {
 const { inputs, scenario, workspace } = model
 const costs: CommercialCost[] = [], inventory = months.map(month => ({ month, opening: 0, costOfSales: 0, purchases: 0, closing: 0, trace: '' }))
 const money = (n: number) => formatMoney(n, workspace.currency)
 for (const e of inputs.expense.filter(e => ['acquisition', 'inventory'].includes(e.kind))) {
  const r = inputs.revenue.find(r => r.originId === e.revenueOrigin && r.department === e.department)
  requireThat(r && r.kind === (e.kind === 'inventory' ? 'volume' : 'customers'), 'A linked cost needs its original revenue driver', 409)
  let volume = r.startVolume
  const volumes = new Map<string, number>()
  if (e.kind === 'inventory') for (let month = r.start, index = 0; month <= months.at(-1)!; month = addMonths(month, 1), index++) {
   if (index) volume = safe(mulDiv(volume, 10000 + r.growthBps, 10000))
   volumes.set(month, volume)
  }
  let opening = 0
  for (const [index, month] of months.entries()) {
   if (month < e.start || month < r.start) continue
   const closed = month <= (scenario.actualsThrough ?? '')
   if (e.kind === 'acquisition') {
    const reps = r.repDepartment ? inputs.position.filter(p => p.department === r.repDepartment && active(p, month)) : []
    const capacity = reps.reduce((sum, p) => sum + rampFactorBps(monthsBetween(p.start, month), r.rampMonths), 0)
    const count = safe(r.newPerMonth + mulDiv(r.newPerRep, capacity, 10000)), amount = safe(mulDiv(count, e.cacCents, 100))
    costs.push({ month, line: e.line, department: e.department, inventory: false, purchases: 0, source: { kind: 'expense', id: e.originId, label: e.name, amount,
     trace: `${monthLabel(month)}: ${e.name}; new customers ${formatHundredths(count)} (including ramped acquisition capacity, before churn) × CAC ${money(e.cacCents)} = ${money(amount)}; revenue driver ${r.originId}; cost follows current acquisition inputs, not the existing customer base` } })
    continue
   }
   const volumeValue = volumes.get(month)
   requireThat(volumeValue !== undefined, 'The inventory source month is unavailable', 409)
   const quantity = safe(volumeValue)
   const expectedCost = safe(mulDiv(quantity, e.unitCostCents, 100))
   const recorded = actuals.filter(a => a.month === month && a.line === e.line && a.department === e.department)
   requireThat(!closed || recorded.length > 0, `Missing accepted inventory COGS for ${month}`, 409)
   const cost = closed ? safe(recorded.reduce((sum, a) => sum + a.amount, 0)) : expectedCost
   const target = safe(mulDiv(cost, e.inventoryDays, daysIn(month)))
   const purchases = safe(Math.max(0, cost + target - opening)), closing = safe(opening + purchases - cost)
   const summary = inventory[index]
   summary.opening += opening; summary.costOfSales += cost; summary.purchases += purchases; summary.closing += closing
   const trace = `${monthLabel(month)}: ${e.name}; revenue driver ${r.originId}; units ${formatHundredths(quantity)} × unit cost ${money(e.unitCostCents)} = planned COGS ${money(expectedCost)}${closed ? `; recognized accepted COGS ${money(cost)} (inventory remains a planning estimate until balance-sheet actuals)` : ''}; target closing inventory ${money(cost)} × ${e.inventoryDays} inventory days ÷ ${daysIn(month)} calendar days = ${money(target)}, rounded half away from zero; opening stock ${money(opening)} + purchases ${money(purchases)} − COGS ${money(cost)} = closing inventory ${money(closing)}; purchases never negative and excess stock is consumed before replenishment; suppliers paid ${scenario.cash?.paymentLag ?? 0} month(s) later`
   costs.push({ month, line: e.line, department: e.department, inventory: true, purchases, source: { kind: 'expense', id: e.originId, label: e.name, amount: cost, trace } })
   opening = closing
  }
 }
 for (const row of inventory) row.trace = `${row.month}: estimated inventory ${money(row.opening)} + purchases ${money(row.purchases)} − COGS ${money(row.costOfSales)} = ${money(row.closing)}. Zero opening stock; replenishment uses the entered days-of-COGS buffer and cannot create negative purchases. Supplier payment timing is separate.`
 return { costs, inventory }
}
