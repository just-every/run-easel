import { decimal } from './units'
import { get, integer, requireThat, type Data, type State } from './types'

/** Normalize only the declared Actuals reference, never other input fields. */
export function validateHistoryInput(s: State, b: Data): Data {
 const history = b.history
 requireThat(history && typeof history === 'object' && !Array.isArray(history), 'Choose an actuals history reference')
 const growthBps = decimal(history.growthPercent ?? '0', 'Actuals growth %', 2, { negative: true, max: 100000n })
 requireThat(growthBps >= -10000, 'Actuals growth cannot be below -100%')
 return {
  sourceLine: get(s, 'line', history.sourceLine, 'actuals source line').id,
  sourceDepartment: get(s, 'department', history.sourceDepartment, 'actuals source department').id,
  offset: integer(history.offset ?? 12, 'Actuals month offset', 1, 60),
  window: integer(history.window ?? 1, 'Actuals averaging months', 1, 60),
  growthBps,
 }
}
