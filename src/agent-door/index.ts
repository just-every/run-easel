import { createAgentDoor } from '../modules/agent-door/index.ts'
import { createBusinessSettings } from '../modules/business-settings/index.ts'
import { runtimeBindings, operatorAuth, type Bindings } from '../auth.server'
import { doorTrust } from './trust.ts'
import { easelPeople } from './people.ts'
import { nativeContext } from './native.ts'
import { scopesFor } from './credentials.ts'
import { localCredential } from './credentials.ts'
import { planningTools } from './tools.ts'
import { agentLimits, notTools, specialist } from './catalogue.ts'
import { planningInstructions, planningPrompts } from './prompts.ts'
import { planningResources } from './resources.ts'
import { erasureMaps } from '../easel/erasure'
import { transformErased } from '../easel/erasure-map.mjs'
export async function agentResponse(request: Request, original: Bindings) {
 const path = new URL(request.url).pathname
 const businessPath = ['/api/rer/business-settings', '/rer-business-logo', '/rer-business.css'].includes(path)
 if (!businessPath && !['/mcp', '/api/easel/mcp', '/api/rer/agent-policy', '/agents', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path) && !path.startsWith('/agents/')) return null
 const env = runtimeBindings(original), trust = doorTrust(env)
 if (businessPath) return createBusinessSettings({ db: env.DB, trust: env.RER_BUSINESS_TRUST, business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'admin', member: 'member' } } }, team: operatorAuth(env).businessTeam }).handle(request)
 const response = await createAgentDoor({ seed: 'easel', name: 'Easel', specialist, db: env.DB, origin: env.AUTH_ORIGIN, trust,
  capabilities: ['tools', 'policy', 'pause', 'audit', 'idempotency', 'prompts', 'resources'], prompts: planningPrompts, limits: agentLimits,
  people: easelPeople(env, !!trust), tools: planningTools(), resources: planningResources(), notTools, paths: ['/api/easel/mcp'],
  currentScopes: async principal => { try { return scopesFor((await nativeContext({ ...principal, db: env.DB })).x.actor) } catch { return [] } },
  localCredentials: request => localCredential(request, env),

 }).handle(request)
 // The shared door owns transport and admission. Only its public discovery
 // instructions gain the seed's registry-generated planning guide.
 if (response?.headers.get('content-type')?.includes('application/json') && ['/mcp', '/api/easel/mcp'].includes(path)) {
  const body = await response.clone().json() as { result?: { instructions?: string; structuredContent?: unknown; content?: Array<{ type?: string; text?: string; name?: string }> } }
  let result = body.result
  if (result && Object.hasOwn(result, 'structuredContent') && Array.isArray(result.content)) {
   // Retained planning outcomes follow today's native erasure map. Project
   // content fields without changing the shared door's protocol or class facts.
   const maps = await erasureMaps(env.DB)
   if (maps.length) result = { ...result, structuredContent: transformErased(result.structuredContent, maps), content: result.content.map(block =>
    typeof block.text === 'string' ? { ...block, text: transformErased(block.text, maps) } :
    block.type === 'resource_link' && typeof block.name === 'string' ? { ...block, name: transformErased(block.name, maps) } : block) }
  }
  if (typeof result?.instructions === 'string') result = { ...result, instructions: planningInstructions() }
  if (result !== body.result) return Response.json({ ...body, result }, { status: response.status, headers: response.headers })
 }
 return response
}
