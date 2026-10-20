import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { AuthError } from '../modules/operator-auth/index.mjs'
import { requireMember } from './access'
import type { Context } from './context'
import { authority, readFence } from './store'
import { choice, Fault, integer, requireThat, text, type Data } from './types'

// Select metadata explicitly: this query must never expose a bearer or hash.
const metadataColumns = `t.id,t.label,t.kind,t.scope,t.issuing_role AS issuingRole,
 t.departments,t.pay_detail AS payDetail,t.created_at AS createdAt,c.expires_at AS expiresAt,c.revoked_at AS revokedAt`
const metadataFrom = 'FROM e_api_tokens t JOIN oa_credentials c ON c.id=t.id'
const metadata = (row: Data): Data => ({ ...row, departments: JSON.parse(row.departments) })

function revision(c: Context) {
 // The route supplies the revision loaded alongside the command context.
 const value = (c as Context & { revision: number }).revision
 requireThat(Number.isSafeInteger(value) && value >= 0, 'A loaded plan revision is required', 409)
 return value
}

/** Credential changes live outside e_records, but share the plan/session fence. */
async function write(c: Context, statements: D1PreparedStatement[], extra = '', params: (string | number)[] = []) {
 const auth = authority(c.x.actor)
 const guard = (condition: string, values: (string | number)[]) => c.db.prepare(`INSERT INTO e_guard
  SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM e_meta WHERE id=1)=?${condition} THEN 1 ELSE 0 END`)
  .bind(...auth.params, revision(c), ...values)
 try {
  await c.db.batch([guard(extra, params), ...statements, guard('', []), c.db.prepare('DELETE FROM e_guard')])
 } catch (error) {
  if (String(error).includes('CHECK constraint')) throw new Fault(409, 'The plan or your access changed while you were working; reload and try again')
  throw error
 }
}

/** Only a signed-in member can manage credentials issued to that same person. */
export async function tokenAdmin(c: Context, request: Request, env: Bindings, op: 'list' | 'issue' | 'revoke', b: Data): Promise<Data | Data[]> {
 requireThat(!request.headers.has('authorization'), 'Use your signed-in session to manage API tokens', 403)
 requireMember(c.x)
 const planRevision = revision(c)
 const actor = c.x.actor
 if (op === 'list') {
  const { results } = await c.db.prepare(`SELECT ${metadataColumns} ${metadataFrom}
   WHERE c.operator_id=? ORDER BY t.created_at DESC,t.id`).bind(actor.id).all<Data>()
  await readFence(c.db, actor, planRevision)
  return results.map(metadata)
 }
 if (op === 'revoke') {
  const id = text(b.id, 'Token id', 100)
  const row = await c.db.prepare(`SELECT ${metadataColumns} ${metadataFrom} WHERE t.id=? AND c.operator_id=?`).bind(id, actor.id).first<Data>()
  requireThat(row, 'Token not found', 404)
  const revokedAt = Date.now()
  const detail = JSON.stringify({ ...metadata(row), revokedAt, authority: { type: 'person', name: actor.name, via: 'session' } })
  await write(c, [
   c.db.prepare(`INSERT INTO e_activity(at,actor,action,record,scenario,before_revision,after_revision,detail)
    SELECT ?,?,'token-revoked',?,NULL,NULL,NULL,? FROM oa_credentials WHERE id=? AND operator_id=? AND revoked_at IS NULL`)
    .bind(c.now, actor.email, id, detail, id, actor.id),
   c.db.prepare('UPDATE oa_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND operator_id=?').bind(revokedAt, id, actor.id),
  ], ' AND EXISTS(SELECT 1 FROM e_api_tokens t JOIN oa_credentials c ON c.id=t.id WHERE t.id=? AND c.operator_id=?)', [id, actor.id])
  return { id, revoked: true }
 }
 requireThat(op === 'issue', 'Unknown token action', 404)
 const label = text(b.label, 'Token label', 100)
 const kind = choice(b.kind, ['personal', 'service'] as const, 'token kind')
 const scope = choice(b.scope, ['read', 'write'] as const, 'token scope')
 const expiresInSeconds = integer(b.expiresInSeconds === undefined ? 86400 : b.expiresInSeconds, 'Token lifetime in seconds', 1, 365 * 86400)
 let minted: { id: string; token: string; expiresAt: number }
 try {
  minted = await operatorAuth(runtimeBindings(env)).mintCredential(request, { expiresInSeconds })
 } catch (error) {
  if (error instanceof AuthError) throw new Fault(error.status, error.code === 'step_up_required'
   ? 'step_up_required: Confirm your identity using POST /auth/step-up with action credentials:mint, follow the emailed link in this session, then try again'
   : error.code)
  throw error
 }
 const details = { id: minted.id, label, kind, scope, issuingRole: c.x.role, departments: [...c.x.departments], payDetail: c.x.payDetail === true, createdAt: c.now, expiresAt: minted.expiresAt, revokedAt: null }
 try {
  await write(c, [
   c.db.prepare('INSERT INTO e_api_tokens(id,label,kind,scope,issuing_role,departments,created_at,pay_detail) VALUES(?,?,?,?,?,?,?,?)')
    .bind(minted.id, label, kind, scope, c.x.role, JSON.stringify(details.departments), c.now, details.payDetail ? 1 : 0),
   c.db.prepare(`INSERT INTO e_activity(at,actor,action,record,scenario,before_revision,after_revision,detail)
    VALUES(?,?,'token-issued',?,NULL,NULL,NULL,?)`)
    .bind(c.now, actor.email, minted.id, JSON.stringify({ ...details, authority: { type: 'person', name: actor.name, via: 'session' } })),
  ], ' AND EXISTS(SELECT 1 FROM oa_credentials WHERE id=? AND operator_id=? AND operator_version=? AND revoked_at IS NULL AND expires_at>unixepoch()*1000)', [minted.id, actor.id, actor.version])
 } catch (error) {
  // Base has already minted it: a failed metadata/audit transaction must leave
  // no unreported credential capable of authenticating.
  await c.db.prepare('UPDATE oa_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(Date.now(), minted.id).run()
  throw error
 }
 return { ...details, token: minted.token }
}
