import type { AuthConfig, AuthHooks, IdentityProviderConfig } from '../../modules/operator-auth/index.mjs'
import { AuthError, normalizeEmail } from '../../modules/operator-auth/index.mjs'

export interface EnterpriseEnv {
 DB: D1Database
 AUTH_ORIGIN: string
 AUTH_LOCAL?: string
 OWNER_EMAIL: string
 SESSION_SECRET: string
 EASEL_SAML_CONFIG?: string
 EASEL_OIDC_PROVIDERS?: string
 OIDC_TRANSACTION_SECRET?: string
 EASEL_SCIM_CONFIG?: string
 EASEL_SCIM_TOKEN?: string
}
export type SamlConfig = { id: string; issuer: string; idpSsoUrl: string; idpCert: string; spEntityId: string; subjectEmails: Record<string, string>; spPrivateKey?: string; spCert?: string }
// SAML EntityIDs may be URNs or Google's query-bearing issuer. Base's external
// admission seam accepts HTTPS issuer URLs, so use an injective internal
// namespace; protocol verification still compares the actual configured issuer.
export const samlAdmissionIssuer = (config: SamlConfig) => `https://saml.easel.invalid/identity/${encodeURIComponent(config.issuer)}`
export type ScimConfig = { ownerEmail: string; role: 'viewer' | 'contributor' }
export function configured(ok: unknown): asserts ok { if (!ok) throw new AuthError('enterprise_invalid_configuration', 503) }
function parse(raw: string): any { try { return JSON.parse(raw) } catch { throw new AuthError('enterprise_invalid_configuration', 503) } }
const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
function secureUrl(value: unknown, local = false, query = false) {
 configured(typeof value === 'string')
 let url: URL; try { url = new URL(value) } catch { throw new AuthError('enterprise_invalid_configuration', 503) }
 configured(url.href === value && !url.username && !url.password && !url.hash && (!url.search || query) && (url.protocol === 'https:' || local && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
 return value
}
function subjects(value: unknown): Record<string, string> {
 configured(object(value) && Object.keys(value as object).length > 0)
 return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([subject, email]) => {
  configured(subject.length > 0 && subject.length <= 255 && !/[\u0000-\u001f\u007f]/.test(subject))
  return [subject, normalizeEmail(email)]
 }))
}
export function samlConfig(env: EnterpriseEnv): SamlConfig | null {
 if (!env.EASEL_SAML_CONFIG) return null
 const v = parse(env.EASEL_SAML_CONFIG)
 configured(object(v) && /^[a-z][a-z0-9-]{0,31}$/.test(v.id) && typeof v.idpCert === 'string' && v.idpCert.includes('-----BEGIN CERTIFICATE-----'))
 configured(typeof v.issuer === 'string' && v.issuer.length > 0 && v.issuer.length <= 1024 && !/[\s<>\"\u0000-\u001f\u007f]/.test(v.issuer))
 try { new URL(v.issuer) } catch { configured(false) }
 secureUrl(v.idpSsoUrl, env.AUTH_LOCAL === 'true', true)
 configured(typeof v.spEntityId === 'string' && v.spEntityId.length > 0 && v.spEntityId.length <= 255 && !/[\s<>]/.test(v.spEntityId))
 configured(v.spPrivateKey === undefined || typeof v.spPrivateKey === 'string' && v.spPrivateKey.includes('PRIVATE KEY') && typeof v.spCert === 'string' && v.spCert.includes('CERTIFICATE'))
 return { id: v.id, issuer: v.issuer, idpSsoUrl: v.idpSsoUrl, idpCert: v.idpCert, spEntityId: v.spEntityId, subjectEmails: subjects(v.subjectEmails), ...(v.spPrivateKey ? { spPrivateKey: v.spPrivateKey, spCert: v.spCert } : {}) }
}
export function oidcProviders(env: EnterpriseEnv): IdentityProviderConfig[] {
 if (!env.EASEL_OIDC_PROVIDERS) return []
 const rows = parse(env.EASEL_OIDC_PROVIDERS)
 configured(Array.isArray(rows) && rows.length > 0 && rows.length <= 8)
 configured(typeof env.OIDC_TRANSACTION_SECRET === 'string' && env.OIDC_TRANSACTION_SECRET.length >= 32 && env.OIDC_TRANSACTION_SECRET !== env.SESSION_SECRET && env.OIDC_TRANSACTION_SECRET !== env.EASEL_SCIM_TOKEN)
 return rows.map(row => { configured(object(row) && ['auth', 'okta', 'microsoft', 'google'].includes(row.preset)); return { ...row, subjectEmails: subjects(row.subjectEmails) } })
}
export function scimConfig(env: EnterpriseEnv): ScimConfig | null {
 if (!env.EASEL_SCIM_CONFIG) return null
 const value = parse(env.EASEL_SCIM_CONFIG)
 configured(object(value) && ['viewer', 'contributor'].includes(value.role))
 const token = env.EASEL_SCIM_TOKEN
 configured(typeof token === 'string' && token.length >= 32 && token.length <= 1024 && token !== env.SESSION_SECRET && token !== env.OIDC_TRANSACTION_SECRET && !/[\s\u0000-\u001f\u007f]/.test(token))
 return { ownerEmail: normalizeEmail(value.ownerEmail), role: value.role }
}
/** Spread into the edition's existing Base auth configuration. No providers means off. */
export function enterpriseAuthConfig(env: EnterpriseEnv): Partial<AuthConfig> {
 const saml = samlConfig(env), providers = oidcProviders(env)
 configured(!saml || !providers.some(p => p.issuer === samlAdmissionIssuer(saml)))
 return { ...(saml ? { externalIssuers: [samlAdmissionIssuer(saml)] } : {}), ...(providers.length ? { providers, OIDC_TRANSACTION_SECRET: env.OIDC_TRANSACTION_SECRET } : {}) }
}
/** Base revokes a newly issued session if this completion hook refuses it. */
export function enterpriseAuthHooks(env: EnterpriseEnv): AuthHooks {
 const saml = samlConfig(env), providers = oidcProviders(env)
 return { async afterConfirm({ session, operator, method }) {
  if (method !== 'oidc' || !saml && providers.length === 0) return
  const row = await env.DB.prepare('SELECT s.issuer,s.subject,p.provider_id FROM oa_provider_sessions s LEFT JOIN oa_provider_session_pins p ON p.session_id=s.session_id WHERE s.session_id=?').bind(session.id).first<{ issuer: string; subject: string; provider_id: string | null }>()
  if (!row) throw new AuthError('enterprise_identity_not_associated', 403)
  const provider = providers.find(p => p.id === row.provider_id)
  // Unrelated Base dependency providers keep their own admission policy.
  if (row.issuer !== (saml ? samlAdmissionIssuer(saml) : undefined) && !provider) return
  const associations = row.issuer === (saml ? samlAdmissionIssuer(saml) : undefined) && saml ? saml.subjectEmails : provider?.subjectEmails
  if (!associations || !Object.hasOwn(associations, row.subject) || associations[row.subject] !== operator.email.toLowerCase()) throw new AuthError('enterprise_identity_not_associated', 403)
 } }
}
