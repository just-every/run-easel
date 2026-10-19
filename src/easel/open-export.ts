import { canSeeDashboard } from './dashboard-access'
import { canSeeScenario, visibleActivity } from './scenario-access'
import { readD1ImportOriginals } from '../modules/import-kit/src/d1/index'
import type { RetainedOriginal } from '../modules/import-kit/src/types'
import { requireFinance } from './access'
import type { Context } from './context'
import { journalContext } from './kit'
import { scenarioWorkbook } from './report-workbooks'
import { snapshotList, snapshot as readSnapshot } from './store'
import { all, type Data } from './types'
import { zipFiles } from './xlsx-write'
import { scenarioView } from './views'

const encoder = new TextEncoder()
// Product and import-journal tables; credentials follow the existing backup policy.
const credentialTables = new Set(['e_api_tokens', 'e_api_limits'])
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`
function portableCell(value: unknown): unknown {
 if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || Array.isArray(value)) {
  const bytes = Array.isArray(value) ? new Uint8Array(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(raw) }
 }
 return value
}

function csvValue(value: unknown): string {
 let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
 // Excel ignores leading whitespace and control characters when deciding if a
 // cell is a formula. Prefix an apostrophe in those cases before CSV quoting.
 if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
 return `"${text.replace(/"/g, '""')}"`
}

function csv(columns: string[], rows: Record<string, unknown>[]): Uint8Array {
 const content = [columns, ...rows.map(row => columns.map(column => row[column]))]
  .map(row => row.map(csvValue).join(',')).join('\r\n') + '\r\n'
 return encoder.encode(content)
}

function json(value: unknown): Uint8Array {
 return encoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function safeName(name: string): string {
 const leaf = name.replace(/\\/g, '/').split('/').pop() ?? ''
 const safe = leaf.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').trim()
 return safe.slice(0, 160) || 'original'
}

function scenarioSlug(value: unknown): string {
 return String(value ?? 'scenario').normalize('NFKD').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario'
}

async function digest(bytes: Uint8Array): Promise<string> {
 const stable = new Uint8Array(bytes.length)
 stable.set(bytes)
 const result = await crypto.subtle.digest('SHA-256', stable.buffer)
 return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

type ArchiveFile = { name: string; bytes: Uint8Array }

async function retainedOriginals(c: Context): Promise<RetainedOriginal[]> {
 const { results } = await c.db.prepare(
  'SELECT DISTINCT j.id, j.destination, j.namespace, j.mapping_version, j.principal_id FROM ik_jobs j JOIN ik_originals o ON o.job_id=j.id ORDER BY j.id',
 ).all<any>()
 const originals = await Promise.all(results.map((job: any) => readD1ImportOriginals(job.id, journalContext(
  c.db, c.x.actor, job.destination, job.namespace, { mapping_version: job.mapping_version, principal_id: job.principal_id },
 ))))
 return originals.flat()
}

/** Build a complete finance-only portability archive from one loaded context. */
export async function openExport(c: Context): Promise<Uint8Array> {
 requireFinance(c.x)

 const hidden = new Set(all(c.s, 'scenario').filter(sc => !canSeeScenario(c.x, sc)).map(sc => sc.id))
 const visibleRow = (row: Data) => {
  if (row.kind === 'dashboard') return canSeeDashboard(c.s, c.x, row.value)
  if (row.kind === 'dashboard-layout') {
   const dashboard = all(c.s, 'dashboard').find(d => d.id === row.value.dashboard)
   return row.value.owner === c.x.actor.email && !!dashboard && canSeeDashboard(c.s, c.x, dashboard)
  }
  return !hidden.has(row.kind === 'scenario' ? row.id : row.value?.scenario)
 }
 const files: ArchiveFile[] = []
 const tables: Record<string, number> = {}
 const { results: schema } = await c.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND (name GLOB 'e_*' OR name GLOB 'ik_*') ORDER BY name").all<{ name: string; sql: string }>()
 const definitions = []
 for (const definition of schema.filter(t => !credentialTables.has(t.name))) {
  const table = definition.name
  const { results: columnRows } = await c.db.prepare(`PRAGMA table_info(${identifier(table)})`).all<{ name: string }>()
  const columns = columnRows.map(column => column.name)
  let { results } = await c.db.prepare(`SELECT * FROM ${identifier(table)}`).all<Record<string, unknown>>()
  if (table === 'e_records') results = results.filter(row => visibleRow({ ...row, value: JSON.parse(String(row.value)) }))
  if (table === 'e_snapshots') results = results.filter(row => !hidden.has(String(row.scenario)))
  if (table === 'e_activity') results = results.flatMap(row => {
   const event = visibleActivity(c.s, c.x, { ...row, detail: JSON.parse(String(row.detail)) })
   return event ? [{ ...row, detail: JSON.stringify(event.detail) }] : []
  })
  tables[table] = results.length
  definitions.push({ ...definition, columns })
  files.push({ name: `tables/${table}.csv`, bytes: csv(columns, results.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, portableCell(value)])))) })
 }

 const records = [...c.s.values()].filter(visibleRow)
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  .map(row => ({ destination: row.destination, kind: row.kind, id: row.id, revision: row.revision, value: row.value }))
 files.push({ name: 'model.json', bytes: json({ workspace: all(c.s, 'workspace')[0], lines: all(c.s, 'line'), departments: all(c.s, 'department'), records, tables: definitions, units: { money: 'integer minor units', counts: 'hundredths', rates: 'basis points' } }) })

 const scenarios = all(c.s, 'scenario').filter(sc => canSeeScenario(c.x, sc)).sort((a, b) => a.id.localeCompare(b.id))
 for (const scenario of scenarios) {
  const view = await scenarioView(c, scenario.id)
  files.push({
   name: `scenarios/${scenarioSlug(scenario.name)}-${safeName(scenario.id)}.xlsx`,
   bytes: scenarioWorkbook(view),
  })
 }

 const snapshotRows = (await snapshotList(c.db)).filter(sn => !hidden.has(String(sn.scenario)))
 for (const row of snapshotRows) {
  const snapshot = await readSnapshot(c.db, String(row.id))
  files.push({ name: `snapshots/${safeName(`${snapshot.id}.json`)}`, bytes: json(snapshot) })
 }

 const originalItems = await retainedOriginals(c)
 const originals = await Promise.all(originalItems.map(async original => {
  const entry: Data = {
   jobId: original.jobId, kind: original.kind, key: original.key, name: original.name,
   sha256: original.sha256, size: original.size, status: original.original.status,
  }
  if (original.original.status === 'retained') {
   const raw = atob(original.original.base64)
   const bytes = new Uint8Array(raw.length)
   for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
   const filename = safeName(original.name)
   const prefix = (await digest(encoder.encode(original.key))).slice(0, 12)
   const path = `originals/${safeName(original.jobId)}/${original.kind}/${prefix}-${filename}`
   files.push({ name: path, bytes })
   entry.path = path
  }
  return entry
 }))

 const manifest = {
  format: 'easel-open-export-v1',
  createdAt: c.now,
  inventory: {
   tables,
   modelRecords: records.length,
   scenarios: scenarios.length,
   snapshots: snapshotRows.length,
   originals: originals.length,
   retainedOriginals: originals.filter(item => item.status === 'retained').length,
   unavailableOriginals: originals.filter(item => item.status === 'unavailable').length,
  },
  files: await Promise.all(files.map(async file => ({ path: file.name, size: file.bytes.length, sha256: await digest(file.bytes) }))),
  originals,
 }
 files.push({ name: 'manifest.json', bytes: json(manifest) })
 return zipFiles(files)
}
