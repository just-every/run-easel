import { canSeeDashboard } from './dashboard-access'
import { find, type Access, type Data, type State } from './types'

// Stored review/audit metadata is historical evidence, never a grant to read
// another person's private report. Reapply the current audience on every door.
export function visiblePipelineMetadata(s:State,x:Access,value:any):any {
 if(Array.isArray(value))return value.map(v=>visiblePipelineMetadata(s,x,v))
 if(!value||typeof value!=='object')return value
 return Object.fromEntries(Object.entries(value).map(([key,v])=>{
  if(key==='impacts'&&v&&typeof v==='object'){
   const impacts=v as Data
   return [key,{...impacts,reports:(impacts.reports??[]).filter((r:Data)=>{
    const dashboard=find(s,'dashboard',r.id)
    return dashboard&&canSeeDashboard(s,x,dashboard)
   })}]
  }
  return [key,visiblePipelineMetadata(s,x,v)]
 }))
}
