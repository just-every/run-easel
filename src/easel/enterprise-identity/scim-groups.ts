import { all, find, put, remove, uid, type Data } from '../types'
import { check } from './http'
import { commit, matchVersion, nativeFence, redacted, resourceVersion, type Provisioning } from './repository'
import { externalId, person } from './scim-users'

export const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
export type ScimGroup = { group_id: string; external_id: string | null }
export async function groups(c: Provisioning): Promise<ScimGroup[]> {
 return (await c.env.DB.prepare('SELECT group_id,external_id FROM oa_enterprise_scim_groups WHERE owner_id=? ORDER BY group_id').bind(c.owner.id).all<ScimGroup>()).results.filter(g => find(c.state, 'access-group', g.group_id))
}
export async function group(c: Provisioning, id: string): Promise<ScimGroup> {
 const result = (await groups(c)).find(row => row.group_id === id)
 check(result, 'Group not found', 404); return result
}
export async function groupResource(c: Provisioning, row: ScimGroup) {
 const native = find(c.state, 'access-group', row.group_id)!
 const people = (await c.env.DB.prepare('SELECT id,email,display_name FROM oa_operators').all<{ id: string; email: string; display_name: string }>()).results
 return redacted(c, { schemas: [GROUP_SCHEMA], id: row.group_id, displayName: native.name, ...(row.external_id === null ? {} : { externalId: row.external_id }), members: people.filter(p => native.members.includes(p.email)).map(p => ({ value: p.id, display: p.display_name, $ref: `${c.env.AUTH_ORIGIN}/scim/v2/Users/${p.id}` })), meta: { resourceType: 'Group', location: `${c.env.AUTH_ORIGIN}/scim/v2/Groups/${row.group_id}`, version: resourceVersion(c.state.get(`access-group:${row.group_id}`)!) } })
}
function editable(native: Data) { check(!native.payDetail, 'SCIM cannot alter a Pay-enabled group; use the native owner session', 403) }
function name(input: unknown) { check(typeof input === 'string' && input.trim().length > 0 && input.length <= 120 && !/[\u0000-\u001f\u007f]/.test(input), 'Invalid displayName'); return input.trim() }
async function members(c: Provisioning, input: unknown) {
 check(Array.isArray(input) && input.length <= 1000, 'members must be a bounded list')
 const emails: string[] = []
 for (const member of input) {
  check(member && typeof member.value === 'string' && Object.keys(member).every(k => ['value', '$ref', 'display', 'type'].includes(k)), 'A member requires a User id')
  const native = await person(c, member.value), planning = find(c.state, 'member', native.email)
  check(native.role === 'member' && native.status === 'active' && planning?.active && ['viewer', 'contributor'].includes(planning.role), 'Choose an active ordinary SCIM member', 403)
  nativeFence(c, native); emails.push(native.email)
 }
 return [...new Set(emails)]
}
export async function createGroup(c: Provisioning, input: Data) {
 check(Object.keys(input).every(k => ['schemas', 'displayName', 'members', 'externalId'].includes(k)), 'Unsupported or protected Group attribute')
 check(input.schemas === undefined || input.schemas?.length === 1 && input.schemas[0] === GROUP_SCHEMA, 'Unsupported Group schema')
 const displayName = name(input.displayName), groupId = uid(), external = externalId(input), memberEmails = await members(c, input.members ?? [])
 check(redacted(c, displayName) === displayName, 'An erased identity cannot be reintroduced', 409)
 check(!all(c.state, 'access-group').some(g => g.name.toLowerCase() === displayName.toLowerCase()), 'A group with that name exists', 409)
 put(c.state, 'access-group', groupId, { name: displayName, members: memberEmails, departments: { read: [], edit: [], owners: [] }, dimensions: {}, capabilities: [], payDetail: false, revision: 1, updatedBy: c.owner.email, updatedAt: new Date().toISOString() })
 c.extra.push(c.env.DB.prepare('INSERT INTO oa_enterprise_scim_groups(group_id,owner_id,external_id) VALUES(?,?,?)').bind(groupId, c.owner.id, external))
 await commit(c, 'scim-group-created', groupId)
 return groupResource(c, { group_id: groupId, external_id: external })
}
export async function updateGroup(c: Provisioning, request: Request, row: ScimGroup, body: Data, deleting = false) {
 const prior = find(c.state, 'access-group', row.group_id)!
 editable(prior)
 matchVersion(request, (await groupResource(c, row)).meta.version)
 if (deleting) {
  remove(c.state, 'access-group', row.group_id)
  // Identical to native group deletion: no dangling scenario share can revive.
  for (const scenario of all(c.state, 'scenario').filter(s => s.sandbox?.groupGrants?.[row.group_id])) {
   const groupGrants = { ...scenario.sandbox.groupGrants }; delete groupGrants[row.group_id]
   put(c.state, 'scenario', scenario.id, { ...scenario, revision: scenario.revision + 1, sandbox: { ...scenario.sandbox, groupGrants } })
  }
  c.extra.push(c.env.DB.prepare('DELETE FROM oa_enterprise_scim_groups WHERE group_id=?').bind(row.group_id))
  await commit(c, 'scim-group-deleted', row.group_id); return null
 }
 let displayName = prior.name as string, memberEmails = [...prior.members] as string[]
 const apply = async (op: string, path: string, value: any) => {
  if (path.toLowerCase() === 'displayname') { check(op !== 'remove', 'displayName is required'); displayName = name(value); return }
  const filtered = /^members\[value\s+eq\s+"([^"\\]+)"\]$/i.exec(path)
  if (filtered) {
   check(op === 'remove', 'A member filter is only supported for remove')
   const native = await person(c, filtered[1]); nativeFence(c, native)
   memberEmails = memberEmails.filter(email => email !== native.email); return
  }
  check(path.toLowerCase() === 'members', 'Unsupported or protected Group PATCH path')
  if (op === 'remove') {
   if (value === undefined) { memberEmails = []; return }
   check(Array.isArray(value), 'members must be a list')
   const removed: string[] = []
   for (const item of value) { check(typeof item?.value === 'string', 'A member requires a User id'); const p = await person(c, item.value); nativeFence(c, p); removed.push(p.email) }
   memberEmails = memberEmails.filter(email => !removed.includes(email)); return
  }
  const added = await members(c, value)
  memberEmails = op === 'replace' ? added : [...new Set([...memberEmails, ...added])]
 }
 if (request.method === 'PATCH') {
  check(body.schemas?.length === 1 && body.schemas[0] === 'urn:ietf:params:scim:api:messages:2.0:PatchOp' && Array.isArray(body.Operations) && body.Operations.length > 0 && body.Operations.length <= 100, 'Invalid PATCH operations')
  for (const operation of body.Operations) {
   check(typeof operation.op === 'string' && ['add', 'remove', 'replace'].includes(operation.op.toLowerCase()), 'Unsupported Group PATCH operation')
   const op = operation.op.toLowerCase()
   if (operation.path === undefined) {
    check(operation.value && typeof operation.value === 'object' && !Array.isArray(operation.value), 'PATCH value must be an object')
    for (const [path, value] of Object.entries(operation.value)) await apply(op, path, value)
   } else { check(typeof operation.path === 'string', 'Invalid PATCH path'); await apply(op, operation.path, operation.value) }
  }
 } else {
  check(Object.keys(body).every(k => ['schemas', 'id', 'meta', 'displayName', 'members', 'externalId'].includes(k)), 'Unsupported or protected Group attribute')
  check(body.schemas === undefined || body.schemas?.length === 1 && body.schemas[0] === GROUP_SCHEMA, 'Unsupported Group schema')
  check(body.id === undefined || body.id === row.group_id, 'id is read-only')
  check(body.externalId === undefined || body.externalId === row.external_id, 'externalId is immutable', 409)
  displayName = name(body.displayName); memberEmails = await members(c, body.members ?? [])
 }
 check(redacted(c, displayName) === displayName, 'An erased identity cannot be reintroduced', 409)
 check(!all(c.state, 'access-group').some(g => g.id !== row.group_id && g.name.toLowerCase() === displayName.toLowerCase()), 'A group with that name exists', 409)
 put(c.state, 'access-group', row.group_id, { ...prior, name: displayName, members: memberEmails, revision: prior.revision + 1, updatedBy: c.owner.email, updatedAt: new Date().toISOString() })
 await commit(c, 'scim-group-updated', row.group_id)
 return groupResource(c, row)
}
