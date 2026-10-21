import { datePeriod } from './fiscal-calendar'
import { compileWorkbook, evaluateWorkbook, workbookCellKey } from './workbook-formula'
// The Excel-first planning workbook kit. A budget sheet with one row per line
// and department and one column per month becomes a new, separate scenario of
// monthly schedules, staged through the import journal. Cell addresses,
// formulas retain their exact source graph, with unsupported cells explicitly cached.
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob, readD1ImportUndoReport, resumeD1Import, sha256 as kitSha, undoD1Import, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import { requireFinance } from './access'
import type { Context, KitStep } from './context'
import { base64, journalContext, kitContext } from './kit'
import { departments, lines, workspace } from './model'
import { monthLabel, parseMonthHeader, range } from './months'
import { formatMoney } from './units'
import { all, find, get, put, requireThat, type Data } from './types'
import { columnName, readXlsx, type XlsxCell } from './xlsx'

export const WORKBOOK_NAMESPACE = 'easel-xlsx-plan'
export const WORKBOOK_MAPPING = 'xlsx-plan-v2'

function decodeFile(b: Data) {
 requireThat(typeof b.base64 === 'string' && b.base64.length > 0, 'Choose an .xlsx workbook')
 const raw = atob(b.base64)
 const bytes = new Uint8Array(raw.length)
 for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
 return { bytes, file: typeof b.filename === 'string' && b.filename.trim() ? b.filename.trim().slice(0, 200) : 'plan.xlsx' }
}

const toCents = (n: number) => { const scaled = n * 100; const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled)); return { cents: rounded, exact: Math.abs(scaled - rounded) < 1e-6 } }

