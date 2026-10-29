import type { Trust } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
export function doorTrust(env: Bindings): Trust | null {
 const issuer = env.RER_OWNER_CLAIM_ISSUER, installationId = env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys = env.RER_OWNER_CLAIM_PUBLIC_KEYS
 if (![issuer, installationId, publicKeys].some(Boolean)) return null
 if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete agent door trust configuration')
 return { issuer, installationId, appOrigin: env.AUTH_ORIGIN, publicKeys: JSON.parse(publicKeys) }
}
