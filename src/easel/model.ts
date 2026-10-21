import { periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { compensationInput } from './compensation'
import { commissionPosition } from './commissions'
import { headcountInput } from './headcount-input'
import { taxInput, positionTaxInput } from './tax-input'
import { collectionInput, paymentInput, payrollInput, workingExpenseInput } from './working-capital-input'
import { commercialInput } from './commercial-input'
import { validateHistoryInput } from './history-input'
import { libraryRevenueInput } from './revenue-input'
import { requireScenarioEdit } from './scenario-access'
import { validateFinancingInput } from './financing-input'
// Turning stored records into an engine Model, and validating scenario inputs.
import { addMonths, month, monthsBetween } from './months'
import { validateAssetInput } from './asset-input'
import { cents, decimal, hundredths, percentBps } from './units'
import { all, choice, find, get, integer, optionalText, requireThat, text, type Access, type Data, type State } from './types'
import type { Line, Model } from './engine'

export const INPUT_KINDS = ['revenue', 'position', 'expense', 'schedule', 'allocation', 'asset-category', 'asset', 'debt', 'equity', 'tax-policy', 'workbook-model'] as const
export type InputKind = typeof INPUT_KINDS[number]

export function workspace(s: State) {
 const w = find(s, 'workspace', 'main')
 requireThat(w, 'Finance has not set up the plan yet', 409)
 return w as Data & CalendarWorkspace
}

export const lines = (s: State) => all(s, 'line').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)) as Line[]
export const departments = (s: State) => all(s, 'department').sort((a, b) => a.name.localeCompare(b.name)) as { id: string; name: string; shared?: boolean }[]
// Inputs in a stable order (by name, then origin) so calculations and their
// traces are identical however the rows happen to be stored or restored.
const inputName = (i: Data) => String(i.name ?? i.title ?? '')
export const scenarioInputs = (s: State, scenario: string, kind: InputKind) => all(s, kind).filter(i => i.scenario === scenario).sort((a, b) => inputName(a).localeCompare(inputName(b)) || String(a.originId).localeCompare(String(b.originId)))

export function model(s: State, scenarioId: string): Model {
 const w = workspace(s)
 const scenario = get(s, 'scenario', scenarioId)
 return {
  workspace: { currency: w.currency, planStart: w.planStart, horizon: scenario.horizon ?? w.horizon, fiscalYearStart: w.fiscalYearStart, calendar: w.calendar ?? 'calendar-month', ...(w.retailStartDate ? { retailStartDate: w.retailStartDate } : {}) },
  lines: lines(s), departments: departments(s), scenario,
  inputs: { revenue: scenarioInputs(s, scenarioId, 'revenue'), position: scenarioInputs(s, scenarioId, 'position'), expense: scenarioInputs(s, scenarioId, 'expense'), schedule: scenarioInputs(s, scenarioId, 'schedule'), allocation: scenarioInputs(s, scenarioId, 'allocation'), 'asset-category': scenarioInputs(s, scenarioId, 'asset-category'), asset: scenarioInputs(s, scenarioId, 'asset'), debt: scenarioInputs(s, scenarioId, 'debt'), equity: scenarioInputs(s, scenarioId, 'equity'), 'tax-policy': scenarioInputs(s, scenarioId, 'tax-policy'), 'workbook-model': scenarioInputs(s,scenarioId,'workbook-model') },
 }
}

const line = (s: State, id: unknown, types: string[], label: string) => {
 const l = get(s, 'line', id, label)
 requireThat(types.includes(l.type), `${label} must be a ${types.join(' or ')} line`)
 return l.id
}
const department = (s: State, id: unknown, label = 'department') => get(s, 'department', id, label).id

/** Months a driver may start: up to two years before the plan through its last month. */
function planMonth(s: State, v: unknown, label: string, scenario: string) {
 const w = workspace(s), m = month(v, label)
 const horizon = get(s, 'scenario', scenario).horizon ?? w.horizon
 requireThat(monthsBetween(addMonths(w.planStart, -24), m) >= 0 && m <= addMonths(w.planStart, horizon - 1), `${label} must be within two years before the plan and no later than its last month`)
 return m
}
const optionalEnd = (s: State, v: unknown, start: string, label: string) => {
 if (v === undefined || v === null || v === '') return ''
 const m = month(v, label)
 requireThat(m >= start, `${label} must not be before the start month`)
 return m
}

