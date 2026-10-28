import { ledgerScope } from './ledger-scope'
import { DIMENSION_KINDS, dimensionStructure } from './dimensions'
import { dimensionVersionCells } from './dimensions-report'
import { nativeRevisions } from './native-revisions'
import { historyOverlay } from './history-sources'
import { addMonths } from './months'
import { workingCalculation } from './calculation'
// The existing append-only, finance-only trail is the model's version store.
// Capture definitions and their effects inside the same fenced model save.
import type { Context } from './context'
import { INPUT_KINDS } from './model'
import { semanticEqual } from './semantic'
import { all, Fault, find, type Data, type State } from './types'

const GLOBAL_KINDS = ['workspace', 'line', 'department', 'account-map', 'account-rule', 'department-map', ...DIMENSION_KINDS]
const kinds = new Set([...GLOBAL_KINDS, ...INPUT_KINDS, 'scenario'])

/** Global definitions contain no individual compensation; safe in pack snapshots. */
export function capturedStructure(s: State) {
 return Object.fromEntries(GLOBAL_KINDS.map(kind => [kind, all(s, kind).sort((a, b) => a.id.localeCompare(b.id))]))
}

function definitions(s: State) {
 return new Map([...s].filter(([, row]) => kinds.has(row.kind)).map(([key, row]) => {
  const value = row.kind === 'scenario'
   ? { name: row.value.name, kind: row.value.kind, horizon: row.value.horizon ?? null, cash: row.value.cash }
   : row.value
  return [key, { kind: row.kind, id: row.id, value }]
 }))
}

async function cells(c: Context, s: State, id: string) {
 const sc = find(s, 'scenario', id)
 if (!sc || !find(s, 'workspace', 'main')) return { cells: [], currency: null }
 try {
  const calc = await workingCalculation({ ...c, s }, id)
  return { cells: [...calc.cells.map(({ line, department, month, amount }) => ({ line, department, month, amount })), ...dimensionVersionCells(calc, dimensionStructure(s))], currency: calc.currency }
 } catch (error) {
  if (!(error instanceof Fault) || error.status !== 409) throw error
  return { cells: [], currency: null, blocked: error.message }
 }
}

export async function versionStructure(c: Context, before: State, modelRevisionBefore: number) {
 const nativeAffected = await nativeRevisions(c,before)
 // Every newly captured immutable version carries today's global definitions.
 for (const sn of c.snapshots) {
  sn.body.structure = capturedStructure(c.s)
  sn.body.dimensionStructure = dimensionStructure(c.s)
  if (sn.body.calculation?.months) sn.body.actualsHistory = await historyOverlay(c, [...new Set<string>(sn.body.calculation.months.flatMap((m: string) => [m, addMonths(m, -12)]))],sn.scenario)
  if (sn.kind === 'forecast') {
   sn.body.lines = all(c.s, 'line'); sn.body.departments = all(c.s, 'department')
  }
 }
 const left = definitions(before), right = definitions(c.s)
 const changes: Data[] = []
 for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
  const a = left.get(key), b = right.get(key)
  if (semanticEqual(a?.value, b?.value)) continue
  const row = b ?? a!
  const fields = [...new Set([...Object.keys(a?.value ?? {}), ...Object.keys(b?.value ?? {})])].sort()
   .filter(field => !semanticEqual(a?.value[field], b?.value[field]))
   .map(field => ({ field, before: a?.value[field] ?? null, after: b?.value[field] ?? null }))
  changes.push({ kind: row.kind, id: row.id, name: row.value.name ?? row.value.title ?? row.id, before: a?.value ?? null, after: b?.value ?? null, fields })
 }
 if (!changes.length) return
 const global = changes.some(change => GLOBAL_KINDS.includes(change.kind))
 const ids = new Set(changes.flatMap(change => change.kind === 'scenario' ? [change.id] : [change.before?.scenario, change.after?.scenario]).filter(Boolean))
 const scenarios: Data[] = []
 for (const id of [...new Set([...all(before, 'scenario'), ...all(c.s, 'scenario')].map(sc => sc.id))].sort()) {
  const prior = find(before, 'scenario', id), next = find(c.s, 'scenario', id)
  // Frozen arithmetic is never recalculated, including under global edits.
  if ((next ?? prior)?.status === 'frozen' || (!global && !ids.has(id) && !nativeAffected.has(id))) continue
  const a = await cells(c, before, id), b = await cells(c, c.s, id)
  const key = (cell: Data) => JSON.stringify([cell.line, cell.department, cell.month, cell.dimension ?? null, cell.member ?? null, cell.lineGroup ?? null])
  const l = new Map(a.cells.map(cell => [key(cell), cell.amount])), r = new Map(b.cells.map(cell => [key(cell), cell.amount]))
  const changedCells = a.blocked || b.blocked ? [] : [...new Set([...l.keys(), ...r.keys()])].sort().flatMap(k => {
   const old = l.get(k) ?? null, now = r.get(k) ?? null
   if (old === now && a.currency === b.currency) return []
   const [line, department, month, dimension, member, lineGroup] = JSON.parse(k)
   return [{ line, department, month, ...(dimension !== null ? { dimension, member } : {}), ...(lineGroup !== null ? { lineGroup } : {}), before: old, after: now, difference: old !== null && now !== null && a.currency === b.currency ? now - old : null }]
  })
  scenarios.push({ id, name: (next ?? prior)!.name, currency: b.currency ?? a.currency, currencyBefore: a.currency, currencyAfter: b.currency,
   revisionBefore: prior?.revision ?? null, revisionAfter: next?.revision ?? null, changedCells,
   ...(a.blocked ? { blockedBefore: a.blocked } : {}), ...(b.blocked ? { blockedAfter: b.blocked } : {}) })
 }
 c.activity.push({ action: 'structure-version', record: 'main', scenario: scenarios.length === 1 ? scenarios[0].id : undefined, before: scenarios.length === 1 ? scenarios[0].revisionBefore : undefined, after: scenarios.length === 1 ? scenarios[0].revisionAfter : undefined, detail: { modelRevisionBefore, structureBefore: capturedStructure(before), structureAfter: capturedStructure(c.s), changes, scenarios } })
}
