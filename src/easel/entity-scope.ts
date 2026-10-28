import { all, find, get, requireThat, type Data, type State } from './types'

/** Derived versions retain the source entity boundary until finance binds a
 * separate official plan explicitly. Binding does not change other entities. */
export function boundEntity(s: State, scenario: Data): Data | undefined {
 const seen = new Set<string>(); let current: Data | undefined = scenario
 while (current) {
  requireThat(!seen.has(current.id), 'Scenario ancestry contains a cycle', 409); seen.add(current.id)
  if (current.entity) return get(s, 'entity', current.entity)
  current = current.parent ? find(s, 'scenario', current.parent) : undefined
 }
 return undefined
}
export function entityDimensions(s: State, scenario: string, supplied: Record<string, string> = {}) {
 const entity = boundEntity(s, get(s, 'scenario', scenario))
 if (!entity) return supplied
 requireThat(supplied[entity.dimension] === undefined || supplied[entity.dimension] === entity.member, 'Inputs cannot move to another entity inside this plan', 409)
 return { ...supplied, [entity.dimension]: entity.member }
}

/** A connected entity's working forecast succeeds its frozen budget, retaining the same source binding. */
export function entitySourcePlan(s:State,entity:Data) {
 const source=get(s,'scenario',entity.scenario)
 if(source.status==='frozen'&&all(s,'intacct-entity').some(r=>r.entity===entity.id))
  return all(s,'scenario').find(sc=>sc.parent===source.id&&sc.kind==='forecast'&&sc.status==='working')??source
 return source
}
