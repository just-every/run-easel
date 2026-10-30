import { createAgentDoor } from '../modules/agent-door/index.ts'
import { createBusinessSettings } from '../modules/business-settings/index.ts'
import { runtimeBindings, operatorAuth, type Bindings } from '../auth.server'
import { doorTrust } from './trust.ts'
import { easelPeople } from './people.ts'
import { nativeContext } from './native.ts'
import { scopesFor } from './credentials.ts'
import { localCredential } from './credentials.ts'
import { planningTools } from './tools.ts'
import { planningResources } from './resources.ts'
import { notTools } from './catalogue.ts'
export async function agentResponse(request: Request, original: Bindings) {
 const path = new URL(request.url).pathname
 const businessPath = ['/api/rer/business-settings', '/rer-business-logo', '/rer-business.css'].includes(path)
 if (!businessPath && !['/mcp', '/api/easel/mcp', '/api/rer/agent-policy', '/agents', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path) && !path.startsWith('/agents/')) return null
 const env = runtimeBindings(original), trust = doorTrust(env)
 if (businessPath) return createBusinessSettings({ db: env.DB, trust: env.RER_BUSINESS_TRUST, business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'admin', member: 'member' } } }, team: operatorAuth(env).businessTeam }).handle(request)
 return createAgentDoor({ seed: 'easel', name: 'Easel', specialist: 'finance planner', db: env.DB, origin: env.AUTH_ORIGIN, trust,
  capabilities: ['tools', 'policy', 'pause', 'audit', 'idempotency', 'resources'],
  people: easelPeople(env, !!trust), tools: planningTools(), resources: planningResources(), notTools, paths: ['/api/easel/mcp'],
  currentScopes: async principal => { try { return scopesFor((await nativeContext({ ...principal, db: env.DB })).x.actor) } catch { return [] } },
  localCredentials: request => localCredential(request, env),

 }).handle(request)
}