export async function previewWorkbook(c: Context, b: Data) {
 requireFinance(c.x)
 const w = workspace(c.s)
 const { bytes, file } = decodeFile(b)
 const sha = kitSha(bytes)
 const sheets = await readXlsx(bytes)
 const translation = compileWorkbook(sheets), evaluated = evaluateWorkbook(translation.graph)
 const sheet = b.sheet ? sheets.find(x => x.name === b.sheet) : sheets[0]
 requireThat(sheet, `The workbook has no sheet named ${b.sheet}`)
 const byRow = new Map<number, XlsxCell[]>()
 for (const cell of sheet.cells) byRow.set(cell.row, [...(byRow.get(cell.row) ?? []), cell])
 const headerRow = [...byRow.keys()].sort((a, b) => a - b).slice(0, 20).find(r => byRow.get(r)!.some(x => typeof x.value === 'string' && x.value.trim().toLowerCase() === 'line'))
 requireThat(headerRow, `Sheet ${sheet.name} needs a heading row with a "Line" column within its first 20 rows`)
 const header = byRow.get(headerRow)!
 const col = (name: string) => header.find(x => typeof x.value === 'string' && x.value.trim().toLowerCase() === name)?.col
 const lineCol = col('line')!, deptCol = col('department')
 requireThat(deptCol, `Sheet ${sheet.name} needs a "Department" column`)
 const monthCols = header.flatMap(x => { const m = typeof x.value === 'number' && w.calendar && w.calendar !== 'calendar-month' && x.value > 20000 && x.value < 80000 ? datePeriod(w, new Date(Date.UTC(1899, 11, 30) + Math.floor(x.value) * 86400000).toISOString().slice(0,10)) : x.value === null || typeof x.value === 'boolean' || x.col === lineCol || x.col === deptCol ? null : parseMonthHeader(x.value); return m ? [{ col: x.col, month: m, ref: x.ref }] : [] })
 requireThat(monthCols.length > 0, 'No month columns found: use headings like Jul-26, Jul 2026 or 2026-07')
 requireThat(new Set(monthCols.map(m => m.month)).size === monthCols.length, 'Two columns name the same month')
 const planMonths = new Set(range(w.planStart, w.horizon))
 const outside = monthCols.filter(m => !planMonths.has(m.month)).map(m => monthLabel(m.month))
 const lineMap = (b.lineMap ?? {}) as Record<string, string>, deptMap = (b.departmentMap ?? {}) as Record<string, string>
 const resolveLine = (name: string) => lineMap[name] ?? lines(c.s).find(l => l.name.toLowerCase() === name.toLowerCase())?.id
 const resolveDept = (name: string) => deptMap[name] ?? departments(c.s).find(d => d.name.toLowerCase() === name.toLowerCase())?.id
 const rows: Data[] = [], skipped: Data[] = [], rejected: Data[] = [], workbookTotals: Data[] = [], formulaReconciliation: Data[] = []
 let formulas = 0, rounded = 0
 for (const r of [...byRow.keys()].filter(r => r > headerRow).sort((a, b) => a - b)) {
  const cells = byRow.get(r)!
  const at = (col?: number) => cells.find(x => x.col === col)
  const lineName = String(at(lineCol)?.value ?? '').trim(), deptName = String(at(deptCol)?.value ?? '').trim()
  const filled = monthCols.filter(m => at(m.col)?.value !== null && at(m.col)?.value !== undefined && at(m.col)?.value !== '')
  if (!lineName && !filled.length) continue
  if (!lineName) { skipped.push({ row: r, reason: 'no line name' }); continue }
  if (/^total\b/i.test(lineName) || /^total\b/i.test(deptName)) {
   skipped.push({ row:r,reason:`${lineName} is a total row; Easel calculates totals itself` })
   for (const m of monthCols.filter(m => planMonths.has(m.month))) {
    const cell=at(m.col)
    if (!cell || cell.value===null) continue
    const key=workbookCellKey(sheet.name,cell.ref),computed=evaluated.cents[key]
    const cached=typeof cell.value==='number'?toCents(cell.value).cents:null
    const supported=translation.report.some(f=>f.sheet===sheet.name&&f.cell===cell.ref&&f.status==='translated')
    workbookTotals.push({sheet:sheet.name,cell:cell.ref,month:m.month,workbookCents:cached,translatedCents:computed ?? null,differenceCents:cached!==null&&computed!==undefined?computed-cached:null,status:supported&&cached!==null&&computed===cached?'reconciled':'unreconciled'})
   }
   continue
  }
  const values: Record<string, number> = {}, refs: Record<string, string> = {}, cellFormulas: Record<string, string> = {}
  const problems: string[] = []
  for (const m of monthCols) {
   const cell = at(m.col)
   if (!cell || cell.value === null || cell.value === '') continue
   if (cell.error) { problems.push(`${cell.ref} shows ${cell.error}`); continue }
   if (typeof cell.value !== 'number') { problems.push(`${cell.ref} is not a number`); continue }
   const { cents, exact } = toCents(cell.value)
   if (!exact) rounded++
   if (cell.formula) {
    formulas++; cellFormulas[m.month] = cell.formula
    if (planMonths.has(m.month)) {
     const calculated=evaluated.cents[workbookCellKey(sheet.name,cell.ref)]
     formulaReconciliation.push({sheet:sheet.name,cell:cell.ref,month:m.month,workbookCents:cents,translatedCents:calculated ?? null,status:calculated===cents?'reconciled':'unreconciled'})
    }
   }
   if (planMonths.has(m.month)) { values[m.month] = cents; refs[m.month] = cell.ref }
  }
  if (problems.length) { rejected.push({ row: r, line: lineName, department: deptName, reason: problems.join('; ') }); continue }
  rows.push({ row: r, lineName, deptName, line: resolveLine(lineName) ?? null, department: resolveDept(deptName) ?? null, values, refs, formulas: cellFormulas, total: Object.values(values).reduce((a, v) => a + v, 0) })
 }
 const unresolvedLines = [...new Set(rows.filter(r => !r.line || !find(c.s, 'line', r.line)).map(r => r.lineName))]
 const unresolvedDepartments = [...new Set(rows.filter(r => !r.department || !find(c.s, 'department', r.department)).map(r => r.deptName))]
 const id = `wb-${sha.slice(0, 16)}`
 const destination = `workbook:${sha.slice(0, 20)}`
 const ctx = kitContext(c.db, c.x.actor, destination, WORKBOOK_NAMESPACE, `${WORKBOOK_MAPPING}:${kitSha(canonicalJson({ sheet: sheet.name, lineMap, deptMap })).slice(0, 16)}`)
 const budget = all(c.s, 'scenario').find(x => x.kind === 'budget' && !x.alternativeBudget)
 const scenarioValue = { name: `Imported from ${file}`, kind: 'scenario', status: 'working', revision: 1, createdBy: c.x.actor.email, parent: null, actualsThrough: null, cash: budget?.cash ?? { openingCents: 0, basis: 'estimate', note: '', receivablesCents: 0, payablesCents: 0, collectionLag: 0, paymentLag: 0 }, imported: { file, sha256: sha, sheet: sheet.name, destination } }
 const workbookOrigin=`${id}:formulas`
 const records = [
  {namespace:WORKBOOK_NAMESPACE,kind:'formula-model',sourceId:'formulas',payload:{scenario:id,originId:workbookOrigin,name:file,graph:translation.graph,overrides:{}},payloadHash:'',artifactHash:sha,location:{artifact:file,pointer:'formula-model'}},
  { namespace: WORKBOOK_NAMESPACE, kind: 'workbook', sourceId: sha, payload: { file, sheet: sheet.name, headerRow, months: monthCols.map(m => ({ month: m.month, ref: m.ref })) } as any, payloadHash: '', artifactHash: sha, location: { artifact: file, pointer: `${sheet.name}!${columnName(lineCol)}${headerRow}` } },
  ...rows.map(r => ({ namespace: WORKBOOK_NAMESPACE, kind: 'plan-row', sourceId: `${sheet.name}!${r.row}`, payload: r as any, payloadHash: '', artifactHash: sha, location: { artifact: file, row: r.row, pointer: `${sheet.name}!${r.row}` } })),
 ].map(r => ({ ...r, payloadHash: kitSha(canonicalJson(r.payload)) }))
 const source: SourceBundle = { diagnostics: [], artifacts: [{ name: file, sha256: sha, size: bytes.length, original: { status: 'available', base64: base64(bytes) } }], records }
 const mapping: ImportMapping = { version: ctx.mappingVersion, map: record => {
  if (record.kind === 'formula-model') return {effects:[{targetKind:'workbook-model',targetId:workbookOrigin,value:record.payload}]}
  if (record.kind === 'workbook') return { effects: [{ targetKind: 'scenario', targetId: id, value: scenarioValue as any }] }
  const r = record.payload as any
  if (!r.line || !r.department) return { effects: [], rejection: 'Map the line and department first' }
  const originId = `${id}-r${r.row}`
  return { effects: [{ targetKind: 'schedule', targetId: originId, value: { scenario: id, originId, name: `${r.lineName} · ${r.deptName}`, line: r.line, department: r.department, values: r.values, workbookOrigin, workbookCells:Object.fromEntries(Object.entries(r.refs).map(([m,ref])=>[m,workbookCellKey(sheet.name,ref as string)])), provenance: { file, sheet: sheet.name, row: r.row, cells: r.refs, formulas: r.formulas } } as any }] }
 } }
 const plan = await planD1Import(source, mapping, ctx)
 const totals = Object.fromEntries([...planMonths].map(m => [m, rows.reduce((a, r) => a + (r.values[m] ?? 0), 0)]))
 return {
  id, file, sha256: sha, size: bytes.length, sheets: sheets.map(x => x.name), sheet: sheet.name, headerRow,
  months: monthCols.map(m => ({ month: m.month, label: monthLabel(m.month), ref: m.ref })), outside,
  rows: rows.map(r => ({ row: r.row, line: r.lineName, department: r.deptName, mappedLine: r.line, mappedDepartment: r.department, total: r.total, totalText: formatMoney(r.total, w.currency), formulas: Object.keys(r.formulas).length })),
  formulaReport:translation.report,workbookTotals,formulaReconciliation,
  skipped, rejected, formulas, rounded, unresolvedLines, unresolvedDepartments, totals,
  fingerprint: plan.fingerprint, counts: plan.counts, destination, ctx, plan,
 }
}

