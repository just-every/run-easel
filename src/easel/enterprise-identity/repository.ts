import { AuthError } from '../../modules/operator-auth/index.mjs'
import { transformErased, type ErasureMap } from '../erasure-map.mjs'
import { key, type Data, type Row, type State } from '../types'
import type { EnterpriseEnv, ScimConfig } from './config'
import { check } from './http'

export type NativePerson = { id: string; email: string; display_name: string; role: string; status: string; version: number; created_at: number }
export type Provisioning = { env: EnterpriseEnv; config: ScimConfig; owner: NativePerson; revision: number; before: State; state: State; extra: D1PreparedStatement[]; guards: { sql: string; args: unknown[] }[]; people: Map<string, NativePerson> }
export async function context(env: EnterpriseEnv, config: ScimConfig): Promise<Provisioning> {
 const [meta, records, owners] = await env.DB.batch([
  env.DB.prepare('SELECT revision FROM e_meta WHERE id=1'), env.DB.prepare('SELECT * FROM e_records'),
  env.DB.prepare("SELECT * FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(config.ownerEmail),
 ])
 const owner = owners.results[0] as NativePerson | undefined
 check(owner, 'SCIM requires its configured active native owner', 403)
 const state: State = new Map(records.results.map((r: any) => [key(r.kind, r.id), { ...r, value: JSON.parse(r.value) }]))
 return { env, config, owner, revision: Number((meta.results[0] as { revision: number }).revision), before: new Map(state), state, extra: [], guards: [], people: new Map() }
}
export function nativeFence(c: Provisioning, person: NativePerson) { c.people.set(person.id, person) }

const ownerFence = (c: Provisioning) => ({ sql: "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND version=? AND role='owner' AND status='active')", args: [c.owner.id, c.config.ownerEmail, c.owner.version] })
function activity(c: Provisioning, action: string, record: string, detail: Data) {
 return c.env.DB.prepare('INSERT INTO e_activity(at,actor,action,record,detail) VALUES(?,?,?,?,?)').bind(new Date().toISOString(), c.owner.email, action, record, JSON.stringify({ ...detail, authority: { type: 'integration', name: 'SCIM', via: 'scim', attributedTo: c.owner.id } }))
}
/** Same D1 batch/revision/active-authority guards as the edition's session save,
 * with the provisioning bearer bound to its explicitly configured native owner. */
export async function commit(c: Provisioning, action: string, id: string) {
 const db = c.env.DB, owner = ownerFence(c)
 const fences = [owner, ...c.guards, ...(c.people.size ? [{
  sql: `NOT EXISTS(SELECT 1 FROM json_each(?) expected LEFT JOIN oa_operators o ON o.id=json_extract(expected.value,'$.id')
   WHERE o.id IS NULL OR o.email!=json_extract(expected.value,'$.email') OR o.version!=json_extract(expected.value,'$.version')
   OR o.role!=json_extract(expected.value,'$.role') OR o.status!=json_extract(expected.value,'$.status') OR o.display_name!=json_extract(expected.value,'$.display_name'))`,
  args: [JSON.stringify([...c.people.values()].map(({ id, email, version, role, status, display_name }) => ({ id, email, version, role, status, display_name })))],
 }] : [])]
 const statements = [db.prepare(`INSERT INTO e_guard SELECT CASE WHEN (SELECT revision FROM e_meta WHERE id=1)=? AND ${fences.map(f => `(${f.sql})`).join(' AND ')} THEN 1 ELSE 0 END`).bind(c.revision, ...fences.flatMap(f => f.args))]
 for (const [recordKey, row] of c.state) {
  const before = c.before.get(recordKey)
  if (before?.revision === row.revision) continue
  statements.push(activity(c, 'record-changed', row.id, { kind: row.kind, before: before?.value ?? null, after: row.value, beforeRecordRevision: before?.revision ?? null, afterRecordRevision: row.revision }))
  statements.push(db.prepare('INSERT INTO e_records(destination,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.destination, row.kind, row.id, row.revision, JSON.stringify(row.value)))
 }
 for (const [recordKey, row] of c.before) if (!c.state.has(recordKey)) {
  statements.push(activity(c, 'record-changed', row.id, { kind: row.kind, before: row.value, after: null, beforeRecordRevision: row.revision, afterRecordRevision: null }))
  statements.push(db.prepare('DELETE FROM e_records WHERE kind=? AND id=?').bind(row.kind, row.id))
 }
 statements.push(...c.extra, activity(c, action, id, {}), db.prepare(`INSERT INTO e_guard SELECT CASE WHEN ${owner.sql} THEN 1 ELSE 0 END`).bind(...owner.args), db.prepare('DELETE FROM e_guard'))
 try { await db.batch(statements) } catch (e) {
  if (String(e).includes('CHECK constraint')) throw new AuthError('The plan or provisioning authority changed; reload and review', 409)
  if (/UNIQUE constraint/.test(String(e))) throw new AuthError('A resource with that identity already exists', 409)
  throw e
 }
}
export async function readFence(c: Provisioning) {
 const owner = ownerFence(c)
 const row = await c.env.DB.prepare(`SELECT CASE WHEN (SELECT revision FROM e_meta WHERE id=1)=? AND ${owner.sql} THEN 1 ELSE 0 END AS ok`).bind(c.revision, ...owner.args).first<{ ok: number }>()
 check(row?.ok === 1, 'The plan or provisioning authority changed; reload', 409)
}
export function redacted<T>(c: Provisioning, value: T): T {
 const maps = [...c.state.values()].filter(r => r.kind === 'erasure').map(r => r.value as ErasureMap)
 return transformErased(value, maps)
}
export function matchVersion(request: Request, version: string) {
 const expected = request.headers.get('if-match')
 check(!expected || expected === version, 'The resource changed; review it again', 412)
}
export const resourceVersion = (row: Row, nativeVersion?: number) => `W/"${nativeVersion ?? 0}-${row.revision}"`
