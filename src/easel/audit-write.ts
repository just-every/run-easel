// Capture native values at the same atomic write boundary as the model and kit.
import type { D1Sql, TargetRow } from '../modules/import-kit/src/d1/index'
import type { Activity } from './store'
import type { Actor, Row } from './types'

export function actorAuthority(actor: Actor) {
 return { type: actor.agent ? 'agent' : 'person', name: actor.agent?.name ?? actor.name, via: actor.token ? 'api-token' : actor.agent?.via ?? 'session', ...(actor.token ? { tokenId: actor.token.id } : {}) }
}

export function changeEvent(before?: Row, after?: Row): Activity {
 const row = after ?? before!
 return { action: 'record-changed', record: row.id, scenario: (after?.value ?? before?.value)?.scenario ?? (row.kind === 'scenario' ? row.id : undefined), detail: {
  kind: row.kind, before: before?.value ?? null, after: after?.value ?? null,
  beforeRecordRevision: before?.revision ?? null, afterRecordRevision: after?.revision ?? null,
 } }
}

export function eventStatement(db: D1Database, actor: Actor, event: Activity) {
 const d = event.detail!
 return db.prepare('INSERT INTO e_activity(at,actor,action,record,scenario,before_revision,after_revision,detail) VALUES(?,?,?,?,?,?,?,?)').bind(
  new Date().toISOString(), actor.email, event.action, event.record, event.scenario ?? null, null, null,
  JSON.stringify({ ...d, authority: actorAuthority(actor) }),
 )
}

/** SELECT the old value before the kit mutates it; the journal executes these
 * statements inside its authorized, revision-fenced native batch. */
export function importAudit(actor: Actor, destination: string, kind: string, id: string, after?: TargetRow): D1Sql[] {
 const actual = kind === 'actual', table = actual ? 'e_actuals' : 'e_records'
 const where = actual ? 'destination=? AND id=?' : 'destination=? AND kind=? AND id=?'
 const params = actual ? [destination, id] : [destination, kind, id]
 const query = (field: string) => `(SELECT ${field} FROM ${table} WHERE ${where})`
 const value = after ? JSON.stringify(after.value) : null
 const scenario = (after?.value as any)?.scenario ?? (kind === 'scenario' ? id : null)
 return [{ sql: `INSERT INTO e_activity(at,actor,action,record,scenario,before_revision,after_revision,detail)
  SELECT ?,?,'record-changed',?,COALESCE(?,json_extract(${query('value')},'$.scenario')),NULL,NULL,
  json_object('kind',?,'destination',?,'before',json(${query('value')}),'after',json(?),'beforeRecordRevision',${query('revision')},'afterRecordRevision',?,'authority',json(?))`,
  params: [new Date().toISOString(), actor.email, id, scenario, ...params, kind, destination, ...params, value, ...params, after?.revision ?? null, JSON.stringify(actorAuthority(actor))],
 }]
}
