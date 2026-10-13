// Easel's native target for Base import-kit. Move-in kits write through this
// adapter only: accepted actuals rows into e_actuals and imported plan
// records into e_records, each under the kit's own destination so the journal
// can resume, reconcile and undo exactly what that import wrote.
import type { D1ImportContext, D1Sql, D1TargetAdapter, TargetRow } from '../modules/import-kit/src/d1/index'
import { authority } from './store'
import type { Actor } from './types'

const sql = (text: string, ...params: unknown[]): D1Sql => ({ sql: text, params })
const isActual = (kind: string) => kind === 'actual'
const strings = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []

export const targets: D1TargetAdapter = {
 async read(db, destination, kind, id) {
  const r: any = isActual(kind)
   ? await db.prepare('SELECT * FROM e_actuals WHERE destination=? AND id=?').bind(destination, id).first()
   : await db.prepare('SELECT * FROM e_records WHERE destination=? AND kind=? AND id=?').bind(destination, kind, id).first()
  return r ? { destination, targetKind: kind, targetId: id, revision: r.revision, value: JSON.parse(r.value) } : undefined
 },
 matches(r, d, k, id) {
  if (isActual(k)) return r ? sql('EXISTS(SELECT 1 FROM e_actuals WHERE destination=? AND id=? AND revision=? AND value=?)', d, id, r.revision, JSON.stringify(r.value)) : sql('NOT EXISTS(SELECT 1 FROM e_actuals WHERE destination=? AND id=?)', d, id)
  return r ? sql('EXISTS(SELECT 1 FROM e_records WHERE destination=? AND kind=? AND id=? AND revision=? AND value=?)', d, k, id, r.revision, JSON.stringify(r.value)) : sql('NOT EXISTS(SELECT 1 FROM e_records WHERE kind=? AND id=?)', k, id)
 },
 matchesCount(n, d) { return sql('(SELECT COUNT(*) FROM e_actuals WHERE destination=?)+(SELECT COUNT(*) FROM e_records WHERE destination=?)=?', d, d, n) },
 matchesMany(rows, d) { return [this.matchesCount!(rows.length, d), ...rows.map(r => this.matches(r, d, r.targetKind, r.targetId))] },
 write(r) {
  const v = r.value as any
  if (isActual(r.targetKind)) return [sql('INSERT INTO e_actuals(destination,id,revision,value,period,account,department,amount,fingerprint,row_no) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(destination,id) DO UPDATE SET revision=excluded.revision,value=excluded.value,period=excluded.period,account=excluded.account,department=excluded.department,amount=excluded.amount,fingerprint=excluded.fingerprint,row_no=excluded.row_no', r.destination, r.targetId, r.revision, JSON.stringify(v), v.period, v.account, v.department, v.amount, v.fingerprint, v.line)]
  return [sql('INSERT INTO e_records(destination,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value', r.destination, r.targetKind, r.targetId, r.revision, JSON.stringify(v))]
 },
 remove(d, k, id) {
  return isActual(k) ? [sql('DELETE FROM e_actuals WHERE destination=? AND id=?', d, id)] : [sql('DELETE FROM e_records WHERE destination=? AND kind=? AND id=?', d, k, id)]
 },
 async list(db, d) {
  const [actuals, records]: any[] = await db.batch([db.prepare('SELECT * FROM e_actuals WHERE destination=? ORDER BY id').bind(d), db.prepare('SELECT * FROM e_records WHERE destination=? ORDER BY kind,id').bind(d)])
  return [
   ...(actuals.results as any[]).map((r: any) => ({ destination: d, targetKind: 'actual', targetId: r.id, revision: r.revision, value: JSON.parse(r.value) })),
   ...(records.results as any[]).map((r: any) => ({ destination: d, targetKind: r.kind, targetId: r.id, revision: r.revision, value: JSON.parse(r.value) })),
  ] as TargetRow[]
 },
 // Undo keeps anything a person has since edited, and keeps an imported plan
 // record while any record outside the import still refers to it.
 async preparePreservedUndo(db, destination, effects) {
  const rows = await this.list(db, destination)
  const byKey = new Map(rows.map(r => [`${r.targetKind}:${r.targetId}`, r]))
  const planEffects = effects.filter(e => !isActual(e.expected.targetKind))
  const outside = planEffects.length ? (await db.prepare('SELECT * FROM e_records WHERE destination<>?').bind(destination).all()).results as any[] : []
  const dependencies = planEffects.flatMap(e => outside.filter(r => strings(JSON.parse(r.value)).includes(e.expected.targetId)).map(r => ({
   requiredEffectId: e.provenance.id, cause: { table: 'e_records', recordId: r.id, field: r.kind },
   evidence: { reason: 'A record outside this import refers to it', kind: r.kind, id: r.id },
  })))
  // Inside the import, a record that refers to another (a schedule to its
  // scenario) keeps it while the referring record survives.
  const effectByKey = new Map(planEffects.map(e => [`${e.expected.targetKind}:${e.expected.targetId}`, e.provenance.id]))
  for (const e of planEffects) for (const r of rows) {
   const k = `${r.targetKind}:${r.targetId}`
   if (k === `${e.expected.targetKind}:${e.expected.targetId}` || !strings(r.value).includes(e.expected.targetId)) continue
   dependencies.push({ requiredEffectId: e.provenance.id, ...(effectByKey.has(k) ? { dependentEffectId: effectByKey.get(k) } : {}), cause: { table: 'e_records', recordId: r.targetId, field: r.targetKind }, evidence: { reason: 'Another imported record refers to it', kind: r.targetKind, id: r.targetId } } as any)
  }
  const referencing = outside.filter(r => dependencies.some(d => d.cause.recordId === r.id))
  return {
   observations: effects.map(e => ({ effectId: e.provenance.id, current: byKey.get(`${e.expected.targetKind}:${e.expected.targetId}`) ?? null, entity: { table: isActual(e.expected.targetKind) ? 'e_actuals' : 'e_records', recordId: e.expected.targetId, field: e.expected.targetKind }, evidence: { reason: 'Complete current native record' } })),
   nativeRows: rows,
   dependencies,
   guards: [...this.matchesMany!(rows, destination), ...referencing.map(r => sql('EXISTS(SELECT 1 FROM e_records WHERE kind=? AND id=? AND revision=?)', r.kind, r.id, r.revision))],
  }
 },
}

/** A fresh kit context bound to this actor's current finance session. */
export function kitContext(db: D1Database, a: Actor, destination: string, namespace: string, mappingVersion: string): D1ImportContext {
 return {
  destination, namespace, mappingVersion, reversalPolicy: 'preserve-conflicts',
  storage: { database: db as any, targets },
  authorization: { principalId: a.id, predicate: () => authority(a, true) },
  batchSize: 100, maxBatches: 2,
 } as D1ImportContext
}

/** Keep journal attribution with its importer while authorizing the live operator. */
export function journalContext(db: D1Database, a: Actor, destination: string, namespace: string, job: { mapping_version: string; principal_id: string }): D1ImportContext {
 const ctx = kitContext(db, a, destination, namespace, job.mapping_version)
 return { ...ctx, authorization: { ...ctx.authorization, principalId: job.principal_id } }
}

export function base64(bytes: Uint8Array) {
 let raw = ''
 for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
 return btoa(raw)
}