/** Validates one input against the model's lines and departments. Returns the stored value. */
export function validateInput(s: State, kind: InputKind, b: Data, scenario: string): Data {
 if (kind === 'workbook-model') { requireThat(false, 'Workbook source graphs are created through the reviewed import door',409) }
 if (kind === 'tax-policy') return taxInput(s,b,scenario)
 if(b.line)requireThat(!all(s,'tax-policy').some(p=>p.scenario===scenario&&p.line===b.line),'This line is reserved for the income-tax estimate',409)
 if (kind === 'debt' || kind === 'equity') return validateFinancingInput(s, kind, b, scenario)
 if (kind === 'asset-category' || kind === 'asset') return validateAssetInput(s, kind, b, scenario)
 if (kind === 'revenue') {
  const base = { ...collectionInput(b), name: text(b.name, 'Revenue model name'), line: line(s, b.line, ['revenue'], 'revenue line'), department: department(s, b.department), start: planMonth(s, b.start, 'Start month', scenario), collectionLag: integer(b.collectionLag ?? 0, 'Collection timing (months)', 0, 3) }
  for (const cost of all(s, 'expense').filter(e => e.scenario === scenario && e.revenueOrigin === b.originId && b.originId)) {
   requireThat(cost.department === base.department && b.kind === (cost.kind === 'inventory' ? 'volume' : 'customers'), 'Update or remove linked costs before changing this revenue driver kind or department', 409)
  }
  const library = libraryRevenueInput(b, base, workspace(s))
  if (b.commissionPosition) {
   requireThat(b.kind === 'contract', 'Commission links require a contract booking')
   const position = commissionPosition(scenarioInputs(s, scenario, 'position'), { ...base, commissionPosition: b.commissionPosition })
   requireThat(!get(s, 'line', position.line).nonCash, 'Commission requires a cash salary line', 409)
   Object.assign(library!, { commissionPosition: position.originId })
  }
  if (library) return library
  const kindOf = choice(b.kind, ['volume', 'customers'] as const, 'a driver')
  if (kindOf === 'volume') return { ...base, kind: kindOf, startVolume: hundredths(b.startVolume, 'Starting volume'), growthBps: decimal(b.growthPercent ?? '0', 'Monthly growth %', 2, { negative: true, max: 100000n }), rateCents: cents(b.rate, 'Rate per unit') }
  const repDepartment = b.repDepartment ? department(s, b.repDepartment, 'hiring department') : ''
  const newPerRep = hundredths(b.newPerRep ?? '0', 'New customers per ramped hire')
  requireThat(newPerRep === 0 || repDepartment, 'Choose the department whose hires bring new customers')
  return { ...base, kind: kindOf, startCustomers: hundredths(b.startCustomers, 'Starting customers'), newPerMonth: hundredths(b.newPerMonth ?? '0', 'New customers per month'), newPerRep, repDepartment, rampMonths: integer(b.rampMonths ?? 1, 'Ramp months', 1, 24), churnBps: percentBps(b.churnPercent ?? '0', 'Monthly churn %'), arpaCents: cents(b.arpa, 'Monthly revenue per customer') }
 }
 if (kind === 'position') {
  const start = planMonth(s, b.start, 'Start month', scenario)
  const policy=all(s,'tax-policy').find(p=>p.scenario===scenario)
  if(policy && periodForKey(workspace(s), workspace(s).planStart).startDate.slice(5) !== '01-01' && start<workspace(s).planStart && b.employmentType!=='1099') requireThat(b.taxYtdWages!==undefined && b.taxYtdWages!=='','Enter prior year-to-date wages for a continuing W-2 position',409)
  if (b.payDay !== undefined && b.payDay !== '') requireThat(!get(s, 'line', b.line).nonCash, 'Accrued payroll requires a cash salary line')
  const end = optionalEnd(s, b.end, start, 'End month')
  for (const contract of scenarioInputs(s, scenario, 'revenue').filter(r => r.commissionPosition === b.originId)) {
   commissionPosition([{ originId: b.originId, start, end }], contract)
   requireThat(!get(s, 'line', b.line).nonCash, 'Commission requires a cash salary line', 409)
  }
  return { ...compensationInput(b), commissionRateBps: percentBps(b.commissionPercent ?? '0', 'Commission planning estimate %'), ...payrollInput(b), ...positionTaxInput(b), ...headcountInput(s,b,scenario,start), title: text(b.title, 'Position title'), holder: optionalText(b.holder, 'Person', 200), department: department(s, b.department), line: line(s, b.line, ['cost-of-sales', 'operating-expense'], 'salary line'), start, end, onCostBps: percentBps(b.onCostPercent ?? '0', 'On-costs %') }
 }
 if (kind === 'expense') {
  const kindOf = choice(b.kind, ['recurring', 'one-off', 'acquisition', 'inventory', 'prepaid', 'bonus'] as const, 'an expense kind')
  const start = planMonth(s, b.start, kindOf === 'one-off' ? 'Month' : 'Start month', scenario)
  const base = { name: text(b.name, 'Expense name'), line: line(s, b.line, ['cost-of-sales', 'operating-expense'], 'expense line'), department: department(s, b.department), start, end: kindOf === 'recurring' ? optionalEnd(s, b.end, start, 'End month') : '' }
  const l = get(s, 'line', base.line)
  if (['prepaid', 'bonus'].includes(kindOf)) requireThat(!l.nonCash && (kindOf !== 'prepaid' || !l.payroll), 'Prepaids and bonuses require a cash expense line; prepaids cannot use payroll lines')
  if ((b.paymentMethod && b.paymentMethod !== 'lag') || b.dpoDays !== undefined || b.paymentTermDays !== undefined) requireThat(!l.nonCash && !l.payroll && !['prepaid', 'bonus'].includes(kindOf), 'Vendor timing requires a cash, non-payroll vendor expense')
  const working = workingExpenseInput(b, base)
  if (working) return working
  Object.assign(base, paymentInput(b))
  const linked = commercialInput(s, b, scenario, base)
  if (linked) return linked
  return { ...base, kind: kindOf, amountCents: cents(b.amount, kindOf === 'one-off' ? 'Amount' : 'Monthly amount', { negative: true }) }
 }
 if (kind === 'schedule') {
  if (b.history) {
   requireThat(!b.values || !Object.keys(b.values).length, 'Choose entered values or an actuals reference, never both')
   return { name: text(b.name, 'Schedule name'), line: get(s, 'line', b.line, 'line').id, department: department(s, b.department), history: validateHistoryInput(s, b) }
  }
  requireThat(b.values && typeof b.values === 'object' && !Array.isArray(b.values), 'Enter monthly values')
  const values: Record<string, number> = {}
  for (const [m, v] of Object.entries(b.values)) if (v !== '' && v !== null && v !== undefined) values[month(m)] = cents(v, `Value for ${m}`, { negative: true })
  requireThat(Object.keys(values).length > 0, 'Enter at least one monthly value')
  return { name: text(b.name, 'Schedule name'), line: get(s, 'line', b.line, 'line').id, department: department(s, b.department), values, ...(b.provenance ? { provenance: b.provenance } : {}) }
 }
 // allocation
 const sourceDepartment = department(s, b.sourceDepartment, 'shared department')
 requireThat(get(s, 'department', sourceDepartment).shared, 'Only a department marked shared can be allocated')
 const basis = choice(b.basis, ['headcount', 'fixed'] as const, 'an allocation basis')
 requireThat(Array.isArray(b.targets) && b.targets.length > 0 && b.targets.length <= 50, 'Choose the departments that receive the cost')
 const targets = b.targets.map((t: Data) => ({ department: department(s, t.department, 'receiving department'), ...(basis === 'fixed' ? { bps: percentBps(t.percent, 'Share %') } : {}) }))
 requireThat(new Set(targets.map((t: Data) => t.department)).size === targets.length, 'Each receiving department may appear once')
 requireThat(!targets.some((t: Data) => t.department === sourceDepartment), 'A shared department cannot allocate to itself')
 if (basis === 'fixed') requireThat(targets.reduce((sum: number, t: Data) => sum + t.bps, 0) === 10000, 'Fixed shares must add up to exactly 100%')
 const others = scenarioInputs(s, scenario, 'allocation').filter(a => a.originId !== b.originId)
 requireThat(!others.some(a => a.targets.some((t: Data) => t.department === sourceDepartment)), 'This shared department already receives an allocation; allocations cannot chain')
 requireThat(!targets.some((t: Data) => others.some(a => a.sourceDepartment === t.department)), 'A receiving department is itself allocated; allocations cannot chain')
 requireThat(!others.some(a => a.sourceDepartment === sourceDepartment), 'This shared department already has an allocation rule')
 return { name: text(b.name, 'Allocation name'), sourceDepartment, basis, targets }
}

