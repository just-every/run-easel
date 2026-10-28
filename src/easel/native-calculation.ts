import type { ActualCell, Calculation, Cell, Model } from './engine'
import { addMonths, monthsBetween, range } from './months'
import { evaluateExpression, numeric, checked, type Evaluated } from './native-evaluate'
import { incomeTaxes } from './tax-calculation'
import { apportion, formatHundredths } from './units'
import { requireThat, type Data } from './types'

export type NativeBase={model:Model;cells:Cell[];headcount:Record<string,Record<string,number>>}
export type FormulaValue={originId:string;name:string;unit:string;dimension?:string;member?:string;month:string;value:number;trace:string;department:string;line?:string;dependencies:Dependency[]}
export type Dependency={department:string;payroll?:boolean;scenario?:string}
export type NativeGraph={base:NativeBase;finish:(values:FormulaValue[])=>Calculation}
export type NativeRuntime={graph:(scenario:string)=>NativeGraph|{frozen:Calculation};actual:(line:string,department:string,month:string,scenario:string)=>ActualCell;resolve:(scenario:string)=>FormulaValue[]}

/** One memoized graph spans drivers, members, periods, final lines and versions. */
export function nativeRuntime(graph:NativeRuntime['graph'],actual:NativeRuntime['actual']):NativeRuntime {
 const values=new Map<string,FormulaValue>(),stack:{key:string;label:string}[]=[]
 const protect=<T>(key:string,label:string,work:()=>T):T=>{
  const index=stack.findIndex(s=>s.key===key);requireThat(index<0,`Circular formula: ${[...stack.slice(Math.max(0,index)).map(s=>s.label),label].join(' → ')}`,409)
  requireThat(stack.length<500,'Formula dependency chain is too deep',409);stack.push({key,label});try{return work()}finally{stack.pop()}
 }
 const dep=(m:Model,line:string,department:string):Dependency=>({department,payroll:m.lines.find(l=>l.id===line)?.payroll===true||m.inputs.position.some(p=>p.line===line&&p.department===department),scenario:m.scenario.id})
 function finalLine(scenario:string,line:string,department:string,month:string,deps:Dependency[]):Evaluated {
  const g=graph(scenario)
  if('frozen'in g){const c=g.frozen.cells.find(c=>c.line===line&&c.department===department&&c.month===month);requireThat(c,`Missing captured version cell ${scenario}, ${line}, ${department}, ${month}`,409);deps.push({scenario,department,payroll:c.sources.some(s=>s.kind==='position')});for(const source of c.sources)if(source.kind==='formula')deps.push(...(g.frozen.formulaValues??[]).filter(r=>r.originId===source.id&&r.month===month).flatMap(r=>r.dependencies));return {value:c.amount,trace:`Captured version ${scenario}, line ${line}, department ${department}, ${month} = ${formatHundredths(c.amount)}`}}
  const {model:m,headcount}=g.base;requireThat(range(m.workspace.planStart,m.workspace.horizon).includes(month),`Missing version period ${m.scenario.name}: ${month}`,409)
  deps.push(dep(m,line,department))
  const raw=(l:string,d:string):Evaluated=>rawLine(g.base,l,d,month,deps)
  let value=numeric(raw(line,department)),trace=`${m.scenario.name}: ${m.lines.find(l=>l.id===line)?.name}, ${m.departments.find(d=>d.id===department)?.name}, ${month}`
  if(m.lines.find(l=>l.id===line)?.type!=='revenue')for(const rule of m.inputs.allocation){
   const weights=rule.targets.map((t:Data)=>rule.basis==='headcount'?headcount[t.department]?.[month]??0:t.bps)
   if(weights.every((w:number)=>w===0))continue
   if(rule.sourceDepartment===department){value=0;trace+=`; allocated out by ${rule.name}`}
   const index=rule.targets.findIndex((t:Data)=>t.department===department)
   if(index>=0){const source=numeric(raw(line,rule.sourceDepartment));deps.push(dep(m,line,rule.sourceDepartment));value=checked(BigInt(value)+BigInt(apportion(source,weights)[index]));trace+=`; allocated from ${m.departments.find(d=>d.id===rule.sourceDepartment)?.name} by ${rule.name}`}
  }
  return {value,trace:`${trace} = ${formatHundredths(value)}`}
 }
 function rawLine(base:NativeBase,line:string,department:string,month:string,deps:Dependency[]):Evaluated {
  const m=base.model,key=`line|${m.scenario.id}|${line}|${department}|${month}`
  // Dependency collection is deliberately repeated even when arithmetic is cached.
  deps.push(dep(m,line,department))
  return protect(key,`${m.scenario.name}: LINE(${m.lines.find(l=>l.id===line)?.name}, ${m.departments.find(d=>d.id===department)?.name}, ${month})`,()=>{
   const closed=m.scenario.actualsThrough&&month<=m.scenario.actualsThrough
   const cell=base.cells.find(c=>c.line===line&&c.department===department&&c.month===month)
   if(closed){requireThat(cell,`Missing accepted line cell ${line}, ${department}, ${month}`,409);return {value:cell.amount,trace:cell.sources.map(s=>s.trace).join('; ')}}
   const policy=m.inputs['tax-policy']?.[0]
   if(policy?.line===line&&policy.department===department){
    const periods=range(m.workspace.planStart,monthsBetween(m.workspace.planStart,month)+1)
    const profits=periods.map(period=>({month:period,profit:checked(m.lines.filter(l=>l.id!==line).reduce((sum,l)=>sum+m.departments.reduce((n,d)=>n+BigInt(numeric(rawLine(base,l.id,d.id,period,deps)))*(l.type==='revenue'?1n:-1n),0n),0n))}))
    const tax=incomeTaxes(profits,policy,m.workspace.currency).at(-1)!;return {value:tax.taxCents,trace:tax.trace}
   }
   let amount=BigInt(cell?.amount??0)
   for(const f of m.inputs.formula??[])if(f.line===line&&f.department===department&&month>=f.start&&(!f.end||month<=f.end))for(const member of f.members??[{name:undefined}]){const row=driver(base,f,month,member.name);amount+=BigInt(row.value);deps.push(...row.dependencies)}
   const value=checked(amount);return {value,trace:`${month}: ${formatHundredths(value)}`}
  })
 }
 function driver(base:NativeBase,f:Data,month:string,member?:string):FormulaValue {
  const m=base.model,key=`driver|${m.scenario.id}|${f.originId}|${month}|${member??''}`,cached=values.get(key);if(cached)return cached
  return protect(key,`${m.scenario.name}: ${f.name}${member?`[${member}]`:''} (${month})`,()=>{
   requireThat(month>=f.start&&(!f.end||month<=f.end)&&month>=m.workspace.planStart&&month<=addMonths(m.workspace.planStart,m.workspace.horizon-1),`Missing driver '${f.name}' for ${month}`,409)
   const row=member===undefined?f:f.members?.find((r:Data)=>r.name.toLowerCase()===member.toLowerCase());requireThat(row,`Missing member '${member}' in '${f.dimension}'`,409)
   const dependencies:Dependency[]=[dep(m,f.line,f.department)]
   const result=evaluateExpression(row.expression,{period:monthsBetween(m.workspace.planStart,month)+1,member,reference:(node,evaluate)=>{
    const a=node.args,b=node.binding!;requireThat(b,`Unbound ${node.name} reference`,409)
    const offset=(i:number,defaultValue=0)=>{const v=a[i]?numeric(evaluate(a[i])):defaultValue*100;requireThat(v%100===0&&Math.abs(v)<=12000,'Reference offset must be a whole number from -120 to 120',409);return v/100}
    if(b.origin){
     const target=(m.inputs.formula??[]).find(f=>f.originId===b.origin);requireThat(target,`Missing driver referenced by '${f.name}'`,409)
     const sourceMonth=addMonths(month,node.name==='PRIOR'?-offset(1,1):offset(node.name==='LOOKUP'?3:node.name==='SUM'?2:1))
     const read=(name?:string)=>{const v=driver(base,target,sourceMonth,name);dependencies.push(...v.dependencies);return {value:v.value,trace:`${target.name}${name?`[${name}]`:''}, ${sourceMonth}: ${v.trace}`}}
     if(node.name==='LOOKUP'){const name=evaluate(a[2]);requireThat(typeof name.value==='string','LOOKUP member must be a name',409);return read(name.value)}
     if(node.name==='SUM'){const rows=target.members.map((r:Data)=>read(r.name));return {value:checked(rows.reduce((n:bigint,r:Evaluated)=>n+BigInt(numeric(r)),0n)),trace:`SUM ${target.name} over ${target.dimension}: ${rows.map((r:Evaluated)=>r.trace).join('; ')}`}}
     return read()
    }
    const sourceMonth=addMonths(month,offset(node.name==='VERSION'?3:2))
    if(node.name==='ACTUAL'||b.scenario==='actuals'){const source=actual(b.line!,b.department!,sourceMonth,m.scenario.id);dependencies.push(dep(m,b.line!,b.department!));return {value:source.amount,trace:`Actuals ${m.lines.find(l=>l.id===b.line)?.name}, ${m.departments.find(d=>d.id===b.department)?.name}, ${sourceMonth}: ${formatHundredths(source.amount)} from ${source.rows} accepted rows (${source.batches.join(', ')})`}}
    if(b.scenario){const source=graph(b.scenario),currency='frozen'in source?source.frozen.currency:source.base.model.workspace.currency;requireThat(currency===m.workspace.currency,'Version formula references require the same currency',409)}
    return finalLine(b.scenario??m.scenario.id,b.line!,b.department!,sourceMonth,dependencies)
   }})
   const resultRow:FormulaValue={originId:f.originId,name:f.name,unit:f.unit,...(f.dimension?{dimension:f.dimension,member:row.name}:{}),month,value:numeric(result),trace:`${f.name}${member?`[${member}]`:''}, ${month}: ${row.formula}; ${result.trace}`,department:f.department,...(f.line?{line:f.line}:{}),dependencies:[...new Map(dependencies.map(d=>[JSON.stringify(d),d])).values()]}
   values.set(key,resultRow);return resultRow
  })
 }
 return {graph,actual,resolve(scenario){const g=graph(scenario);if('frozen'in g)return g.frozen.formulaValues??[];const m=g.base.model;const result:FormulaValue[]=[];for(const f of m.inputs.formula??[])for(const month of range(m.workspace.planStart,m.workspace.horizon).filter(month=>month>=f.start&&(!f.end||month<=f.end)))for(const member of f.members??[{name:undefined}])result.push(driver(g.base,f,month,member.name));return result}}
}
