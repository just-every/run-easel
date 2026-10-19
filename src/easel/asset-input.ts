// Asset categories and asset records share the same scenario/origin model as
// the other planning inputs. Category references use origin IDs so proposal
// copies can retain their relationships.
import { addMonths, month, monthsBetween } from './months'
import { cents } from './units'
import { all, get, integer, requireThat, text, type Data, type State } from './types'

function planMonth(s: State, value: unknown, label: string, scenario: string) {
 const m = month(value, label)
 const w = get(s, 'workspace', 'main')
 const horizon = get(s, 'scenario', scenario).horizon ?? w.horizon
 requireThat(monthsBetween(addMonths(w.planStart, -24), m) >= 0 && m <= addMonths(w.planStart, horizon - 1), `${label} must be within two years before the plan and no later than its last month`)
 return m
}

/** Validates one asset category or asset and returns its stored value. */
export function validateAssetInput(s: State, kind: 'asset-category' | 'asset', b: Data, scenario: string): Data {
 if (kind === 'asset-category') {
  return {
   name: text(b.name, 'Asset category name'),
   usefulLifeMonths: integer(b.usefulLifeMonths, 'Useful life (months)', 1, 1200),
  }
 }

 const name = text(b.name, 'Asset name')
 const categoryOriginId = text(b.category, 'Asset category')
 const category = all(s, 'asset-category').find(c => c.originId === categoryOriginId && c.scenario === scenario)
 requireThat(category, 'Asset category not found in this scenario', 404)
 const categoryId = category.originId
 const department = get(s, 'department', b.department, 'department').id
 const selectedLine = get(s, 'line', b.line, 'line')
 requireThat(['operating-expense', 'cost-of-sales'].includes(selectedLine.type) && selectedLine.payroll !== true && selectedLine.nonCash === true, 'Asset line must be a non-cash, non-payroll operating expense or cost-of-sales line')
 const assetKind = b.kind
 requireThat(assetKind === 'purchase' || assetKind === 'existing', 'Choose purchase or existing')
 const w = get(s, 'workspace', 'main')
 const start = assetKind === 'existing' ? month(w.planStart, 'Plan start month') : planMonth(s, b.start, 'Start month', scenario)
 if (assetKind === 'existing') requireThat(b.start === undefined || b.start === '' || month(b.start, 'Start month') === start, 'An existing asset must start in the plan start month')
 const costCents = cents(b.cost, 'Asset cost')
 const paymentMonth = assetKind === 'purchase'
  ? month(b.paymentMonth ?? start, 'Payment month')
  : ''
 const openingAccumulatedCents = assetKind === 'existing' ? cents(b.openingAccumulated ?? '0', 'Opening accumulated depreciation') : 0
 requireThat(openingAccumulatedCents <= costCents, 'Opening accumulated depreciation cannot exceed asset cost')
 const categoryLife = integer(category.usefulLifeMonths, 'Useful life (months)', 1, 1200)
 const remainingLifeMonths = assetKind === 'existing'
  ? integer(b.remainingLifeMonths ?? categoryLife, 'Remaining useful life (months)', 1, categoryLife)
  : categoryLife
 const disposalMonth = b.disposalMonth === undefined || b.disposalMonth === null || b.disposalMonth === '' ? '' : month(b.disposalMonth, 'Disposal month')
 requireThat(!disposalMonth || disposalMonth >= start, 'Disposal month must not be before the start month')
 const disposalProceedsCents = disposalMonth ? cents(b.disposalProceeds ?? '0', 'Disposal proceeds') : 0

 return {
  name, category: categoryId, department, line: selectedLine.id, kind: assetKind,
  start, ...(assetKind === 'purchase' ? { paymentMonth } : {}), costCents,
  ...(assetKind === 'existing' ? { openingAccumulatedCents, remainingLifeMonths } : {}),
  disposalMonth, disposalProceedsCents,
 }
}
