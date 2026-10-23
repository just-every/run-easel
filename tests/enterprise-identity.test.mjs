import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fakeIdentityProvider, userEmail, oidcEmail, patchSchema } from './enterprise-idp.mjs'
import { harness } from './harness.mjs'

function cookies(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => !value.endsWith('=')) }
const sessionCookie = response => cookies(response).find(value => value.startsWith('operator_session_local_'))
async function scim(h, idp, path, method = 'GET', body, extra = {}) {
 const response = await h.mf.dispatchFetch(h.origin + '/scim/v2/' + path, { method, headers: { authorization: `Bearer ${idp.bearer}`, 'content-type': 'application/scim+json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
 const raw = await response.text(); let value; try { value = JSON.parse(raw) } catch { value = raw }
 return { response, status: response.status, value }
}
async function samlStart(h) {
 const response = await h.mf.dispatchFetch(h.origin + '/auth/saml/synthetic-easel-1/start', { method: 'POST', headers: { host: new URL(h.origin).host, origin: h.origin, 'cf-connecting-ip': '192.0.2.1', 'content-type': 'application/x-www-form-urlencoded' }, body: 'returnTo=%2Fapp', redirect: 'manual' })
 assert.equal(response.status, 303, await response.clone().text())
 return response
}
async function samlCallback(h, idp, start, cookie = cookies(start).join('; ')) {
 const formResponse = await idp.provider(new Request(start.headers.get('location'))), form = await formResponse.text()
 const action = /action="([^"]+)"/.exec(form)[1], response = /name="SAMLResponse" value="([^"]+)"/.exec(form)[1], relay = /name="RelayState" value="([^"]+)"/.exec(form)[1]
 const body = new URLSearchParams({ SAMLResponse: response, RelayState: relay })
 const callback = () => h.mf.dispatchFetch(action, { method: 'POST', headers: { host: new URL(h.origin).host, 'content-type': 'application/x-www-form-urlencoded', cookie, origin: new URL(SAML).origin }, body: body.toString(), redirect: 'manual' })
 return { response: await callback(), replay: callback }
}
async function oidcSignIn(h, idp, claims = {}) {
 idp.oidc(claims)
 const start = await h.mf.dispatchFetch(h.origin + '/auth/oidc/synthetic-easel-1/start', { method: 'POST', headers: { host: new URL(h.origin).host, origin: h.origin, 'cf-connecting-ip': '192.0.2.1', 'content-type': 'application/json' }, body: JSON.stringify({ returnTo: '/app' }), redirect: 'manual' })
 assert.equal(start.status, 303, await start.clone().text())
 const authorized = await idp.provider(new Request(start.headers.get('location')))
 return h.mf.dispatchFetch(authorized.headers.get('location'), { headers: { host: new URL(h.origin).host, cookie: cookies(start).join('; ') }, redirect: 'manual' })
}

test('ACCESS-002 fake SAML and OIDC HTTP sign-ins, SCIM live group grants and immediate deprovision preserve submission attribution', async t => {
 const idp = fakeIdentityProvider(), h = await harness({ bindings: idp.bindings, outbound: idp.provider }); t.after(() => h.close())
 await h.command('workspace', { name: 'synthetic-easel-1', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'synthetic-easel-1' }), line = await h.command('line', { name: 'synthetic-easel-1', type: 'operating-expense' })
 await h.person(oidcEmail, 'contributor', [department.id], false)
 const ordinary = await scim(h, idp, 'Users', 'POST', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: userEmail, displayName: 'synthetic-easel-2', active: true, externalId: 'synthetic-easel-2' })
 assert.equal(ordinary.status, 201, JSON.stringify(ordinary.value)); assert.equal(ordinary.value.active, true)
 const user = ordinary.value
 const filtered = await scim(h, idp, 'Users?filter=' + encodeURIComponent(`userName eq "${userEmail}"`))
 assert.equal(filtered.status, 200); assert.equal(filtered.value.totalResults, 1); assert.equal(filtered.value.Resources[0].id, user.id)
 assert.equal((await scim(h, idp, 'ServiceProviderConfig')).value.patch.supported, true)
 const duplicateOwner = await scim(h, idp, 'Users', 'POST', { userName: 'owner@example.test', displayName: 'synthetic-easel-9' })
 assert.equal(duplicateOwner.status, 409)
 const escalation = await scim(h, idp, `Users/${user.id}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'replace', path: 'roles', value: ['admin'] }] })
 assert.equal(escalation.status, 400)
 assert.equal((await h.send('/auth/settings/identity', { idpSignIn: true }, h.owner)).status, 200)
 const page = await h.mf.dispatchFetch(h.origin + '/auth/saml/synthetic-easel-1/start')
 assert.equal(page.status, 200); assert.match(await page.text(), /Continue with SAML/)
 const signedIn = await samlCallback(h, idp, await samlStart(h))
 assert.equal(signedIn.response.status, 303, await signedIn.response.clone().text())
 const samlCookie = sessionCookie(signedIn.response); assert.ok(samlCookie)
 const samlSession = await h.get('/auth/session', samlCookie)
 assert.equal(samlSession.operator.email, userEmail); assert.equal(samlSession.kind, 'oidc')
 assert.equal((await signedIn.replay()).status, 403, 'A signed response is consumed once')
 const oidc = await oidcSignIn(h, idp)
 assert.equal(oidc.status, 303, await oidc.clone().text())
 const oidcCookie = sessionCookie(oidc); assert.ok(oidcCookie)
 assert.equal((await h.get('/auth/session', oidcCookie)).operator.email, oidcEmail)
 const createdGroup = await scim(h, idp, 'Groups', 'POST', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'], displayName: 'synthetic-easel-4', externalId: 'synthetic-easel-4', members: [] })
 assert.equal(createdGroup.status, 201, JSON.stringify(createdGroup.value))
 const groupId = createdGroup.value.id
 const native = (await h.get('/api/easel/access-report')).groups.find(g => g.id === groupId)
 const { payDetail: _payDetail, ...ordinaryGroup } = native
 let grant = await h.command('group-save', { ...ordinaryGroup, departments: { read: [], edit: [department.id], owners: [department.id] } })
 const add = () => scim(h, idp, `Groups/${groupId}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'add', path: 'members', value: [{ value: user.id }] }] })
 assert.equal((await add()).status, 200)
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('request-submissions', { scenario: budget.id, departments: [department.id] })
 const expense = { scenario: budget.id, department: department.id, line: line.id, name: 'synthetic-easel-5', kind: 'recurring', start: '2026-01', amount: '100' }
 await h.command('expense', expense, samlCookie)
 const visible = await h.get(`/api/easel/scenario/${budget.id}`, samlCookie)
 assert.ok(visible.inputs.expense.some(r => r.name === expense.name))
 assert.equal((await h.get('/api/easel/access-report')).people.find(p => p.email === userEmail).payDetail, false)
 await h.stepUp(samlCookie)
 const issued = await h.send('/api/easel/tokens/issue', { label: 'synthetic-easel-6', kind: 'personal', scope: 'write' }, samlCookie)
 assert.equal(issued.status, 200)
 const removed = await scim(h, idp, `Groups/${groupId}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'remove', path: `members[value eq "${user.id}"]` }] })
 assert.equal(removed.status, 200, JSON.stringify(removed.value))
 assert.ok(!(await h.get(`/api/easel/scenario/${budget.id}`, samlCookie)).inputs.expense.some(r => r.name === expense.name))
 await h.command('expense', expense, samlCookie, 403)
 const oldToken = await h.mf.dispatchFetch(h.origin + '/api/easel/command/expense', { method: 'POST', headers: { authorization: `Bearer ${issued.value.token}`, 'content-type': 'application/json' }, body: JSON.stringify(expense) })
 assert.equal(oldToken.status, 403, 'Group removal also bounds a previously issued token')
 assert.equal((await add()).status, 200)
 await h.command('submit', { scenario: budget.id, department: department.id }, samlCookie)
 await h.command('comment', { scenario: budget.id, department: department.id, text: 'synthetic-easel-7' }, samlCookie)
 // SCIM cannot change membership in a compensation-enabled group, even though
 // the native owner deliberately granted that group Pay detail.
 grant = (await h.get('/api/easel/access-report')).groups.find(g => g.id === groupId)
 grant = await h.command('group-pay', { id: grant.id, revision: grant.revision, granted: true })
 assert.equal((await scim(h, idp, `Groups/${groupId}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'remove', path: 'members' }] })).status, 403)
 const deprovisioned = await scim(h, idp, `Users/${user.id}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'replace', path: 'active', value: false }] })
 assert.equal(deprovisioned.status, 200, JSON.stringify(deprovisioned.value)); assert.equal(deprovisioned.value.active, false)
 await h.get('/api/easel/state', samlCookie, 401)
 await h.get('/auth/session', samlCookie, 401)
 const revokedToken = await h.mf.dispatchFetch(h.origin + '/api/easel/state', { headers: { authorization: `Bearer ${issued.value.token}` } })
 assert.equal(revokedToken.status, 401)
 const retained = await h.get('/api/easel/state')
 assert.equal(retained.submissions.find(s => s.submittedBy === userEmail)?.status, 'submitted')
 assert.equal(retained.actorNames[userEmail], 'synthetic-easel-2')
 assert.equal((await scim(h, idp, `Users/${user.id}`, 'PATCH', { schemas: [patchSchema], Operations: [{ op: 'replace', path: 'active', value: true }] })).status, 403, 'SCIM cannot revive Pay detail by reactivating a person')
 const erased = await h.command('person-erase', { email: userEmail })
 assert.match(erased.pseudonym, /^Erased person /)
 assert.equal((await scim(h, idp, `Users/${user.id}`)).status, 404)
 const afterErasure = await h.get('/api/easel/state')
 assert.doesNotMatch(JSON.stringify(afterErasure), /synthetic-easel-2/)
 assert.match(JSON.stringify(afterErasure.submissions), /Erased person /)
})

test('Enterprise SAML refuses unverified, unassociated, expired and misdirected assertions; OIDC refuses invalid nonce and unknown subjects', async t => {
 const idp = fakeIdentityProvider(), h = await harness({ bindings: idp.bindings, outbound: idp.provider }); t.after(() => h.close())
 await h.command('workspace', { name: 'synthetic-easel-1', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'synthetic-easel-1' })
 await h.person(userEmail, 'contributor', [department.id], false)
 await h.person(oidcEmail, 'contributor', [department.id], false)
 const disabled = await h.mf.dispatchFetch(h.origin + '/auth/saml/synthetic-easel-1/start')
 assert.equal(disabled.status, 403)
 await h.send('/auth/settings/identity', { idpSignIn: true }, h.owner)
 for (const option of [{ unsigned: true }, { tamper: true }, { subject: 'synthetic-easel-9' }, { issuer: SAML + '/other' }, { audience: 'synthetic-easel-9' }, { recipient: 'https://synthetic-easel-9.example.test/callback' }, { destination: 'https://synthetic-easel-9.example.test/callback' }, { expiry: new Date(Date.now() - 120000).toISOString() }]) {
  idp.saml(option)
  const result = await samlCallback(h, idp, await samlStart(h))
  assert.equal(result.response.status, 403, `SAML refusal: ${JSON.stringify(option)} ${await result.response.text()}`)
  assert.equal(sessionCookie(result.response), undefined)
 }
 const start = await samlStart(h)
 const missingBrowser = await samlCallback(h, idp, start, '')
 assert.equal(missingBrowser.response.status, 403)
 const good = await samlCallback(h, idp, await samlStart(h))
 assert.equal(good.response.status, 303, await good.response.clone().text())
 const before = await h.db.prepare("SELECT count(*) AS n FROM oa_sessions WHERE kind='oidc' AND revoked_at IS NULL").first()
 const wrongNonce = await oidcSignIn(h, idp, { nonce: 'synthetic-easel-9' })
 assert.notEqual(wrongNonce.status, 303)
 const unknown = await oidcSignIn(h, idp, { sub: 'synthetic-easel-9', email: oidcEmail, email_verified: true })
 assert.notEqual(unknown.status, 303)
 const after = await h.db.prepare("SELECT count(*) AS n FROM oa_sessions WHERE kind='oidc' AND revoked_at IS NULL").first()
 assert.equal(after.n, before.n, 'Rejected IdP responses create no active native session')
 const noBearer = await h.mf.dispatchFetch(h.origin + '/scim/v2/Users', { headers: { cookie: h.owner } })
 assert.equal(noBearer.status, 401)
 const incorrectBearer = await scim(h, { bearer: 'synthetic-easel-9' }, 'Users')
 assert.equal(incorrectBearer.status, 401)
})
