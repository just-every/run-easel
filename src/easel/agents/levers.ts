// AGENT-002 levers: the only inputs the agent may touch. Finance marks each
// one adjustable with a bound; an input that is not marked is never changed in
// any response. A lever names an input by its origin, so it follows the input
// into every scenario copy, and a response moves it only while the input has
// not started.
import { requireCapability, requireFinance, requirePayDetail } from '../access'
import type { Context } from '../context'
import { scenarioInputs } from '../model'
import { addMonths } from '../months'
import { all, choice, get, integer, put, remove, requireThat, text, uid, type Data } from '../types'
import { mulDiv } from '../units'

export const LEVER_KINDS = ['hire-start', 'spend-cut', 'collection-days'] as const
export type LeverKind = typeof LEVER_KINDS[number]
export const LEVER_UNIT: Record<LeverKind, string> = { 'hire-start': 'months', 'spend-cut': 'percent', 'collection-days': 'days' }
const LIMIT: Record<LeverKind, number> = { 'hire-start': 12, 'spend-cut': 100, 'collection-days': 120 }

export type Applied = { inputs: Data; change: string }

/** The input a lever names in a scenario's inputs, if it can still move. */
function target(inputs: Data, lever: Data, firstOpen: string): { kind: 'position' | 'expense' | 'revenue'; row: Data } | null {
 const kind = lever.kind === 'hire-start' ? 'position' : lever.kind === 'spend-cut' ? 'expense' : 'revenue'
 const row = (inputs[kind] ?? []).find((r: Data) => r.originId === lever.origin)
 if (!row || row.start < firstOpen) return null
 if (lever.kind === 'spend-cut' && (!['recurring', 'one-off'].includes(row.kind) || !(row.amountCents > 0))) return null
 if (lever.kind === 'collection-days' && (row.kind !== 'contract' || !(row.dsoDays > 0))) return null
 return { kind, row }
}

const shiftDate = (date: string, months: number) => {
 const target = addMonths(date.slice(0, 7), months), last = new Date(Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)).getUTCDate()
 return `${target}-${String(Math.min(Number(date.slice(8)), last)).padStart(2, '0')}`
}

/** Applies a lever at a level (months, percent or days); null when the input is gone, started or cannot move that way. */
export function applyLever(inputs: Data, lever: Data, level: number, firstOpen: string): Applied | null {
 const t = target(inputs, lever, firstOpen)
 if (!t || level < 1 || level > lever.max) return null
 let row = t.row, change: string
 if (lever.kind === 'hire-start') {
  const start = addMonths(row.start, level)
  row = { ...row, start, ...(row.plannedStartDate ? { plannedStartDate: shiftDate(row.plannedStartDate, level) } : {}), ...(row.end && row.end < start ? { end: start } : {}) }
  change = `${lever.label}: start ${row.start === t.row.start ? '' : `${t.row.start} → `}${start}`
 } else if (lever.kind === 'spend-cut') {
  const amountCents = mulDiv(t.row.amountCents, 100 - level, 100)
  row = { ...row, amountCents }
  change = `${lever.label}: cut ${level}%`
 } else {
  const dsoDays = Math.max(0, t.row.dsoDays - level)
  row = { ...row, dsoDays }
  change = `${lever.label}: collect ${t.row.dsoDays - dsoDays} days sooner`
 }
 return { inputs: { ...inputs, [t.kind]: inputs[t.kind].map((r: Data) => r === t.row ? row : r) }, change }
}

export function leverCommands(c: Context, op: string, b: Data): Data | undefined {
 if (op !== 'lever-save' && op !== 'lever-delete') return undefined
 requireCapability(c.x, 'approvals', c.s); requireFinance(c.x)
 if (op === 'lever-delete') {
  const lever = get(c.s, 'lever', b.id, 'lever')
  remove(c.s, 'lever', lever.id)
  c.activity.push({ action: op, record: lever.id, detail: { label: lever.label } })
  return { deleted: lever.id }
 }
 const kind = choice(b.kind, LEVER_KINDS, 'a lever kind')
 const forecast = get(c.s, 'scenario', b.scenario, 'forecast')
 requireThat(forecast.kind === 'forecast' && forecast.status === 'working', 'Levers are marked on the official working forecast', 409)
 const inputs = Object.fromEntries((['position', 'expense', 'revenue'] as const).map(k => [k, scenarioInputs(c.s, forecast.id, k)]))
 const row = inputs[kind === 'hire-start' ? 'position' : kind === 'spend-cut' ? 'expense' : 'revenue'].find((r: Data) => r.originId === b.origin)
 requireThat(row, 'Choose an input of that kind in the forecast', 404)
 if (kind === 'hire-start') requirePayDetail(c.x)
 const max = integer(b.max, `Largest ${LEVER_UNIT[kind]} change`, 1, LIMIT[kind])
 requireThat(target(inputs, { kind, origin: row.originId, max }, forecast.actualsThrough ? addMonths(forecast.actualsThrough, 1) : '0000-00'), 'This input cannot move: it has started or has nothing to cut', 409)
 const existing = all(c.s, 'lever').find(l => l.origin === row.originId && l.kind === kind)
 const id = existing?.id ?? uid()
 put(c.s, 'lever', id, { kind, origin: row.originId, label: text(b.label ?? (row.title ?? row.name), 'Lever label', 120), max, scenario: forecast.id, savedBy: c.x.actor.email, savedAt: c.now })
 c.activity.push({ action: op, record: id, detail: { kind, max } })
 return get(c.s, 'lever', id)
}
export const levers = (c: Context) => all(c.s, 'lever').sort((a, b) => a.label.localeCompare(b.label))
