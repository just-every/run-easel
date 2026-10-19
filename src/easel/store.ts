// Loading and saving the editable model. Every save is one D1 batch fenced by
// the model revision read at load and by the actor's current native session,
// so a concurrent change or a revoked session writes nothing.
import { actorAuthority, changeEvent, eventStatement } from './audit-write'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { tokenActor, tokenAuthority } from './token-auth'
import { Fault, key, requireThat, type Actor, type Data, type State } from './types'

export async function actor(request: Request, original: Bindings): Promise<Actor> {
 const env = runtimeBindings(original)
 const url = new URL(request.url), host = request.headers.get('host')
 requireThat(url.origin === env.AUTH_ORIGIN && (!host || host.toLowerCase() === url.host.toLowerCase()), 'Invalid host', 403)
 if (request.headers.has('authorization')) return tokenActor(request, env)
 if (!['GET', 'HEAD'].includes(request.method)) requireThat(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403)
 const session = await operatorAuth(env).getSession(request)
 requireThat(session, 'Sign in required', 401)
 return { id: session.operator.id, email: session.operator.email.toLowerCase(), name: session.operator.displayName, session: session.id, version: session.operator.version, baseRole: session.operator.role }
}

/** SQL that is true only while the actor's session and operator are still current. */
export function authority(a: Actor, finance = false) {
 if (a.token) return tokenAuthority(a, finance)
 return {
  sql: `EXISTS(SELECT 1 FROM oa_sessions se JOIN oa_operators o ON o.id=se.operator_id WHERE se.id=? AND o.id=? AND o.version=se.operator_version AND o.version=? AND o.role=? AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>unixepoch()*1000${finance ? " AND o.role IN ('owner','admin')" : ''})`,
  params: [a.session, a.id, a.version, a.baseRole],
 }
}

export async function load(db: D1Database) {
 const [meta, rows] = await db.batch([db.prepare('SELECT revision FROM e_meta WHERE id=1'), db.prepare('SELECT * FROM e_records ORDER BY kind, id')])
 const revision = Number((meta.results[0] as any).revision)
 const state: State = new Map(rows.results.map((r: any) => [key(r.kind, r.id), { destination: r.destination, kind: r.kind, id: r.id, revision: r.revision, value: JSON.parse(r.value) }]))
 return { revision, state }
}

export type Activity = { action: string; record: string; scenario?: string; before?: number; after?: number; detail?: Data }
export type Snapshot = { id: string; kind: 'approval' | 'forecast' | 'pack' | 'reforecast'; scenario: string; label: string; body: Data }

export async function sha256(text: string) {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
 return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function save(db: D1Database, a: Actor, before: State, after: State, revision: number, activity: Activity[], snapshots: Snapshot[] = [], finance = false, extra: D1PreparedStatement[] = []) {
 const auth = authority(a, finance)
 const guard = (extra = '') => db.prepare(`INSERT INTO e_guard SELECT CASE WHEN (${auth.sql})${extra} THEN 1 ELSE 0 END`)
 const q: D1PreparedStatement[] = [guard(' AND (SELECT revision FROM e_meta WHERE id=1)=?').bind(...auth.params, revision)]
 for (const [k, r] of after) {
  if (before.get(k)?.revision === r.revision) continue
  q.push(eventStatement(db, a, changeEvent(before.get(k), r)))
  q.push(db.prepare('INSERT INTO e_records(destination,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(r.destination, r.kind, r.id, r.revision, JSON.stringify(r.value)))
 }
 for (const [k, r] of before) if (!after.has(k)) {
  q.push(eventStatement(db, a, changeEvent(r, undefined)))
  q.push(db.prepare('DELETE FROM e_records WHERE kind=? AND id=?').bind(r.kind, r.id))
 }
 q.push(...extra)
 const at = new Date().toISOString()
 for (const s of snapshots) {
  const body = JSON.stringify(s.body)
  q.push(db.prepare('INSERT INTO e_snapshots(id,kind,scenario,label,actor,at,sha256,body) VALUES(?,?,?,?,?,?,?,?)').bind(s.id, s.kind, s.scenario, s.label, a.email, at, await sha256(body), body))
 }
 for (const e of activity) q.push(db.prepare('INSERT INTO e_activity(at,actor,action,record,scenario,before_revision,after_revision,detail) VALUES(?,?,?,?,?,?,?,?)').bind(at, a.email, e.action, e.record, e.scenario ?? null, e.before ?? null, e.after ?? null, JSON.stringify({ ...e.detail, authority: actorAuthority(a) })))
 q.push(guard().bind(...auth.params), db.prepare('DELETE FROM e_guard'))
 try { await db.batch(q) } catch (e) {
  if (String(e).includes('CHECK constraint')) throw new Fault(409, 'The plan or your access changed while you were working; reload and try again')
  throw e
 }
}

/** Confirms a read reflected one consistent model revision and a current session. */
export async function readFence(db: D1Database, a: Actor, revision: number) {
 const auth = authority(a)
 const result = await db.prepare(`SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM e_meta WHERE id=1)=? THEN 1 ELSE 0 END AS ok`).bind(...auth.params, revision).first<{ ok: number }>()
 requireThat(result?.ok === 1, 'The plan or your access changed while reading; reload', 409)
}

export async function snapshot(db: D1Database, id: string) {
 const row = await db.prepare('SELECT * FROM e_snapshots WHERE id=?').bind(id).first<any>()
 requireThat(row, 'Snapshot not found', 404)
 return { id: row.id, kind: row.kind, scenario: row.scenario, label: row.label, actor: row.actor, at: row.at, sha256: row.sha256, body: JSON.parse(row.body) }
}

export async function snapshotList(db: D1Database) {
 const { results } = await db.prepare('SELECT id,kind,scenario,label,actor,at,sha256 FROM e_snapshots ORDER BY at, id').all()
 return results as Data[]
}
