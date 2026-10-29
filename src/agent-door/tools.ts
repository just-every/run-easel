import type { ClassAndFacts, ToolDefinition } from '../modules/agent-door/index.ts'
import { catalogue } from './catalogue.ts'
import { nativeAction, nativeContext } from './native.ts'
import { find, type Data } from '../easel/types'

/** Only native payroll/identity fields trigger sensitive; caller labels have no authority. */
export function sensitiveRecords(value: unknown): number {
 if (!value || typeof value !== 'object') return 0
 if (Array.isArray(value)) return value.reduce((n, item) => n + sensitiveRecords(item), 0)
 const object = value as Data
 if (Object.hasOwn(object, 'annualSalary') || Object.hasOwn(object, 'holder') && !!object.holder) return 1
 return Object.values(object).reduce<number>((n, item) => n + sensitiveRecords(item), 0)
}
export function recordClasses(value: unknown): ClassAndFacts[] {
 const n = sensitiveRecords(value)
 return [{ class: 'standard', facts: { measure: 1 } }, ...(n ? [{ class: 'sensitive' as const, facts: { measure: n, kind: 'payroll' } }] : [])]
}
export const planningTools: ToolDefinition[] = catalogue.map(tool => ({
 name: tool.name, title: tool.name, description: tool.description, scope: tool.scope, readOnly: tool.readOnly,
 inputSchema: { ...tool.inputSchema, type: 'object' }, outputSchema: { type: 'object' }, classes: tool.classes, clauses: tool.clauses, untrusted: true,
 async classify(args, ctx) {
  // Native status reads expire interrupted jobs. Classification must never do that.
  if (tool.nativeName === 'calculation_status') { await nativeContext(ctx); return recordClasses(null) }
  const { c, result } = await nativeAction(tool.nativeName, args, ctx, false)
  if (!tool.classes.includes('sensitive')) return recordClasses(null)
  const changed = [...c.s.values()].filter(row => c.before.get(`${row.kind}:${row.id}`)?.revision !== row.revision)
  const removed = [...c.before.values()].filter(row => !c.s.has(`${row.kind}:${row.id}`))
  const records = tool.readOnly ? result : [...changed.map(row => row.value), ...removed.map(row => row.value)]
  const linked = args.commissionPosition ? [...c.s.values()].find(row => row.kind === 'position' && row.value.originId === args.commissionPosition)?.value : null
  const classes = recordClasses([records, linked])
  if (tool.nativeName === 'variance' && [...c.s.values()].some(row => row.kind === 'line' && row.value.payroll)) return [{ class: 'standard', facts: { measure: 1 } }, { class: 'sensitive', facts: { measure: 1, kind: 'payroll' } }]
  return classes
 },
 ...(!tool.readOnly ? {
  revisionType: 'integer' as const,
  async revision(_args: Data, ctx: Parameters<NonNullable<ToolDefinition['revision']>>[1]) { return (await nativeContext(ctx)).revision },
  async summary(args: Data, ctx: Parameters<NonNullable<ToolDefinition['summary']>>[1]) {
   const { c, result } = await nativeAction(tool.nativeName, args, ctx, false)
   const id = String(args.scenario ?? args.from ?? args.id ?? result.id ?? '')
   const target = find(c.before, 'scenario', id)
   return { target: { id, name: String(target?.name ?? result.name ?? result.title ?? tool.description.split('.')[0]) }, items: [String(result.name ?? result.title ?? result.text ?? tool.nativeName)] }
  },
 } : {}),
 async run(args, ctx) {
  const { result } = await nativeAction(tool.nativeName, args, ctx, true)
  return { result }
 },
}))
