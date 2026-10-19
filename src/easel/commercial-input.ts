import { cents } from './units'
import { all, get, integer, requireThat, type Data, type State } from './types'

/** Linked costs belong to the same department as their revenue driver. */
export function commercialInput(s: State, b: Data, scenario: string, base: Data): Data | undefined {
 if (!['acquisition', 'inventory'].includes(b.kind)) return
 const revenue = all(s, 'revenue').find(r => r.scenario === scenario && r.originId === b.revenueOrigin)
 requireThat(revenue && revenue.department === base.department, 'Choose a revenue driver in this scenario and department')
 requireThat(revenue.kind === (b.kind === 'inventory' ? 'volume' : 'customers'), b.kind === 'inventory' ? 'Inventory requires a units × price revenue driver' : 'Acquisition requires a customer revenue driver')
 const line = get(s, 'line', base.line)
 requireThat(!line.nonCash && !line.payroll, 'Linked commercial costs use a cash, non-payroll expense line')
 if (b.kind === 'inventory') {
  requireThat(line.type === 'cost-of-sales', 'Inventory cost belongs to a cost-of-sales line')
  requireThat(!all(s, 'expense').some(e => e.scenario === scenario && e.originId !== b.originId && e.kind === 'inventory' && e.line === base.line), 'Use a separate cost-of-sales line for each inventory driver')
  return { ...base, kind: b.kind, revenueOrigin: revenue.originId, unitCostCents: cents(b.unitCost, 'Cost per unit'), inventoryDays: integer(b.inventoryDays, 'Inventory days', 0, 365) }
 }
 return { ...base, kind: b.kind, revenueOrigin: revenue.originId, cacCents: cents(b.cac, 'Acquisition cost per new customer') }
}
