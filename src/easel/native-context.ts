import { boundEntity } from './entity-scope'
import { actualCells } from './actuals-read'
import type { Context } from './context'
import { prepareCalculation, type Calculation, type Model } from './engine'
import { historySourceMonths, assertHistorySources, historyOverlay } from './history-sources'
import { ledgerContext } from './ledger-context'
import { model } from './model'
import { nativeBindings } from './native-input'
import { nativeRuntime, type NativeGraph } from './native-calculation'
import { frozenModel } from './reforecasts'
import { addMonths, range } from './months'
import { get, requireThat, type Data } from './types'

/** Load source material once; references consume availability lazily during evaluation. */
export async function calculateNativeContext(c:Context,scenario:string,through?:string):Promise<Calculation> {
 const models=new Map<string,Model>(),frozen=new Map<string,Calculation>(),ledgers=new Map<string,Awaited<ReturnType<typeof ledgerContext>>>()
 const sourceDefinitions:Data={versions:{},actuals:[]}
 async function load(id:string):Promise<void>{
  if(models.has(id)||frozen.has(id))return
  const sc=get(c.s,'scenario',id)
  if(sc.status==='frozen'){const saved=await frozenModel(c,sc);frozen.set(id,saved.calculation);sourceDefinitions.versions[id]={scenario:saved.scenario,inputs:saved.inputs,calculation:saved.calculation};return}
  const m=model(c.s,id);if(id===scenario&&through!==undefined)m.scenario={...m.scenario,actualsThrough:through};models.set(id,m)
  await assertHistorySources(c,historySourceMonths(m),boundEntity(c.s,m.scenario)?.id)
  if(m.scenario.actualsThrough)ledgers.set(id,await ledgerContext(c,m.scenario.actualsThrough,m.scenario.ledgerAllocations??[],m.scenario.balanceLedger===true,boundEntity(c.s,m.scenario)?.id))
  for(const input of m.inputs.formula??[])for(const b of nativeBindings(input))if(b.scenario&&b.scenario!=='actuals')await load(b.scenario)
 }
 await load(scenario)
 const partitions=new Map<string,Awaited<ReturnType<typeof actualCells>>>()
 for(const [id,m] of models)partitions.set(id,await actualCells(c.db,c.s,undefined,boundEntity(c.s,m.scenario)?.id))
 const actuals=partitions.get(scenario)??[]
 const allMonths=[...models.values()].flatMap(m=>range(addMonths(m.workspace.planStart,-120),m.workspace.horizon+240))
 const usesActuals=[...models.values()].some(m=>(m.inputs.formula??[]).some(f=>JSON.stringify(f.expression??f.members).includes('ACTUAL')||nativeBindings(f).some(b=>b.scenario==='actuals')))
 const overlay=usesActuals?await historyOverlay(c,[...new Set(allMonths)],boundEntity(c.s,get(c.s,'scenario',scenario))?.id):null
 const graphs=new Map<string,NativeGraph>()
 const runtime=nativeRuntime(id=>{
  const saved=frozen.get(id);if(saved)return {frozen:saved}
  let g=graphs.get(id);if(!g){const m=models.get(id);requireThat(m,`Missing version '${id}'`,409);g=prepareCalculation(m,partitions.get(id)??[],ledgers.get(id));graphs.set(id,g)}return g
 },(line,department,month,sourceScenario)=>{
  requireThat(!overlay?.blockedMonths.includes(month),`Actuals history reconciliation blocked for ${month}`,409)
  const cell=(partitions.get(sourceScenario??scenario)??actuals).find(a=>a.line===line&&a.department===department&&a.month===month)
  requireThat(cell,`Missing accepted actuals for ${month}, line ${line}, department ${department}`,409)
  if(!sourceDefinitions.actuals.some((a:Data)=>a.line===line&&a.department===department&&a.month===month))sourceDefinitions.actuals.push(cell)
  return cell
 })
 const resultGraph=runtime.graph(scenario);requireThat(!('frozen'in resultGraph),'Use captured arithmetic for a frozen scenario',409)
 const values=runtime.resolve(scenario),result=resultGraph.finish(values)
 for(const [id,m]of models)if(id!==scenario){const graph=runtime.graph(id);requireThat(!('frozen'in graph),'Working source graph is unavailable',409);sourceDefinitions.versions[id]={scenario:m.scenario,workspace:m.workspace,lines:m.lines,departments:m.departments,inputs:m.inputs,calculation:graph.finish(runtime.resolve(id))}}
 if(values.length)result.nativeSources=sourceDefinitions
 return result
}
