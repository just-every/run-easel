import { compensationSchedule } from './compensation'
import { commissionEstimates } from './commissions'
// Working-capital subledger. Dates are UTC calendar dates; all amounts are cents.
import type { ContractCalculation } from './contract-revenue'
import type { Model, Source } from './engine'
import { addMonths } from './months'
import { datePeriod, periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { apportion, formatMoney } from './units'
import { requireThat, type Data } from './types'

const day = 86400000
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
export const monthEnd = (month: string) => iso(stamp(`${addMonths(month, 1)}-01`) - day)
const afterDays = (date: string, days: number) => iso(stamp(date) + days * day)
/** Retail pay days count from one within the target period and clamp to its end. */
export const payDate = (month: string, date: number, offset = 0, workspace?: CalendarWorkspace) => {
 const target = addMonths(month, offset)
 if (workspace?.calendar && workspace.calendar !== 'calendar-month') {
  const period = periodForKey(workspace, target)
  return iso(Math.min(stamp(period.startDate) + (date - 1) * day, stamp(period.endDate)))
 }
 return `${target}-${String(Math.min(date, Number(monthEnd(target).slice(8)))).padStart(2, '0')}`
}
export type TimingCash = { month: string; date?: string; amount: number; collection: boolean; label: string; line?: string; department?: string; source?: string }
export function timedCash(input: Data, month: string, amount: number, collection: boolean, legacyLag: number, label: string, workspace?: CalendarWorkspace): { events: TimingCash[]; trace: string } {
 const method = collection ? input.collectionMethod : input.paymentMethod
 const date = workspace ? periodForKey(workspace, month).endDate : monthEnd(month)
 const period = (date: string) => workspace ? datePeriod(workspace, date) : date.slice(0, 7)
 if (collection && method === 'curve') {
  const parts = apportion(amount, input.collectionCurve.map((r: Data) => r.bps))
  const dates = input.collectionCurve.map((r: Data) => afterDays(date, r.days))
  return { events: parts.map((n, i) => ({ month: period(dates[i]), date: dates[i], amount: n, collection, label })), trace: `Invoice dated ${date}; collection curve ${input.collectionCurve.map((r: Data, i: number) => `${r.bps} basis points at ${r.days} exact calendar days (${dates[i]}, ${parts[i]} minor units)`).join('; ')}. Cents apportioned by largest remainder, earliest installment wins ties.` }
 }
 if (method === 'dso' || method === 'dpo' || method === 'terms') {
  const days = method === 'dso' ? input.dsoDays : method === 'dpo' ? input.dpoDays : input.paymentTermDays
  const settlement = afterDays(date, days)
  return { events: [{ month: period(settlement), date: settlement, amount, collection, label }], trace: `Invoice dated ${date}; ${method === 'terms' ? `vendor terms after invoice ${workspace?.calendar && workspace.calendar !== 'calendar-month' ? 'accounting period' : 'month'} end` : method.toUpperCase()} ${days} exact calendar days; ${collection ? 'collect' : 'pay'} ${settlement}.` }
 }
 const target = addMonths(month, legacyLag)
 return { events: [{ month: target, date: workspace ? periodForKey(workspace, target).endDate : monthEnd(target), amount, collection, label }], trace: '' }
}

/** A contract curve applies to real planned invoice dates, never revenue dates. */
export function curveContracts(contracts: ContractCalculation, inputs: Data[], months: string[], workspace?: CalendarWorkspace) {
 const period = (date: string) => workspace ? datePeriod(workspace, date) : date.slice(0, 7)
 for (const input of inputs.filter(r => r.kind === 'contract' && r.collectionMethod === 'curve')) {
  const invoices = contracts.invoices.filter(i => i.originId === input.originId)
  contracts.invoices = contracts.invoices.filter(i => i.originId !== input.originId)
  for (const invoice of invoices) {
   const parts = apportion(invoice.amount, input.collectionCurve.map((r: Data) => r.bps))
   input.collectionCurve.forEach((r: Data, i: number) => contracts.invoices.push({ ...invoice, amount: parts[i], collectionDate: afterDays(invoice.date, r.days) }))
  }
  const changed = contracts.invoices.filter(i => i.originId === input.originId)
  const ar = (month: string) => changed.reduce((n, i) => n + (period(i.date) <= month ? i.amount : 0) - (period(i.collectionDate) <= month ? i.amount : 0), 0)
  const prior = addMonths(months[0], -1)
  contracts.opening.receivables += ar(prior) - invoices.reduce((n, i) => n + (period(i.date) <= prior ? i.amount : 0) - (period(i.collectionDate) <= prior ? i.amount : 0), 0)
  for (const row of contracts.rows.filter(r => r.originId === input.originId)) {
   row.receivables = ar(row.month)
   row.collections = changed.filter(i => period(i.collectionDate) === row.month).reduce((n, i) => n + i.amount, 0)
   row.trace = row.trace.replace(/collections .*\.$/, `collections ${row.collections} minor units under the invoice collection curve.`)
   row.trace = row.trace.replace(/DSO \d+ exact calendar days after invoice date\./, `Collection curve from each invoice date: ${input.collectionCurve.map((r: Data) => `${r.bps} basis points at ${r.days} exact calendar days`).join('; ')}; largest-remainder cent allocation, earliest installment wins ties.`)
  }
 }
 for (const month of contracts.months) {
  const rows = contracts.rows.filter(r => r.month === month.month)
  month.receivables = rows.reduce((n, r) => n + r.receivables, 0)
  month.collections = rows.reduce((n, r) => n + r.collections, 0)
  if (inputs.some(r => r.kind === 'contract' && r.collectionMethod === 'curve')) month.trace = 'Contract totals: collections follow the entered invoice-date collection curves or exact DSO; all invoice installments conserve cents. Deferred recognition and receivables reconcile independently.'
 }
}
export type WorkingCapitalMonth = { month: string; prepaid: number; accruedLiabilities: number; prepaidExpense: number; accruedExpense: number; prepaidPayments: number; accruedPayments: number; trace: string }
export type WorkingCapitalRow = WorkingCapitalMonth & { originId: string; name: string; line: string; department: string; kind: string }
export type WorkingCapitalCalculation = { opening: { prepaid: number; accruedLiabilities: number }; months: WorkingCapitalMonth[]; rows: WorkingCapitalRow[]; issues: { month: string; line: string; department: string; reason: string }[] }
type Posting = { input: Data; month: string; expense: number; payment: number; prepaid: boolean; detail: string }
export function workingCapital(model: Model, months: string[], allocations: Data[] = []) {
 const postings: Posting[] = [], cash: TimingCash[] = [], before = addMonths(months[0], -1)
 const money = (n: number) => formatMoney(n, model.workspace.currency)
 const retail = model.workspace.calendar && model.workspace.calendar !== 'calendar-month'
 const post = (input: Data, month: string, expense: number, payment: number, prepaid: boolean, detail: string) => postings.push({ input, month, expense, payment, prepaid, detail })
 for (const input of model.inputs.expense.filter(e => ['prepaid', 'bonus'].includes(e.kind))) {
  if (input.kind === 'prepaid') {
   post(input, input.paymentMonth, 0, input.amountCents, true, `Prepayment ${money(input.amountCents)} paid in ${input.paymentMonth}; service starts ${input.start}, ${input.amortizationMonths} ${retail ? 'accounting-period' : 'monthly'} installments.`)
   const base = Number(BigInt(input.amountCents) / BigInt(input.amortizationMonths))
   for (let k = 0; k < input.amortizationMonths; k++) post(input, addMonths(input.start, k), k === input.amortizationMonths - 1 ? input.amountCents - base * k : base, 0, true, `Total ${money(input.amountCents)} / ${input.amortizationMonths} ${retail ? 'periods' : 'months'}; floor installments ${money(base)}, final service ${retail ? 'period' : 'month'} receives cent remainder.`)
  } else {
   const base = Number(BigInt(input.amountCents) / 3n)
   for (let k = 0; addMonths(input.start, k) <= months.at(-1)!; k++) {
    const month = addMonths(input.start, k)
    post(input, month, k % 3 === 2 ? input.amountCents - base * 2 : base, 0, false, `Quarterly bonus ${money(input.amountCents)} accrues in three ${retail ? 'accounting-period' : 'monthly'} installments; final ${retail ? 'period' : 'month'} receives cent remainder. First settlement ${input.payMonth}, then every three ${retail ? 'periods' : 'months'}.`)
    if (k % 3 === 0) post(input, addMonths(input.payMonth, k), 0, input.amountCents, false, `Quarterly bonus settles on ${periodForKey(model.workspace, addMonths(input.payMonth, k)).endDate}.`)
   }
  }
 }
 const payroll = (input: Data, month: string, expense: number) => {
  const date = payDate(month, input.payDay, input.payMonthOffset, model.workspace)
  post(input, month, expense, 0, false, `Payroll earned ${month}; pay date ${date} (${retail ? '1-based day within the target accounting period, clamped to period end' : 'day clamped to calendar month end'}).`)
  post(input, datePeriod(model.workspace, date), 0, expense, false, `Payroll earned ${month} settles ${date}.`)
 }
 const commissions = commissionEstimates(model.inputs.revenue, model.inputs.position, model.workspace.currency)
 // Prior earned salaries seed explicitly estimated opening accruals, rather
 // than restarting a continuing position's payment calendar at plan start.
 for (const p of model.inputs.position.filter(p => p.payDay)) {
  const priorMonths = [3,2,1].map(offset => addMonths(months[0],-offset))
  const schedule = compensationSchedule(p, priorMonths, model.workspace.currency, model.workspace, false)
  for (let offset = 3; offset >= 1; offset--) {
   const month = addMonths(months[0], -offset)
   if (p.start <= month && (!p.end || month <= p.end)) { const components = schedule.get(month)!; payroll(p, month, components.total - components.bonus + (commissions.get(`${p.originId}|${month}`)?.amount ?? 0)); if(components.bonus) payroll({...p,payMonthOffset:0},month,components.bonus) }
  }
 }
 let prepared = false
 const openingDeltas = new Map<string, { month: string; delta: number; trace: string }>()
 const prepare = () => {
  if (prepared) return
  prepared = true
  for (const a of allocations.filter(a => ['bs:prepaid', 'bs:accrued-liabilities'].includes(a.target))) {
   const parts = postings.filter(p => p.input.originId === a.originId)
   requireThat(parts.length > 0, 'Allocated working-capital schedule no longer exists', 409)
   const prior = parts.filter(p => p.month <= a.month).reduce((n, p) => n + (p.prepaid ? p.payment - p.expense : p.expense - p.payment), 0)
   const delta = a.amount - prior
   openingDeltas.set(a.originId, { month: a.month, delta, trace: a.trace })
   if (a.target === 'bs:prepaid') {
    const future = parts.filter(p => p.month > a.month && p.expense > 0)
    requireThat(future.length > 0, 'Prepaid opening needs remaining service months', 409)
    const base = Number(BigInt(a.amount) / BigInt(future.length))
    future.forEach((p, i) => { p.expense = i === future.length - 1 ? a.amount - base * i : base; p.detail += ` ${a.trace} Imported remaining balance amortizes over ${future.length} remaining service months; final month receives the cent remainder.` })
   } else {
    const payment = parts.filter(p => p.month > a.month && p.payment > 0).sort((a, b) => a.month.localeCompare(b.month))[0]
    requireThat(payment && payment.payment + delta >= 0, 'Accrued opening needs a sufficient future scheduled settlement; no pay date is inferred', 409)
    payment.payment += delta; payment.detail += ` ${a.trace} First entered future settlement replaces its estimated opening-accrual component by the imported amount.`
   }
  }
 }
 const expenseRows = () => { prepare(); return postings.filter(p => p.expense && p.input.kind && months.includes(p.month)).map(p => ({ input: p.input, month: p.month, source: { kind: 'expense', id: p.input.originId, label: p.input.name, amount: p.expense, trace: p.detail } as Source })) }
 const finish = (): WorkingCapitalCalculation => {
  prepare()
  cash.length = 0
  for (const p of postings.filter(p => p.payment && p.month >= months[0])) cash.push({ month: p.month, amount: p.payment, collection: false, label: p.input.name ?? p.input.title, line: p.input.line, department: p.input.department, source: p.input.originId })
  const inputs = [...new Map(postings.map(p => [p.input.originId, p.input])).values()]
  const balance = (input: Data, through: string) => postings.filter(p => p.input.originId === input.originId && p.month <= through).reduce((n, p) => n + (p.prepaid ? p.payment - p.expense : p.expense - p.payment), 0) + (through >= (openingDeltas.get(input.originId)?.month ?? '9999') ? openingDeltas.get(input.originId)!.delta : 0)
  const opening = { prepaid: 0, accruedLiabilities: 0 }
  const rows: WorkingCapitalRow[] = []
  for (const input of inputs) {
   const prepaid = input.kind === 'prepaid'
   opening[prepaid ? 'prepaid' : 'accruedLiabilities'] += balance(input, before)
   for (const month of months) {
    const parts = postings.filter(p => p.input.originId === input.originId && p.month === month)
    const expense = parts.reduce((n, p) => n + p.expense, 0), payments = parts.reduce((n, p) => n + p.payment, 0), closing = balance(input, month), prior = balance(input, addMonths(month, -1))
    rows.push({ originId: input.originId, name: input.name ?? input.title, line: input.line, department: input.department, kind: input.kind ?? 'payroll', month, prepaid: prepaid ? closing : 0, accruedLiabilities: prepaid ? 0 : closing, prepaidExpense: prepaid ? expense : 0, accruedExpense: prepaid ? 0 : expense, prepaidPayments: prepaid ? payments : 0, accruedPayments: prepaid ? 0 : payments,
     trace: `${openingDeltas.get(input.originId)?.trace ?? ''} ${month}: ${input.name ?? input.title}; opening ${money(prior)} ${month === months[0] ? '(estimate from entered payment/service assumptions; not imported balances)' : ''} ${prepaid ? '+ paid − recognized' : '+ earned − settled'} = closing ${money(closing)}; expense ${money(expense)}, payment ${money(payments)}. ${parts.map(p => p.detail).join(' ')}` })
   }
  }
  const totals = months.map(month => {
   const parts = rows.filter(r => r.month === month)
   const fields = ['prepaid', 'accruedLiabilities', 'prepaidExpense', 'accruedExpense', 'prepaidPayments', 'accruedPayments'] as const
   return { month, ...Object.fromEntries(fields.map(f => [f, parts.reduce((n, r) => n + r[f], 0)])), trace: `${month}: prepaid balance = opening + prepayments − amortization; accrued liabilities = opening + earned payroll/bonus − pay-date settlements. Reviewed CONNECT-007 allocations replace schedule opening estimates at the last closed month, with source attribution in each affected row.` } as WorkingCapitalMonth
  })
  return { opening, months: totals, rows, issues: [] }
 }
 return { payroll, expenseRows, finish, cash }
}
