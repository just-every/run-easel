import { INPUT_KINDS } from './model'
import { find, type Data, type State } from './types'

/** Keep the published small-business size inline; larger mutations get a job. */
export const INLINE_INPUT_ROWS = 2000
export function backgroundScenario(s: State, op: string, b: Data): string | undefined {
 if (!['revenue', 'expense', 'position', 'schedule', 'allocation', 'formula', 'asset', 'debt', 'equity', 'tax-policy', 'input-delete', 'input-dimensions', 'grid-save', 'grid-undo'].includes(op)) return undefined
 const id = typeof b.scenario === 'string' ? b.scenario : op === 'input-delete' && b.kind && b.id ? find(s, b.kind, b.id)?.scenario : undefined
 if (!id) return undefined
 const count = [...s.values()].filter(r => INPUT_KINDS.includes(r.kind as any) && r.kind !== 'workbook-model' && r.value.scenario === id).length
 return count > INLINE_INPUT_ROWS ? id : undefined
}
