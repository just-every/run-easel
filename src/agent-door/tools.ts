import { ToolRefusal, type ToolDefinition } from '../modules/agent-door/index.ts'
import { deletionReplay } from './deletion.ts'
import { planningTarget } from './targets.ts'
import { outputSchema } from './schemas.ts'
import { catalogue } from './catalogue.ts'
import { nativeAction, nativeContext, nativeAdmission, type NativeAdmission, recordClasses } from './native.ts'
import { scenarioLink } from './resources.ts'
import { find, type Data } from '../easel/types'

export function planningTools(): ToolDefinition[] {
 // A door is built per request. These read-only admission snapshots never
 // become persistent effects or outlive a pending HTTP request.
 const admissions = new Map<string, NativeAdmission>()
 const key = (ctx: Parameters<ToolDefinition['classify']>[1], tool: string) => `${ctx.operationId}\0${tool}`
 const admitted = (ctx: Parameters<ToolDefinition['classify']>[1], tool: string) => {
  const value = admissions.get(key(ctx, tool))
  if (!value) throw new ToolRefusal('native_admission_missing')
  return value
 }
 return catalogue.map(tool => ({
 name: tool.name, title: tool.name, description: tool.description, scope: tool.scope, readOnly: tool.readOnly,
 inputSchema: { ...tool.inputSchema, type: 'object' }, outputSchema: outputSchema(tool.nativeName), classes: tool.classes, clauses: tool.clauses, untrusted: true,
 target: (args, ctx) => planningTarget(tool.nativeName, args, ctx),
 async classify(args, ctx) {
  if (tool.nativeName === 'input-delete') { const retained = await deletionReplay(args, ctx); if (retained) { admissions.set(key(ctx, tool.name), nativeAdmission(retained.c)); return recordClasses(retained.input) } }
  // Native status reads expire interrupted jobs. Classification must never do that.
  if (tool.nativeName === 'calculation_status') { const c = await nativeContext(ctx); admissions.set(key(ctx, tool.name), nativeAdmission(c)); return recordClasses(null) }
  const { c, result } = await nativeAction(tool.nativeName, args, ctx, false)
  admissions.set(key(ctx, tool.name), nativeAdmission(c))
  if (!tool.classes.includes('sensitive')) return recordClasses(null)
  // Preserve the filtered view's line metadata when classifying payroll inputs.
  // Wrapping it as an effect list loses the relationship to payroll lines.
  if (tool.readOnly && tool.nativeName !== 'variance') return recordClasses(result)
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
   const { c, result } = await nativeAction(tool.nativeName, args, ctx, false, admitted(ctx, tool.name))
   const id = String(args.scenario ?? args.from ?? args.id ?? result.id ?? '')
   const target = find(c.before, 'scenario', id)
   return { target: { id, name: String(target?.name ?? result.name ?? result.title ?? tool.description.split('.')[0]) }, items: [String(result.name ?? result.title ?? result.text ?? tool.nativeName), `Planning revision ${c.revision}`] }
  },
 } : {}),
 async run(args, ctx) {
  try {
   // Approved reads run again on later requests; re-read native authority and
   // fence that current view instead of depending on an earlier request's map.
   const admission = tool.readOnly ? nativeAdmission(await nativeContext(ctx)) : admitted(ctx, tool.name)
   const { result } = await nativeAction(tool.nativeName, args, ctx, true, admission)
   const record = tool.nativeName === 'scenario' ? result.scenario : ['proposal-create', 'proposal-submit'].includes(tool.nativeName) ? result : null
   return { result, ...(record?.id ? { resources: [scenarioLink(record)] } : {}) }
  } finally { admissions.delete(key(ctx, tool.name)) }
 },
}))
}
