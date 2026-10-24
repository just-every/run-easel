import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { pantryKey } from './pantry-connection'
import { pantryCents, pantryDate, pantryDigest, pantryId, pantryPages } from './pantry-provider'
import { workspace } from './model'
import { requireThat, type Data } from './types'

const day=86400000
const addDays=(date:string,n:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+n*day).toISOString().slice(0,10)
/** A no-write source preview. Credits and reversed payments never masquerade as
 * paid-invoice lateness; source dates and minor units remain exact. */
export async function pantryCash(c:Context,env:Bindings,b:Data) {
 const key=await pantryKey(c,env),asOf=pantryDate(b.asOf)
 requireThat(asOf===c.now.slice(0,10),'Read current open balances on today’s UTC date; historical open balances are not inferred')
 const business=await pantryPages(key,'business');requireThat(business.length===1&&business[0].currency===workspace(c.s).currency,'Pantry and Easel currencies differ or are unavailable',409)
 const invoices=await pantryPages(key,'invoices','invoices'),bills=await pantryPages(key,'bills','bills'),payments=await pantryPages(key,'payments','payments')
 const history=new Map<string,number[]>(),paid=new Map<string,{date:string;amount:number}[]>()
 for(const payment of payments) {
  const date=pantryDate(payment.payment_date)
  requireThat(Object.hasOwn(payment,'reversal_id')&&(payment.reversal_id===null||typeof payment.reversal_id==='string'),'Pantry payment reversal state is missing',502)
  if(payment.direction!=='received'||payment.reversal_id||date>asOf)continue
  requireThat(Array.isArray(payment.allocations),'Pantry payment allocations are missing',502)
  for(const a of payment.allocations) {
   if(a.target_kind!=='invoice'||a.voided_on)continue
   const amount=pantryCents(a.amount_cents);requireThat(amount>=0,'Pantry returned a negative payment allocation',502)
   const id=pantryId(a.target_id);paid.set(id,[...(paid.get(id)??[]),{date,amount}])
  }
 }
 for(const invoice of invoices) {
  const due=pantryDate(invoice.due_date),issue=pantryDate(invoice.issue_date),total=pantryCents(invoice.total_cents),open=pantryCents(invoice.open_cents),customer=pantryId(invoice.customer_id)
  requireThat(total>=0&&open>=0&&open<=total,'Pantry invoice balance is invalid',502)
  if(invoice.kind!=='invoice'||invoice.status!=='issued'||issue>asOf||open!==0||!total)continue
  const allocations=(paid.get(invoice.id)??[]).sort((a,b)=>a.date.localeCompare(b.date));let settled=0
  for(const a of allocations){settled=pantryCents(settled+a.amount);if(settled>=total){const late=Math.max(0,Math.round((Date.parse(a.date)-Date.parse(due))/day));history.set(customer,[...(history.get(customer)??[]),late]);break}}
 }
 const events:Data[]=[],unresolved:Data[]=[]
 for(const invoice of invoices) {
  if(invoice.kind!=='invoice'||invoice.status!=='issued'||pantryDate(invoice.issue_date)>asOf||pantryCents(invoice.open_cents)===0)continue
  const customer=pantryId(invoice.customer_id),samples=history.get(customer)??[]
  if(!samples.length){unresolved.push({kind:'invoice',id:pantryId(invoice.id),reason:'No fully paid invoice history; finance must review a collection assumption'});continue}
  const lateDays=Math.floor(samples.reduce((n,v)=>n+v,0)/samples.length+0.5),date=addDays(pantryDate(invoice.due_date),lateDays)
  const event={kind:'invoice',id:pantryId(invoice.id),date,amount:pantryCents(invoice.open_cents),customer,lateDays,paidInvoiceCount:samples.length}
  if(date<=asOf)unresolved.push({...event,reason:'Expected collection date has passed; review before forecasting'})
  else events.push(event)
 }
 for(const bill of bills) {
  const amount=pantryCents(bill.open_cents);requireThat(amount>=0&&amount<=pantryCents(bill.total_cents),'Pantry bill balance is invalid',502)
  if(bill.status!=='posted'||pantryDate(bill.bill_date)>asOf||!amount)continue
  const event={kind:'bill',id:pantryId(bill.id),date:pantryDate(bill.due_date),amount}
  if(event.date<=asOf)unresolved.push({...event,reason:'Bill due date has passed; review before forecasting'})
  else events.push(event)
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 return {asOf,currency:business[0].currency,events,unresolved,complete:!unresolved.length,digest:pantryDigest({asOf,events,unresolved}),basis:'Pantry open-item source preview only. Current open balances are read now; paid history is bounded by the observation date. No plan, monthly forecast, bank balance or weekly override is changed.'}
}
