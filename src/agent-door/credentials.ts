import type { Bindings } from '../auth.server'
import { actor } from '../easel/store'
import { access } from '../easel/access'
import { load } from '../easel/store'
import type { Actor } from '../easel/types'

export function scopesFor(a: Actor) { return ['events:read', 'planning:read', ...(!a.token || a.token.scope === 'write' ? ['planning:write'] : [])] }
export async function localCredential(request: Request, env: Bindings) {
 try {
  const a = await actor(request, env)
  if (!access((await load(env.DB)).state, a).role) return null
  return { sponsor: { id: a.id }, agent: { id: a.token ? `credential:${a.token.id}` : `session:${a.session}`, name: a.token?.label ?? 'MCP client', specialist: 'finance planner' },
   scopes: scopesFor(a), clientId: a.token ? `credential:${a.token.id}` : `session:${a.session}` }
 } catch { return null }
}
export async function credentialActor(db: D1Database, id: string, person: Actor): Promise<Actor | null> {
 const row = await db.prepare(`SELECT t.*,cr.operator_version FROM e_api_tokens t JOIN oa_credentials cr ON cr.id=t.id
  WHERE t.id=? AND cr.operator_id=? AND cr.operator_version=? AND cr.revoked_at IS NULL AND cr.expires_at>unixepoch()*1000`).bind(id, person.id, person.version).first<any>()
 return row ? { ...person, token: { id: row.id, label: row.label, kind: row.kind, scope: row.scope, role: row.issuing_role, departments: JSON.parse(row.departments), payDetail: row.pay_detail === 1,
  ...(row.grants ? { grants: JSON.parse(row.grants) } : {}), write: row.scope === 'write' } } : null
}
