import type { Data } from './types'
import { requireThat } from './types'

/** QBO reports move prior-year profit into retained earnings at fiscal rollover.
 * That report reclassification is displayed separately from posted revenue;
 * it must never become an invented journal or change a month's earned revenue. */
export function reconcileQboTrial(chart:Map<string,Data>,opening:Map<string,number>,movement:Map<string,number>,closing:Map<string,number>,from:string,fiscalStart:unknown) {
 const residual=new Map<string,number>()
 for(const id of new Set([...opening.keys(),...movement.keys(),...closing.keys()])) {
  const value=(closing.get(id)??0)-(opening.get(id)??0)-(movement.get(id)??0)
  requireThat(Number.isSafeInteger(value),'QuickBooks reconciliation exceeds exact cents',502)
  if(value)residual.set(id,value)
 }
 const fiscalMonth=['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(String(fiscalStart))+1
 const rollover=Number(from.slice(5,7))===fiscalMonth
 const pnl=new Set(['Income','Other Income','Expense','Other Expense','Cost of Goods Sold'])
 const automaticClose=new Map<string,number>()
 const explained=rollover && residual.size>0 && [...residual].every(([id,value])=>{
  const account=chart.get(id)
  return account && (pnl.has(account.type)?value===-(opening.get(id)??0):account.type==='Equity'&&account.subtype==='RetainedEarnings')
 }) && [...residual.values()].reduce((n,value)=>n+value,0)===0
 if(explained)for(const [id,value]of residual)automaticClose.set(id,value)
 const differences=[...residual].filter(([id])=>!automaticClose.has(id)).map(([accountId,amount])=>({accountId,amount}))
 return{opening:Object.fromEntries(opening),movement:Object.fromEntries(movement),closing:Object.fromEntries(closing),automaticClose:Object.fromEntries(automaticClose),differences,balanced:differences.length===0,
  basis:explained?'Provider fiscal-year report transfer from prior-year profit to retained earnings; posted monthly revenue is unchanged':'Opening source balance plus posted monthly movements'}
}
