import { boundEntity } from './entity-scope'
import { all,get,requireThat,type State,type Data } from './types'
/** An absent scope always means legacy, unbound actuals. Never infer ownership. */
export function ledgerEntity(s:State,scenario?:string):string|undefined{return scenario?boundEntity(s,get(s,'scenario',scenario))?.id:undefined}
export function ledgerWhere(entity?:string){return entity?{sql:"json_extract(value,'$.entity')=?",params:[entity]}:{sql:"json_extract(value,'$.entity') IS NULL",params:[] as string[]}}
export function entityReceipts(s:State,entity?:string){return entity?all(s,'intacct-month').filter(r=>r.entity===entity&&r.status==='accepted'):[]}
export function requireIntacctHistory(s:State,through:string,entity?:string){
 if(!entity)return
 const binding=all(s,'intacct-entity-map').find(r=>r.entity===entity)
 requireThat(binding,'Entity actuals require an entity-scoped ledger connection',409)
 const history=all(s,'intacct-month').filter(r=>r.entity===entity).sort((a,b)=>a.month.localeCompare(b.month))
 requireThat(history.length>0,'No reviewed Intacct history covers this entity',409)
 const accepted=new Set(history.filter(r=>r.status==='accepted').map(r=>r.month))
 for(let m=history[0].month;m<=through;){requireThat(accepted.has(m),`Intacct history is incomplete for ${m}; accept this entity month before consuming later balances`,409);const d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);m=d.toISOString().slice(0,7)}
}
export function sameLedgerRow(row:Data,entity?:string){return entity?row.entity===entity:!row.entity}

/** Use the current fenced model, including a just-completed journal whose
 * accepted receipt is being saved with alerts/tasks in this same command. */
export function acceptedLedgerFilter(s:State){
 const destinations=all(s,'batch').filter(batch=>['importing','undoing','failed'].includes(batch.status)).map(batch=>batch.destination)
 return destinations.length?{sql:'destination NOT IN (SELECT value FROM json_each(?))',params:[JSON.stringify(destinations)]}:{sql:'1',params:[] as string[]}
}
