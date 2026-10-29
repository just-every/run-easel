// Contract subledger: exact calendar dates, integer cents and conserved remainders.
import { addMonths } from './months'
import { datePeriod, periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { formatBps, formatMoney } from './units'
import { requireThat, type Data } from './types'

export type ContractMonth = { month: string; bookings: number; billings: number; revenue: number; collections: number; receivables: number; deferredRevenue: number; unbilledRevenue: number; trace: string }
export type ContractRow = ContractMonth & { originId: string; name: string; line: string; department: string }
export type ContractInvoice = { originId: string; name: string; department: string; date: string; collectionDate: string; amount: number; month?: string; collectionMonth?: string }
export type ContractBalances = { receivables: number; deferredRevenue: number; unbilledRevenue: number }
export type ContractActualIssue = { month: string; line: string; department: string; acceptedRevenue: number; scheduledRevenue: number; reason: string }
export type ContractCalculation = { actualsIssues: ContractActualIssue[]; months: ContractMonth[]; rows: ContractRow[]; invoices: ContractInvoice[]; opening: ContractBalances }
const day = 86400000
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
export function contractDate(value: unknown): string {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(stamp(value)) && iso(stamp(value)) === value, 'Contract start date must be a real date written YYYY-MM-DD')
 return value
}
export function contractPeriod(input:Data,date:string,workspace?:CalendarWorkspace):string{
 const periods=input.pipeline?.fiscalPeriods
 if(periods){const matches=periods.filter((p:Data)=>p.start<=date&&date<=p.end);requireThat(matches.length===1,'Pipeline date needs a reviewed CRM fiscal period',409);return matches[0].month}
 return workspace?datePeriod(workspace,date):date.slice(0,7)
}
// Every anniversary uses the original day, clamped to that month's last day.
const anniversary = (date: string, offset: number) => {
 const month = addMonths(date.slice(0, 7), offset)
 const end = new Date(stamp(`${addMonths(month, 1)}-01`) - day).getUTCDate()
 return `${month}-${String(Math.min(Number(date.slice(8)), end)).padStart(2, '0')}`
}
const sum = (values: number[]) => {
 const total = values.reduce((a, b) => a + BigInt(b), 0n)
 requireThat(total <= BigInt(Number.MAX_SAFE_INTEGER), 'Contract calculation exceeds the supported exact range')
 return Number(total)
}
export function contractRevenue(inputs: Data[], months: string[], currency: string, workspace?: CalendarWorkspace): ContractCalculation {
 const rows: ContractRow[] = [], invoices: ContractInvoice[] = []
 const opening: ContractBalances = { receivables: 0, deferredRevenue: 0, unbilledRevenue: 0 }
 const money = (n: number) => formatMoney(n, currency)
 const period = (date: string) => workspace ? datePeriod(workspace, date) : date.slice(0, 7)
 for (const r of inputs.filter(r => r.kind === 'contract')) {
  const amounts = Array.from({ length: r.termMonths }, (_, i) => i === r.termMonths - 1 ? r.contractValueCents - Number(BigInt(r.contractValueCents) / BigInt(r.termMonths)) * i : Number(BigInt(r.contractValueCents) / BigInt(r.termMonths)))
  if (r.pipeline) {
   const p=r.pipeline, collectionDate=iso(stamp(r.startDate)+r.dsoDays*day)
   const collectionMonth=contractPeriod(r,collectionDate,workspace)
   const dateTrace=p.dateRevision?`source close ${p.sourceCloseDate}; learned date revision ${p.dateRevision.from} + ${p.dateRevision.days} days = ${r.startDate}`:r.ownerAssumption?`source close ${p.sourceCloseDate}; native owner ${r.ownerAssumption.answeredBy} answered ${r.startDate} at ${r.ownerAssumption.answeredAt}`:`source close ${p.sourceCloseDate} + ${p.slippageDays} days = ${r.startDate}`
   invoices.push({originId:r.originId,name:r.name,department:r.department,date:r.startDate,collectionDate,amount:r.contractValueCents,month:r.start,collectionMonth})
   const earned=(through:string)=>sum(amounts.filter((_,i)=>addMonths(r.start,i)<=through))
   const balances=(through:string)=>({receivables:(r.start<=through?r.contractValueCents:0)-(collectionMonth<=through?r.contractValueCents:0),deferredRevenue:(r.start<=through?r.contractValueCents:0)-earned(through),unbilledRevenue:0})
   const prior=balances(addMonths(months[0],-1))
   for(const key of ['receivables','deferredRevenue','unbilledRevenue'] as const)opening[key]=sum([opening[key],prior[key]])
   for(const month of months){
    const index=monthsBetweenPeriod(r.start,month),revenue=index>=0&&index<amounts.length?amounts[index]:0
    const bookings=month===r.start?r.contractValueCents:0,collections=month===collectionMonth?r.contractValueCents:0
    rows.push({originId:r.originId,name:r.name,line:r.line,department:r.department,month,bookings,billings:bookings,revenue,collections,...balances(month),
     trace:`${p.provider} deal ${p.deal}, product ${p.product}: ${money(p.sourceAmountCents)} × ${formatBps(p.probabilityBps)} (${p.closed?'closed outcome':p.mode==='override'?`finance override of CRM ${p.crmProbabilityBps===null?'unavailable':formatBps(p.crmProbabilityBps)}`:'CRM probability'}) = ${money(r.contractValueCents)} weighted booking, once half-away rounded${p.priceChangePercent ? `; planning price uplift ${p.priceChangePercent}%, CRM unchanged` : ''}; ${dateTrace}; ${p.fiscalPeriod?`Salesforce fiscal period ${p.fiscalPeriod.id} (${p.fiscalPeriod.start}–${p.fiscalPeriod.end}) → `:''}${r.start}. ${p.rule}: ${r.termMonths} accounting-period installment(s), floor total/term with final cent remainder; upfront planning invoice, DSO ${r.dsoDays} days; ${month}: revenue ${money(revenue)}, collections ${money(collections)}, deferred ${money(balances(month).deferredRevenue)}. Assumption version ${p.assumptionVersion}. Planning estimate; no CRM or invoice write.`})
   }
   continue
  }
  const earned = new Map<string, number>()
  for (let i = 0; i < r.termMonths; i++) {
   const start = anniversary(r.startDate, i), end = anniversary(r.startDate, i + 1)
   let cursor = stamp(start), left = amounts[i]
   const duration = (stamp(end) - cursor) / day
   while (cursor < stamp(end)) {
    const month = period(iso(cursor))
    const next = workspace ? stamp(periodForKey(workspace, month).endDate) + day : stamp(`${addMonths(month, 1)}-01`)
    const until = Math.min(next, stamp(end))
    const amount = until === stamp(end) ? left : Number(BigInt(amounts[i]) * BigInt((until - cursor) / day) / BigInt(duration))
    earned.set(month, sum([earned.get(month) ?? 0, amount])); left -= amount; cursor = until
   }
  }
  const interval = { monthly: 1, quarterly: 3, annual: 12 }[r.billingCadence as 'monthly' | 'quarterly' | 'annual']
  const bills: ContractInvoice[] = []
  for (let i = 0; i < r.termMonths; i += interval) {
   const date = anniversary(r.startDate, i)
   bills.push({ originId: r.originId, name: r.name, department: r.department, date, collectionDate: iso(stamp(date) + r.dsoDays * day), amount: sum(amounts.slice(i, i + interval)) })
  }
  invoices.push(...bills)
  const balances = (through: string): ContractBalances => {
   const billed = sum(bills.filter(b => period(b.date) <= through).map(b => b.amount))
   const collected = sum(bills.filter(b => period(b.collectionDate) <= through).map(b => b.amount))
   const revenue = sum([...earned].filter(([m]) => m <= through).map(([, n]) => n))
   return { receivables: billed - collected, deferredRevenue: Math.max(0, billed - revenue), unbilledRevenue: Math.max(0, revenue - billed) }
  }
  const prior = balances(addMonths(months[0], -1))
  for (const key of ['receivables', 'deferredRevenue', 'unbilledRevenue'] as const) opening[key] = sum([opening[key], prior[key]])
  for (const month of months) {
   const bookings = month === (workspace ? period(r.startDate) : r.start) ? r.contractValueCents : 0
   const billings = sum(bills.filter(b => period(b.date) === month).map(b => b.amount))
   const collections = sum(bills.filter(b => period(b.collectionDate) === month).map(b => b.amount))
   const revenue = earned.get(month) ?? 0
   rows.push({ originId: r.originId, name: r.name, line: r.line, department: r.department, month, bookings, billings, revenue, collections, ...balances(month),
    trace: `${r.name}: contract ${money(r.contractValueCents)} starts ${r.startDate}, ${r.termMonths} service months; ${r.billingCadence} upfront billing; DSO ${r.dsoDays} exact calendar days after invoice date. Service-month installments floor total cents / term; final installment receives the cent remainder. Anniversaries clamp the original day to Gregorian month end. ${workspace?.calendar && workspace.calendar !== 'calendar-month' ? 'Accounting-period' : 'Calendar-month'} recognition splits installments by actual service days (end exclusive), floors each non-final segment and assigns remaining cents to the final segment. Invoice, collection and booking dates map to their accounting periods. ${month}: bookings ${money(bookings)}, billings ${money(billings)}, revenue ${money(revenue)}, collections ${money(collections)}.` })
  }
 }
 const totals = months.map(month => {
  const parts = rows.filter(r => r.month === month)
  const values = Object.fromEntries(['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue', 'unbilledRevenue'].map(key => [key, sum(parts.map(r => r[key as keyof ContractMonth] as number))]))
  return { month, ...values, trace: 'Contract totals: bookings at start; invoices billed upfront by cadence; revenue earned over service dates; collections on invoice date plus exact DSO days. Deferred revenue is billed less earned; unbilled revenue is earned less billed, shown separately by contract.' } as ContractMonth
 })
 return { months: totals, rows, invoices, opening, actualsIssues: [] }
}
const monthsBetweenPeriod=(from:string,to:string)=>(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5))-Number(from.slice(5))
