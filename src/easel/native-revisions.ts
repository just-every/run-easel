import type { Context } from './context'
import { INPUT_KINDS } from './model'
import { nativeBindings, nativeExpressions } from './native-input'
import { visitExpression } from './native-expression'
import { workingCalculation } from './calculation'
import { semanticEqual } from './semantic'
import { all, find, put, type State } from './types'

/** A source edit changes every working consumer's reviewed arithmetic revision. */
export async function nativeRevisions(c:Context,before:State):Promise<Set<string>> {
 const changed=new Set<string>();let global=false,actuals=false
 for(const key of new Set([...before.keys(),...c.s.keys()])){
  const a=before.get(key),b=c.s.get(key),r=b??a!
  if(semanticEqual(a?.value,b?.value))continue
  if(['workspace','line','department','account-map','account-rule','department-map'].includes(r.kind))global=true
  if(['batch','account-map','account-rule','department-map'].includes(r.kind))actuals=true
  if((INPUT_KINDS as readonly string[]).includes(r.kind)){if(a?.value.scenario)changed.add(a.value.scenario);if(b?.value.scenario)changed.add(b.value.scenario)}
  if(r.kind==='scenario'&&(!a||!b||['cash','horizon','actualsThrough','ledgerAllocations','balanceLedger'].some(field=>!semanticEqual(a?.value[field],b?.value[field]))))changed.add(r.id)
 }
 const formulas=all(c.s,'formula'),affected=new Set(changed)
 if(global)for(const f of formulas)affected.add(f.scenario)
 if(actuals)for(const f of formulas)for(const e of nativeExpressions(f))visitExpression(e,n=>{if(n.name==='ACTUAL'||n.binding?.scenario==='actuals')affected.add(f.scenario)})
 for(let more=true;more;){more=false;for(const f of formulas)if(!affected.has(f.scenario)&&nativeBindings(f).some(b=>b.scenario&&affected.has(b.scenario))){affected.add(f.scenario);more=true}}
 for(const id of affected){
  const sc=find(c.s,'scenario',id);if(!sc||sc.status!=='working'||!formulas.some(f=>f.scenario===id))continue
  await workingCalculation(c,id)
  const prior=find(before,'scenario',id)
  if(prior&&sc.revision===prior.revision){
   put(c.s,'scenario',id,{...sc,revision:sc.revision+1})
   c.activity.push({action:'formula-sources-changed',record:id,scenario:id,before:sc.revision,after:sc.revision+1,detail:{sourceScenarios:[...changed]}})
  }
 }
 return affected
}
