import { dimensionAllowed } from './access'
import { find, type Access, type Data, type State } from './types'

export function entityAllowed(s: State, x: Access, entity: Data) {
 return dimensionAllowed(s, x, { [entity.dimension]: entity.member })
}

/** Apply on ordinary scenario doors as well as consolidation reads. */
export function entityScenarioAllowed(s: State, x: Access, scenario: Data) {
 const seen = new Set<string>()
 let current: Data | undefined = scenario
 while (current) {
  if (seen.has(current.id)) return false
  seen.add(current.id)
  if (current.entity) {
   const entity = find(s, 'entity', current.entity)
   return !!entity && entityAllowed(s, x, entity)
  }
  current = current.parent ? find(s, 'scenario', current.parent) : undefined
 }
 return true
}
