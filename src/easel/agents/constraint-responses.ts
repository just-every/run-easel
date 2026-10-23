import { agentEnabled, requireAgent } from './governance'
// AGENT-002: three to five responses that restore a broken constraint, found
// only among the levers finance marked adjustable. Every response is
// recalculated in full before it is offered and created as a draft proposal
// bound to the forecast revision it was searched on; the owner picks one (and
// finance promotes that exact revision through the ordinary proposal doors) or
// rejects them all with a reason. The agent never changes the plan itself.
import { requireCapability, requireFinance } from '../access'
import type { Context } from '../context'
import type { Calculation } from '../engine'
import { scenarioInputs } from '../model'
import { addMonths } from '../months'
import { plan } from '../plan'
import { formatMoney } from '../units'
import { find, get, put, requireThat, text, type Data } from '../types'
import { constraints, evaluator, restored } from './agent-evaluate'
import { applyLever, LEVER_UNIT, levers, type LeverKind } from './levers'
import { CONSTRAINTS } from './constraint-watch'

const MAX_EVALUATIONS = 700, MAX_RESPONSES = 5, WANT = 3
const KINDS = ['revenue', 'position', 'expense'] as const

type Level = { lever: Data; level: number }
type Found = { levels: Level[]; calc: Calculation; changes: string[]; load: number }

const grid = (lever: Data) => {
 const step = lever.kind === 'hire-start' ? 1 : 5, out: number[] = []
 for (let n = step; n <= lever.max; n += step) out.push(n)
 if (!out.includes(lever.max)) out.push(lever.max)
 return out
}
const revenue = (calc: Calculation, months: string[]) => calc.profit.filter(p => months.includes(p.month)).reduce((n, p) => n + p.revenue, 0)

