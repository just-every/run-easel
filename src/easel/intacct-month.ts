import type { Context } from './context'
import { addMonths } from './months'
import { all,find, put,requireThat, type Data,type State } from './types'

/** Source-month evidence follows the actual import journal, including continuation and undo. */
export function finishIntacctMonth(c: Context, batch: Data, undone = false) {
 const source=batch.intacctSource
 if(!source)return
 put(c.s,'intacct-month',source.id,{...source,status:undone?'undone':'accepted',acceptedAt:c.now,batch:batch.id})
 const connection=find(c.s,'connection','intacct')
 if(!undone && connection && source.realmId.startsWith(connection.realmId+':'))
  put(c.s,'connection','intacct',{...connection,inventory:source.inventory,lastRefresh:c.now,rowCount:source.ledgerRows,error:null,rateLimit:null})
}

export function requireIntacctHistory(s:State,through:string,entity?:string){
 const records=all(s,'intacct-month').filter(r=>r.entity===entity)
 for(const source of new Set(records.map(r=>`${r.environment}:${r.realmId}`))){
  const history=records.filter(r=>`${r.environment}:${r.realmId}`===source).sort((a,b)=>a.month.localeCompare(b.month))
  const accepted=new Set(history.filter(r=>r.status==='accepted'&&r.month<=through).map(r=>r.month as string))
  if(!accepted.size)continue
  const last=[...accepted].sort().at(-1)!
  for(let period=history[0].month;period<=last;period=addMonths(period,1))requireThat(accepted.has(period),`Intacct history is incomplete for ${period}; re-pull that reviewed month before consuming later balances`,409)
 }
}
