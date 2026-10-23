import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, createHash, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inflateRawSync } from 'node:zlib'
import { SignedXml } from 'xml-crypto'
import { harness } from './harness.mjs'

const SAML = 'https://synthetic-easel-1.example.test/saml'
const OIDC = 'https://synthetic-easel-1.example.test/oidc'
const userEmail = 'synthetic-easel-2@example.test', oidcEmail = 'synthetic-easel-3@example.test'
const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
let material
function fakeIdentityProvider() {
 // Runtime-only signer: no private key or reusable certificate fixture is committed.
 material ??= (() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  const cert = execFileSync('openssl', ['req', '-new', '-x509', '-key', '/dev/stdin', '-subj', '/CN=synthetic-easel-1', '-days', '1', '-sha256'], { input: privateKey, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  return { privateKey, cert, jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-easel-1', use: 'sig', alg: 'RS256' } }
 })()
 const bearer = `${randomUUID()}${randomUUID()}`, clientSecret = `${randomUUID()}${randomUUID()}`, codes = new Map()
 let nextSaml = {}, nextOidc = {}
 const signedXml = (input, element) => {
  const signer = new SignedXml({ privateKey: material.privateKey, publicCert: material.cert, signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' })
  signer.addReference({ xpath: `/*[local-name()='${element}']`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'], digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' })
  signer.computeSignature(input, { location: { reference: `/*[local-name()='${element}']/*[local-name()='Issuer']`, action: 'after' } })
  return signer.getSignedXml()
 }
 const provider = async request => {
  const url = new URL(request.url)
  if (url.href === OIDC + '/.well-known/openid-configuration') return Response.json({ issuer: OIDC, authorization_endpoint: OIDC + '/authorize', token_endpoint: OIDC + '/token', jwks_uri: OIDC + '/jwks', response_types_supported: ['code'], grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'], authorization_response_iss_parameter_supported: true })
  if (url.href === OIDC + '/jwks') return Response.json({ keys: [material.jwk] })
  if (url.origin + url.pathname === OIDC + '/authorize') {
   assert.equal(url.searchParams.get('client_id'), 'synthetic-easel-1')
   assert.equal(url.searchParams.get('response_type'), 'code')
   assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
   const code = randomUUID(), callback = new URL(url.searchParams.get('redirect_uri'))
   codes.set(code, { nonce: url.searchParams.get('nonce'), challenge: url.searchParams.get('code_challenge'), callback: callback.href, claims: nextOidc }); nextOidc = {}
   callback.searchParams.set('code', code); callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('iss', OIDC)
   return new Response(null, { status: 303, headers: { location: callback.href } })
  }
  if (url.href === OIDC + '/token') {
   assert.equal(request.method, 'POST')
   assert.equal(request.headers.get('authorization'), `Basic ${Buffer.from(`synthetic-easel-1:${clientSecret}`).toString('base64')}`)
   const body = new URLSearchParams(await request.text()), code = codes.get(body.get('code')); codes.delete(body.get('code'))
   assert.ok(code, 'The fake exchanges a real one-time authorization code')
   assert.equal(body.get('redirect_uri'), code.callback)
   assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), code.challenge, 'The authorization code is bound to PKCE')
   const now = Math.floor(Date.now() / 1000)
   const payload = { iss: OIDC, aud: 'synthetic-easel-1', sub: 'synthetic-easel-3', iat: now, exp: now + 300, nonce: code.nonce, ...code.claims }
   const input = encode({ alg: 'RS256', kid: material.jwk.kid, typ: 'JWT' }) + '.' + encode(payload)
   return Response.json({ id_token: input + '.' + sign('RSA-SHA256', Buffer.from(input), material.privateKey).toString('base64url') })
  }
  if (url.origin + url.pathname === SAML + '/sso') {
   const requestXml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'), 'base64')).toString('utf8')
   const requestId = /\bID="([^"]+)"/.exec(requestXml)?.[1], recipient = /\bAssertionConsumerServiceURL="([^"]+)"/.exec(requestXml)?.[1]
   assert.ok(requestId && recipient, 'The fake receives an actual SAML AuthnRequest')
   assert.match(requestXml, /synthetic-easel-1:sp/)
   const option = nextSaml; nextSaml = {}
   const before = new Date(Date.now() - 60000).toISOString(), after = new Date(Date.now() + 180000).toISOString(), instant = new Date().toISOString()
   let assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${instant}"><saml:Issuer>${xml(option.issuer ?? SAML)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${xml(option.subject ?? 'synthetic-easel-2')}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${xml(requestId)}" Recipient="${xml(option.recipient ?? recipient)}" NotOnOrAfter="${option.expiry ?? after}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${option.expiry ?? after}"><saml:AudienceRestriction><saml:Audience>${xml(option.audience ?? 'synthetic-easel-1:sp')}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${instant}" SessionIndex="_${randomUUID()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`
   if (!option.unsigned) assertion = signedXml(assertion, 'Assertion')
   let response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${instant}" Destination="${xml(option.destination ?? recipient)}" InResponseTo="${xml(requestId)}"><saml:Issuer>${xml(SAML)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}</samlp:Response>`
   if (!option.unsigned) response = signedXml(response, 'Response')
   if (option.tamper) response = response.replaceAll('synthetic-easel-2', 'synthetic-easel-9')
   const encoded = Buffer.from(response).toString('base64')
   return new Response(`<form method="post" action="${xml(recipient)}"><input name="SAMLResponse" value="${encoded}"><input name="RelayState" value="${xml(url.searchParams.get('RelayState'))}"></form>`, { headers: { 'content-type': 'text/html' } })
  }
  throw new Error(`Unexpected fake IdP request: ${url.origin}${url.pathname}`)
 }
 return { provider, bearer, saml(option) { nextSaml = option }, oidc(claims) { nextOidc = claims }, bindings: {
  EASEL_SAML_CONFIG: JSON.stringify({ id: 'synthetic-easel-1', issuer: SAML, idpSsoUrl: SAML + '/sso', idpCert: material.cert, spEntityId: 'synthetic-easel-1:sp', subjectEmails: { 'synthetic-easel-2': userEmail } }),
  EASEL_OIDC_PROVIDERS: JSON.stringify([{ id: 'synthetic-easel-1', preset: 'okta', issuer: OIDC, clientId: 'synthetic-easel-1', tokenAuthMethod: 'client_secret_basic', clientSecret, subjectEmails: { 'synthetic-easel-3': oidcEmail } }]),
  OIDC_TRANSACTION_SECRET: `${randomUUID()}${randomUUID()}`, EASEL_SCIM_CONFIG: JSON.stringify({ ownerEmail: 'owner@example.test', role: 'contributor' }), EASEL_SCIM_TOKEN: bearer,
 } }
}
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
