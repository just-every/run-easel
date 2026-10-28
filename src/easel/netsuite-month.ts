import type { Context } from './context'
import { addMonths } from './months'
import { all,find, put,requireThat, type Data,type State } from './types'

/** Source-month evidence follows the actual import journal, including continuation and undo. */
export function finishNetsuiteMonth(c: Context, batch: Data, undone = false) {
 const source=batch.netsuiteSource
 if(!source)return
 put(c.s,'netsuite-month',source.id,{...source,status:undone?'undone':'accepted',acceptedAt:c.now,batch:batch.id})
 const connection=find(c.s,'connection','netsuite')
 if(!undone && connection && connection.realmId===source.realmId&&connection.environment===source.environment)
  put(c.s,'connection','netsuite',{...connection,inventory:source.inventory,lastRefresh:c.now,rowCount:source.ledgerRows,error:null,rateLimit:null})
}

export function requireNetsuiteHistory(s:State,through:string,entity?:string){
 const records=all(s,'netsuite-month').filter(r=>!entity||r.entity===entity)
 for(const source of new Set(records.map(r=>`${r.environment}:${r.realmId}:${r.subsidiaryId}`))){
  const history=records.filter(r=>`${r.environment}:${r.realmId}:${r.subsidiaryId}`===source).sort((a,b)=>a.month.localeCompare(b.month))
  const accepted=new Set(history.filter(r=>r.status==='accepted'&&r.month<=through).map(r=>r.month as string))
  if(!accepted.size)continue
  const last=[...accepted].sort().at(-1)!
  for(let period=history[0].month;period<=last;period=addMonths(period,1))requireThat(accepted.has(period),`NetSuite history is incomplete for ${period}; re-pull that reviewed month before consuming later balances`,409)
 }
}
