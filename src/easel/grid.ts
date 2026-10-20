import { requireMember, requirePayDetail } from './access'
import { workingCalculation } from './calculation'
import type { Context } from './context'
import { gridAmounts } from './grid-math'
import { historyOverlay } from './history-sources'
import { requireEditable } from './model'
import { addMonths } from './months'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { cents } from './units'
import { Fault, get, integer, optionalText, put, remove, requireThat, text, type Data } from './types'

const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('')
const address = (cell: Data) => cell.address ? String(cell.address).slice(0, 100) : `${cell.schedule}:${cell.month}`
const cellKey = (cell: Data) => `${cell.schedule}:${cell.month}`

/** Preview and apply use identical validation, with one exact-revision fenced save. */
export async function grid(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['grid-preview', 'grid-save', 'grid-undo'].includes(op)) return
 requireMember(c.x)
 const sc = scenarioAccess(c.s, c.x, b.scenario)
 requireThat(integer(b.revision, 'Reviewed scenario revision', 1, Number.MAX_SAFE_INTEGER) === sc.revision, 'The grid changed; reload before saving', 409)
 if (op === 'grid-undo') {
  const history = get(c.s, 'grid-history', sc.id, 'last grid save')
  requireThat(history.afterRevision === sc.revision, 'The scenario changed since its last grid save', 409)
  for (const row of history.before) {
   const current = get(c.s, 'schedule', row.id)
   if (get(c.s, 'line', current.line).payroll) requirePayDetail(c.x)
   requireEditable(c.s, c.x, sc, current.department)
   requireEditable(c.s, c.x, sc, row.department)
  }
  for (const row of history.before) put(c.s, 'schedule', row.id, row)
  remove(c.s, 'grid-history', sc.id)
  bump(c, sc, op, sc.id, { cells: history.cells })
  return get(c.s, 'scenario', sc.id)
 }
 const calc = await workingCalculation(c, sc.id)
 const supplied = b.operation ? b.cells : b.changes
 requireThat(Array.isArray(supplied) && supplied.length > 0 && supplied.length <= 5000, 'Choose 1 to 5000 grid cells')
 const refused: Data[] = [], rows: Data[] = [], seen = new Set<string>()
 for (const cell of supplied) {
  try {
   requireThat(cell && typeof cell === 'object', 'Choose a cell')
   requireThat(!seen.has(cellKey(cell)), 'A cell appears twice'); seen.add(cellKey(cell))
   const row = get(c.s, 'schedule', cell.schedule)
   if (get(c.s, 'line', row.line).payroll) requirePayDetail(c.x)
   requireThat(row.scenario === sc.id, 'This row belongs to another scenario')
   requireEditable(c.s, c.x, sc, row.department)
   requireThat(!row.workbookOrigin || !row.provenance?.formulas?.[cell.month], 'This is a workbook formula; edit its source driver',409)
   requireThat(calc.months.includes(cell.month), 'The month is outside this plan')
   requireThat(!sc.actualsThrough || cell.month > sc.actualsThrough, 'Closed actuals cannot be typed over')
   requireThat(!row.history && ![...c.s.values()].some(r => r.kind === 'schedule' && r.value.scenario === sc.id && r.value.line === row.line && r.value.department === row.department && r.value.history), 'This cell is calculated from actuals; read its trace')
   const sources = calc.cells.filter(p => p.line === row.line && p.department === row.department && p.month === cell.month).flatMap(p => p.sources)
   requireThat(!sources.some(source => source.kind !== 'schedule') && !calc.cells.some(p => p.line === row.line && p.department === row.department && p.month === cell.month && p.basis === 'actual'), 'This cell is driver-calculated; read its trace')
   requireThat(!b.operation || !row.subrows?.[cell.month]?.length, 'Edit or clear split sub-rows before applying a selection operation')
   rows.push(row)
  } catch (error) {
   if (!(error instanceof Fault)) throw error
   refused.push({ address: address(cell ?? {}), error: error.message })
  }
 }
 let changes: Data[] = []
 if (!refused.length) {
  try {
   let values: number[] | undefined
   if (b.operation) {
    const history = b.operation === 'prior-year' ? await historyOverlay(c, supplied.map((cell: Data) => addMonths(cell.month, -12))) : null
    const prior = supplied.map((cell: Data, i: number) => {
     if (!history) return 0
     const month = addMonths(cell.month, -12)
     requireThat(!history.blockedMonths.includes(month) && !history.missingMonths.includes(month), `Prior-year actuals unavailable for ${address(cell)}`, 409)
     const source = history.cells.find(p => p.line === rows[i].line && p.department === rows[i].department && p.month === month)
     requireThat(source, `Missing prior-year actual cell for ${address(cell)}`, 409)
     return source.amount
    })
    values = gridAmounts(b, supplied.map((cell: Data, i: number) => rows[i].values[cell.month] ?? 0), prior)
   }
   changes = supplied.map((cell: Data, i: number) => {
    const row = rows[i]
    const note = cell.note === undefined ? row.notes?.[cell.month] ?? '' : optionalText(cell.note, 'Cell note', 2000)
    const splits = cell.subrows === undefined ? row.subrows?.[cell.month] ?? [] : cell.subrows
    requireThat(Array.isArray(splits) && splits.length <= 100, `Use at most 100 split rows for ${address(cell)}`)
    const subrows = cell.subrows === undefined ? splits : splits.map((part: Data) => ({ name: text(part.name, 'Split name'), amount: cents(part.amount, 'Split amount', { negative: true }) }))
    requireThat(new Set(subrows.map((part: Data) => part.name.toLowerCase())).size === subrows.length, 'Split names must be distinct')
    const total = subrows.reduce((sum: number, part: Data) => sum + part.amount, 0)
    const value = values?.[i] ?? (cell.value === undefined && subrows.length ? total : cents(cell.value, `Value for ${address(cell)}`, { negative: true }))
    requireThat(Number.isSafeInteger(value) && Math.abs(value) <= 1e13, 'Grid amount is too large')
    requireThat(!subrows.length || value === total, `Split amounts must sum to the cell at ${address(cell)}`)
    return { schedule: row.id, month: cell.month, value, note, subrows }
   })
  } catch (error) {
   if (!(error instanceof Fault)) throw error
   refused.push({ address: supplied.map(address).join(', '), error: error.message })
  }
 }
 const fingerprint = await digest({ scenario: sc.id, revision: sc.revision, changes, refused })
 if (op === 'grid-preview') return { revision: sc.revision, changes, refused, fingerprint }
 requireThat(!refused.length, refused.map(r => `${r.address}: ${r.error}`).join('; '), 400)
 requireThat(b.fingerprint === fingerprint, 'Preview these exact changes before applying them', 409)
 const before = [...new Map(rows.map(row => [row.id, row])).values()]
 for (const change of changes) {
  const row = get(c.s, 'schedule', change.schedule)
  put(c.s, 'schedule', row.id, { ...row, values: { ...row.values, [change.month]: change.value }, notes: { ...row.notes, [change.month]: change.note }, subrows: { ...row.subrows, [change.month]: change.subrows }, gridRevisions: { ...row.gridRevisions, [change.month]: { revision: sc.revision + 1, by: c.x.actor.email, at: c.now } } })
 }
 put(c.s, 'grid-history', sc.id, { scenario: sc.id, afterRevision: sc.revision + 1, before, cells: changes.map(address) })
 bump(c, sc, op, sc.id, { cells: changes.map(address), fingerprint })
 return { scenario: get(c.s, 'scenario', sc.id), changes }
}
