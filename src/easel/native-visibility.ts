import { seesDepartmentDetail, seesPayDetail } from './access'
import type { Dependency } from './native-calculation'
import { nativeBindings } from './native-input'
import { canSeeScenario } from './scenario-access'
import { all, find, type Access, type Data, type State } from './types'

export function visibleNativeDependencies(x:Access,dependencies:Dependency[],s?:State):boolean {
 return dependencies.every(d=>seesDepartmentDetail(x,d.department)&&(!d.payroll||seesPayDetail(x,d.department))&&(!d.scenario||!s||!find(s,'scenario',d.scenario)||canSeeScenario(x,find(s,'scenario',d.scenario)!)))
}
export function visibleNativeInput(s:State,x:Access,input:Data,seen=new Set<string>(),candidates=all(s,'formula')):boolean {
 if(seen.has(input.originId))return true;seen.add(input.originId)
 if(!seesDepartmentDetail(x,input.department)||input.line&&find(s,'line',input.line)?.payroll&&!seesPayDetail(x,input.department))return false
 for(const b of nativeBindings(input)){
  if(b.department&&!seesDepartmentDetail(x,b.department))return false
  if(b.line&&find(s,'line',b.line)?.payroll&&!seesPayDetail(x,b.department!))return false
  if(b.scenario&&b.scenario!=='actuals'){const sc=find(s,'scenario',b.scenario);if(!sc||!canSeeScenario(x,sc))return false}
  if(b.origin){const source=candidates.find(f=>f.scenario===input.scenario&&f.originId===b.origin);if(source&&!visibleNativeInput(s,x,source,seen,candidates))return false}
 }
 return true
}
