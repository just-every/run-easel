import { normalizeEmail } from '../../modules/operator-auth/index.mjs'
import { all, find, key, put, uid, type Data } from '../types'
import { check } from './http'
import { commit, matchVersion, nativeFence, redacted, resourceVersion, type NativePerson, type Provisioning } from './repository'

export const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
export type ScimPerson = NativePerson & { external_id: string | null }
const text = (value: unknown, label: string, max = 200) => { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value), `Invalid ${label}`); return value.trim() }
export function externalId(input: Data): string | null { return input.externalId === undefined ? null : text(input.externalId, 'externalId', 255) }
export async function users(c: Provisioning): Promise<ScimPerson[]> {
 return (await c.env.DB.prepare('SELECT o.*,m.external_id FROM oa_enterprise_scim_users m JOIN oa_operators o ON o.id=m.operator_id WHERE m.owner_id=? ORDER BY o.id').bind(c.owner.id).all<ScimPerson>()).results
}
export async function person(c: Provisioning, id: string): Promise<ScimPerson> {
 const row = (await users(c)).find(row => row.id === id)
 check(row && c.state.has(key('member', row.email)), 'User not found', 404)
 return row
}
export function userResource(c: Provisioning, row: ScimPerson) {
 const member = c.state.get(key('member', row.email))!
 const groups = all(c.state, 'access-group').filter(g => g.members.includes(row.email)).map(g => ({ value: g.id, display: g.name, $ref: `${c.env.AUTH_ORIGIN}/scim/v2/Groups/${g.id}` }))
 return redacted(c, { schemas: [USER_SCHEMA], id: row.id, ...(row.external_id === null ? {} : { externalId: row.external_id }), userName: row.email, displayName: row.display_name, name: { formatted: row.display_name }, emails: [{ value: row.email, primary: true }], active: row.status === 'active' && member.value.active === true, groups,
  meta: { resourceType: 'User', location: `${c.env.AUTH_ORIGIN}/scim/v2/Users/${row.id}`, version: resourceVersion(member, row.version) } })
}
function editable(c: Provisioning, row: ScimPerson) {
 const member = find(c.state, 'member', row.email)
 check(row.role === 'member' && member && ['viewer', 'contributor'].includes(member.role), 'SCIM cannot change an owner, admin or protected planning role', 403)
 nativeFence(c, row)
 return member
}
function userInput(input: Data, current?: ScimPerson) {
 check(Object.keys(input).every(k => ['schemas', 'id', 'meta', 'userName', 'displayName', 'name', 'emails', 'active', 'externalId'].includes(k)), 'Unsupported or protected User attribute')
 check(input.schemas === undefined || Array.isArray(input.schemas) && input.schemas.length === 1 && input.schemas[0] === USER_SCHEMA, 'Unsupported User schema')
 const email = input.userName === undefined && current ? current.email : normalizeEmail(input.userName)
 if (current) check(email === current.email, 'SCIM userName is immutable', 409)
 check(input.active === undefined || typeof input.active === 'boolean', 'active must be a boolean')
 if (input.name !== undefined) check(input.name && typeof input.name === 'object' && Object.keys(input.name).every(k => k === 'formatted'), 'Only name.formatted is supported')
 const name = input.displayName ?? input.name?.formatted ?? current?.display_name
 if (input.displayName !== undefined && input.name?.formatted !== undefined) check(input.displayName === input.name.formatted, 'displayName and name.formatted must agree')
 if (input.emails !== undefined) check(Array.isArray(input.emails) && input.emails.length === 1 && input.emails[0].value?.toLowerCase() === email && (input.emails[0].primary === undefined || input.emails[0].primary === true) && Object.keys(input.emails[0]).every(k => ['value', 'primary', 'type'].includes(k)), 'The one primary email must equal userName')
 check(!input.id || input.id === current?.id, 'id is read-only')
 return { email, name: text(name, 'displayName', 120), active: input.active ?? (current ? current.status === 'active' : true) }
}
export async function createUser(c: Provisioning, input: Data) {
 const value = userInput(input), id = uid(), external = externalId(input)
 check(redacted(c, value.email) === value.email && redacted(c, value.name) === value.name, 'An erased identity cannot be provisioned', 409)
 check(!find(c.state, 'member', value.email), 'An existing planning membership is protected', 409)
 check(!await c.env.DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(value.email).first(), 'An existing native account is protected', 409)
 c.guards.push({ sql: 'NOT EXISTS(SELECT 1 FROM oa_operators WHERE email=?)', args: [value.email] })
 put(c.state, 'member', value.email, { email: value.email, name: value.name, role: c.config.role, departments: [], groupOnly: true, active: value.active })
 c.extra.push(c.env.DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,'member',?,1,?)").bind(id, value.email, value.name, value.active ? 'active' : 'inactive', Date.now()))
 c.extra.push(c.env.DB.prepare('INSERT INTO oa_enterprise_scim_users(operator_id,owner_id,external_id) VALUES(?,?,?)').bind(id, c.owner.id, external))
 await commit(c, 'scim-user-created', id)
 return userResource(c, { id, email: value.email, display_name: value.name, role: 'member', status: value.active ? 'active' : 'inactive', version: 1, created_at: Date.now(), external_id: external })
}
function patchedUser(input: Data, row: ScimPerson): Data {
 check(input.schemas?.length === 1 && input.schemas[0] === 'urn:ietf:params:scim:api:messages:2.0:PatchOp' && Array.isArray(input.Operations) && input.Operations.length > 0 && input.Operations.length <= 100, 'Invalid PATCH operations')
 const result: Data = {}
 for (const operation of input.Operations) {
  check(typeof operation.op === 'string' && ['add', 'replace'].includes(operation.op.toLowerCase()), 'Unsupported User PATCH operation')
  if (operation.path === undefined) {
   check(operation.value && typeof operation.value === 'object' && !Array.isArray(operation.value), 'PATCH value must be an object')
   for (const [key, value] of Object.entries(operation.value)) {
    check(['active', 'displayName', 'name', 'userName', 'emails', 'externalId'].includes(key), 'Unsupported or protected User PATCH attribute')
    result[key] = value
   }
  } else {
   check(typeof operation.path === 'string', 'Invalid PATCH path')
   const path = operation.path.toLowerCase()
   if (path === 'name.formatted') result.name = { formatted: operation.value }
   else {
    const key = ({ active: 'active', displayname: 'displayName', username: 'userName', emails: 'emails', externalid: 'externalId', name: 'name' } as Record<string, string>)[path]
    check(key, 'Unsupported or protected User PATCH path'); result[key] = operation.value
   }
  }
 }
 return result
}
export async function updateUser(c: Provisioning, request: Request, row: ScimPerson, body: Data, remove = false) {
 const member = editable(c, row), current = userResource(c, row)
 matchVersion(request, current.meta.version)
 const input = remove ? { active: false } : request.method === 'PATCH' ? patchedUser(body, row) : body
 if (input.externalId !== undefined) check(input.externalId === row.external_id, 'externalId is immutable', 409)
 const value = userInput(input, row)
 check(redacted(c, value.name) === value.name, 'An erased identity cannot be reintroduced', 409)
 if (value.active && row.status !== 'active') {
  check(!find(c.state, 'pay-grant', row.email)?.granted && !all(c.state, 'access-group').some(g => g.payDetail && g.members.includes(row.email)), 'Only the native owner can reactivate a person with Pay detail', 403)
 }
 put(c.state, 'member', row.email, { ...member, name: value.name, active: value.active })
 c.extra.push(c.env.DB.prepare('UPDATE oa_operators SET display_name=?,status=? WHERE id=?').bind(value.name, value.active ? 'active' : 'inactive', row.id))
 if (!value.active) {
  const now = Date.now()
  for (const table of ['oa_sessions', 'oa_tokens', 'oa_credentials']) c.extra.push(c.env.DB.prepare(`UPDATE ${table} SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?`).bind(now, row.id))
  c.extra.push(c.env.DB.prepare('DELETE FROM oa_external_identities WHERE operator_id=?').bind(row.id))
 }
 if (remove) c.extra.push(c.env.DB.prepare('DELETE FROM oa_enterprise_scim_users WHERE operator_id=?').bind(row.id))
 await commit(c, value.active ? 'scim-user-updated' : 'scim-user-deprovisioned', row.id)
 return userResource(c, { ...row, display_name: value.name, status: value.active ? 'active' : 'inactive', version: row.version + (row.status !== (value.active ? 'active' : 'inactive') ? 1 : 0) })
}
