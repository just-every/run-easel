import { createOperatorAuth, type OperatorAuth } from '../../modules/operator-auth/index.mjs'
import { enterpriseAuthConfig, enterpriseAuthHooks, samlConfig, scimConfig, type EnterpriseEnv } from './config'
import { errorResponse, origin } from './http'
import { samlResponse } from './saml'
import { scimResponse } from './scim'
export { enterpriseAuthConfig, enterpriseAuthHooks } from './config'
export type { EnterpriseEnv } from './config'

/** Mount before Base's auth handler and the product API. No asserted-identity
 * endpoint exists: only the SAML verifier can invoke Base's admission seam. */
export async function enterpriseIdentityResponse(request: Request, env: EnterpriseEnv, auth?: OperatorAuth): Promise<Response | null> {
 const path = new URL(request.url).pathname, scim = path === '/scim/v2' || path.startsWith('/scim/v2/'), saml = path.startsWith('/auth/saml/')
 if (!scim && !saml) return null
 try {
  origin(request, env)
  if (scim) {
   const config = scimConfig(env)
   return config ? await scimResponse(request, env, config) : new Response(null, { status: 404 })
  }
  const config = samlConfig(env)
  if (!config || !['start', 'callback', 'metadata'].some(action => path === `/auth/saml/${config.id}/${action}`)) return new Response(null, { status: 404 })
  const composed = auth ?? createOperatorAuth({ db: env.DB, config: { origin: env.AUTH_ORIGIN, local: env.AUTH_LOCAL === 'true', OWNER_EMAIL: env.OWNER_EMAIL, SESSION_SECRET: env.SESSION_SECRET, ...enterpriseAuthConfig(env) }, hooks: enterpriseAuthHooks(env), clientIp: r => r.headers.get('cf-connecting-ip') ?? '' })
  return await samlResponse(request, env, config, composed)
 } catch (e) { return errorResponse(e, scim) }
}
