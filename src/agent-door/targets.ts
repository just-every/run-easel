import type { NativeTarget, ToolContext } from '../modules/agent-door/index.ts'
import { nativeAction } from './native.ts'
import { deletionReplay } from './deletion.ts'
import { find, type Data } from '../easel/types'

/** Resolve only native records after the action's real visibility/authority checks. */
export async function planningTarget(name: string, args: Data, ctx: ToolContext): Promise<NativeTarget | null> {
 if (['scenarios','compare','variance','calculation_status'].includes(name)) return null
 if (name === 'input-delete') {
  const retained = await deletionReplay(args, ctx)
  if (retained) return { kind: args.kind, id: retained.input.id }
 }
 const { c } = await nativeAction(name, args, ctx, false)
 const kind = name === 'input-delete' ? args.kind : ['proposal-submit'].includes(name) ? 'scenario' : name
 const record = typeof args.id === 'string' ? find(c.before, kind, args.id) : null
 if (record) return { kind, id: record.id }
 const scenarioId = args.scenario ?? args.from
 const scenario = typeof scenarioId === 'string' ? find(c.before, 'scenario', scenarioId) : null
 if (scenario) return { kind: 'scenario', id: scenario.id }
 const line = typeof args.line === 'string' ? find(c.before, 'line', args.line) : null
 return line ? { kind: 'line', id: line.id } : null
}