export async function workbookCommand(c: Context, op: string, b: Data): Promise<KitStep | undefined> {
 if (op === 'preview') { const { ctx: _c, plan: _p, ...rest } = await previewWorkbook(c, b); return { result: rest } }
 if (op === 'commit') {
  const p = await previewWorkbook(c, b)
  requireThat(p.workbookTotals.length>0 && p.workbookTotals.every((r:Data)=>r.status==='reconciled') && p.formulaReconciliation.every((r:Data)=>r.status==='reconciled'), 'Workbook totals or formula caches do not reconcile; recalculate the source workbook and include supported formula totals before importing',409)
  requireThat(p.rows.length > 0, 'No plan rows can be imported from this sheet', 409)
  requireThat(!p.unresolvedLines.length && !p.unresolvedDepartments.length, `Map these first: ${[...p.unresolvedLines, ...p.unresolvedDepartments].join(', ')}`, 409)
  requireThat(!p.rejected.length, `Fix these rows in the workbook first: ${p.rejected.map((r: Data) => r.row).join(', ')}`, 409)
  requireThat(b.fingerprint === p.fingerprint, 'The workbook or mapping changed after your preview; review the preview again', 409)
  const existing = find(c.s, 'workbook-import', p.id)
  requireThat(!existing || existing.status === 'undone' || existing.status === 'failed', 'This workbook is already imported', 409)
  const attempt = (existing?.attempt ?? 0) + 1
  put(c.s, 'workbook-import', p.id, { destination: p.destination, file: p.file, sha256: p.sha256, sheet: p.sheet, rows: p.rows.length, skipped: p.skipped.length, formulas: p.formulas, rounded: p.rounded, totals: p.totals, formulaReport:p.formulaReport, workbookTotals:p.workbookTotals, scenario: p.id, status: 'importing', attempt, createdBy: c.x.actor.email, createdAt: c.now })
  c.activity.push({ action: 'workbook-import-started', record: p.id, detail: { file: p.file, sha256: p.sha256 } })
  return { result: {}, kit: async () => {
   const job = await createD1ImportJob(p.plan, { ...p.ctx, reviewedFingerprint: p.fingerprint, operationKey: `${p.fingerprint}:${attempt}` })
   return applyD1ImportBatches(job.id, p.ctx)
  }, record: (c2, applied) => finish(c2, p.id, applied), failed: async (c2, error) => {
   if (await c2.db.prepare('SELECT 1 FROM ik_jobs WHERE destination=?').bind(p.destination).first()) return
   put(c2.s, 'workbook-import', p.id, { ...get(c2.s, 'workbook-import', p.id), status: 'failed', error: error.message.slice(0, 500) })
   c2.activity.push({ action: 'workbook-import-failed', record: p.id, detail: { file: p.file, error: error.message.slice(0, 500) } })
  } }
 }
 if (op === 'resume' || op === 'undo' || op === 'status') {
  requireFinance(c.x)
  const imp = get(c.s, 'workbook-import', b.id, 'workbook import')
  const job = await c.db.prepare('SELECT id, state, mapping_version, principal_id FROM ik_jobs WHERE destination=? AND namespace=? ORDER BY rowid DESC LIMIT 1').bind(imp.destination, WORKBOOK_NAMESPACE).first<any>()
  requireThat(job, 'This import has no journal entry yet; start it again from the preview', 409)
  const ctx = journalContext(c.db, c.x.actor, imp.destination, WORKBOOK_NAMESPACE, job)
  if (op === 'status') return { result: { import: imp, job: await readD1ImportJob(job.id, ctx), undo: ['undone', 'undoing'].includes(job.state) ? await readD1ImportUndoReport(job.id, ctx) : null } }
  if (op === 'resume') { requireThat(imp.status === 'importing', 'This import is not waiting to continue', 409); return { result: {}, kit: () => resumeD1Import(job.id, ctx), record: (c2, applied) => finish(c2, imp.id, applied) } }
  requireThat(imp.status === 'imported' || imp.status === 'undoing', 'Only a completed import can be undone', 409)
  put(c.s, 'workbook-import', imp.id, { ...imp, status: 'undoing' })
  c.activity.push({ action: 'workbook-undo-started', record: imp.id, detail: { file: imp.file } })
  return { result: {}, kit: async () => ({ undone: await undoD1Import(job.id, ctx), report: await readD1ImportUndoReport(job.id, ctx) }), record: (c2, { undone, report }) => {
   const current = get(c2.s, 'workbook-import', imp.id)
   put(c2.s, 'workbook-import', imp.id, { ...current, status: undone.state === 'undone' ? 'undone' : 'undoing', undoneBy: c2.x.actor.email, undoneAt: c2.now })
   c2.activity.push({ action: undone.state === 'undone' ? 'workbook-undone' : 'workbook-undo-partial', record: imp.id, detail: { file: imp.file, state: undone.state } })
   return { import: get(c2.s, 'workbook-import', imp.id), job: undone, undo: report }
  } }
 }
 return undefined
}

function finish(c: Context, id: string, job: Data) {
 const imp = get(c.s, 'workbook-import', id)
 const done = job.state === 'completed'
 put(c.s, 'workbook-import', id, { ...imp, status: done ? 'imported' : 'importing', jobState: job.state })
 if (done) c.activity.push({ action: 'workbook-imported', record: id, scenario: imp.scenario, detail: { file: imp.file, rows: imp.rows } })
 return { import: get(c.s, 'workbook-import', id), job: { id: job.id, state: job.state, checkpoint: job.checkpoint, total: job.total } }
}
