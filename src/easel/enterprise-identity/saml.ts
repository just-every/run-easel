import { samlSignInPage } from './signin'
import { SAML, ValidateInResponseTo, type CacheProvider, type Profile } from '@node-saml/node-saml'
import { randomBytes } from 'node:crypto'
import { parseStringPromise, processors } from 'xml2js'
import type { OperatorAuth } from '../../modules/operator-auth/index.mjs'
import { safeReturnTo } from '../../modules/operator-auth/index.mjs'
import { samlAdmissionIssuer, type EnterpriseEnv, type SamlConfig } from './config'
import { bodyText, check, digest, origin } from './http'

const lifetime = 600000
const random = () => Buffer.from(randomBytes(32)).toString('base64url')
const callbackUrl = (env: EnterpriseEnv, config: SamlConfig) => `${env.AUTH_ORIGIN}/auth/saml/${config.id}/callback`
const cookieName = (env: EnterpriseEnv, relay: string) => `${env.AUTH_ORIGIN.startsWith('https:') ? '__Host-' : ''}easel_saml_${relay}`
function cookie(env: EnterpriseEnv, relay: string, token = '', age = 600) {
 return `${cookieName(env, relay)}=${token}; Path=/; HttpOnly; ${env.AUTH_ORIGIN.startsWith('https:') ? 'Secure; SameSite=None' : 'SameSite=Lax'}; Max-Age=${age}`
}
function browserBinding(request: Request, env: EnterpriseEnv, relay: string) {
 const cookies = request.headers.get('cookie') ?? ''
 check(cookies.length <= 16384, 'saml_invalid_correlation', 403)
 const matches = cookies.split(';').map(v => v.trim()).filter(v => v.startsWith(`${cookieName(env, relay)}=`))
 check(matches.length === 1, 'saml_invalid_correlation', 403)
 const value = matches[0].slice(matches[0].indexOf('=') + 1)
 check(/^[A-Za-z0-9_-]{43}$/.test(value), 'saml_invalid_correlation', 403)
 return value
}
function relyingParty(env: EnterpriseEnv, config: SamlConfig, cacheProvider: CacheProvider) {
 return new SAML({ issuer: config.spEntityId, audience: config.spEntityId, callbackUrl: callbackUrl(env, config), entryPoint: config.idpSsoUrl,
  idpIssuer: config.issuer, idpCert: config.idpCert, validateInResponseTo: ValidateInResponseTo.always,
  wantAuthnResponseSigned: true, wantAssertionsSigned: true, requestIdExpirationPeriodMs: lifetime,
  acceptedClockSkewMs: 30000, maxAssertionAgeMs: lifetime, cacheProvider, signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256',
  allowCreate: false, disableRequestedAuthnContext: true,
  ...(config.spPrivateKey ? { privateKey: config.spPrivateKey, publicCert: config.spCert } : {}),
 })
}
function noCache(): CacheProvider { return { async saveAsync() { return null }, async getAsync() { return null }, async removeAsync() { return null } } }
/** Only fields from the library's cryptographically verified assertion enter admission. */
function strongSignature(element: any) {
 const signature = element.Signature
 check(signature?.length === 1, 'saml_signature_required', 403)
 const info = signature[0].SignedInfo
 check(info?.length === 1 && info[0].SignatureMethod?.length === 1 && info[0].Reference?.length === 1, 'saml_invalid_signature', 403)
 check(['http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512'].includes(info[0].SignatureMethod[0].$?.Algorithm), 'saml_signature_algorithm_refused', 403)
 const digest = info[0].Reference[0].DigestMethod
 check(digest?.length === 1 && ['http://www.w3.org/2001/04/xmlenc#sha256', 'http://www.w3.org/2001/04/xmlenc#sha512'].includes(digest[0].$?.Algorithm), 'saml_digest_algorithm_refused', 403)
}
async function verifiedSubject(profile: Profile, config: SamlConfig, env: EnterpriseEnv, requestId: string) {
 // wantAuthnResponseSigned requires a valid signature over the full response.
 // Parse only after that verification, and still use its signed assertion as
 // the principal source. Node-SAML does not itself enforce Destination.
 const verifiedResponse = await parseStringPromise(profile.getSamlResponseXml!(), { explicitRoot: true, explicitArray: true, explicitCharkey: true, tagNameProcessors: [processors.stripPrefix] })
 const response = verifiedResponse.Response
 const responseIssued = Date.parse(response?.$?.IssueInstant)
 check(Number.isFinite(responseIssued) && responseIssued <= Date.now() + 30000 && Date.now() < responseIssued + lifetime, 'saml_expired_response', 403)
 check(response?.$?.Destination === callbackUrl(env, config) && response.$.InResponseTo === requestId && response.$.Version === '2.0', 'saml_invalid_destination', 403)
 check(response.Issuer?.length === 1 && response.Issuer[0]._ === config.issuer && response.Status?.length === 1 && response.Status[0].StatusCode?.length === 1 && response.Status[0].StatusCode[0].$?.Value === 'urn:oasis:names:tc:SAML:2.0:status:Success', 'saml_invalid_status', 403)
 strongSignature(response)
 const assertion = (profile.getAssertion?.() as any)?.Assertion
 check(assertion && assertion.$?.Version === '2.0' && typeof assertion.$.ID === 'string', 'saml_invalid_assertion', 403)
 check(assertion.Issuer?.length === 1 && assertion.Issuer[0]._ === config.issuer && profile.issuer === config.issuer, 'saml_issuer_mismatch', 403)
 const issue = Date.parse(assertion.$.IssueInstant)
 check(Number.isFinite(issue) && issue <= Date.now() + 30000 && Date.now() < issue + lifetime, 'saml_expired_assertion', 403)
 const conditions = assertion.Conditions
 check(conditions?.length === 1 && Number.isFinite(Date.parse(conditions[0].$?.NotOnOrAfter)), 'saml_expiry_required', 403)
 const subject = assertion.Subject
 check(subject?.length === 1 && subject[0].NameID?.length === 1 && typeof subject[0].NameID[0]._ === 'string', 'saml_subject_required', 403)
 const name = subject[0].NameID[0]._ as string
 check(profile.nameID === name && name.length <= 255 && Object.hasOwn(config.subjectEmails, name), 'saml_subject_not_associated', 403)
 const confirmations = subject[0].SubjectConfirmation
 check(confirmations?.length === 1 && confirmations[0].$?.Method === 'urn:oasis:names:tc:SAML:2.0:cm:bearer', 'saml_invalid_confirmation', 403)
 const data = confirmations[0].SubjectConfirmationData
 check(data?.length === 1 && data[0].$?.Recipient === callbackUrl(env, config) && data[0].$.InResponseTo === requestId && Number.isFinite(Date.parse(data[0].$.NotOnOrAfter)), 'saml_invalid_recipient', 403)
 strongSignature(assertion)
 return name
}
async function identityEnabled(env: EnterpriseEnv) {
 check((await env.DB.prepare('SELECT idp_sign_in FROM oa_auth_settings WHERE singleton=1').first<{ idp_sign_in: number }>())?.idp_sign_in === 1, 'saml_sign_in_disabled', 403)
}
export async function samlResponse(request: Request, env: EnterpriseEnv, config: SamlConfig, auth: OperatorAuth): Promise<Response> {
 origin(request, env)
 const url = new URL(request.url), action = url.pathname.split('/').at(-1)
 check(!url.search, 'saml_invalid_route', 404)
 if (action === 'metadata') {
  check(request.method === 'GET', 'saml_method_not_allowed', 405)
  return new Response(relyingParty(env, config, noCache()).generateServiceProviderMetadata(null, config.spCert), { headers: { 'content-type': 'application/samlmetadata+xml', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
 }
 if (action === 'start' && request.method === 'GET') {
  await identityEnabled(env)
  return samlSignInPage(config.id)
 }
 check(request.method === 'POST', 'saml_method_not_allowed', 405)
 await identityEnabled(env)
 const configHash = await digest(JSON.stringify([env.AUTH_ORIGIN, config]))
 if (action === 'start') {
  check(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'saml_invalid_origin', 403)
  check(/^application\/(?:json|x-www-form-urlencoded)(?:;|$)/i.test(request.headers.get('content-type') ?? ''), 'saml_unsupported_media_type', 415)
  const ip = request.headers.get('cf-connecting-ip')
  check(ip && ip.length <= 256, 'saml_client_address_unavailable', 503)
  const bucket = await digest(`saml:${configHash}:${ip}:${Math.floor(Date.now() / 60000)}`)
  const count = await env.DB.prepare('INSERT INTO oa_oidc_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, Date.now() + 120000).first<{ count: number }>()
  check(count && count.count <= 20, 'saml_rate_limited', 429)
  const text = await bodyText(request, 4096)
  let input: any
  try { input = request.headers.get('content-type')!.includes('application/json') ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text)) } catch { check(false, 'saml_invalid_input') }
  const returnTo = safeReturnTo(input?.returnTo, '/app'), relay = random(), binding = random()
  let saved = false
  const cache: CacheProvider = {
   async saveAsync(key, value) {
    await env.DB.batch([
     env.DB.prepare('DELETE FROM oa_enterprise_saml_transactions WHERE expires_at<=?').bind(Date.now()),
     env.DB.prepare('INSERT INTO oa_enterprise_saml_transactions(relay_hash,binding_hash,config_hash,request_id,requested_at,return_to,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await digest(relay), await digest(binding), configHash, key, value, returnTo, Date.now() + lifetime),
    ])
    saved = true; return { value, createdAt: Date.now() }
   }, async getAsync() { return null }, async removeAsync() { return null },
  }
  const location = await relyingParty(env, config, cache).getAuthorizeUrlAsync(relay, undefined, {})
  check(saved, 'saml_correlation_unavailable', 503)
  return new Response(null, { status: 303, headers: { location, 'set-cookie': cookie(env, relay, binding), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
 }
 check(action === 'callback', 'saml_invalid_route', 404)
 check(/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') ?? ''), 'saml_unsupported_media_type', 415)
 const form = new URLSearchParams(await bodyText(request, 262144))
 check(form.getAll('RelayState').length === 1 && form.getAll('SAMLResponse').length === 1 && [...form.keys()].every(k => ['RelayState', 'SAMLResponse'].includes(k)), 'saml_invalid_response')
 const relay = form.get('RelayState')!, response = form.get('SAMLResponse')!
 check(/^[A-Za-z0-9_-]{43}$/.test(relay) && response.length > 0 && /^[A-Za-z0-9+/=\r\n]+$/.test(response), 'saml_invalid_response')
 const binding = browserBinding(request, env, relay)
 // Atomic take precedes protocol verification: a replay, including concurrent
 // copies, can never reach admission twice. A failed verification burns the try.
 const transaction = await env.DB.prepare('DELETE FROM oa_enterprise_saml_transactions WHERE relay_hash=? AND binding_hash=? AND config_hash=? AND expires_at>? RETURNING request_id,requested_at,return_to').bind(await digest(relay), await digest(binding), configHash, Date.now()).first<{ request_id: string; requested_at: string; return_to: string }>()
 check(transaction, 'saml_invalid_correlation', 403)
 const cache: CacheProvider = { async saveAsync() { return null }, async getAsync(key) { return key === transaction.request_id ? transaction.requested_at : null }, async removeAsync(key) { return key } }
 let profile: Profile | null
 try { ({ profile } = await relyingParty(env, config, cache).validatePostResponseAsync({ SAMLResponse: response })) } catch { check(false, 'saml_verification_failed', 403) }
 check(profile!, 'saml_assertion_required', 403)
 const subject = await verifiedSubject(profile!, config, env, transaction.request_id)
 check(env.AUTH_LOCAL === 'true' || !/\.(?:localhost|test|invalid)$/.test(config.subjectEmails[subject]), 'saml_reserved_email', 403)
 const existing = await env.DB.prepare("SELECT id FROM oa_operators WHERE email=? AND status='active'").bind(config.subjectEmails[subject]).first()
 check(existing, 'saml_existing_active_account_required', 403)
 const issuer = samlAdmissionIssuer(config)
 const admit = auth.createIdentityAdmission({ issuer, subjectEmails: config.subjectEmails })
 const session = await admit(request, { issuer, subject, provider: config.id }, { returnTo: transaction.return_to })
 const headers = new Headers({ location: session.returnTo, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
 headers.append('set-cookie', cookie(env, relay, '', 0)); headers.append('set-cookie', session.cookie)
 return new Response(null, { status: 303, headers })
}
