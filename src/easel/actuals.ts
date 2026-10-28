import { intacctAuthority } from './intacct-connection'
import { finishIntacctMonth } from './intacct-month'
import { ledgerEntity } from './ledger-scope'
import { netsuiteAuthority } from './netsuite-connection'
import { finishNetSuiteMonth } from './netsuite-month'
import { assertSourceGuardAcceptance, completeSourceGuards } from './agents/source-guard'
import { finishXeroMonth } from './xero-month'
import { xeroAuthority } from './xero-connection'
import { finishQboMonth } from './qbo-month'
import { qboAuthority } from './qbo-connection'
import { resolveDimensions } from './dimension-mapping'
import { datePeriod, type CalendarWorkspace } from './fiscal-calendar'
import { balanceTarget } from './balance-targets'
// The Excel-first CSV actuals kit: a general-ledger detail export (one row
// per posted line) becomes accepted actuals through a no-write preview, a
// reviewed commit into the import journal, explicit resume and undo.
// Amounts are stored debit-positive in minor units; reports turn them into
// natural signs (income positive, costs positive) through the account mapping.
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob, resumeD1Import, sha256 as kitSha, undoD1Import, readD1ImportUndoReport, type ImportMapping, type SourceBundle } from '../modules/import-kit/src/d1/index'
import { requireFinance } from './access'
import type { Context, KitStep } from './context'
import { parseCsv } from './csv'
import { resolveAccount } from './account-rules'
import { base64, journalContext, kitContext } from './kit'
import { lines, workspace } from './model'
import { monthLabel } from './months'
import { cents } from './units'
import { all, choice, find, get, put, requireThat, type Data, type State } from './types'

export function closedImportPeriods(s: State, batch: Data): string[] {
 const closedThrough = all(s, 'scenario').filter(sc => sc.kind === 'forecast' && sc.status === 'working' && sc.actualsThrough && ledgerEntity(s,sc.id)===batch.entity).map(sc => sc.actualsThrough as string)
 return batch.periods.filter((period: string) => closedThrough.some(through => period <= through))
}

export const CSV_NAMESPACE = 'easel-csv-actuals'
export const CSV_MAPPING = 'csv-actuals-v1'
const MAX_BYTES = 2_000_000, MAX_ROWS = 5000

export const departmentKey = (source: string) => source.trim() || '(blank)'

type Columns = { date?: string; period?: string; account: string; accountName?: string; accountType?: string; department?: string; amount?: string; debit?: string; credit?: string; description?: string; reference?: string; class?: string; trackingOption?: string }
type Normal = { line: number; date: string; period: string; account: string; accountName: string; accountType: string; department: string; amount: number; description: string; reference: string; fingerprint: string; sourceId: string; sourceDimensions: Record<string, string> }

function parseDate(v: string, format: string): { date: string; period: string } | null {
 const s = v.trim()
 let y: string, m: string, d = '01'
 if (format === 'YYYY-MM-DD') { const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!x) return null; [, y, m, d] = x }
 else if (format === 'DD/MM/YYYY') { const x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (!x) return null; y = x[3]; m = x[2].padStart(2, '0'); d = x[1].padStart(2, '0') }
 else if (format === 'MM/DD/YYYY') { const x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (!x) return null; y = x[3]; m = x[1].padStart(2, '0'); d = x[2].padStart(2, '0') }
 else { const x = /^(\d{4})-(\d{2})$/.exec(s); if (!x) return null; [, y, m] = x }
 const date = `${y}-${m}-${d}`, parsed = new Date(`${date}T00:00:00Z`)
 if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null
 return { date: format === 'YYYY-MM' ? `${y}-${m}` : date, period: `${y}-${m}` }
}

const money = (v: string, label: string) => {
 const s = v.trim().replace(/^\((.*)\)$/, '-$1').replace(/[$\s]/g, '')
 return s === '' ? 0 : cents(s, label, { negative: true })
}

