import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, createHash, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inflateRawSync } from 'node:zlib'
import { SignedXml } from 'xml-crypto'
export const SAML = 'https://synthetic-easel-1.example.test/saml'
const OIDC = 'https://synthetic-easel-1.example.test/oidc'
export const userEmail = 'synthetic-easel-2@example.test', oidcEmail = 'synthetic-easel-3@example.test'
export const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
let material
export function fakeIdentityProvider() {
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
