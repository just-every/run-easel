import { workspace } from './model'
import { addMonths } from './months'
import type { Context } from './context'
import { boundEntity } from './entity-scope'
import { all,find,type Data } from './types'

/** Observations hold only consumers of that entity/period. Captures never change. */
export function netsuiteSourceBlock(c:Context,scenario:Data,through?:string){
 if(scenario.status==='frozen')return null
 const entity=boundEntity(c.s,scenario),w=workspace(c.s)
 const last=through??addMonths(w.planStart,(scenario.horizon??w.horizon)-1)
 const pending=all(c.s,'netsuite-observation').filter(o=>(!entity||o.entity===entity.id)&&o.month<=last).filter(o=>{
  const accepted=find(c.s,'netsuite-month',o.id)
  return o.error||!accepted||accepted.status!=='accepted'||accepted.sourceDigest!==o.sourceDigest
 })
 return pending.length?pending.map(o=>`NetSuite ${o.month} subsidiary ${o.subsidiaryId}: ${o.error??'source changed; review mappings, impacts and trial balance, then accept the refreshed month'}`).join('; '):null
}
