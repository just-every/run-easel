import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness } from './harness.mjs'

test('API-001 scoped personal and service credentials expire, revoke, retain issuer permissions and fence writes', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const engineering = await h.command('department', { name: 'Engineering' })
 const line = await h.command('line', { name: 'Salary', type: 'operating-expense', payroll: true })
 const planner = await h.person('planner@example.test', 'contributor', [sales.id])
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('position', { scenario: budget.id, department: engineering.id, line: line.id, title: 'Engineer', holder: 'Private employee', annualSalary: '120000', start: '2026-01' })
 const issue = (data, cookie = h.owner, status = 200) => h.send('/api/easel/tokens/issue', data, cookie).then(r => { assert.equal(r.status, status); return r.value })
 const scoped = { label: 'Reporting integration', kind: 'personal', scope: 'read', expiresInSeconds: 86400 }
 await issue(scoped, h.owner, 403)
 await h.stepUp(h.owner)
 const readOnly = await issue(scoped)
 const request = async (token, path, body, cookie) => {
  const response = await h.mf.dispatchFetch(h.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, headers: response.headers, body: await response.json() }
 }
 assert.equal((await request(readOnly.token, `/api/easel/scenario/${budget.id}`)).status, 200)
 const before = (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision
 assert.equal((await request(readOnly.token, '/api/easel/command/comment', { scenario: budget.id, department: sales.id, text: 'Forbidden' })).status, 403)
 assert.equal((await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision, before)
 const listed = await h.get('/api/easel/tokens')
 assert.ok(listed.some(r => r.id === readOnly.id && r.scope === 'read'))
 assert.ok(listed.every(r => !('token' in r) && !('token_hash' in r)))
 assert.equal((await request(readOnly.token, '/api/easel/tokens')).status, 403)
 assert.equal((await h.send('/api/easel/tokens/revoke', { id: readOnly.id }, planner)).status, 404)
 assert.equal((await h.send('/api/easel/tokens/revoke', { id: readOnly.id }, h.owner)).status, 200)
 assert.equal((await request(readOnly.token, `/api/easel/scenario/${budget.id}`)).status, 401)
 assert.equal((await request('invalid', '/api/easel/state', undefined, h.owner)).status, 401)

 await h.stepUp(planner)
 const service = await issue({ ...scoped, kind: 'service', scope: 'write', label: 'Sales planning agent' }, planner)
 const filtered = await request(service.token, `/api/easel/scenario/${budget.id}`)
 assert.equal(filtered.status, 200)
 assert.ok(!JSON.stringify(filtered.body).includes('Private employee'))
 assert.equal((await request(service.token, '/api/easel/command/comment', { scenario: budget.id, department: engineering.id, text: 'Outside grant' })).status, 403)
 assert.equal((await request(service.token, '/api/easel/command/comment', { scenario: budget.id, department: sales.id, text: 'Prepared the sales review.' })).status, 200)
 assert.equal((await request(service.token, '/api/easel/command/member', { email: 'other@example.test', name: 'Other', role: 'finance' })).status, 403)
 const audit = await h.get('/api/easel/activity')
 assert.ok(audit.some(r => r.action === 'api-token-used' && r.record === service.id && r.detail.status === 200))
 assert.ok(audit.some(r => r.action === 'comment' && r.actor === 'planner@example.test' && r.detail.authority.type === 'agent' && r.detail.authority.name === 'Sales planning agent'))
 assert.ok(!JSON.stringify(audit).includes(service.token))
 await h.command('member', { email: 'planner@example.test', name: 'Planner', role: 'viewer', departments: [] })
 assert.equal((await request(service.token, '/api/easel/command/comment', { scenario: budget.id, department: sales.id, text: 'No longer granted' })).status, 403)
 // A token issued before a department expansion never acquires the new scope.
 await h.command('member', { email: 'planner@example.test', name: 'Planner', role: 'contributor', departments: [sales.id, engineering.id] })
 assert.equal((await request(service.token, '/api/easel/command/comment', { scenario: budget.id, department: engineering.id, text: 'New department' })).status, 403)
 const shortLived = await issue({ ...scoped, label: 'Short lived', expiresInSeconds: 1 })
 await new Promise(r => setTimeout(r, 1100))
 assert.equal((await request(shortLived.token, '/api/easel/state')).status, 401)

 const writer = await issue({ ...scoped, kind: 'service', scope: 'write', label: 'Finance automation' })
 const approved = await h.command('approve-budget', { scenario: budget.id, revision: before })
 const forecast = approved.forecast
 assert.equal((await request(writer.token, '/api/easel/command/forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 18 })).status, 200)
 assert.equal((await request(writer.token, '/api/easel/command/forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 24 })).status, 409)
 // The public portability service excludes all credential-bearing tables.
 const serviceExport = await createPortability({ db: h.db, policy: easelPolicy }), exportId = await serviceExport.exports.create()
 try {
  while ((await serviceExport.exports.advance(exportId, { maxParts: 16 })).phase === 'building') {}
  const records = (await new Response(await serviceExport.exports.download(exportId)).text()).trim().split('\n').map(JSON.parse)
  assert.ok(records[0].tables.every(r => !['e_api_tokens', 'e_api_limits', 'oa_credentials'].includes(r.name)))
  assert.ok(!JSON.stringify(records).includes(writer.token))
 } finally { await serviceExport.exports.abort(exportId) }
 const rateToken = await issue({ ...scoped, label: 'Rate limited reader' })
 let limited
 for (let i = 0; i < 300; i++) {
  const response = await request(rateToken.token, '/api/easel/state')
  if (response.status === 429) { limited = response; break }
  assert.equal(response.status, 200)
 }
 assert.ok(limited, 'Repeated API use reaches a bounded durable request limit')
 assert.ok(Number(limited.headers.get('retry-after')) > 0)
 assert.ok((await h.get('/api/easel/activity')).some(r => r.record === rateToken.id && r.detail.status === 429))
})
