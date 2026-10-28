import { canonicalJson } from '../modules/import-kit/src/d1/index'
import type { Context } from './context'
import { addMonths } from './months'
import { all,find,put,requireThat,type State,type Data } from './types'
export function finishNetSuiteMonth(c:Context,batch:Data,undone=false){
 const source=batch.netsuiteSource;if(!source)return
 put(c.s,'netsuite-month',source.id,{...source,status:undone?'undone':'accepted',acceptedAt:c.now,batch:batch.id})
 if(!undone){const prior=find(c.s,'connection','netsuite');if(prior?.account===source.account)put(c.s,'connection','netsuite',{...prior,inventory:source.inventory,lastRefresh:c.now,rowCount:source.ledgerRows,error:null,rateLimit:null})}
}
export function requireNetSuiteHistory(s:State,through:string,entity:string){
 const records=all(s,'netsuite-month').filter(m=>m.entity===entity&&m.month<=through)
 for(const binding of new Set(records.map(m=>m.binding))){
  const history=records.filter(m=>m.binding===binding).sort((a,b)=>a.month.localeCompare(b.month));if(!history.length)continue
  let previous:Data|undefined
  for(let period=history[0].month;period<=through;period=addMonths(period,1)){
   const row=history.find(m=>m.month===period)
   requireThat(row?.status==='accepted',`NetSuite history is incomplete for ${period}; re-pull the reviewed entity month`,409)
   if(previous)for(const account of new Set([...Object.keys(previous.trialBalance.closing),...Object.keys(row.trialBalance.opening)]))requireThat((previous.trialBalance.closing[account]??0)===(row.trialBalance.opening[account]??0),`NetSuite cumulative source balances changed before ${period}; re-pull the dependent month`,409)
   previous=row
  }
 }
}
