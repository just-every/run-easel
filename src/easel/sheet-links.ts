// A saved rectangle can propose changes to entered native schedule cells only.
// The reviewed source baseline and every proposal remain separate from the plan.
import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { requireDimensionAccess } from './dimensions'
import { requireEditable, scenarioInputs, workspace } from './model'
import { month, range } from './months'
import { plan } from './plan'
import { scenarioAccess } from './scenario-access'
import { sheetAuthority } from './sheet-connection'
import { SheetFailure } from './sheet-provider'
import { sheetSource, type SheetShape } from './sheet-source'
import { sha256 } from './store'
import { formatHundredths } from './units'
import { all, choice, Fault, find, get, integer, put, requireThat, text, uid, type Data } from './types'

type Source = Awaited<ReturnType<typeof sheetSource>>
type Mapping = { source: string; originId: string; month: string }

const shapeOf = (s: Source): SheetShape => ({ spreadsheetId: s.spreadsheetId, range: s.range, sheetId: s.sheetId, sheetTitle: s.sheetTitle,
 gridRows: s.gridRows, gridColumns: s.gridColumns, startRow: s.startRow, startColumn: s.startColumn, rowCount: s.rowCount, columnCount: s.columnCount })

function target(c: Context, id: unknown) {
 const scenario = scenarioAccess(c.s, c.x, id)
 requireThat(scenario.kind !== 'proposal' && !scenario.sandbox, 'Link a shared working plan, not a proposal or private sandbox', 409)
 requireEditable(c.s, c.x, scenario, null)
 return scenario
}

function editableCell(c: Context, scenario: Data, mapping: Mapping) {
 const rows = scenarioInputs(c.s, scenario.id, 'schedule').filter(r => r.originId === mapping.originId)
 requireThat(rows.length === 1, 'A linked schedule was removed or replaced; review the mapping again', 409)
 const row = rows[0]
 requireThat(!row.history && !row.workbookOrigin && Object.hasOwn(row.values ?? {}, mapping.month), 'Link an existing entered native schedule cell, not history or workbook cells', 409)
 requireThat(!(row.subrows?.[mapping.month] ?? []).length, 'A linked cell cannot contain split rows', 409)
 requireThat(range(workspace(c.s).planStart, scenario.horizon ?? workspace(c.s).horizon).includes(mapping.month) && (!scenario.actualsThrough || mapping.month > scenario.actualsThrough), 'Link an open month within the working plan', 409)
 requireEditable(c.s, c.x, scenario, row.department)
 requireDimensionAccess(c.s, c.x, row.dimensions ?? {}, row.department)
 return row
}

function mappingFor(c: Context, scenario: Data, source: Source, input: unknown): Mapping[] {
 requireThat(Array.isArray(input) && input.length === source.cells.length, 'Map every source cell to one existing native schedule cell')
 const mappings: Mapping[] = input.map((m: Data) => {
  requireThat(m && typeof m === 'object', 'Each linked cell needs a source and native target')
  const row = get(c.s, 'schedule', m.schedule)
  requireThat(row.scenario === scenario.id && typeof row.originId === 'string', 'Choose a schedule in the target scenario')
  const entered = text(m.source, 'Source cell').replaceAll('$', '')
  const cell = source.cells.find(cell => cell.address === entered || cell.address.slice(cell.address.lastIndexOf('!') + 1) === entered.toUpperCase())
  requireThat(cell, 'Every mapped source cell must be inside the linked rectangle')
  return { source: cell.address, originId: row.originId, month: month(m.month) }
 })
 requireThat(new Set(mappings.map(m => m.source)).size === mappings.length && new Set(mappings.map(m => `${m.originId}|${m.month}`)).size === mappings.length, 'Source and target cells must each appear once')
 const addresses = new Set(source.cells.map(cell => cell.address))
 requireThat(mappings.every(m => addresses.has(m.source)), 'Every mapped source cell must be inside the linked rectangle')
 for (const mapping of mappings) editableCell(c, scenario, mapping)
 return mappings.sort((a, b) => a.source.localeCompare(b.source))
}

function previewCells(c: Context, scenario: Data, source: Source, mappings: Mapping[]) {
 return mappings.map(mapping => {
  const row = editableCell(c, scenario, mapping), cell = source.cells.find(cell => cell.address === mapping.source)!
  return { ...mapping, schedule: row.id, scheduleName: row.name, department: row.department, line: row.line, beforeCents: row.values[mapping.month], afterCents: cell.cents }
 })
}

