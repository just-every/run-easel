// The deterministic planning calculation. Given one scenario's inputs (and,
// for a forecast, the accepted actuals of its closed months) it produces every
// cell keyed by line, department and month, each with the sources and the
// arithmetic that produced it, then profit and monthly cash. No model or
// network call supplies a number: the same inputs always give the same cells.
import { calculateAssets, type AssetMonth } from './assets'
import { addMonths, monthLabel, monthsBetween, range } from './months'
import { rampFactorBps, RAMP_RULE } from './ramp'
import { apportion, formatBps, formatHundredths, formatMoney, mulDiv } from './units'
import type { Data } from './types'

export const ENGINE = 'easel-engine-1'

export type LineType = 'revenue' | 'cost-of-sales' | 'operating-expense'
export type Line = { id: string; name: string; type: LineType; payroll?: boolean; nonCash?: boolean }
export type Department = { id: string; name: string; shared?: boolean }
export type Source = { kind: string; id?: string; label: string; amount: number; trace: string }
export type Cell = { line: string; department: string; month: string; amount: number; basis: 'plan' | 'actual'; sources: Source[] }
export type ActualCell = { line: string; department: string; month: string; amount: number; rows: number; batches: string[] }
export type CashMonth = { month: string; opening: number; collections: number; payments: number; closing: number; trace: string }
export type ProfitMonth = { month: string; revenue: number; costOfSales: number; operatingExpenses: number; grossMargin: number; profit: number }

export type Model = {
 workspace: { currency: string; planStart: string; horizon: number }
 lines: Line[]
 departments: Department[]
 scenario: Data
 inputs: { revenue: Data[]; position: Data[]; expense: Data[]; schedule: Data[]; allocation: Data[]; asset?: Data[]; 'asset-category'?: Data[] }
}

export type Calculation = {
 engine: string
 rampRule: string
 currency: string
 months: string[]
 actualsThrough: string | null
 cells: Cell[]
 lineTotals: Record<string, Record<string, number>>
 profit: ProfitMonth[]
 cash: CashMonth[]
 headcount: Record<string, Record<string, number>>
 warnings: string[]
 assets?: AssetMonth[]
}

const active = (p: Data, m: string) => p.start <= m && (!p.end || m <= p.end)
const monthCount = (count: number) => `${count} ${count === 1 ? 'month' : 'months'}`

