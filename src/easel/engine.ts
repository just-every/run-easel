import { datePeriod, type CalendarWorkspace } from './fiscal-calendar'
import { ledgerStatements } from './ledger-statements'
import { openContracts, scheduleAllocations } from './ledger-schedules'
import type { LedgerContext } from './ledger-context'
import { workbookScheduleValues } from './workbook-calculation'
import { commissionEstimates } from './commissions'
import { payrollTaxes } from './payroll-taxes'
import { incomeTaxes, salesTaxes } from './tax-calculation'
import { workingCapital, timedCash, curveContracts, type WorkingCapitalCalculation } from './working-capital'
import { contractRevenue, type ContractCalculation } from './contract-revenue'
import { commercialCosts, type InventoryMonth } from './commercial-costs'
import { historySchedule } from './history-schedules'
import { calculateFinancing, evaluateCovenants, type FinancingCalculation } from './financing'
import { libraryRevenue } from './revenue-drivers'
import { cashDrivers, type CashDriver, type TaggedCash } from './cash-drivers'
// The deterministic planning calculation. Given one scenario's inputs (and,
// for a forecast, the accepted actuals of its closed months) it produces every
// cell keyed by line, department and month, each with the sources and the
// arithmetic that produced it, then profit and monthly cash. No model or
// network call supplies a number: the same inputs always give the same cells.
import { statements, type BalanceMonth, type CashFlowMonth } from './statements'
import { calculateAssets, type AssetMonth } from './assets'
import { addMonths, monthLabel, monthsBetween, range } from './months'
import { rampFactorBps, RAMP_RULE } from './ramp'
import { apportion, formatBps, formatHundredths, formatMoney, mulDiv } from './units'
import { Fault, type Data } from './types'

export const ENGINE = 'easel-engine-1'

export type LineType = 'revenue' | 'cost-of-sales' | 'operating-expense'
export type Line = { id: string; name: string; type: LineType; payroll?: boolean; nonCash?: boolean }
export type Department = { id: string; name: string; shared?: boolean }
export type Source = { kind: string; id?: string; label: string; amount: number; trace: string }
export type Cell = { line: string; department: string; month: string; amount: number; basis: 'plan' | 'actual'; sources: Source[] }
export type ActualCell = { line: string; department: string; month: string; amount: number; rows: number; batches: string[] }
export type CashMonth = { month: string; opening: number; collections: number; payments: number; closing: number; trace: string; incompleteReasons?: string[] }
export type ProfitMonth = { month: string; revenue: number; costOfSales: number; operatingExpenses: number; grossMargin: number; profit: number }

export type Model = {
 workspace: CalendarWorkspace & { currency: string }
 lines: Line[]
 departments: Department[]
 scenario: Data
 inputs: { revenue: Data[]; position: Data[]; expense: Data[]; schedule: Data[]; allocation: Data[]; asset?: Data[]; 'asset-category'?: Data[]; debt?: Data[]; equity?: Data[]; 'tax-policy'?: Data[]; 'workbook-model'?: Data[] }
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
 taxes?: {label:string;payrollRows:import('./payroll-taxes').PayrollTaxRow[];payrollTotals:{month:string;totalCents:number}[];incomeRows:Data[];openingSalesTaxPayableCents:number;sales:import('./tax-calculation').SalesTaxMonth[]}
 warnings: string[]
 balanceSheet?: BalanceMonth[]
 cashFlow?: CashFlowMonth[]
 assets?: AssetMonth[]
 inventory?: InventoryMonth[]
 contracts?: ContractCalculation
 workingCapital?: WorkingCapitalCalculation
 financing?: FinancingCalculation
 /** Each month's cash split into collections, payroll, spend and financing (cash-drivers.ts); sums to `cash`. */
 cashDrivers?: CashDriver[]
}

const active = (p: Data, m: string) => p.start <= m && (!p.end || m <= p.end)
const monthCount = (count: number) => `${count} ${count === 1 ? 'month' : 'months'}`

