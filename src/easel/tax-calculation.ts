import { addCalendarMonths, datePeriod, periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { addMonths } from './months'
import { formatMoney, mulDiv } from './units'
import type { Data } from './types'
export type SalesTaxMonth={month:string;collectedCents:number;remittedCents:number;payableCents:number;trace:string}
export function salesTaxes(events:{month:string;date?:string;amount:number}[],months:string[],policy:Data,currency:string,workspace?:CalendarWorkspace):SalesTaxMonth[] {
 const remit = (e: {month:string;date?:string}) => workspace ? datePeriod(workspace, addCalendarMonths(e.date ?? periodForKey(workspace, e.month).endDate, policy.salesTaxRemitLagMonths)) : addMonths(e.month,policy.salesTaxRemitLagMonths)
 const collected=new Map<string,number>(),remitted=new Map<string,number>()
 for(const e of events) {
  const tax=mulDiv(e.amount,policy.salesTaxBps,10000),pay=remit(e)
  collected.set(e.month,(collected.get(e.month)??0)+tax);remitted.set(pay,(remitted.get(pay)??0)+tax)
 }
 let payable=events.reduce((n,e)=>{const tax=mulDiv(e.amount,policy.salesTaxBps,10000);return n+(e.month<months[0]?tax:0)-(remit(e)<months[0]?tax:0)},0)
 return months.map(month=>{
  const received=collected.get(month)??0,paid=remitted.get(month)??0;payable+=received-paid
  return {month,collectedCents:received,remittedCents:paid,payableCents:payable,trace:`Planning sales-tax pass-through: revenue invoice collections × ${policy.salesTaxBps} basis points, rounded half away once per collection. Collected ${formatMoney(received,currency)}, remitted ${formatMoney(paid,currency)} after ${policy.salesTaxRemitLagMonths} calendar months; payable ${formatMoney(payable,currency)}. Revenue excludes tax; the rate and cash-basis remittance timing are finance assumptions, not a determination of taxability or a filing.`}
 })
}
export function incomeTaxes(profit:{month:string;profit:number}[],policy:Data,currency:string) {
 let loss=policy.openingLossCents
 return profit.map(row=>{
  const opening=loss,positive=Math.max(0,row.profit),used=Math.min(loss,mulDiv(positive,policy.lossOffsetBps,10000))
  const taxable=positive-used,tax=mulDiv(taxable,policy.federalIncomeBps+policy.stateIncomeBps,10000)
  loss=loss-used+Math.max(0,-row.profit)
  return {month:row.month,preTaxProfitCents:row.profit,lossUsedCents:used,taxableCents:taxable,taxCents:tax,lossClosingCents:loss,trace:`C-corporation planning estimate, assumption year ${policy.year}: accounting profit ${formatMoney(row.profit,currency)} approximates taxable profit; opening loss ${formatMoney(opening,currency)}, use ${formatMoney(used,currency)} limited to ${policy.lossOffsetBps} basis points of positive profit; taxable ${formatMoney(taxable,currency)} × combined federal ${policy.federalIncomeBps} + state ${policy.stateIncomeBps} basis points = ${formatMoney(tax,currency)}, rounded half away once. Carryforward ${formatMoney(loss,currency)}. Estimated tax is paid in the recognition month; no return, refund or filing is produced.`}
 })
}