export async function constraintCommands(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['constraint-check', 'constraint-respond', 'constraint-reject'].includes(op)) return undefined
 if (op !== 'constraint-reject') requireAgent(c, 'responses')
 requireCapability(c.x, 'approvals', c.s); requireFinance(c.x)
 if (op === 'constraint-check') {
  // The API runs the watch for this action after every command that can move a constraint.
  c.activity.push({ action: op, record: 'constraints', detail: {} })
  return { checked: true }
 }
 const item = get(c.s, 'decision-item', b.item, 'decision item')
 if (op === 'constraint-reject') {
  requireThat(item.status === 'open', 'Only an open decision item can be rejected', 409)
  const reason = text(b.reason, 'Reason', 2000)
  for (const r of item.responses ?? []) {
   const p = find(c.s, 'scenario', r.proposal)
   if (p?.proposalStatus === 'draft' || p?.proposalStatus === 'submitted') put(c.s, 'scenario', p.id, { ...p, status: 'closed', proposalStatus: 'declined', declinedBy: c.x.actor.email, reason: `Constraint responses rejected: ${reason}` })
  }
  put(c.s, 'decision-item', item.id, { ...item, status: 'rejected', rejectedBy: c.x.actor.email, rejectedAt: c.now, rejectedReason: reason })
  c.activity.push({ action: op, record: item.id, detail: { reason } })
  return get(c.s, 'decision-item', item.id)
 }
 requireThat(item.status === 'open', 'Only an open decision item gets responses', 409)
 requireThat(!(item.responses ?? []).some((r: Data) => ['draft', 'submitted'].includes(find(c.s, 'scenario', r.proposal)?.proposalStatus)), 'Responses already exist: promote one or reject them all first', 409)
 const forecast = get(c.s, 'scenario', item.forecast)
 requireThat(Number(b.revision) === forecast.revision && item.forecastRevision === forecast.revision, 'The forecast changed since this item was opened; check constraints again', 409)
 const firstOpen = forecast.actualsThrough ? addMonths(forecast.actualsThrough, 1) : '0000-00'
 const ev = await evaluator(c, forecast)
 const baseInputs = Object.fromEntries(KINDS.map(k => [k, ev.model.inputs[k]])) as Data
 const usable = levers(c).filter(l => applyLever(baseInputs, l, 1, firstOpen))
 requireThat(usable.length > 0, 'Mark at least one input that has not started as an adjustable lever first', 409)
 const baseCalc = ev.run({}), futureMonths = baseCalc.months.filter(m => m >= firstOpen)
 let evaluations = 0
 const attempt = (levels: Level[]): Found | null => {
  if (++evaluations > MAX_EVALUATIONS) return null
  let inputs = baseInputs; const changes: string[] = []
  for (const { lever, level } of levels) { const applied = applyLever(inputs, lever, level, firstOpen); if (!applied) return null; inputs = applied.inputs as Data; changes.push(applied.change) }
  const calc = ev.run(inputs)
  return restored(constraints(c, calc, forecast)) ? { levels, calc, changes, load: levels.reduce((n, l) => n + Math.round(l.level * 10000 / l.lever.max), 0) } : null
 }
 const found: Found[] = [], solo = new Set<string>()
 for (const lever of usable) for (const level of grid(lever)) { const f = attempt([{ lever, level }]); if (f) { found.push(f); solo.add(lever.id); break } }
 if (found.length < WANT) {
  const rest = usable.filter(l => !solo.has(l.id))
  for (let i = 0; i < rest.length && evaluations < MAX_EVALUATIONS; i++) for (let j = 0; j < rest.length && evaluations < MAX_EVALUATIONS; j++) if (i !== j) for (const fraction of [25, 50, 75, 100]) {
   const first = Math.max(1, Math.ceil(rest[i].max * fraction / 100))
   const f = grid(rest[j]).map(level => attempt([{ lever: rest[i], level: first }, { lever: rest[j], level }])).find(Boolean)
   if (f) found.push(f)
  }
 }
 requireThat(found.length > 0, 'No combination of the adjustable levers restores this constraint within their bounds; widen a bound or mark another lever', 409)
 const unique = new Map<string, Found>()
 // One response per set of levers: the smallest total change that restores the constraint.
 for (const f of found) { const key = f.levels.map(l => l.lever.id).sort().join('|'), kept = unique.get(key); if (!kept || f.load < kept.load) unique.set(key, f) }
 const ranked = [...unique.values()].map(f => ({ f, forgone: revenue(baseCalc, futureMonths) - revenue(f.calc, futureMonths) })).sort((a, b) => a.f.load - b.f.load || a.forgone - b.forgone || a.f.changes.join().localeCompare(b.f.changes.join())).slice(0, MAX_RESPONSES)
 const money = (n: number) => formatMoney(n, baseCalc.currency)
 const responses: Data[] = []
 for (const [i, { f, forgone }] of ranked.entries()) {
  const k = constraints(c, f.calc, forecast)
  const request = text(`Response ${i + 1} to ${CONSTRAINTS[item.constraint as keyof typeof CONSTRAINTS]}: ${f.changes.join('; ')}. Recalculated: lowest forecast cash ${money(k.lowest!.closingCents)} in ${k.lowest!.month}${k.minRunwayHundredths === null ? '' : `, shortest runway ${k.minRunwayHundredths / 100} months`}; revenue forgone ${money(forgone)}. ${item.summary}`, 'Request', 2000)
  const proposal = (await plan(c, 'proposal-create', { from: forecast.id, name: `Response ${i + 1}: ${f.changes.join('; ')}`.slice(0, 200), request }))!
  const copied = Object.fromEntries(KINDS.map(kind => [kind, scenarioInputs(c.s, proposal.id, kind)])) as Data
  let revised = copied
  for (const { lever, level } of f.levels) revised = applyLever(revised, lever, level, firstOpen)!.inputs as Data
  for (const kind of KINDS) copied[kind].forEach((row: Data, n: number) => { if (revised[kind][n] !== row) put(c.s, kind, row.id, revised[kind][n]) })
  const moved = baseCalc.cells.flatMap(cell => { const after = f.calc.cells.find(x => x.line === cell.line && x.department === cell.department && x.month === cell.month)?.amount ?? 0; return after === cell.amount ? [] : [{ line: cell.line, department: cell.department, month: cell.month, before: cell.amount, after }] })
  const response = { proposal: proposal.id, name: proposal.name, changes: f.changes, levers: f.levels.map(l => ({ lever: l.lever.id, level: l.level, unit: LEVER_UNIT[l.lever.kind as LeverKind] })), restores: true, newLowestCash: k.lowest, shortestRunwayHundredths: k.minRunwayHundredths, cost: { revenueForgoneCents: forgone }, movedCells: moved.length, moved: moved.slice(0, 20), changeLoadBps: f.load / f.levels.length }
  put(c.s, 'scenario', proposal.id, { ...get(c.s, 'scenario', proposal.id), agentResponse: { item: item.id, ...response, moved: undefined } })
  responses.push(response)
 }
 put(c.s, 'decision-item', item.id, { ...item, responses, respondedAt: c.now, searched: { evaluations, levers: usable.length, forecastRevision: forecast.revision } })
 c.activity.push({ action: op, record: item.id, detail: { responses: responses.length, evaluations } })
 return get(c.s, 'decision-item', item.id)
}
