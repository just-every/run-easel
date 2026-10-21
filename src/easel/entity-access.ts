import { dimensionAllowed } from './access'
import { type Access, type Data, type State } from './types'

export function entityAllowed(s: State, x: Access, entity: Data) {
 return dimensionAllowed(s, x, { [entity.dimension]: entity.member })
}
