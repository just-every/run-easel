// AGENT-004 backtest plumbing: kept forecasts are read from their immutable
// snapshots and never written. A revision is tried on a recalculation of the
// kept inputs; that recalculation must first reproduce the stored kept cells,
// otherwise the forecast is excluded and the reason shown.
import { actualCells } from '../actuals-read'
import type { Context } from '../context'
import { calculate, type Calculation, type Cell } from '../engine'
import { dimensionStructure } from '../dimensions'
import { departments, lines } from '../model'
import { addMonths, range } from '../months'
import { snapshot } from '../store'
import { Fault, type Data } from '../types'
import { MAX_KEPT } from './learning-measures'

export type Kept = { month: string; snapshot: string; sha256: string; body: Data; window: string[] }

/** The last twelve kept forecasts, oldest first, each with the closed months it can be judged on. */
export async function keptForecasts(c: Context, forecast: Data): Promise<Kept[]> {
 const out: Kept[] = []
 for (const k of (forecast.priorForecasts ?? []).slice(-MAX_KEPT)) {
  const sn = await snapshot(c.db, k.snapshot)
  const through = forecast.actualsThrough as string
  out.push({ month: k.month, snapshot: sn.id, sha256: sn.sha256, body: sn.body, window: k.month <= through ? range(k.month, monthsSpan(k.month, through)) : [] })
 }
 return out
}
const monthsSpan = (from: string, to: string) => { let n = 1; for (let m = from; m < to; m = addMonths(m, 1)) n++; return n }

const key = (c: { line: string; department: string; month: string }) => `${c.line}|${c.department}|${c.month}`
const amounts = (cells: Cell[], window: Set<string>) => new Map(cells.filter(c => window.has(c.month)).map(c => [key(c), c.amount]))

/** Signed error (actual − forecast) by line|department|month over the kept forecast's closed window. */
export function cellErrors(forecast: Cell[], actual: Cell[], window: string[]) {
 const w = new Set(window), f = amounts(forecast, w), a = amounts(actual.filter(c => c.basis === 'actual'), w)
 const out = new Map<string, number>()
 for (const k of new Set([...f.keys(), ...a.keys()])) { const e = (a.get(k) ?? 0) - (f.get(k) ?? 0); if (e) out.set(k, e) }
 return out
}

export const sumAbs = (errors: Map<string, number>, include: (k: string) => boolean = () => true) => [...errors].filter(([k]) => include(k)).reduce((n, [, e]) => n + Math.abs(e), 0)

/** Recalculates a kept forecast with `inputs` against today's accepted actuals. */
export async function rebuild(c: Context, k: Kept, inputs: Data, actuals: Awaited<ReturnType<typeof actualCells>>, structure = dimensionStructure(c.s)): Promise<Calculation> {
 const b = k.body
 return calculate({ workspace: b.workspace, lines: lines(c.s), departments: departments(c.s), scenario: b.scenario, inputs: inputs as any, dimensionStructure: structure }, actuals)
}

export const sameCells = (kept: Cell[], rebuilt: Cell[], window: string[]) => {
 const w = new Set(window), a = amounts(kept, w), b = amounts(rebuilt, w)
 return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)
}
export const isFault = (e: unknown): e is Fault => e instanceof Fault
