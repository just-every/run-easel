import { requireDepartment, requirePayDetail } from './access'
import { addMonths, month } from './months'
import { parseExpression, quoted, visitExpression, type Expression } from './native-expression'
import { scenarioAccess } from './scenario-access'
import { all, choice, get, integer, requireThat, text, type Access, type Data, type State } from './types'

const named=(rows:Data[],name:string,label:string)=>{const found=rows.filter(r=>r.id===name||String(r.name).toLowerCase()===name.toLowerCase());requireThat(found.length===1,`${label} '${name}' ${found.length?'is ambiguous':'was not found'}`,409);return found[0]}
export function nativeInput(s:State,b:Data,scenario:string):Data {
 const w=get(s,'workspace','main'),sc=get(s,'scenario',scenario),name=text(b.name,'Driver name'),unit=choice(b.unit,['money','count','percent'] as const,'a formula unit')
 requireThat(!all(s,'formula').some(f=>f.scenario===scenario&&f.originId!==b.originId&&f.name.toLowerCase()===name.toLowerCase()),`Driver '${name}' already exists`,409)
 const department=get(s,'department',b.department).id,line=b.line?get(s,'line',b.line).id:undefined
 requireThat(!line||unit==='money','Only money formulas can contribute to a financial line')
 const start=month(b.start||w.planStart,'Start month'),end=b.end?month(b.end,'End month'):''
 requireThat(start>=w.planStart&&start<=addMonths(w.planStart,(sc.horizon??w.horizon)-1),'Formula start must be within the plan')
 requireThat(!end||end>=start,'Formula end must not precede its start')
 const base:Data={name,unit,department,...(line?{line}:{}),start,end,collectionLag:integer(b.collectionLag??0,'Collection timing (months)',0,3)}
 if(b.dimension){
  base.dimension=text(b.dimension,'Dimension name');requireThat(Array.isArray(b.members)&&b.members.length>0&&b.members.length<=100,'A dimension table needs 1–100 named members')
  base.members=b.members.map((r:Data)=>({name:text(r.name,'Member name'),formula:text(r.formula,'Member formula',8000)}))
  requireThat(new Set(base.members.map((r:Data)=>r.name.toLowerCase())).size===base.members.length,'Dimension members must have distinct names')
  requireThat(!b.formula,'Choose a scalar formula or a dimension member table')
 } else {requireThat(!b.members?.length,'Name the dimension for a member table');base.formula=text(b.formula,'Formula',8000)}
 const candidates=[...all(s,'formula').filter(f=>f.scenario===scenario&&f.originId!==b.originId),{...base,originId:b.originId}]
 const bind=(source:string)=>{
  const ast=parseExpression(source)
  visitExpression(ast,node=>{
   const a=node.args
   if(['DRIVER','PRIOR','LOOKUP'].includes(node.name)||(node.name==='SUM'&&a[0]?.kind==='string')){
    const target=named(candidates.map(f=>({...f,id:f.originId})),quoted(a[0],'Driver'),'Driver')
    node.binding={origin:target.originId}
    if(node.name==='LOOKUP'||node.name==='SUM') {const dimension=quoted(a[1],'Dimension');requireThat(target.dimension?.toLowerCase()===dimension.toLowerCase(),`Driver '${target.name}' has no dimension '${dimension}'`,409);node.binding.dimension=target.dimension}
    else requireThat(!target.dimension,`Use LOOKUP or SUM for dimension driver '${target.name}'`)
   }
   if(['LINE','ACTUAL','VERSION'].includes(node.name)) {
    const shift=node.name==='VERSION'?1:0
    const l=named(all(s,'line'),quoted(a[shift],'Line'),'Line'),d=named(all(s,'department'),quoted(a[shift+1],'Department'),'Department')
    node.binding={line:l.id,department:d.id}
    if(node.name==='VERSION') {const version=quoted(a[0],'Version');if(version.toLowerCase()==='actuals')node.binding.scenario='actuals';else node.binding.scenario=named(all(s,'scenario'),version,'Version').id}
   }
  })
  return ast
 }
 if(base.members)base.members=base.members.map((r:Data)=>({...r,expression:bind(r.formula)}));else base.expression=bind(base.formula)
 return base
}
export function nativeExpressions(f:Data):Expression[]{return f.members?f.members.map((r:Data)=>r.expression):f.expression?[f.expression]:[]}
export function nativeBindings(f:Data){const result:NonNullable<Extract<Expression,{kind:'call'}>['binding']>[]=[];for(const e of nativeExpressions(f))visitExpression(e,n=>{if(n.binding)result.push(n.binding)});return result}
/** Source authority is checked independently of the destination's authority. */
export function requireNativeSources(s:State,x:Access,f:Data,scenario:string,seen=new Set<string>()) {
 if(seen.has(f.originId))return;seen.add(f.originId)
 requireDepartment(x,f.department);if(f.line&&get(s,'line',f.line).payroll)requirePayDetail(x)
 for(const b of nativeBindings(f)) {
  if(b.department)requireDepartment(x,b.department)
  if(b.line&&get(s,'line',b.line).payroll)requirePayDetail(x)
  if(b.scenario&&b.scenario!=='actuals')scenarioAccess(s,x,b.scenario)
  if(b.origin){const source=all(s,'formula').find(r=>r.scenario===scenario&&r.originId===b.origin);if(source)requireNativeSources(s,x,source,scenario,seen)}
 }
}