/** The department an input belongs to, for contributor scope. Allocations belong to finance. */
export const inputDepartment = (kind: InputKind, value: Data) => (['allocation', 'asset-category', 'debt', 'equity', 'tax-policy'].includes(kind)) ? null : value.department as string

/** Whether this person may change this department's inputs in this scenario right now. */
export function requireEditable(s: State, x: Access, scenario: Data, dept: string | null) {
 requireScenarioEdit(x, scenario)
 requireThat(scenario.status === 'working', scenario.status === 'frozen' ? 'This scenario is approved and frozen; branch it to change assumptions' : 'This proposal is closed', 409)
 if (x.role === 'finance') return
 requireThat(x.role === 'contributor', 'Only finance and contributors change plans', 403)
 requireThat(dept !== null && x.departments.includes(dept), 'You can only change your own departments', 403)
 if (scenario.kind === 'budget') {
  const sub = find(s, 'submission', `${scenario.id}|${dept}`)
  requireThat(sub && ['requested', 'returned'].includes(sub.status), sub?.status === 'submitted' ? 'Your submission is with finance; ask them to return it to make changes' : 'Finance has not requested this department\'s submission', 409)
  return
 }
 if (scenario.sandbox) return
 requireThat(scenario.kind === 'proposal' && scenario.createdBy === x.actor.email, 'Contributors change budgets through submissions and other plans through their own proposals', 403)
}

export const usesLine = (s: State, id: string) => INPUT_KINDS.some(k => all(s, k).some(i => i.line === id || i.history?.sourceLine === id)) || ['account-map', 'account-rule'].some(k => all(s, k).some(m => m.target === id))
export const usesDepartment = (s: State, id: string) => INPUT_KINDS.some(k => all(s, k).some(i => i.department === id || i.history?.sourceDepartment === id || i.repDepartment === id || i.sourceDepartment === id || i.targets?.some((t: Data) => t.department === id))) || all(s, 'department-map').some(m => m.department === id) || all(s, 'member').some(m => m.departments?.includes(id))
