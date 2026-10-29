import { operatorAuthPeople, type PeopleAdapter, type Person } from '../modules/agent-door/index.ts'
import { authConfig, operatorAuth, type Bindings } from '../auth.server'
import { access } from '../easel/access'
import { load } from '../easel/store'
import type { Actor } from '../easel/types'

export async function nativeActor(db: D1Database, id: string): Promise<Actor | null> {
 const row = await db.prepare("SELECT id,email,display_name,version,role FROM oa_operators WHERE id=? AND status='active'").bind(id).first<any>()
 return row ? { id: row.id, email: row.email, name: row.display_name, version: row.version, baseRole: row.role, session: '' } : null
}

type MappedPerson = Person & { policyRole: 'owner' | 'editor' | null }
export function easelPeople(env: Bindings, paired: boolean): PeopleAdapter {
 const native = operatorAuthPeople({ db: env.DB, allowList: authConfig(env).allowList, session: request => operatorAuth(env).getSession(request) })
 const admitted = async (person: Person | null): Promise<MappedPerson | null> => {
  if (!person?.active) return null
  const a = await nativeActor(env.DB, person.id)
  if (!a || !access((await load(env.DB)).state, a).role) return null
  const member = paired ? await native.businessMember!(person) : null
  return { ...person, policyRole: paired ? member?.role ?? null : person.role === 'owner' ? 'owner' : person.role === 'admin' ? 'editor' : null }
 }
 return {
  person: async id => admitted(await native.person(id)),
  sponsor: async claims => admitted(await native.sponsor(claims)),
  session: async request => admitted(await native.session(request)),
  businessMember: native.businessMember,
  businessRole: person => (person as MappedPerson).policyRole,
 }
}
