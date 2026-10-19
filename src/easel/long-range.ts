// Annual strategy stays linked to the operating budget; targets never replace
// bottom-up year one. Later years are explicit annual planning assumptions.
import { requireFinance, requireMember } from './access'
import type { Context } from './context'
import { addMonths } from './months'
import { workspace } from './model'
import { cents, decimal, mulDiv } from './units'
import { all, get, integer, put, requireThat, text, uid, type Data } from './types'
import { scenarioView } from './views'
import { snapshot } from './store'

const growth = (v: unknown, label: string) => {
 const n = decimal(v, label, 2, { negative: true, max: 100000n })
 requireThat(n >= -10000, `${label} cannot be below -100%`)
 return n
}
const margin = (v: unknown, label: string) => {
 const n = decimal(v, label, 2, { negative: true, max: 100000n })
 requireThat(n <= 10000, `${label} cannot exceed 100%`)
 return n
}
const total = (rows: Data[], field: string) => rows.reduce((sum, row) => sum + row[field], 0)

export async function longRange(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'long-range-save') return undefined
 requireFinance(c.x)
 const budget = get(c.s, 'scenario', b.budget, 'operating budget')
 requireThat(budget.kind === 'budget', 'Year one must link to the operating budget')
 requireThat(budget.revision === Number(b.budgetRevision), 'The operating budget changed; review it again', 409)
 const prior = b.id ? get(c.s, 'long-range', b.id, 'long-range plan') : null
 requireThat(!prior || prior.revision === Number(b.revision), 'The long-range plan changed; reload before saving', 409)
 const years = integer(b.years, 'Annual plan years', 3, 5)
 requireThat(Array.isArray(b.drivers) && b.drivers.length === years - 1 && b.drivers.every((d: unknown) => d && typeof d === 'object' && !Array.isArray(d)), 'Enter annual drivers for each year after year one')
 requireThat(b.targets && typeof b.targets === 'object', 'Enter the long-range targets')
 const plan = {
  name: text(b.name, 'Long-range plan name'), budget: budget.id, years,
  currency: (await scenarioView(c, budget.id)).workspace.currency,
  revision: (prior?.revision ?? 0) + 1,
  priorYearRevenueCents: cents(b.priorYearRevenue, 'Prior-year revenue'),
  targets: { growthBps: growth(b.targets.growthPercent, 'Target annual revenue growth'), marginBps: margin(b.targets.marginPercent, 'Target operating margin'), headcount: integer(b.targets.headcount, 'Target year-end headcount', 0, 100000), cashCents: cents(b.targets.cash, 'Target year-end cash', { negative: true }) },
  drivers: b.drivers.map((d: Data, i: number) => ({ growthBps: growth(d.growthPercent, `Year ${i + 2} revenue growth`), marginBps: margin(d.marginPercent, `Year ${i + 2} operating margin`), headcountChange: integer(d.headcountChange, `Year ${i + 2} headcount change`, -100000, 100000), cashChangeCents: cents(d.cashChange, `Year ${i + 2} net cash change`, { negative: true }) })),
  updatedBy: c.x.actor.email, updatedAt: c.now,
 }
 const id = prior?.id ?? uid()
 // Validate every projected year before the fenced save publishes anything.
 await annualView(c, { ...plan, id })
 put(c.s, 'long-range', id, plan)
 c.activity.push({ action: op, record: id, scenario: budget.id, before: prior?.revision, after: plan.revision, detail: { name: plan.name, budgetRevision: budget.revision } })
 return get(c.s, 'long-range', id)
}

