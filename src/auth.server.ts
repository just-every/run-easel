import { enterpriseAuthConfig, enterpriseAuthHooks, samlConfig } from './easel/enterprise-identity/config'
import { enterpriseIdentityResponse } from './easel/enterprise-identity/index'
import { createOwnerClaimHandler } from './modules/owner-claim/index.mjs'
import { firstRunResponse } from './base/setup'
import { fontDocumentResponse } from './base/font-response'
import { createOperatorAuth, createAuthHandler, createSignInHandler, type AuthConfig } from './modules/operator-auth/index.mjs'
import { operatorMail } from './mail.server.mjs'
import branding from './branding.json'
import { revokeMobileSession } from './easel/mobile-push-devices'

// The edition's declared theme (public/rer-theme.css), as Base frames link it.
const theme = { href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor }

export interface Bindings {
 ASSETS?: Fetcher
 /** Managed ADP client certificate; raw private key never enters app records or archives. */
 HRIS_ADP_MTLS?: Fetcher
 /** Explicit public receiver hosts reviewed by the installation owner. */
 EASEL_WEBHOOK_HOSTS?: string
 GAUGE_ORIGIN?: string
 PANTRY_ORIGIN?: string
 PURSE_ORIGIN?: string
 COASTER_ORIGIN?: string
 /** Owner-entered incoming webhooks for planning reminders (deployment secrets). */
 SLACK_WEBHOOK_URL?: string
 TEAMS_WEBHOOK_URL?: string
 /** Enterprise identity is off unless explicitly configured by the installation owner. */
 EASEL_SAML_CONFIG?: string
 EASEL_OIDC_PROVIDERS?: string
 OIDC_TRANSACTION_SECRET?: string
 EASEL_SCIM_CONFIG?: string
 EASEL_SCIM_TOKEN?: string
 /** Provider signing keys are deployment secrets; the server mints short-lived assertions. */
 EASEL_APNS_PRIVATE_KEY?: string
 EASEL_APNS_TEAM_ID?: string
 EASEL_APNS_KEY_ID?: string
 EASEL_APNS_TOPIC?: string
 EASEL_APNS_SANDBOX?: string
 EASEL_FCM_SERVICE_ACCOUNT?: string
 DB: D1Database
 AUTH_ORIGIN: string
 AUTH_LOCAL?: string
 RER_DEV_ORIGIN?: string
 /** Local runtimes only: the checkout's key gate and dev identity switch. Deploy refuses both. */
 RER_DEV_KEY?: string
 RER_DEV_IDENTITY?: string
 RER_DEMO?: string
 RER_DEMO_EXPIRES?: string
 RER_OWNER_CLAIM_ISSUER?: string
 RER_OWNER_CLAIM_INSTALLATION_ID?: string
 RER_OWNER_CLAIM_PUBLIC_KEYS?: string
 RER_INSTALLATION_ID?: string
 RER_MANAGEMENT_ORIGIN?: string
 RER_DEPLOY_SOURCE?: string
 RER_DEPLOY_FINGERPRINT?: string
 RER_VERSION?: { id: string }
 OWNER_EMAIL: string
 SESSION_SECRET: string
 SETUP_TOKEN?: string
 MAIL_PROVIDER?: 'development' | 'resend' | 'sendgrid' | 'cloudflare'
 MAIL_FROM?: string
 MAIL_API_KEY?: string
 MAIL_ACCOUNT_ID?: string
}

export const runtimeBindings = (env: Bindings): Bindings => env.RER_DEV_ORIGIN && env.AUTH_LOCAL === 'true' ? { ...env, AUTH_ORIGIN: env.RER_DEV_ORIGIN } : env
export const authConfig = (env: Bindings): AuthConfig => ({ ...enterpriseAuthConfig(env), origin: env.AUTH_ORIGIN, local: env.AUTH_LOCAL === 'true', OWNER_EMAIL: env.OWNER_EMAIL, SESSION_SECRET: env.SESSION_SECRET, SETUP_TOKEN: env.SETUP_TOKEN, MAIL_FROM: env.MAIL_FROM, branding: { productName: branding.name, accentColor: branding.primaryColor, signInPath: '/signin', theme: theme.href } })
export function operatorAuth(env: Bindings) {
 return createOperatorAuth({ hooks: enterpriseAuthHooks(env), db: env.DB, config: authConfig(env), mailSender: operatorMail(env), clientIp: request => request.headers.get('CF-Connecting-IP') ?? '' })
}

export async function authResponse(request: Request, original: Bindings): Promise<Response | null> {
 const env = runtimeBindings(original), url = new URL(request.url)
 if (url.pathname.startsWith('/auth/saml/') || url.pathname === '/scim/v2' || url.pathname.startsWith('/scim/v2/')) {
  const enterprise = await enterpriseIdentityResponse(request, env, operatorAuth(env))
  if (enterprise) return fontDocumentResponse(enterprise)
 }
 if (url.pathname === '/auth/owner-claim' && env.RER_OWNER_CLAIM_PUBLIC_KEYS) {
  const response = await createOwnerClaimHandler({
   db: env.DB, authConfig: authConfig(env), appOrigin: env.AUTH_ORIGIN,
   issuer: env.RER_OWNER_CLAIM_ISSUER ?? '', installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID ?? '',
   expectedEmail: env.OWNER_EMAIL, publicKeys: JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS),
   clientIp: request => request.headers.get('CF-Connecting-IP') ?? '',
  })(request)
  if (response) return fontDocumentResponse(response)
 }
 // The shared server-rendered sign-in page: plain forms that work before any script.
 if (url.pathname === '/signin') {
  const page = await createSignInHandler(operatorAuth(env), {
   defaultReturnTo: '/setup',
   links: async () => { const saml = samlConfig(env), enabled = saml && await env.DB.prepare('SELECT idp_sign_in FROM oa_auth_settings WHERE singleton=1').first<{ idp_sign_in: number }>(); return saml && enabled?.idp_sign_in === 1 ? [{ href: `/auth/saml/${saml.id}/start`, label: 'Company SAML sign-in' }] : [] },
  })(request)
  if (page) return fontDocumentResponse(page)
 }
 if (url.pathname.startsWith('/auth/')) {
  // Planning membership, groups and Pay detail are granted by sign-in email, and
  // Base's own-email change does not prove the new mailbox. Easel composes the
  // handler without it, so the route answers like any path it does not own.
  const { changeEmail: _unprovenEmailChange, ...auth } = operatorAuth(env)
  return fontDocumentResponse(await createAuthHandler({ ...auth, signOut: async request => {
   if (await auth.getSession(request)) await revokeMobileSession(request, env)
   return auth.signOut(request)
  } })(request))
 }
 if (url.pathname === '/setup' || url.pathname === '/app' || url.pathname.startsWith('/app/')) {
  const setup = await firstRunResponse(request, env, operatorAuth(env), { theme })
  if (setup) return setup
 }
 return null
}
