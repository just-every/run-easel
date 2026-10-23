import { timingSafeEqual } from 'node:crypto'
import type { EnterpriseEnv, ScimConfig } from './config'
import { check, digest, json, jsonBody } from './http'
import { context, readFence, type Provisioning } from './repository'
import { createUser, person, updateUser, userResource, users, USER_SCHEMA } from './scim-users'
import { createGroup, group, groupResource, groups, updateGroup, GROUP_SCHEMA } from './scim-groups'
import type { Data } from '../types'

const listSchema = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
function integer(value: string | null, fallback: number, min: number, max: number) { if (value === null) return fallback; check(/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max, 'Invalid pagination'); return Number(value) }
const attribute = (name: string, type: string, required = false, multiValued = false, extra: Data = {}) => ({ name, type, multiValued, required, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none', ...extra })
const schemas = [
 { id: USER_SCHEMA, name: 'User', description: 'An ordinary Easel planning member', attributes: [attribute('userName', 'string', true, false, { uniqueness: 'server', mutability: 'immutable' }), attribute('displayName', 'string', true), attribute('name', 'complex', false, false, { subAttributes: [attribute('formatted', 'string')] }), attribute('active', 'boolean'), attribute('emails', 'complex', false, true, { subAttributes: [attribute('value', 'string'), attribute('primary', 'boolean'), attribute('type', 'string')] }), attribute('groups', 'complex', false, true, { mutability: 'readOnly', subAttributes: [attribute('value', 'string'), attribute('display', 'string'), attribute('$ref', 'reference', false, false, { referenceTypes: ['Group'] })] })] },
 { id: GROUP_SCHEMA, name: 'Group', description: 'Native grants with SCIM-managed membership', attributes: [attribute('displayName', 'string', true, false, { uniqueness: 'server' }), attribute('members', 'complex', false, true, { subAttributes: [attribute('value', 'string', true), attribute('display', 'string', false, false, { mutability: 'readOnly' }), attribute('$ref', 'reference', false, false, { referenceTypes: ['User'] })] })] },
].map(s => ({ ...s, schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'] }))
function list(url: URL, resources: Data[], kind: string) {
 const filter = url.searchParams.get('filter')
 if (filter) {
  const match = /^(id|externalId|userName|displayName)\s+eq\s+("(?:[^"\\]|\\.)*")$/i.exec(filter)
  check(match, 'Only id, externalId, userName and displayName equality filters are supported')
  const field = ({ id: 'id', externalid: 'externalId', username: 'userName', displayname: 'displayName' } as Record<string, string>)[match[1].toLowerCase()]
  check(kind === 'Users' || field !== 'userName', 'userName is not a Group attribute')
  const value = JSON.parse(match[2])
  resources = resources.filter(row => typeof row[field] === 'string' && (field === 'userName' || field === 'displayName' ? row[field].toLowerCase() === value.toLowerCase() : row[field] === value))
 }
 const start = integer(url.searchParams.get('startIndex'), 1, 1, Number.MAX_SAFE_INTEGER), count = integer(url.searchParams.get('count'), 100, 0, 100)
 const selected = resources.slice(start - 1, start - 1 + count)
 return { schemas: [listSchema], totalResults: resources.length, startIndex: start, itemsPerPage: selected.length, Resources: selected }
}
function response(resource: Data, status = 200) { return json(resource, status, { ...(resource.meta?.version ? { etag: resource.meta.version } : {}), ...(resource.meta?.location ? { location: resource.meta.location } : {}) }) }
async function authenticated(request: Request, env: EnterpriseEnv, config: ScimConfig) {
 const header = request.headers.get('authorization') ?? '', match = /^Bearer ([^\s]+)$/i.exec(header)
 check(match && match[1].length <= 1024, 'Invalid SCIM bearer', 401)
 const [actual, expected] = await Promise.all([digest(match[1]), digest(env.EASEL_SCIM_TOKEN!)])
 check(timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')), 'Invalid SCIM bearer', 401)
 const c = await context(env, config), bucket = await digest(`scim:${c.owner.id}:${Math.floor(Date.now() / 60000)}`)
 const limit = await env.DB.prepare('INSERT INTO oa_oidc_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, Date.now() + 120000).first<{ count: number }>()
 check(limit && limit.count <= 120, 'SCIM rate limit exceeded', 429)
 return c
}
async function read(c: Provisioning, value: Data) { await readFence(c); return response(value) }
export async function scimResponse(request: Request, env: EnterpriseEnv, config: ScimConfig): Promise<Response> {
 const c = await authenticated(request, env, config), url = new URL(request.url)
 check([...url.searchParams.keys()].every(k => ['filter', 'startIndex', 'count'].includes(k)), 'Unsupported query parameter')
 const parts = url.pathname.slice('/scim/v2'.length).split('/').filter(Boolean)
 check(parts.length <= 2, 'Resource not found', 404)
 if (request.method === 'GET' && parts[0] === 'ServiceProviderConfig' && !parts[1]) return read(c, {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'], patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 }, filter: { supported: true, maxResults: 100 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: true }, authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Dedicated installation provisioning bearer', description: 'A separate server-configured bearer bound to the active native owner', primary: true }],
 })
 if (request.method === 'GET' && parts[0] === 'ResourceTypes') {
  const resources = ['User', 'Group'].map(kind => ({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: kind, name: kind, endpoint: `/${kind}s`, schema: kind === 'User' ? USER_SCHEMA : GROUP_SCHEMA, schemaExtensions: [] }))
  const resource = resources.find(row => row.id === parts[1])
  check(!parts[1] || resource, 'Resource type not found', 404)
  return read(c, resource ?? list(url, resources, 'ResourceTypes'))
 }
 if (request.method === 'GET' && parts[0] === 'Schemas') {
  const resource = schemas.find(row => row.id === decodeURIComponent(parts[1] ?? ''))
  check(!parts[1] || resource, 'Schema not found', 404)
  return read(c, resource ?? list(url, schemas, 'Schemas'))
 }
 const [kind, id] = parts
 check(['Users', 'Groups'].includes(kind), 'Resource not found', 404)
 check(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method), 'Method not allowed', 405)
 if (request.method === 'GET') {
  if (kind === 'Users') return read(c, id ? userResource(c, await person(c, id)) : list(url, (await users(c)).filter(p => c.state.has(`member:${p.email}`)).map(p => userResource(c, p)), kind))
  return read(c, id ? await groupResource(c, await group(c, id)) : list(url, await Promise.all((await groups(c)).map(g => groupResource(c, g))), kind))
 }
 check(!url.search, 'Mutations do not accept query parameters')
 if (request.method === 'POST') {
  check(!id, 'Method not allowed', 405)
  const input = await jsonBody(request)
  return response(kind === 'Users' ? await createUser(c, input) : await createGroup(c, input), 201)
 }
 check(id, 'Choose a resource', 404)
 const input = request.method === 'DELETE' ? {} : await jsonBody(request)
 const value = kind === 'Users' ? await updateUser(c, request, await person(c, id), input, request.method === 'DELETE') : await updateGroup(c, request, await group(c, id), input, request.method === 'DELETE')
 return request.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } }) : response(value!)
}