export function sheetLinks(c: Context) {
 sheetAuthority(c)
 return { links: all(c.s, 'sheet-link') }
}

export async function sheetLinkCommands(c: Context, env: Bindings, op: string, b: Data): Promise<Data | undefined> {
 if (!['sheet-link-preview', 'sheet-link-save', 'sheet-link-pull', 'sheet-link-disable'].includes(op)) return undefined
 sheetAuthority(c)
 if (op === 'sheet-link-pull' || op === 'sheet-link-disable') {
  const link = get(c.s, 'sheet-link', b.id)
  requireThat(Number(b.revision) === link.revision, 'The sheet link changed; reload', 409)
  if (op === 'sheet-link-pull') return pullSheetLink(c, env, link.id)
  put(c.s, 'sheet-link', link.id, { ...link, enabled: false, revision: link.revision + 1, updatedAt: c.now, updatedBy: c.x.actor.email })
  c.activity.push({ action: op, record: link.id, scenario: link.scenario, detail: {} })
  return get(c.s, 'sheet-link', link.id)
 }
 // Replacing an existing link needs a new explicit review of its source baseline.
 const prior = b.id ? get(c.s, 'sheet-link', b.id) : null
 if (prior) requireThat(Number(b.revision) === prior.revision, 'The sheet link changed; reload', 409)
 const scenario = target(c, b.scenario)
 const source = await sheetSource(c, env, { spreadsheetId: b.spreadsheetId, range: b.range })
 const mappings = mappingFor(c, scenario, source, b.mappings)
 const name = text(b.name, 'Sheet link name'), cadence = choice(b.cadence, ['hourly', 'daily'] as const, 'a pull frequency')
 const hour = integer(b.hour ?? 8, 'Company-local pull hour', 0, 23), enabled = b.enabled !== false
 const cells = previewCells(c, scenario, source, mappings), shape = shapeOf(source)
 const digest = await sha256(JSON.stringify({ id: prior?.id ?? null, revision: prior?.revision ?? null, name, cadence, hour, enabled, scenario: scenario.id, scenarioRevision: scenario.revision, shape, values: source.values, cells }))
 if (op === 'sheet-link-preview') return { digest, source, scenario: scenario.id, scenarioRevision: scenario.revision, cells, cadence, hour, enabled, baselineOnly: true }
 requireThat(typeof b.digest === 'string' && b.digest === digest, 'The sheet, mapping or plan changed; preview this exact link again', 409)
 const id = prior?.id ?? uid()
 const baselineDigest = await sha256(JSON.stringify(source.values))
 put(c.s, 'sheet-link', id, { name, scenario: scenario.id, shape, mappings, baseline: source.values, baselineDigest,
  initialBaseline: { values: source.values, digest: baselineDigest, reviewedAt: c.now, reviewedBy: c.x.actor.email, scenarioRevision: scenario.revision },
  baselineReviewedAt: c.now, baselineReviewedBy: c.x.actor.email, cadence, hour, enabled, owner: c.x.actor.email, ownerId: c.x.actor.id,
  revision: (prior?.revision ?? 0) + 1, createdAt: prior?.createdAt ?? c.now, updatedAt: c.now, updatedBy: c.x.actor.email,
  lastChecked: null, lastRefresh: source.fetchedAt, rowCount: source.rowCount, error: null, lastRun: null, proposals: prior?.proposals ?? [] })
 connectionHealth(c, { lastRefresh: source.fetchedAt, rowCount: source.rowCount, error: null, rateLimit: null })
 c.activity.push({ action: op, record: id, scenario: scenario.id, detail: { digest, shape, cadence, hour, enabled } })
 return get(c.s, 'sheet-link', id)
}