export async function annualView(c: Context, plan: Data) {
 requireMember(c.x)
 const budget = await scenarioView(c, plan.budget)
 requireThat(budget.scenario.kind === 'budget', 'Year one must link to the operating budget', 409)
 requireThat(plan.currency === budget.workspace.currency, 'The budget currency changed; review and save the long-range assumptions in that currency', 409)
 const calc = budget.calculation, months = calc.months.slice(0, 12)
 requireThat(months.length === 12, 'The operating budget needs twelve months', 409)
 const profit = calc.profit.filter(p => months.includes(p.month))
 const cash = calc.cash.filter(p => months.includes(p.month))
 const revenue = total(profit, 'revenue'), netIncome = total(profit, 'profit')
 let targetRevenue = plan.priorYearRevenueCents
 const rows: Data[] = []
 for (let i = 0; i < plan.years; i++) {
  const prior = rows[i - 1], driver = plan.drivers[i - 1]
  const yearRevenue = i === 0 ? revenue : mulDiv(prior.revenue, 10000 + driver.growthBps, 10000)
  const yearProfit = i === 0 ? netIncome : mulDiv(yearRevenue, driver.marginBps, 10000)
  const headcount = i === 0 ? Object.values(calc.headcount).reduce((sum, monthly) => sum + (monthly[months[11]] ?? 0), 0) : prior.headcount + driver.headcountChange
  requireThat(headcount >= 0, `Year ${i + 1} projected headcount is negative`)
  const openingCash = i === 0 ? cash[0].opening : prior.closingCash
  const closingCash = i === 0 ? cash[11].closing : openingCash + driver.cashChangeCents
  targetRevenue = mulDiv(targetRevenue, 10000 + plan.targets.growthBps, 10000)
  const targetProfit = mulDiv(targetRevenue, plan.targets.marginBps, 10000)
  const values = [yearRevenue, yearProfit, yearRevenue - yearProfit, closingCash, targetRevenue, targetProfit, closingCash - openingCash, yearRevenue - targetRevenue, yearProfit - targetProfit, closingCash - plan.targets.cashCents]
  requireThat(values.every(Number.isSafeInteger), 'Annual projection exceeds exact integer arithmetic; reduce the assumptions')
  rows.push({ year: i + 1, start: addMonths(months[0], 12 * i), end: addMonths(months[0], 12 * i + 11),
   revenue: yearRevenue, costs: yearRevenue - yearProfit, profit: yearProfit,
   marginBps: yearRevenue === 0 ? null : mulDiv(yearProfit, 10000, yearRevenue), headcount, openingCash, cashChange: closingCash - openingCash, closingCash,
   targetRevenue, targetProfit, targetHeadcount: plan.targets.headcount, targetCash: plan.targets.cashCents,
   revenueGap: yearRevenue - targetRevenue, profitGap: yearProfit - targetProfit, headcountGap: headcount - plan.targets.headcount, cashGap: closingCash - plan.targets.cashCents,
   trace: i === 0 ? `Operating budget ${budget.scenario.name} revision ${budget.scenario.revision}: twelve monthly revenues, costs and profits summed; headcount and cash at year end.` : `Revenue ${prior.revenue} × (10000 + ${driver.growthBps}) ÷ 10000; profit ${yearRevenue} × ${driver.marginBps} ÷ 10000; headcount ${prior.headcount} + ${driver.headcountChange}; cash ${openingCash} + ${driver.cashChangeCents}. Money is minor units; each division rounds half away from zero once.`,
  })
 }
 return { plan, currency: plan.currency, source: { id: budget.scenario.id, name: budget.scenario.name, revision: budget.scenario.revision, status: budget.scenario.status, ...(budget.scenario.approval ? { snapshot: budget.scenario.approval.snapshot, sha256: (await snapshot(c.db, budget.scenario.approval.snapshot)).sha256 } : {}) }, rows }
}

export async function longRangeView(c: Context, id: string) {
 requireMember(c.x)
 return annualView(c, get(c.s, 'long-range', id, 'long-range plan'))
}
export async function longRangeList(c: Context) {
 requireMember(c.x)
 workspace(c.s)
 return all(c.s, 'long-range').sort((a, b) => a.name.localeCompare(b.name))
}
