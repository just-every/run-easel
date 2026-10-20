import type { Data } from './types'
import type { Cell, Sheet } from './xlsx-write'

export function workingCapitalSheet(working:Data,currency:string,prefix=''):Sheet {
 const rows:Cell[][]=[[`${currency} minor units; opening balances are entered schedule estimates`],['Month','Opening prepaid','Prepayments','Amortization','Closing prepaid','Opening accrued','Earned payroll and bonus','Settlements','Closing accrued','Trace']]
 for(const [i,m] of working.months.entries()) {
  const r=i+3
  rows.push([m.month,i?{formula:`E${r-1}`,value:working.months[i-1].prepaid}:working.opening.prepaid,m.prepaidPayments,m.prepaidExpense,{formula:`B${r}+C${r}-D${r}`,value:m.prepaid},i?{formula:`I${r-1}`,value:working.months[i-1].accruedLiabilities}:working.opening.accruedLiabilities,m.accruedExpense,m.accruedPayments,{formula:`F${r}+G${r}-H${r}`,value:m.accruedLiabilities},m.trace])
 }
 return {name:`${prefix}Working capital`,rows}
}
