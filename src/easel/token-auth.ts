// Base authenticates opaque credentials; Easel supplies integration scopes and
// an authority ceiling. Raw bearer values never enter the planning database.
import { operatorAuth, type Bindings } from '../auth.server'
import { requireThat, type Actor } from './types'

export async function tokenActor(request: Request, env: Bindings): Promise<Actor> {
 const credential = await operatorAuth(env).authenticateCredential(request)
 requireThat(credential, 'Invalid or expired API token', 401)
 const row = await env.DB.prepare(`SELECT t.*,o.email,o.display_name,o.role AS base_role,o.version FROM e_api_tokens t
  JOIN oa_credentials cr ON cr.id=t.id JOIN oa_operators o ON o.id=cr.operator_id WHERE t.id=? AND o.id=?`).bind(credential.id, credential.personId).first<any>()
 requireThat(row, 'Invalid API token', 401)
 return { id: credential.personId, email: row.email, name: row.display_name, session: '', version: credential.fence, baseRole: row.base_role,
  token: { id: row.id, label: row.label, kind: row.kind, scope: row.scope, role: row.issuing_role, departments: JSON.parse(row.departments), payDetail: row.pay_detail === 1, write: !['GET', 'HEAD'].includes(request.method) },
  ...(row.kind === 'service' ? { agent: { name: row.label, via: 'api-token' } } : {}),
 }
}

/** Rechecked in every save/read and in import journal transactions, so a
 * concurrent revocation or expired credential cannot finish a write. */
export function tokenAuthority(a: Actor, finance: boolean) {
 const token = a.token!
 return { sql: `EXISTS(SELECT 1 FROM e_api_tokens t JOIN oa_credentials cr ON cr.id=t.id JOIN oa_operators o ON o.id=cr.operator_id
  WHERE t.id=? AND o.id=? AND cr.operator_version=o.version AND o.version=? AND o.role=? AND o.status='active'
  AND cr.revoked_at IS NULL AND cr.expires_at>(julianday('now')-2440587.5)*86400000 AND t.scope=? AND t.issuing_role=?${token.write ? " AND t.scope='write'" : ''}${finance ? " AND o.role IN ('owner','admin')" : ''})`,
  params: [token.id, a.id, a.version, a.baseRole, token.scope, token.role],
 }
}

export async function tokenRate(db: D1Database, a: Actor) {
 const minute = Math.floor(Date.now() / 60000)
 const result = await db.prepare(`INSERT INTO e_api_limits(token_id,window,count) VALUES(?,?,1) ON CONFLICT(token_id) DO UPDATE SET
  window=excluded.window,count=CASE WHEN e_api_limits.window=excluded.window THEN e_api_limits.count+1 ELSE 1 END RETURNING count`).bind(a.token!.id, minute).first<{count:number}>()
 return { allowed: result!.count <= 120, retryAfter: 60 - Math.floor(Date.now() / 1000) % 60 }
}

export async function tokenUse(db: D1Database, a: Actor, request: Request, status: number) {
 const token = a.token!
 await db.prepare(`INSERT INTO e_activity(at,actor,action,record,detail) VALUES(?,?,'api-token-used',?,?)`).bind(new Date().toISOString(), a.email, token.id,
  JSON.stringify({ token: { id: token.id, label: token.label, kind: token.kind, scope: token.scope }, method: request.method, path: new URL(request.url).pathname, status,
   authority: { type: token.kind === 'service' ? 'agent' : 'person', name: token.label, via: 'api-token' } }),
 ).run()
}