/** A failed source or target validation writes health only. Proposal edits are staged. */
export async function pullSheetLink(c: Context, env: Bindings, id: string, run?: { key: string; scheduledAt: string }): Promise<Data> {
 sheetAuthority(c)
 const link = get(c.s, 'sheet-link', id)
 requireThat(link.enabled, 'Enable this reviewed sheet link before pulling', 409)
 if (run && link.lastRun === run.key) return { link, unchanged: true }
 let source: Source, scenario: Data, cells: Data[]
 try {
  scenario = target(c, link.scenario)
  source = await sheetSource(c, env, link.shape, link.shape)
  cells = previewCells(c, scenario, source, link.mappings)
 } catch (error) { return sheetLinkFailure(c, link, error, run) }
 const digest = await sha256(JSON.stringify(source.values))
 const common = { lastChecked: c.now, lastRefresh: source.fetchedAt, rowCount: source.rowCount, error: null, revision: link.revision + 1,
  ...(run ? { lastRun: run.key, scheduledAt: run.scheduledAt } : {}) }
 if (digest === link.baselineDigest) {
  put(c.s, 'sheet-link', id, { ...link, ...common })
  connectionHealth(c, { lastRefresh: source.fetchedAt, rowCount: source.rowCount, error: null, rateLimit: null })
  c.activity.push({ action: 'sheet-link-unchanged', record: id, scenario: scenario.id, detail: { digest } })
  return { link: get(c.s, 'sheet-link', id), unchanged: true, cells: [] }
 }
 const old = new Map<string, number>()
 for (let r = 0; r < source.rowCount; r++) for (let col = 0; col < source.columnCount; col++) old.set(source.cells[r * source.columnCount + col].address, link.baseline[r][col])
 const changed: Data[] = cells.filter(cell => old.get(cell.source) !== cell.afterCents).map(cell => ({ ...cell, sourceBeforeCents: old.get(cell.source) }))
 const staged: Context = { ...c, s: new Map(c.s), activity: [], snapshots: [], extra: [...(c.extra ?? [])] }
 let proposal: Data
 try {
  proposal = (await plan(staged, 'proposal-create', { from: scenario.id, name: `${link.name.slice(0, 150)} · sheet changes`, request: `Review ${changed.length} changed source cells from ${source.range}. The working plan is unchanged until finance promotes this exact proposal revision.` }))!
  for (const originId of new Set(changed.map(cell => cell.originId))) {
   const row = scenarioInputs(staged.s, proposal.id, 'schedule').find(row => row.originId === originId)!
   const values = Object.fromEntries(Object.entries(row.values).map(([m, value]) => [m, formatHundredths(value as number)]))
   for (const cell of changed.filter(cell => cell.originId === originId)) values[cell.month] = formatHundredths(cell.afterCents)
   await plan(staged, 'schedule', { ...row, scenario: proposal.id, scenarioRevision: get(staged.s, 'scenario', proposal.id).revision, values,
    provenance: { ...row.provenance, sheet: { link: id, spreadsheetId: source.spreadsheetId, range: source.range, fetchedAt: source.fetchedAt, digest, cells: changed.filter(cell => cell.originId === originId) } } })
  }
  proposal = (await plan(staged, 'proposal-submit', { id: proposal.id, summary: `${changed.length} source cells changed. Review the linked source and native cell differences before promotion.` }))!
 } catch (error) { return sheetLinkFailure(c, link, error, run) }
 for (const [key, row] of staged.s) c.s.set(key, row)
 c.activity.push(...staged.activity); c.snapshots.push(...staged.snapshots)
 c.extra = staged.extra
 const record = { id: proposal.id, revision: proposal.revision, targetRevision: scenario.revision, digest, fetchedAt: source.fetchedAt, createdAt: c.now, cells: changed }
 put(c.s, 'sheet-link', id, { ...link, ...common, baseline: source.values, baselineDigest: digest, lastProposal: record, proposals: [...link.proposals, record] })
 connectionHealth(c, { lastRefresh: source.fetchedAt, rowCount: source.rowCount, error: null, rateLimit: null })
 c.activity.push({ action: 'sheet-link-proposed', record: id, scenario: scenario.id, detail: record })
 return { link: get(c.s, 'sheet-link', id), proposal, cells: changed }
}

export function sheetLinkFailure(c: Context, link: Data, error: unknown, run?: { key: string; scheduledAt: string }) {
 const message = error instanceof Fault ? error.message : 'The sheet pull could not be completed; no proposal or baseline was changed.'
 put(c.s, 'sheet-link', link.id, { ...link, revision: link.revision + 1, lastChecked: c.now, error: message,
  ...(run ? { lastRun: run.key, scheduledAt: run.scheduledAt } : {}) })
 connectionHealth(c, { error: message, rateLimit: error instanceof SheetFailure ? error.rateLimit : null })
 c.activity.push({ action: 'sheet-link-failed', record: link.id, scenario: link.scenario, detail: { error: message, scheduledAt: run?.scheduledAt ?? null } })
 return { link: get(c.s, 'sheet-link', link.id), error: message, cells: [] }
}

function connectionHealth(c: Context, health: Data) {
 const connection = find(c.s, 'connection', 'sheets')
 if (connection) put(c.s, 'connection', 'sheets', { ...connection, ...health, lastChecked: c.now })
}