/** Reads the file with the person's column choices. Never writes. */
export async function readActuals(b: Data, calendar?: CalendarWorkspace, provenance?: Record<number, Data>) {
 requireThat(typeof b.csv === 'string' && b.csv.length > 0, 'Choose a CSV file')
 const bytes = new TextEncoder().encode(b.csv)
 requireThat(bytes.length <= MAX_BYTES, `The file is larger than ${MAX_BYTES / 1_000_000} MB; split it by month`)
 const file = typeof b.filename === 'string' && b.filename.trim() ? b.filename.trim().slice(0, 200) : 'actuals.csv'
 const { headers, rows } = parseCsv(b.csv)
 requireThat(rows.length <= MAX_ROWS, `The file has more than ${MAX_ROWS} rows; split it by month`)
 const cols = (b.columns ?? { date: 'Date', account: 'Account', amount: 'Amount', ...(headers.includes('Department') ? { department: 'Department' } : {}), ...(headers.includes('Class') ? { class: 'Class' } : {}), ...(headers.includes('Tracking option') ? { trackingOption: 'Tracking option' } : {}) }) as Columns
 const has = (name?: string) => !!name && headers.includes(name)
 requireThat(has(cols.account), 'Choose the account column')
 requireThat(has(cols.date) || has(cols.period), 'Choose the date or period column')
 const amountMode = choice(b.amountMode ?? 'debit-positive', ['debit-credit', 'debit-positive', 'credit-positive'] as const, 'how amounts are signed')
 requireThat(amountMode === 'debit-credit' ? has(cols.debit) && has(cols.credit) : has(cols.amount), amountMode === 'debit-credit' ? 'Choose the debit and credit columns' : 'Choose the amount column')
 const dateFormat = choice(b.dateFormat ?? 'MM/DD/YYYY', ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM'] as const, 'a date format')
 const allowRepeats = b.allowRepeats === true
 const index = (name?: string) => (name ? headers.indexOf(name) : -1)
 const at = (cells: string[], name?: string) => (index(name) >= 0 ? (cells[index(name)] ?? '').trim() : '')
 const sha = kitSha(bytes)
 const normal: Normal[] = [], rejected: { line: number; reason: string }[] = []
 const seen = new Map<string, number[]>()
 for (const { line, cells } of rows) {
  try {
   requireThat(cells.length === headers.length, `has ${cells.length} columns, the heading has ${headers.length}`)
   const account = at(cells, cols.account)
   requireThat(account, 'has no account')
   const when = parseDate(at(cells, cols.date ?? cols.period), cols.date ? dateFormat : 'YYYY-MM')
   requireThat(when, `has a date that is not ${cols.date ? dateFormat : 'YYYY-MM'}`)
   let amount: number
   if (amountMode === 'debit-credit') {
    const debit = money(at(cells, cols.debit), 'Debit'), credit = money(at(cells, cols.credit), 'Credit')
    requireThat(!(debit !== 0 && credit !== 0), 'has both a debit and a credit')
    amount = debit - credit
   } else amount = money(at(cells, cols.amount), 'Amount') * (amountMode === 'credit-positive' ? -1 : 1)
   const sourceDimensions = { ...(cols.department ? { department: at(cells, cols.department) } : {}), ...(cols.class ? { class: at(cells, cols.class) } : {}), ...(cols.trackingOption ? { 'tracking-option': at(cells, cols.trackingOption) } : {}) }
   const extra = provenance?.[line] ?? {}
   const row = { ...extra, sourceDimensions: extra.sourceDimensions ?? sourceDimensions, date: when.date, period: extra.netsuitePeriodOverride ?? (calendar && when.date.length === 10 ? datePeriod(calendar, when.date) : when.period), account, accountName: at(cells, cols.accountName), accountType: at(cells, cols.accountType), department: departmentKey(at(cells, cols.department)), amount, description: at(cells, cols.description).slice(0, 500), reference: at(cells, cols.reference).slice(0, 200) }
   const fingerprint = kitSha(canonicalJson([row.date, row.account, row.department, row.amount, row.description, row.reference, ...(Object.keys(sourceDimensions).some(k => k !== 'department') ? [sourceDimensions] : []), ...(provenance ? [extra] : [])]))
   const earlier = seen.get(fingerprint) ?? []
   if (earlier.length && !allowRepeats) { rejected.push({ line, reason: `repeats line ${earlier[0]} exactly` }); continue }
   seen.set(fingerprint, [...earlier, line])
   normal.push({ line, ...row, fingerprint, sourceId: `${fingerprint}#${earlier.length + 1}` })
  } catch (e) {
   rejected.push({ line, reason: (e as Error).message.replace(/^(Debit|Credit|Amount) must/, 'has an amount that must') })
  }
 }
 return { file, bytes, sha, headers, normal, rejected, config: { columns: cols, amountMode, dateFormat, allowRepeats } }
}

/** The person's mapping decisions decide whether this file can be accepted. */
export async function previewActuals(c: Context, b: Data, provenance?: Record<number, Data>) {
 requireFinance(c.x)
 workspace(c.s)
 const read = await readActuals({ ...b, dateFormat: b.dateFormat ?? workspace(c.s).dateFormat ?? 'MM/DD/YYYY' }, workspace(c.s), provenance)
 const { s } = c
 // Rows already accepted in another import are refused rather than counted twice.
 const prior = new Map<string, string>()
 const prints = [...new Set(read.normal.map(r => r.fingerprint))]
 for (let i = 0; i < prints.length; i += 90) {
  const chunk = prints.slice(i, i + 90)
  const { results } = await c.db.prepare(`SELECT fingerprint, destination FROM e_actuals WHERE fingerprint IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<any>()
  for (const r of results) prior.set(r.fingerprint, r.destination)
 }
 const batches = all(s, 'batch')
 const rejected = [...read.rejected]
 const accepted = read.normal.filter(r => {
  const where = prior.get(r.fingerprint)
  if (!where) return true
  rejected.push({ line: r.line, reason: `was already accepted in ${batches.find(x => x.destination === where)?.file ?? 'an earlier import'}` })
  return false
 })
 rejected.sort((a, b) => a.line - b.line)
 const lineType = new Map(lines(s).map(l => [l.id, l.type]))
 const accounts = new Map<string, Data>(), departments = new Map<string, Data>(), periods = new Map<string, Data>()
 type Summary = Data
 for (const r of accepted) {
  const a = accounts.get(r.account) ?? { account: r.account, name: r.accountName, accountTypes: [] as string[], rows: 0, net: 0 }
  a.rows++; a.net += r.amount; if (!a.accountTypes.includes(r.accountType)) a.accountTypes.push(r.accountType); if (!a.name && r.accountName) a.name = r.accountName
  accounts.set(r.account, a)
  const d = departments.get(r.department) ?? { source: r.department, rows: 0, net: 0 }
  d.rows++; d.net += r.amount
  departments.set(r.department, d)
  const p = periods.get(r.period) ?? { period: r.period, label: monthLabel(r.period), rows: 0, debit: 0, credit: 0 }
  p.rows++; if (r.amount >= 0) p.debit += r.amount; else p.credit -= r.amount
  periods.set(r.period, p)
 }
 const accountRows: Summary[] = [...accounts.values()].sort((a, b) => a.account.localeCompare(b.account)).map(a => {
  const resolutions = a.accountTypes.map((t: string) => resolveAccount(s, a.account, t))
  const targets = [...new Set<string | null>(resolutions.map((r: Data) => r.target))]
  const target = targets.length === 1 ? targets[0] : null
  const ruleIds = [...new Set(resolutions.flatMap((r: Data) => r.ruleIds))]
  const mappingStatus = target ? 'mapped' : resolutions.some((r: Data) => r.mappingStatus === 'ambiguous') || targets.length > 1 ? 'ambiguous' : 'unmapped'
  const type = target ? lineType.get(target) : undefined
  const balance = target ? balanceTarget(target) : undefined
  const sign = type === 'revenue' && a.net > 0 ? 'This revenue account is net debit in this file: check the sign convention' : type && type !== 'revenue' && a.net < 0 ? 'This cost account is net credit in this file: check the sign convention' : ''
  return { ...a, target, ruleIds, mappingStatus, sign: balance && a.net * balance.sign < 0 ? 'Opposite to this balance-sheet line’s usual sign; review the source' : sign }
 })
 const departmentRows: Summary[] = [...departments.values()].sort((a, b) => a.source.localeCompare(b.source)).map(d => ({ ...d, department: find(s, 'department-map', d.source)?.department ?? null }))
 const unmappedAccounts = accountRows.filter(a => a.target === null).map(a => a.account)
 const unmappedDepartments = departmentRows.filter(d => d.department === null).map(d => d.source)
 const destination = `actuals:${(provenance?kitSha(canonicalJson([read.sha,provenance])):read.sha).slice(0, 20)}`
 const dimensionExceptions = accepted.flatMap(r => resolveDimensions(s, r.sourceDimensions).unresolved.map(issue => ({ ...issue, line: r.line, period: r.period })))
 const reviewed = { dimensionRules: all(s, 'dimension-map'), dimensionMembers: all(s, 'dimension-member'), config: read.config, workspace: workspace(s),
  accounts: accountRows.map(a => ({ account: a.account, resolutions: a.accountTypes.map((t: string) => resolveAccount(s, a.account, t)), line: find(s, 'line', a.target) ?? null })),
  departments: departmentRows.map(d => ({ source: d.source, mapping: find(s, 'department-map', d.source) ?? null, department: find(s, 'department', d.department) ?? null })),
 }
 const ctx = kitContext(c.db, c.x.actor, destination, CSV_NAMESPACE, `${CSV_MAPPING}:${kitSha(canonicalJson(reviewed))}`)
 const source: SourceBundle = {
  diagnostics: [],
  artifacts: [{ name: read.file, sha256: read.sha, size: read.bytes.length, original: { status: 'available', base64: base64(read.bytes) } }],
  records: accepted.map(r => ({ namespace: CSV_NAMESPACE, kind: 'gl-row', sourceId: r.sourceId, payload: r as any, payloadHash: kitSha(canonicalJson(r)), artifactHash: read.sha, location: { artifact: read.file, row: r.line } })),
 }
 const mapping: ImportMapping = { version: ctx.mappingVersion, map: record => {
  const r = record.payload as unknown as Normal
  return { effects: [{ targetKind: 'actual', targetId: r.sourceId, value: { ...r, file: read.file, batch: destination } as any }] }
 } }
 const plan = await planD1Import(source, mapping, ctx)
 const net = accepted.reduce((sum, r) => sum + r.amount, 0)
 return {
  file: read.file, sha256: read.sha, size: read.bytes.length, headers: read.headers, destination, config: read.config,
  rows: read.normal.length + read.rejected.length, accepted: accepted.length, rejected, net,
  periods: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)).map(p => {
   const rows = accepted.filter(r => r.period === p.period)
   const unmappedAccounts = [...new Set(rows.filter(r => !resolveAccount(s, r.account, r.accountType).target).map(r => r.account))]
   const unmappedDepartments = [...new Set(rows.filter(r => !find(s, 'department-map', r.department)).map(r => r.department))]
   return { ...p, blocked: !!(unmappedAccounts.length || unmappedDepartments.length), unmappedAccounts, unmappedDepartments }
  }),
  accounts: accountRows, departments: departmentRows, unmappedAccounts, unmappedDepartments, dimensionExceptions,
  fingerprint: plan.fingerprint, counts: plan.counts, ctx, plan,
 }
}

const publicPreview = ({ ctx: _ctx, plan: _plan, ...rest }: Data) => rest

export async function actualsCommand(c: Context, op: string, b: Data, provenance?: Record<number, Data>): Promise<KitStep | undefined> {
 if (op === 'preview') return { result: publicPreview(await previewActuals(c, b, provenance)) }
 if (op === 'commit') {
  const p = await previewActuals(c, b, provenance)
  assertSourceGuardAcceptance(c, p.sha256, p.periods.map((r:Data)=>r.period),provenance?Object.values(provenance)[0]?.entity:undefined)
  requireThat(p.accepted > 0, 'Nothing in this file can be accepted', 409)
  requireThat(!p.unmappedAccounts.length, `Map these accounts first: ${p.unmappedAccounts.join(', ')}`, 409)
  requireThat(!p.unmappedDepartments.length, `Map these departments first: ${p.unmappedDepartments.join(', ')}`, 409)
  requireThat(!p.dimensionExceptions.length, 'Map the unresolved source dimension members before accepting this file', 409)
  requireThat(b.fingerprint === p.fingerprint, 'The file or mapping changed after your preview; review the preview again', 409)
  requireThat(Number(b.acknowledgeRejected ?? 0) === p.rejected.length, p.rejected.length ? `Confirm that the ${p.rejected.length} rejected rows stay out of this import` : 'Preview again', 409)
  const id = p.destination.slice('actuals:'.length)
  const existing = find(c.s, 'batch', id)
  requireThat(!existing || existing.status === 'undone' || existing.status === 'failed', 'This file is already imported', 409)
  put(c.s, 'batch', id, {
   destination: p.destination, namespace: CSV_NAMESPACE, file: p.file, sha256: p.sha256, size: p.size, rows: p.rows, accepted: p.accepted, rejected: p.rejected.length,
   net: p.net, periods: p.periods.map((x: Data) => x.period), config: p.config, status: 'importing', attempt: (existing?.attempt ?? 0) + 1, createdBy: c.x.actor.email, createdAt: c.now,
  })
  c.activity.push({ action: 'actuals-import-started', record: id, detail: { file: p.file, sha256: p.sha256, accepted: p.accepted, rejected: p.rejected.length } })
  const attempt = (existing?.attempt ?? 0) + 1
  return { result: {}, kit: async () => {
   const job = await createD1ImportJob(p.plan, { ...p.ctx, reviewedFingerprint: p.fingerprint, operationKey: `${p.fingerprint}:${attempt}` })
   return applyD1ImportBatches(job.id, p.ctx)
  }, record: (c2, applied) => finishBatch(c2, id, applied), failed: async (c2, error) => {
   if (await jobFor(c2.db, p.destination)) return
   put(c2.s, 'batch', id, { ...get(c2.s, 'batch', id), status: 'failed', error: error.message.slice(0, 500) })
   c2.activity.push({ action: 'actuals-import-failed', record: id, detail: { file: p.file, error: error.message.slice(0, 500) } })
  } }
 }
 if (op === 'resume' || op === 'undo' || op === 'status') {
  requireFinance(c.x)
  const batch = get(c.s, 'batch', b.id, 'import')
  if(batch.intacctSource)intacctAuthority(c)
  if(batch.netsuiteSource)netsuiteAuthority(c)
  if(batch.xeroSource)xeroAuthority(c)
  if(batch.qboSource)qboAuthority(c)
  const job = await jobFor(c.db, batch.destination)
  requireThat(job, 'This import has no journal entry yet; start it again from the preview', 409)
  const bound = journalContext(c.db, c.x.actor, batch.destination, CSV_NAMESPACE, job)
  if (op === 'status') return { result: { batch, job: await readD1ImportJob(job.id, bound), undo: ['undone', 'undoing'].includes(job.state) ? await readD1ImportUndoReport(job.id, bound) : null } }
  if (op === 'resume') {
   requireThat(batch.status === 'importing', 'This import is not waiting to continue', 409)
   return { result: {}, kit: () => resumeD1Import(job.id, bound), record: (c2, applied) => finishBatch(c2, batch.id, applied) }
  }
  if(batch.intacctSource)requireThat(find(c.s,'intacct-month',batch.intacctSource.id)?.batch===batch.id,'Undo the latest Intacct correction first; an earlier batch still supports accepted history',409)
  requireThat(batch.status === 'accepted' || batch.status === 'undoing', 'Only an accepted import can be undone', 409)
  const closedPeriods = closedImportPeriods(c.s, batch)
  requireThat(!closedPeriods.length, `${closedPeriods.map(monthLabel).join(', ')} ${closedPeriods.length === 1 ? 'is' : 'are'} closed with these actuals; import a correcting file instead of undoing`, 409)
  put(c.s, 'batch', batch.id, { ...batch, status: 'undoing' })
  c.activity.push({ action: 'actuals-undo-started', record: batch.id, detail: { file: batch.file } })
  return { result: {}, kit: async () => ({ undone: await undoD1Import(job.id, bound), report: await readD1ImportUndoReport(job.id, bound) }), record: (c2, { undone, report }) => {
   const done = undone.state === 'undone'
   const current = get(c2.s, 'batch', batch.id)
   put(c2.s, 'batch', batch.id, { ...current, status: done ? 'undone' : 'undoing', undoneBy: c2.x.actor.email, undoneAt: c2.now })
   if (done) { finishIntacctMonth(c2,current,true); finishQboMonth(c2, current, true); finishXeroMonth(c2, current, true); finishNetSuiteMonth(c2,current,true) }
   c2.activity.push({ action: done ? 'actuals-undone' : 'actuals-undo-partial', record: batch.id, detail: { file: batch.file, state: undone.state } })
   return { batch: get(c2.s, 'batch', batch.id), job: undone, undo: report }
  } }
 }
 return undefined
}

function finishBatch(c: Context, id: string, job: Data) {
 const batch = get(c.s, 'batch', id)
 if(batch.netsuiteSource)netsuiteAuthority(c)
 const done = job.state === 'completed'
 put(c.s, 'batch', id, { ...batch, status: done ? 'accepted' : 'importing', jobState: job.state, ...(done ? { acceptedBy: c.x.actor.email, acceptedAt: c.now } : {}) })
 if (done) completeSourceGuards(c, batch)
 if (done) { finishIntacctMonth(c,batch); finishQboMonth(c, batch); finishXeroMonth(c, batch); finishNetSuiteMonth(c,batch) }
 if (done) c.activity.push({ action: 'actuals-accepted', record: id, detail: { file: batch.file, rows: batch.accepted } })
 return { batch: get(c.s, 'batch', id), job: { id: job.id, state: job.state, checkpoint: job.checkpoint, total: job.total } }
}

export const jobFor = (db: D1Database, destination: string) =>
 db.prepare("SELECT id, state, mapping_version, principal_id FROM ik_jobs WHERE destination=? AND namespace=? ORDER BY rowid DESC LIMIT 1").bind(destination, CSV_NAMESPACE).first<any>()

export { actualCells, reconciliation, cashBalance, rowsFor } from './actuals-read'
