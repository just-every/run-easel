// Generate the public planning guide from the live seed registry and its executable fixtures.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

export async function agentDocumentation() {
 const bundle = await build({ stdin: { contents: "export { catalogue, agentLimits, agentErrors, specialist } from './src/agent-door/catalogue.ts'; export { planningPrompts, planningInstructions } from './src/agent-door/prompts.ts'", resolveDir: process.cwd(), sourcefile: 'agent-docs-entry.ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', target: 'es2023' })
 const loaded = { exports: {} }
 new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports)
 const registry = loaded.exports
 const surface = JSON.parse(await readFile('agent-surface.json', 'utf8'))
 const tools = [...registry.catalogue].sort((a, b) => a.name.localeCompare(b.name))
 assert.deepEqual(tools.map(tool => tool.name), surface.tools.map(tool => tool.name).sort(), 'Agent surface must match the live action registry')
 assert.equal(registry.specialist, surface.specialist)
 assert.ok(surface.capabilities.includes('prompts'), 'The surface must declare the registered prompts')
 const prose = text => text.replace(/(?<=\w)\/(?=\w)/g, ' or ')
 const proof = (tool, cls) => {
  const steps = surface.journey.filter(step => step.tool === tool.name && step.expect.some(item => item.class === cls))
  assert.ok(steps.length, `${tool.name} lacks a computed ${cls} class fixture`)
  return `\`${cls}\`: ${steps.map(step => `\`${step.id}\``).join(', ')} in \`./agent-surface.json\`; \`./src/modules/agent-door/conformance/journey.mjs\` — \`checkClasses\` checks the actual decision and facts in both policy phases.`
 }
 const lines = [
  `Easel’s **${registry.specialist}** specialist prepares alternatives and cited explanations with a named person’s current authority. It never makes the person’s financial decisions.`, '',
  '## Discover and prepare a job', '',
  'Discover the installation at `/.well-known/oauth-protected-resource/mcp`, then call `server / discover` through `POST /mcp`. `POST /api/easel/mcp` is the same door. Use the returned versions, method and name headers, schemas and private cache metadata. Tokens belong only in the Authorization header. Sign in through the installation’s own trusted authority; prompts do not grant access.', '',
  'The discovery instructions below come from the same registry as this page:', '', registry.planningInstructions(), '',
  'Call `prompts / list`, then `prompts / get` with a listed name. Optional string arguments describe the requested work; they are returned separately as untrusted planning inputs. Retrieving a prompt reads no planning records and changes no model state. All tool calls still pass current scope, native grants, policy, Pause and human approval checks.', '',
  ...registry.planningPrompts.flatMap(prompt => [
   `- **${prompt.title}** — \`${prompt.name}\`: ${prompt.description}`, '',
   ...prompt.messages({}).map(message => message.content.text), '',
  ]),
  '## Tools by job', '',
  'This is the complete registered planning catalogue under a complete company policy. An unanswered or unavailable policy can hide tools until a person completes setup. Scopes narrow current native authority; they never replace department, dimension or Pay detail grants.', '',
 ]
 for (const tool of tools) {
  const declared = surface.tools.find(item => item.name === tool.name)
  assert.deepEqual(declared.classes, tool.classes, `${tool.name} class declaration drift`)
  assert.equal(declared.scope, tool.scope, `${tool.name} scope declaration drift`)
  lines.push(`### ${tool.name}`, '', prose(tool.description), '',
   `- Scope: \`${tool.scope}\`. ${tool.readOnly ? 'Read only.' : 'Changes a planning draft or internal planning record; requires an idempotency key.'}`,
   `- Possible classes: ${tool.classes.map(cls => `\`${cls}\``).join(', ')}.`,
   `- Clauses: ${tool.clauses.map(id => `\`${id}\``).join(', ')}.`,
   ...tool.classes.map(cls => `- Computed class proof ${proof(tool, cls)}`), '')
 }
 lines.push('## Resources and events', '',
  surface.resources.length ? surface.resources.map(uri => `- \`${uri}\``).join('\n') : 'Resource template inventory: **none declared**. `resources / templates / list` returns an empty inventory. Resource reads are typed refusals; scenario content remains available through the classified read tools above.', '',
  'Event type inventory: **none declared**. Events and subscriptions remain undeclared and typed-refused. No event delivery, resource refresh or subscription qualification is claimed.', '',
  '## Capacity and policy limits', '',
  `The live door is configured for **${registry.agentLimits.requestsPerMinute.toLocaleString('en-US')} requests per minute per agent** and **${registry.agentLimits.maxBodyBytes.toLocaleString('en-US')} body bytes**. Capacity bounds rate and size, not daily business volume. A rate overrun returns 429 with Retry-After; an oversized request returns 413 without an effect.`, '',
  'Business decisions follow the company’s explicit policy. No provider-cost tool is registered and no provider spend enforcement is claimed. Mutations require `idempotency_key`; an optional `expected_revision` fences the current model revision. Inspect an uncertain outcome before any new key. Under modern MCP, an approval hold returns `input_required` and a local URL for the named signed-in person; a prompt or a confirmation argument cannot approve it.', '',
  '## Errors and recovery', '',
  'Transport errors use JSON-RPC error data. Tool refusals carry `isError` and a stable code in the error metadata. A foreign Origin returns 403. Unknown prompt names return JSON-RPC `-32602`; prompt arguments must be strings.', '',
  ...registry.agentErrors.map(([code, meaning]) => `- \`${code}\`: ${meaning}`), '',
  '## Verification and boundaries', '',
  '`SEED_VERIFY_SHARD=agent-door pnpm exec rer verify` runs the production build, native MCP and audit flows, the published hosted conformance journey, and this page’s browser journey. The class fixtures above run under all autonomous and held policies: standard review, with approval for sensitive payroll facts. The hosted journey checks actual schemas, classes, current authority, policy decisions, exact human approvals and idempotent replay.', '',
  '`./tests/mcp.test.mjs` — “API-003 a contributor uses MCP for filtered reads and proposals, never financial approvals” retrieves both prompts and follows the native planning lifecycle, checks documentation against discovery, and refuses human decision verbs. `./tests/agent-docs-browser.mjs` checks the built documentation against the live door at 1440 and captures it at 1440 and 390.', '',
  'This catalogue does not qualify the broader administrative registry, full resource catalogue, resource refresh, events, subscriptions or a stranger’s complete finance week. Connector accounts, enterprise identity, provider boundaries, device qualification and existing contract holds remain unchanged. Finance alone approves budgets, promotes proposals, closes months and publishes packs; people confirm explanations. No prompt changes those gates.', '',
 )
 return lines.join('\n')
}
export async function agentDocs(mode) {
 if (!['write', 'check'].includes(mode)) throw Error('Usage: node scripts/agent-docs.mjs write|check')
 const expected = await agentDocumentation()
 if (mode === 'write') await writeFile('docs/agents.md', expected)
 else assert.equal(await readFile('docs/agents.md', 'utf8'), expected, 'Stale agent guide; run node scripts/agent-docs.mjs write')
 console.log(`Agent registry documentation ${mode === 'write' ? 'generated' : 'checked'}`)
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await agentDocs(process.argv[2])
