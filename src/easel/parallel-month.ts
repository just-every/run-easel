// Parallel running captures a reviewed month; classifications are finance's
// explanations, never inferred causes. A sign-off binds exactly that content.
import { requireFinance } from './access'
import type { Context } from './context'
import { parseCsv } from './csv'
import { variance } from './review'
import { sha256 } from './store'
import { all, choice, get, put, requireThat, text, uid, type Data } from './types'
import { cents, formatHundredths } from './units'

const measures = ['actual', 'budget', 'forecast'] as const
const oldField = { actual: 'oldActual', budget: 'oldBudget', forecast: 'oldForecast' }
const rowKey = (line: string, department: string) => `${line}|${department}`
const quote = (s: unknown) => `"${String(s).replace(/"/g, '""')}"`
const digest = (v: Data) => sha256(JSON.stringify({ name: v.name, month: v.month, currency: v.currency, source: v.source, budget: v.budget, priorForecast: v.priorForecast, rows: v.rows }))

async function closedMonth(c: Context, month: unknown) {
 requireFinance(c.x)
 requireThat(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'Choose a month in YYYY-MM format')
 const v = await variance(c, month)
 requireThat(v.priorForecast, 'This month has no kept pre-close forecast', 409)
 return v
}

export async function parallelTemplate(c: Context, month: string) {
 const v = await closedMonth(c, month)
 return ['line,department,actual,budget,forecast', ...v.rows.map(r => [r.line, r.department, formatHundredths(r.actual), formatHundredths(r.budget), formatHundredths(r.priorForecast!)].map(quote).join(','))].join('\r\n') + '\r\n'
}

async function preview(c: Context, b: Data) {
 const v = await closedMonth(c, b.month)
 const name = text(b.name, 'Comparison name')
 requireThat(typeof b.csv === 'string' && b.csv.length > 0 && new TextEncoder().encode(b.csv).length <= 1_000_000, 'Choose a comparison CSV of at most 1 MB')
 const file = text(b.filename, 'Source filename')
 const csv = parseCsv(b.csv)
 requireThat(csv.headers.length === 5 && ['line', 'department', ...measures].every(h => csv.headers.includes(h)), 'Use line, department, actual, budget, forecast columns')
 requireThat(csv.rows.length > 0 && csv.rows.length <= 5000, 'Enter between 1 and 5000 comparison rows')
 const old = new Map<string, Data>()
 for (const r of csv.rows) {
  requireThat(r.cells.length === 5, `CSV line ${r.line} must have five cells`)
  const at = (h: string) => r.cells[csv.headers.indexOf(h)].trim()
  const line = get(c.s, 'line', at('line')).id
  const department = at('department') ? get(c.s, 'department', at('department')).id : ''
  const key = rowKey(line, department)
  requireThat(!old.has(key), `CSV line ${r.line} repeats a line and department`)
  old.set(key, Object.fromEntries(measures.map(m => [m, cents(at(m), `${m} on CSV line ${r.line}`, { negative: true })])))
 }
 const current = new Map(v.rows.map(r => [r.key, r]))
 const rows = [...new Set([...current.keys(), ...old.keys()])].sort().map(key => {
  const [line, department] = key.split('|'), r = current.get(key), o = old.get(key)
  const row: Data = { key, line, department, lineName: r?.lineName ?? get(c.s, 'line', line).name, departmentName: r?.departmentName ?? (department ? get(c.s, 'department', department).name : 'No department'), actual: r?.actual ?? 0, budget: r?.budget ?? 0, forecast: r?.priorForecast ?? 0, oldActual: o?.actual ?? 0, oldBudget: o?.budget ?? 0, oldForecast: o?.forecast ?? 0 }
  row.differences = measures.filter(m => row[m] !== row[oldField[m]]).map(m => ({ key: `${key}|${m}`, measure: m, easel: row[m], old: row[oldField[m]], delta: row[m] - row[oldField[m]], classification: null }))
  return row
 })
 const result = { name, month: v.month, currency: v.currency, source: { file, sha256: await sha256(b.csv), csv: b.csv }, budget: v.budget, priorForecast: v.priorForecast, rows }
 return { ...result, status: 'preview', sha256: await digest(result) }
}

export async function parallelList(c: Context, month?: string) {
 requireFinance(c.x)
 return all(c.s, 'parallel-month').filter(p => !month || p.month === month).map(({ id, name, month, status, revision, sha256, signedBy, signedAt }) => ({ id, name, month, status, revision, sha256, signedBy, signedAt }))
}
export async function parallelView(c: Context, id: string) {
 requireFinance(c.x)
 return get(c.s, 'parallel-month', id, 'parallel comparison')
}

export async function parallelMonth(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['parallel-month-preview', 'parallel-month-save', 'parallel-month-classify', 'parallel-month-sign'].includes(op)) return undefined
 requireFinance(c.x)
 if (op === 'parallel-month-preview') return preview(c, b)
 if (op === 'parallel-month-save') {
  const v = await preview(c, b)
  requireThat(b.fingerprint === v.sha256, 'The comparison changed; preview it again before saving', 409)
  const id = uid(), saved = { ...v, status: 'draft', revision: 1, createdBy: c.x.actor.email, createdAt: c.now }
  put(c.s, 'parallel-month', id, saved)
  c.activity.push({ action: op, record: id, detail: { month: v.month, sha256: v.sha256 } })
  return get(c.s, 'parallel-month', id)
 }
 const prior = await parallelView(c, b.id)
 requireThat(prior.status === 'draft', 'This comparison is signed; create another comparison for a later review', 409)
 requireThat(prior.revision === Number(b.revision), 'The comparison changed; reload before saving', 409)
 // Copy nested rows so audit captures the full before and after bodies.
 const next: Data = { ...prior, rows: structuredClone(prior.rows), revision: prior.revision + 1 }
 if (op === 'parallel-month-classify') {
  const difference = next.rows.flatMap((r: Data) => r.differences).find((d: Data) => d.key === b.key)
  requireThat(difference, 'Difference not found', 404)
  difference.classification = { kind: choice(b.kind, ['mapping', 'timing', 'formula', 'source-data'] as const, 'difference classification'), explanation: text(b.explanation, 'Classification explanation', 2000) }
  next.sha256 = await digest(next)
 } else {
  requireThat(b.sha256 === prior.sha256 && await digest(prior) === prior.sha256, 'Review the exact comparison before signing', 409)
  requireThat(next.rows.every((r: Data) => r.differences.every((d: Data) => d.classification)), 'Classify every difference before signing', 409)
  Object.assign(next, { status: 'signed', signedBy: c.x.actor.email, signedAt: c.now })
 }
 put(c.s, 'parallel-month', prior.id, next)
 c.activity.push({ action: op, record: prior.id, detail: { month: prior.month, sha256: next.sha256, ...(op === 'parallel-month-classify' ? { key: b.key } : {}) } })
 return get(c.s, 'parallel-month', prior.id)
}