export function calculate(model: Model, actuals: ActualCell[] = [], ledger?: LedgerContext): Calculation {
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
 const cash: TaggedCash[] = []
 const allocations = scheduleAllocations(ledger, actualsThrough)
 const origins = new Set(Object.values(inputs).flat().map(input => input.originId))
 for (const allocation of allocations) if (!origins.has(allocation.originId)) throw new Fault(409, 'An allocated schedule origin was removed; review and reallocate its accepted balance before using the forecast')
 const working = workingCapital(model, months, allocations)
 const taxPolicy=inputs['tax-policy']?.[0], taxableCollections:{month:string;date?:string;amount:number}[]=[]
 const commissions = commissionEstimates(inputs.revenue, inputs.position, currency)
 const employerTaxes=taxPolicy?payrollTaxes(inputs.position,months,taxPolicy,currency,workspace,commissions):null
 const timedInputs = new Map([...inputs.revenue, ...inputs.expense, ...inputs.position].map(i => [i.originId, i]))
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
  const input = source.id ? timedInputs.get(source.id) : undefined
 if (source.kind === 'position' && input?.payDay) { source.trace += `; payroll accrues when earned and settles on day ${input.payDay} of the earned period + ${input.payMonthOffset} periods (clamped to period end); see working-capital pay-date reconciliation`; return }
  const timing = timedCash(input ?? {}, month, source.amount, type === 'revenue', type === 'revenue' ? lag ?? collectionLag : lineById.get(line)?.payroll ? 0 : lag ?? paymentLag, source.label, workspace)
  const tagged = timing.events.map(e => ({ ...e, line, department, source: source.id }))
  cash.push(...tagged)
  if(type==='revenue')taxableCollections.push(...tagged)
  if (timing.trace) source.trace += `; ${timing.trace}`
 }

 // Headcount by department and month: active positions, used by ramp rules and allocations.
 const headcount: Record<string, Record<string, number>> = {}
 for (const p of inputs.position) for (const m of months) if (active(p, m)) {
  headcount[p.department] ??= {}
  headcount[p.department][m] = (headcount[p.department][m] ?? 0) + 1
 }

 const contracts = contractRevenue(inputs.revenue, months, currency, workspace)
 curveContracts(contracts, inputs.revenue, months, workspace)
 openContracts(contracts, allocations)
 for (const row of contracts.rows) add(row.line, row.department, row.month, { kind: 'revenue', id: row.originId, label: row.name, amount: row.revenue, trace: row.trace }, 0, true)
 const revenueByOrigin = new Map(inputs.revenue.map(r => [r.originId, r]))
 for (const invoice of contracts.invoices) { const event={ month: datePeriod(workspace, invoice.collectionDate), date: invoice.collectionDate, amount: invoice.amount, collection: true, label: 'Planned contract invoice collection', line: revenueByOrigin.get(invoice.originId)?.line, department: revenueByOrigin.get(invoice.originId)?.department, source: invoice.originId };cash.push(event);taxableCollections.push(event) }
 for (const r of inputs.revenue.filter(r => r.kind !== 'contract')) {
  const lag = Number(r.collectionLag ?? collectionLag)
  if (libraryRevenue(r, inputs.position, months[months.length - 1], currency, (month, source) => add(r.line, r.department, month, source, lag))) continue
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
   const tax=employerTaxes?.rows.find(r=>r.originId===p.originId&&r.month===m)
   const commission = commissions.get(`${p.originId}|${m}`)
   const cost=amount+(commission?.amount??0)+(tax?.totalCents??0)
   if (p.payDay) working.payroll(p, m, cost)
   add(p.line, p.department, m, { kind: 'position', id: p.originId, label: who, amount:cost, trace: `${who}: ${money(p.annualSalaryCents)} a year × (1 + ${formatBps(p.onCostBps)} on-costs, owner-supplied) ÷ 12 = ${money(monthly)} a month, rounded down to cents${remainder}${commission ? `; ${commission.traces.join(' ')}` : ''}${tax?`; ${tax.trace}`:''}` })
  }
 }

 for (const e of inputs.expense.filter(e => !['acquisition', 'inventory', 'prepaid', 'bonus'].includes(e.kind))) {
  if (e.kind === 'one-off') add(e.line, e.department, e.start, { kind: 'expense', id: e.originId, label: e.name, amount: e.amountCents, trace: `${e.name}: one-off ${money(e.amountCents)} in ${monthLabel(e.start)}` })
  else for (const m of months) if (active(e, m)) add(e.line, e.department, m, { kind: 'expense', id: e.originId, label: e.name, amount: e.amountCents, trace: `${e.name}: recurring ${money(e.amountCents)} a month from ${monthLabel(e.start)}${e.end ? ` to ${monthLabel(e.end)}` : ''}` })
 }

 for (const row of working.expenseRows()) add(row.input.line, row.input.department, row.month, row.source, 0, true)
 const workingCapitalCalculation = working.finish()
 cash.push(...working.cash)
 const specialKeys = new Set(workingCapitalCalculation.rows.map(r => `${r.line}|${r.department}|${r.month}`))

 const commercial = commercialCosts(model, months, actuals)
 for (const row of commercial.costs) {
  add(row.line, row.department, row.month, row.source, undefined, row.inventory)
  if (row.inventory) {
   const input = timedInputs.get(row.source.id!)!
   const timing = timedCash(input, row.month, row.purchases, false, paymentLag, row.source.label, workspace)
   cash.push(...timing.events.map(e => ({ ...e, line: row.line, department: row.department, source: row.source.id })))
   if (timing.trace) row.source.trace += `; purchases: ${timing.trace}`
  }
 }
 const inventoryLines = new Set(inputs.expense.filter(e => e.kind === 'inventory').map(e => `${e.line}|${e.department}`))

 const workbookValues = workbookScheduleValues(inputs)
 for (const s of inputs.schedule) {
  if (s.history) {
   for (const row of historySchedule(s, actuals, months.filter(m => !closed(m)), currency)) add(s.line, s.department, row.month, { kind: 'schedule', id: s.originId, label: s.name, amount: row.amount, trace: row.trace })
   continue
  }
  for (const [m, amount] of Object.entries((workbookValues.get(s.originId) ?? s.values) as Record<string, number>)) {
   if (!inHorizon.has(m)) { warnings.push(`${s.name}: ${monthLabel(m)} is outside the plan months and is not counted`); continue }
   add(s.line, s.department, m, { kind: s.workbookCells?.[m] && s.provenance?.formulas?.[m] ? 'workbook-formula' : 'schedule', id: s.originId, label: s.name, amount, trace: `${s.name}: ${money(amount)} ${s.workbookCells?.[m] && s.provenance?.formulas?.[m] ? 'from translated workbook arithmetic or an explicitly reported cached unsupported cell' : 'entered'} for ${monthLabel(m)}${s.provenance ? ` (${s.provenance.file} ${s.provenance.sheet}!${s.provenance.cells?.[m] ?? ''})` : ''}${s.subrows?.[m]?.length ? `; split: ${s.subrows[m].map((row: Data) => `${row.name} ${money(row.amount)}`).join(' + ')}` : ''}${s.notes?.[m] ? `; note: ${s.notes[m]}` : ''}${s.gridRevisions?.[m] ? `; cell revision ${s.gridRevisions[m].revision}` : ''}` })
  }
 }

 const financing = calculateFinancing(inputs.debt ?? [], inputs.equity ?? [], months, currency)
 const debtByOrigin = new Map((inputs.debt ?? []).map(d => [d.originId, d]))
 const interestLines = new Set((inputs.debt ?? []).map(d => d.line))
 for (const row of financing.rows) {
  if (row.interest === 0) continue
  const debt = debtByOrigin.get(row.originId)!
  add(debt.line, debt.department, row.month, { kind: 'financing', id: row.originId, label: row.name, amount: row.interest, trace: row.trace }, 0)
 }

 const assets = calculateAssets(inputs.asset ?? [], inputs['asset-category'] ?? [], months, actualsThrough, currency, allocations)
 for (const row of assets) {
  if (row.expense !== 0) add(row.line, row.department, row.month, { kind: 'asset', id: row.originId, label: row.name, amount: row.expense, trace: row.trace }, 0, true)
  if (row.capex) cash.push({ month: row.month, amount: row.capex, collection: false, label: row.name, line: row.line, department: row.department, source: row.originId })
  if (row.disposalProceeds) cash.push({ month: row.month, amount: row.disposalProceeds, collection: true, label: row.name, line: row.line, department: row.department, source: row.originId })
 }

 // Aggregate ledger revenue is not invoice/receipt actuals. Retain the known
 // invoice plan and explicitly disclose cells that cannot reconcile its source.
 const contractActualKeys = new Set<string>()
 contracts.actualsIssues = []
 for (const row of contracts.rows.filter(r => closed(r.month) && (r.revenue || r.billings || r.receivables || r.deferredRevenue))) {
  const key = `${row.line}|${row.department}|${row.month}`
  if (contractActualKeys.has(key)) continue
  contractActualKeys.add(key)
  const scheduledRevenue = contracts.rows.filter(r => `${r.line}|${r.department}|${r.month}` === key).reduce((n, r) => n + r.revenue, 0)
  const acceptedRevenue = actuals.filter(a => `${a.line}|${a.department}|${a.month}` === key).reduce((n, a) => n + a.amount, 0)
  const mixed = inputs.revenue.some(r => r.kind !== 'contract' && r.line === row.line && r.department === row.department && r.start <= row.month) || inputs.schedule.some(r => r.line === row.line && r.department === row.department && (r.history || r.values?.[row.month] !== undefined))
  if (mixed || acceptedRevenue !== scheduledRevenue) {
   const reason = `${row.month}: incomplete cash and receivables reconciliation on line ${lineById.get(row.line)?.name ?? row.line}, department ${deptName.get(row.department) ?? row.department}: accepted revenue ${money(acceptedRevenue)} versus scheduled contract recognition ${money(scheduledRevenue)}${mixed ? '; aggregate cell mixes contract and other revenue sources' : ''}. Accepted P&L is retained; contract invoices and collections remain planning assumptions, not billing actuals. Unresolved receipt allocation is not inferred from revenue.`
   contracts.actualsIssues.push({ month: row.month, line: row.line, department: row.department, acceptedRevenue, scheduledRevenue, reason }); warnings.push(reason)
  }
 }
 for (const a of actuals) {
  if (!closed(a.month) || !inHorizon.has(a.month)) continue
  const c = cell(a.line, a.department, a.month, 'actual')
  c.amount += a.amount
  c.sources.push({ kind: 'actual', label: 'Accepted actuals', amount: a.amount, trace: `${monthLabel(a.month)}: ${money(a.amount)} from ${a.rows} accepted row${a.rows === 1 ? '' : 's'} in ${a.batches.length} import${a.batches.length === 1 ? '' : 's'}` })
  const type = lineById.get(a.line)?.type
  if (lineById.get(a.line)?.nonCash || inventoryLines.has(`${a.line}|${a.department}`)) continue
  if (type === 'revenue' && contractActualKeys.has(`${a.line}|${a.department}|${a.month}`)) continue
  if (specialKeys.has(`${a.line}|${a.department}|${a.month}`)) continue
  const candidates = (type === 'revenue' ? inputs.revenue : inputs.expense).filter(i => i.line === a.line && i.department === a.department)
  const hasDayTiming = candidates.some(i => i.collectionMethod || i.paymentMethod)
  if (hasDayTiming) {
   const policies = new Set(candidates.map(i => JSON.stringify(type === 'revenue' ? [i.collectionMethod ?? 'lag', i.dsoDays ?? null, i.collectionCurve ?? null] : [i.paymentMethod ?? 'lag', i.dpoDays ?? null, i.paymentTermDays ?? null])))
   if (policies.size > 1) throw new Fault(409, `${a.month}: accepted aggregate rows on line ${lineById.get(a.line)?.name ?? a.line} have drivers with different cash timing. Review this line's timing or supply attributed source data; no receipt or payment allocation is inferred.`)
  }
  const input = candidates.length === 1 || hasDayTiming ? candidates[0] : {}
  const events=timedCash(input, a.month, a.amount, type === 'revenue', type === 'revenue' ? collectionLag : lineById.get(a.line)?.payroll || interestLines.has(a.line) ? 0 : paymentLag, 'Actuals', workspace).events.map(e => ({ ...e, line: a.line, department: a.department }))
  cash.push(...events);if(type==='revenue')taxableCollections.push(...events)
 }
 for (const key of specialKeys) {
  const [line, department, month] = key.split('|')
  if (!closed(month)) continue
  const scheduled = workingCapitalCalculation.rows.filter(r => r.line === line && r.department === department && r.month === month).reduce((n, r) => n + r.prepaidExpense + r.accruedExpense, 0)
  const accepted = [...cells.values()].filter(c => c.line === line && c.department === department && c.month === month).reduce((n, c) => n + c.amount, 0)
  const mixed = inputs.schedule.some(s => s.line === line && s.department === department) || inputs.expense.some(e => e.line === line && e.department === department && !['prepaid', 'bonus'].includes(e.kind)) || inputs.position.some(p => p.line === line && p.department === department && !p.payDay)
  if (accepted !== scheduled || mixed) {
   const reason = `${month}, line ${line}, department ${department}: accepted expense ${money(accepted)} versus working-capital recognition ${money(scheduled)}${mixed ? '; aggregate cell mixes other expense sources' : ''}. Accepted P&L retained; this historical schedule difference is not an inferred settlement. Reviewed CONNECT-007 allocations replace future opening estimates when available. No liability plug or invented settlement is applied.`
   workingCapitalCalculation.issues.push({ month, line, department, reason }); warnings.push(reason)
  }
 }
 for (const m of months) if (closed(m) && ![...cells.values()].some(c => c.month === m)) warnings.push(`${monthLabel(m)} is closed but has no accepted actuals`)

 let taxes:Calculation['taxes']
 if(taxPolicy) {
  const preTax=months.map(month=>({month,profit:[...cells.values()].filter(c=>c.month===month && c.line!==taxPolicy.line).reduce((n,c)=>n+(lineById.get(c.line)?.type==='revenue'?c.amount:-c.amount),0)}))
  const incomeRows=incomeTaxes(preTax,taxPolicy,currency)
  for(const row of incomeRows) {
   if(!closed(row.month))add(taxPolicy.line,taxPolicy.department,row.month,{kind:'tax',label:'Income tax planning estimate',amount:row.taxCents,trace:row.trace},0)
   else Object.assign(row,{recognizedTaxCents:[...cells.values()].filter(c=>c.line===taxPolicy.line&&c.month===row.month).reduce((n,c)=>n+c.amount,0),basis:'Estimate alongside accepted income-tax expense; closed P&L and cash retain the accepted amount'})
  }
  const sales=salesTaxes(taxableCollections,months,taxPolicy,currency,workspace)
  for(const row of sales)cash.push({month:row.month,amount:row.collectedCents,collection:true,label:'Sales tax collected'},{month:row.month,amount:row.remittedCents,collection:false,label:'Sales tax remitted'})
  taxes={label:`US tax planning estimates — assumption year ${taxPolicy.year}; no filings`,payrollRows:employerTaxes!.rows,payrollTotals:months.map(month=>({month,totalCents:employerTaxes!.rows.filter(r=>r.month===month).reduce((n,r)=>n+r.totalCents,0)})),incomeRows,openingSalesTaxPayableCents:sales.length?sales[0].payableCents-sales[0].collectedCents+sales[0].remittedCents:0,sales}
 }

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
 const fundingDrivers: CashDriver[] = [
  ...(scenario.cash?.receivablesCents ? [{ month: months[0], driver: 'collections' as const, line: '', department: '', source: '', label: 'Opening receivables', amount: scenario.cash.receivablesCents }] : []),
  ...(scenario.cash?.payablesCents ? [{ month: months[0], driver: 'spend' as const, line: '', department: '', source: '', label: 'Opening payables', amount: -scenario.cash.payablesCents }] : []),
  ...financing.rows.filter(r => inHorizon.has(r.month) && r.draw - r.repayment !== 0).map(r => ({ month: r.month, driver: 'financing' as const, line: '', department: '', source: r.originId, label: r.name, amount: r.draw - r.repayment })),
  ...financing.equityRows.map(r => ({ month: r.month, driver: 'financing' as const, line: '', department: '', source: r.originId, label: r.name, amount: r.amount })),
 ]
 let opening = opening0
 const cashMonths = months.map((m, i) => {
  let collections = cash.filter(e => e.collection && e.month === m).reduce((s, e) => s + e.amount, 0)
  let payments = cash.filter(e => !e.collection && e.month === m).reduce((s, e) => s + e.amount, 0)
  const extra: string[] = []
  if (i === 0 && scenario.cash?.receivablesCents) { collections += scenario.cash.receivablesCents; extra.push(`opening receivables ${money(scenario.cash.receivablesCents)} collected`) }
  if (i === 0 && scenario.cash?.payablesCents) { payments += scenario.cash.payablesCents; extra.push(`opening payables ${money(scenario.cash.payablesCents)} paid`) }
  const funding = financing.totals[i]
  collections += funding.draws + funding.equityRaised
  payments += funding.repayments
  const closing = opening + collections - payments
  const basis = i === 0 ? ` (opening cash ${scenario.cash?.basis === 'imported' ? 'imported from actuals' : 'is an estimate'})` : ''
  const incompleteReasons = [...contracts.actualsIssues, ...workingCapitalCalculation.issues].filter(issue => issue.month <= m).map(issue => issue.reason)
  const row = { ...(incompleteReasons.length ? { incompleteReasons } : {}), month: m, opening, collections, payments, closing, trace: `${money(opening)}${basis} + collections ${money(collections)} − payments ${money(payments)} = ${money(closing)}; financing inflows ${money(funding.draws + funding.equityRaised)}, principal repayments ${money(funding.repayments)}; revenue collected ${monthCount(collectionLag)} after it is earned, non-payroll costs paid ${monthCount(paymentLag)} after, payroll in the month; contract invoices collect on invoice date plus their exact DSO days; inventory purchases fund the stock buffer and follow supplier payment timing; line DSO/curves and vendor DPO/terms use exact calendar days after month-end invoices; prepaid amortization and accrued payroll/bonuses follow their traced service and pay dates${extra.length ? '; ' + extra.join('; ') : ''}` }
  if (incompleteReasons.length) row.trace += ` INCOMPLETE: known schedule only. ${incompleteReasons.join(' ')}`
  opening = closing
  return row
 })
 const uncollected = cash.filter(e => e.month > months[months.length - 1]).reduce((s, e) => s + (e.collection ? e.amount : -e.amount), 0)
 if (uncollected !== 0) warnings.push(`${money(uncollected)} of net cash timing falls after ${monthLabel(months[months.length - 1])} and is outside the plan months`)

 for (const row of financing.totals) if (closed(row.month)) {
  const recognized = [...interestLines].reduce((sum, line) => sum + (lineTotals[line]?.[row.month] ?? 0), 0)
  Object.assign(row, { recognizedInterest: recognized })
  if (recognized !== row.interest) warnings.push(`${row.month}: accepted interest ${money(recognized)} differs from scheduled financing interest ${money(row.interest)}. Closed profit and operating cash use accepted interest; borrowing and principal remain planned schedules until balance-sheet actuals (CONNECT-007).`)
 }
 const nonCashByMonth = Object.fromEntries(months.map(m => [m, lines.filter(l => l.nonCash).reduce((sum, l) => sum + (lineTotals[l.id]?.[m] ?? 0), 0)]))
 financing.covenants = evaluateCovenants(financing, inputs.debt ?? [], profit, cashMonths, nonCashByMonth)
 const result: Calculation = {
  ...(taxes?{taxes}:{}),engine: ENGINE, rampRule: RAMP_RULE, currency, months, actualsThrough,
  ...(inventoryLines.size ? { inventory: commercial.inventory } : {}),
  cells: [...cells.values()].sort((a, b) => a.line.localeCompare(b.line) || a.department.localeCompare(b.department) || a.month.localeCompare(b.month)),
  lineTotals, profit, cash: cashMonths, headcount, warnings, assets, financing, cashDrivers: [...cashDrivers(cash, lines, interestLines, months), ...fundingDrivers], ...(workingCapitalCalculation.rows.length ? { workingCapital: workingCapitalCalculation } : {}), ...(contracts.rows.length ? { contracts } : {}),
 }
 const calculated = { ...result, ...statements(model, result) }
 return ledger ? ledgerStatements(model, calculated, ledger) : calculated
}