export function calculate(model: Model, actuals: ActualCell[] = []): Calculation {
 const { workspace, lines, departments, scenario, inputs } = model
 const currency = workspace.currency
 const money = (n: number) => formatMoney(n, currency)
 const months = range(workspace.planStart, workspace.horizon)
 const inHorizon = new Set(months)
 const actualsThrough: string | null = scenario.actualsThrough ?? null
 const closed = (m: string) => actualsThrough !== null && m <= actualsThrough
 const lineById = new Map(lines.map(l => [l.id, l]))
 const deptName = new Map(departments.map(d => [d.id, d.name]))
 const warnings: string[] = []
 const cells = new Map<string, Cell>()
 const cash: { month: string; amount: number; collection: boolean; label: string }[] = []
 const collectionLag = Number(scenario.cash?.collectionLag ?? 0), paymentLag = Number(scenario.cash?.paymentLag ?? 0)

 const cell = (line: string, department: string, month: string, basis: 'plan' | 'actual') => {
  const k = `${line}|${department}|${month}`
  let c = cells.get(k)
  if (!c) { c = { line, department, month, amount: 0, basis, sources: [] }; cells.set(k, c) }
  return c
 }
 const add = (line: string, department: string, month: string, source: Source, lag?: number, nonCash = false) => {
  if (!inHorizon.has(month) || closed(month)) return
  const c = cell(line, department, month, 'plan')
  c.amount += source.amount
  c.sources.push(source)
  if (nonCash || lineById.get(line)?.nonCash) return
  const type = lineById.get(line)?.type
  if (type === 'revenue') cash.push({ month: addMonths(month, lag ?? collectionLag), amount: source.amount, collection: true, label: source.label })
  else cash.push({ month: addMonths(month, lineById.get(line)?.payroll ? 0 : paymentLag), amount: source.amount, collection: false, label: source.label })
 }

 // Headcount by department and month: active positions, used by ramp rules and allocations.
 const headcount: Record<string, Record<string, number>> = {}
 for (const p of inputs.position) for (const m of months) if (active(p, m)) {
  headcount[p.department] ??= {}
  headcount[p.department][m] = (headcount[p.department][m] ?? 0) + 1
 }

 for (const r of inputs.revenue) {
  const lag = Number(r.collectionLag ?? collectionLag)
  if (r.kind === 'volume') {
   let volume = r.startVolume
   for (let k = 0, m = r.start; m <= months[months.length - 1]; k++, m = addMonths(m, 1)) {
    if (k > 0) volume = mulDiv(volume, 10000 + r.growthBps, 10000)
    const amount = mulDiv(volume, r.rateCents, 100)
    add(r.line, r.department, m, { kind: 'revenue', id: r.originId, label: r.name, amount, trace: `${monthLabel(m)}: volume ${formatHundredths(volume)}${k > 0 ? ` (prior month × (1 + ${formatBps(r.growthBps)}))` : ' (starting volume)'} × rate ${money(r.rateCents)} = ${money(amount)}` }, lag)
   }
  } else {
   let customers = r.startCustomers
   for (let k = 0, m = r.start; m <= months[months.length - 1]; k++, m = addMonths(m, 1)) {
    const prior = customers
    const churned = mulDiv(prior, r.churnBps, 10000)
    const reps = r.repDepartment ? inputs.position.filter(p => p.department === r.repDepartment && active(p, m)) : []
    const capacity = reps.reduce((sum, p) => sum + rampFactorBps(monthsBetween(p.start, m), r.rampMonths), 0)
    const fromReps = mulDiv(r.newPerRep, capacity, 10000)
    customers = prior - churned + r.newPerMonth + fromReps
    const amount = mulDiv(customers, r.arpaCents, 100)
    const repText = reps.length ? ` + ${formatHundredths(fromReps)} from ${reps.length} hire${reps.length > 1 ? 's' : ''} in ${deptName.get(r.repDepartment)} at ${reps.map(p => formatBps(rampFactorBps(monthsBetween(p.start, m), r.rampMonths))).join(', ')} of ${formatHundredths(r.newPerRep)} each` : ''
    add(r.line, r.department, m, { kind: 'revenue', id: r.originId, label: r.name, amount, trace: `${monthLabel(m)}: customers ${formatHundredths(prior)} − churn ${formatHundredths(churned)} (${formatBps(r.churnBps)}) + new ${formatHundredths(r.newPerMonth)}${repText} = ${formatHundredths(customers)} × ${money(r.arpaCents)} per customer = ${money(amount)}` }, lag)
   }
  }
 }

 for (const p of inputs.position) {
  const positionMonths = months.filter(m => active(p, m))
  if (!positionMonths.length) continue
  const rate = 10000 + p.onCostBps
  // Interim months round down so even a small valid annual salary cannot
  // produce a negative final month when its accumulated remainder is applied.
  const monthly = Number((BigInt(p.annualSalaryCents) * BigInt(rate)) / 120000n)
  // Keep the annual salary and on-cost numerator unrounded until the target
  // for this position's active plan months is known. Any monthly rounding
  // difference is assigned to its final active month.
  const target = mulDiv(p.annualSalaryCents, rate * positionMonths.length, 120000)
  const who = p.holder ? `${p.title} (${p.holder})` : `${p.title} (to be hired)`
  for (const [index, m] of positionMonths.entries()) {
   const last = index === positionMonths.length - 1
   const amount = last ? target - monthly * (positionMonths.length - 1) : monthly
   const adjustment = amount - monthly
   const remainder = last ? `; target for ${monthCount(positionMonths.length)} is ${money(target)}; final active month rounding adjustment ${adjustment < 0 ? '−' : '+'}${money(Math.abs(adjustment))} sets this month's cost to ${money(amount)}` : ''
   add(p.line, p.department, m, { kind: 'position', id: p.originId, label: who, amount, trace: `${who}: ${money(p.annualSalaryCents)} a year × (1 + ${formatBps(p.onCostBps)} on-costs, owner-supplied) ÷ 12 = ${money(monthly)} a month, rounded down to cents${remainder}` })
  }
 }

 for (const e of inputs.expense) {
  if (e.kind === 'one-off') add(e.line, e.department, e.start, { kind: 'expense', id: e.originId, label: e.name, amount: e.amountCents, trace: `${e.name}: one-off ${money(e.amountCents)} in ${monthLabel(e.start)}` })
  else for (const m of months) if (active(e, m)) add(e.line, e.department, m, { kind: 'expense', id: e.originId, label: e.name, amount: e.amountCents, trace: `${e.name}: recurring ${money(e.amountCents)} a month from ${monthLabel(e.start)}${e.end ? ` to ${monthLabel(e.end)}` : ''}` })
 }

 for (const s of inputs.schedule) {
  for (const [m, amount] of Object.entries(s.values as Record<string, number>)) {
   if (!inHorizon.has(m)) { warnings.push(`${s.name}: ${monthLabel(m)} is outside the plan months and is not counted`); continue }
   add(s.line, s.department, m, { kind: 'schedule', id: s.originId, label: s.name, amount, trace: `${s.name}: ${money(amount)} entered for ${monthLabel(m)}${s.provenance ? ` (${s.provenance.file} ${s.provenance.sheet}!${s.provenance.cells?.[m] ?? ''})` : ''}` })
  }
 }

 const assets = calculateAssets(inputs.asset ?? [], inputs['asset-category'] ?? [], months, actualsThrough, currency)
 for (const row of assets) {
  if (row.expense !== 0) add(row.line, row.department, row.month, { kind: 'asset', id: row.originId, label: row.name, amount: row.expense, trace: row.trace }, 0, true)
  if (row.capex) cash.push({ month: row.month, amount: row.capex, collection: false, label: row.name })
  if (row.disposalProceeds) cash.push({ month: row.month, amount: row.disposalProceeds, collection: true, label: row.name })
 }

 for (const a of actuals) {
  if (!closed(a.month) || !inHorizon.has(a.month)) continue
  const c = cell(a.line, a.department, a.month, 'actual')
  c.amount += a.amount
  c.sources.push({ kind: 'actual', label: 'Accepted actuals', amount: a.amount, trace: `${monthLabel(a.month)}: ${money(a.amount)} from ${a.rows} accepted row${a.rows === 1 ? '' : 's'} in ${a.batches.length} import${a.batches.length === 1 ? '' : 's'}` })
  const type = lineById.get(a.line)?.type
  if (lineById.get(a.line)?.nonCash) continue
  cash.push({ month: addMonths(a.month, type === 'revenue' ? collectionLag : lineById.get(a.line)?.payroll ? 0 : paymentLag), amount: a.amount, collection: type === 'revenue', label: 'Actuals' })
 }
 for (const m of months) if (closed(m) && ![...cells.values()].some(c => c.month === m)) warnings.push(`${monthLabel(m)} is closed but has no accepted actuals`)

 // Shared-cost allocation: costs in a shared department move to the target
 // departments by the rule's visible weights; line totals never change.
 for (const rule of inputs.allocation) {
  for (const m of months) {
   const weights = rule.basis === 'headcount' ? rule.targets.map((t: Data) => headcount[t.department]?.[m] ?? 0) : rule.targets.map((t: Data) => t.bps)
   for (const c of [...cells.values()].filter(c => c.department === rule.sourceDepartment && c.month === m && lineById.get(c.line)?.type !== 'revenue' && c.amount !== 0)) {
    if (weights.every((w: number) => w === 0)) { warnings.push(`${rule.name}: no headcount in the target departments in ${monthLabel(m)}, so ${money(c.amount)} of ${lineById.get(c.line)?.name} stays in ${deptName.get(rule.sourceDepartment)}`); continue }
    const total = c.amount
    const parts = apportion(total, weights)
    const basisText = rule.basis === 'headcount' ? `by headcount (${rule.targets.map((t: Data, i: number) => `${deptName.get(t.department)} ${weights[i]}`).join(', ')})` : `by fixed shares (${rule.targets.map((t: Data) => `${deptName.get(t.department)} ${formatBps(t.bps)}`).join(', ')})`
    c.amount -= total
    c.sources.push({ kind: 'allocation', id: rule.originId, label: rule.name, amount: -total, trace: `${rule.name}: ${money(total)} allocated out ${basisText}` })
    rule.targets.forEach((t: Data, i: number) => {
     if (parts[i] === 0) return
     const target = cell(c.line, t.department, m, c.basis)
     target.amount += parts[i]
     target.sources.push({ kind: 'allocation', id: rule.originId, label: rule.name, amount: parts[i], trace: `${rule.name}: ${money(parts[i])} of ${money(total)} from ${deptName.get(rule.sourceDepartment)} ${basisText}` })
    })
   }
  }
 }

 const lineTotals: Record<string, Record<string, number>> = {}
 for (const c of cells.values()) {
  lineTotals[c.line] ??= {}
  lineTotals[c.line][c.month] = (lineTotals[c.line][c.month] ?? 0) + c.amount
 }
 const profit = months.map(m => {
  const sum = (type: LineType) => lines.filter(l => l.type === type).reduce((s, l) => s + (lineTotals[l.id]?.[m] ?? 0), 0)
  const revenue = sum('revenue'), costOfSales = sum('cost-of-sales'), operatingExpenses = sum('operating-expense')
  return { month: m, revenue, costOfSales, operatingExpenses, grossMargin: revenue - costOfSales, profit: revenue - costOfSales - operatingExpenses }
 })

 const opening0 = Number(scenario.cash?.openingCents ?? 0)
 let opening = opening0
 const cashMonths = months.map((m, i) => {
  let collections = cash.filter(e => e.collection && e.month === m).reduce((s, e) => s + e.amount, 0)
  let payments = cash.filter(e => !e.collection && e.month === m).reduce((s, e) => s + e.amount, 0)
  const extra: string[] = []
  if (i === 0 && scenario.cash?.receivablesCents) { collections += scenario.cash.receivablesCents; extra.push(`opening receivables ${money(scenario.cash.receivablesCents)} collected`) }
  if (i === 0 && scenario.cash?.payablesCents) { payments += scenario.cash.payablesCents; extra.push(`opening payables ${money(scenario.cash.payablesCents)} paid`) }
  const closing = opening + collections - payments
  const basis = i === 0 ? ` (opening cash ${scenario.cash?.basis === 'imported' ? 'imported from actuals' : 'is an estimate'})` : ''
  const row = { month: m, opening, collections, payments, closing, trace: `${money(opening)}${basis} + collections ${money(collections)} − payments ${money(payments)} = ${money(closing)}; revenue collected ${monthCount(collectionLag)} after it is earned, non-payroll costs paid ${monthCount(paymentLag)} after, payroll in the month${extra.length ? '; ' + extra.join('; ') : ''}` }
  opening = closing
  return row
 })
 const uncollected = cash.filter(e => e.month > months[months.length - 1]).reduce((s, e) => s + (e.collection ? e.amount : -e.amount), 0)
 if (uncollected !== 0) warnings.push(`${money(uncollected)} of net cash timing falls after ${monthLabel(months[months.length - 1])} and is outside the plan months`)

 return {
  engine: ENGINE, rampRule: RAMP_RULE, currency, months, actualsThrough,
  cells: [...cells.values()].sort((a, b) => a.line.localeCompare(b.line) || a.department.localeCompare(b.department) || a.month.localeCompare(b.month)),
  lineTotals, profit, cash: cashMonths, headcount, warnings, assets,
 }
}
