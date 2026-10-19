import { versionStructure } from './structure-versions'
// Stateless Streamable HTTP: JSON responses, native identity, and a closed
// tool list. No command supplied by a client is dispatched directly.
import type { Bindings } from '../auth.server'
import { access, requireMember } from './access'
import type { Context } from './context'
import { cycle } from './cycle'
import { INPUT_KINDS } from './model'
import { month } from './months'
import { plan } from './plan'
import { review, variance } from './review'
import { actor, load, readFence, save } from './store'
import { Fault, get, requireThat, type Data } from './types'
import { compareView, scenarioView, stateView } from './views'

const versions = ['2025-11-25', '2025-06-18', '2025-03-26']
const str = { type: 'string' }
const fields: Record<string, Data> = {
 milestones: { type: 'array', items: { type: 'object', properties: { name: str, month: str, amount: str }, required: ['name', 'month', 'amount'], additionalProperties: false } },
 draws: { type: 'object', additionalProperties: str }, repayments: { type: 'object', additionalProperties: str }, baseRates: { type: 'object', additionalProperties: str },
 covenants: { type: 'object', properties: { minimumCash: str, minimumLiquidity: str, maximumLeverage: str }, additionalProperties: false },
 history: { type: 'object', properties: { sourceLine: str, sourceDepartment: str, offset: { type: 'integer' }, window: { type: 'integer' }, growthPercent: str }, required: ['sourceLine', 'sourceDepartment'], additionalProperties: false },
 values: { type: 'object', additionalProperties: str },
 targets: { type: 'array', items: { type: 'object', properties: { department: str, percent: str }, required: ['department'] } },
}
function tool(name: string, description: string, required: string[], optional: string[] = [], readOnly = false) {
 return { name, description, inputSchema: { type: 'object', properties: Object.fromEntries([...required, ...optional].map(k => [k, fields[k] ?? str])), required, additionalProperties: false }, annotations: { readOnlyHint: readOnly, openWorldHint: false } }
}
const tools = [
 tool('scenarios', 'List scenarios visible to you, plus planning lines and departments.', [], [], true),
 tool('scenario', 'Read a scenario and its role-filtered inputs, cells and traces.', ['scenario'], [], true),
 tool('compare', 'Compare two visible scenarios, including changed inputs and cells.', ['a', 'b'], [], true),
 tool('variance', 'Read role-filtered variance and evidence for a closed month.', ['month'], [], true),
 tool('metrics', 'Read monthly profit, cash and department headcount for a visible scenario.', ['scenario'], [], true),
 tool('proposal-create', 'Create your proposal from a visible working scenario.', ['from', 'name', 'request']),
 tool('proposal-submit', 'Submit your proposal for finance review; never promote it.', ['id'], ['summary']),
 tool('revenue', 'Add or edit a revenue driver in your working proposal: volume, customers, seats, usage, services, milestones or backlog. Services assumes all active department positions are billable. Amounts and percentages are decimal strings.', ['scenario', 'name', 'kind', 'line', 'department', 'start'], ['id', 'collectionLag', 'startVolume', 'growthPercent', 'rate', 'startCustomers', 'newPerMonth', 'newPerRep', 'repDepartment', 'rampMonths', 'churnPercent', 'arpa', 'startSeats', 'expansionPercent', 'price', 'startUsage', 'unitPrice', 'monthlyHours', 'utilizationPercent', 'hourlyRate', 'milestones', 'openingBacklog', 'monthlyAdditions', 'burnPercent']),
 tool('position', 'Add or edit a position in your working proposal.', ['scenario', 'title', 'department', 'line', 'start', 'annualSalary'], ['id', 'holder', 'end', 'onCostPercent']),
 tool('expense', 'Add or edit an expense in your working proposal.', ['scenario', 'name', 'line', 'department', 'kind', 'amount', 'start'], ['id', 'end']),
 tool('schedule', 'Add or edit entered monthly amounts or an actuals-reference schedule in your working proposal; source months must be complete.', ['scenario', 'name', 'line', 'department'], ['values', 'history', 'id']),
 tool('asset-category', 'Finance: add or edit an asset category in your own working proposal.', ['scenario', 'name', 'usefulLifeMonths'], ['id']),
 tool('asset', 'Add or edit an asset in your own working proposal, within your departments.', ['scenario', 'name', 'category', 'department', 'line', 'kind', 'cost', 'start'], ['id', 'paymentMonth', 'openingAccumulated', 'remainingLifeMonths', 'disposalMonth', 'disposalProceeds']),
 tool('allocation', 'Finance: add or edit allocation rules in your own working proposal.', ['scenario', 'name', 'sourceDepartment', 'basis', 'targets'], ['id']),
 tool('debt', 'Finance: plan borrowing and repayment in your own draft proposal; never execute a payment.', ['scenario','name','debtKind','line','department','maturity'], ['id','start','opening','limit','rateKind','annualRate','baseName','baseRates','spreadPercent','draws','repayments','amortization','amortizationStart','termMonths','covenants']),
 tool('equity', 'Finance: plan an equity raise in your own draft proposal.', ['scenario','name','month','amount'], ['id']),
 tool('input-delete', 'Remove an input from your own working proposal.', ['kind', 'id']),
 tool('comment', 'Comment on a visible scenario within your department authority.', ['scenario', 'department', 'text']),
 tool('explanation', 'Draft a variance explanation within your department authority.', ['month', 'line', 'department', 'text']),
]

// Validate the small schema vocabulary used by this closed tool catalogue.
function matches(value: unknown, schema: Data): boolean {
 if (schema.type === 'string') return typeof value === 'string'
 if (schema.type === 'array') return Array.isArray(value) && value.every(v => matches(v, schema.items))
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const object = value as Data
 return (schema.required ?? []).every((k: string) => Object.hasOwn(object, k)) && Object.entries(object).every(([k, v]) => {
  const property = schema.properties && Object.hasOwn(schema.properties, k) ? schema.properties[k] : undefined
  return property ? matches(v, property) : schema.additionalProperties === false ? false : typeof schema.additionalProperties === 'object' ? matches(v, schema.additionalProperties) : true
 })
}

async function invoke(c: Context, name: string, b: Data): Promise<Data> {
 requireThat(tools.some(t => t.name === name), 'This tool is not available to agents', 403)
 if (name === 'scenarios') { const s = await stateView(c); requireThat('scenarios' in s, 'Plan access required', 403); return { scenarios: s.scenarios, lines: s.lines, departments: s.departments, workspace: s.workspace } }
 if (name === 'scenario') return scenarioView(c, b.scenario)
 if (name === 'compare') return compareView(c, b.a, b.b)
 if (name === 'variance') return variance(c, month(b.month))
 if (name === 'metrics') {
  const view = await scenarioView(c, b.scenario)
  const calc = view.calculation
  return { currency: calc.currency, months: calc.months, profit: calc.profit, cash: calc.cash, headcount: calc.headcount, cashHealth: view.cashHealth }
 }
 if (name === 'proposal-create') await scenarioView(c, b.from)
 if (name === 'comment') await scenarioView(c, b.scenario)
 if (name === 'proposal-submit' || name === 'input-delete' || (INPUT_KINDS as readonly string[]).includes(name)) {
  const id = name === 'proposal-submit' ? b.id : name === 'input-delete' ? get(c.s, String(b.kind), b.id).scenario : b.scenario
  const proposal = get(c.s, 'scenario', id)
  requireThat(proposal.kind === 'proposal' && proposal.createdBy === c.x.actor.email && proposal.status === 'working' && proposal.proposalStatus === 'draft', 'Agents may edit and submit only their own draft proposals', 403)
 }
 const result = name === 'comment' ? await cycle(c, name, b) : name === 'explanation' ? await review(c, name, b) : await plan(c, name, b)
 requireThat(result !== undefined, 'Tool unavailable', 403)
 return result
}

export async function handleMcp(request: Request, env: Bindings): Promise<Response> {
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'MCP-Protocol-Version': versions[0] }
 let id: string | number | null = null
 const reply = (value: Data, status = 200) => Response.json({ jsonrpc: '2.0', id, ...value }, { status, headers })
 try {
  const person = { ...await actor(request, env), agent: { name: 'MCP client', via: 'mcp' } }
  const { state, revision } = await load(env.DB)
  const c: Context = { s: state, x: access(state, person), db: env.DB, now: new Date().toISOString(), activity: [], snapshots: [] }
  requireMember(c.x)
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
  const protocol = request.headers.get('MCP-Protocol-Version')
  requireThat(!protocol || versions.includes(protocol), 'Unsupported MCP protocol version')
  headers['MCP-Protocol-Version'] = protocol ?? '2025-03-26'
  requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'Send application/json', 415)
  const accept = request.headers.get('accept')
  requireThat(!accept || accept.includes('application/json') || accept.includes('*/*'), 'Accept application/json responses', 406)
  requireThat(Number(request.headers.get('content-length') ?? 0) <= 1_600_000, 'Request too large', 413)
  const raw = await request.text()
  requireThat(new TextEncoder().encode(raw).length <= 1_600_000, 'Request too large', 413)
  let message: Data
  try { message = JSON.parse(raw) } catch { return reply({ error: { code: -32700, message: 'Parse error' } }, 400) }
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && typeof message.id !== 'string' && typeof message.id !== 'number')) return reply({ error: { code: -32600, message: 'Invalid request' } }, 400)
  id = message.id ?? null
  if (message.id === undefined) {
   await readFence(env.DB, person, revision)
   return new Response(null, { status: 202, headers })
  }
  const params = message.params ?? {}
  if (!params || typeof params !== 'object' || Array.isArray(params)) return reply({ error: { code: -32602, message: 'Invalid params' } })
  if (message.method === 'initialize') {
   if (typeof params.protocolVersion !== 'string' || !params.clientInfo || typeof params.clientInfo.name !== 'string' || !params.capabilities || typeof params.capabilities !== 'object') return reply({ error: { code: -32602, message: 'Invalid initialization params' } })
   const protocolVersion = versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0]
   headers['MCP-Protocol-Version'] = protocolVersion
   await readFence(env.DB, person, revision)
   return reply({ result: { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Easel', version: '1.0.0' }, instructions: 'Use proposals for planning changes. Approval, close, publish and promotion are never available to agents.' } })
  }
  if (message.method === 'ping' || message.method === 'tools/list') {
   await readFence(env.DB, person, revision)
   return reply({ result: message.method === 'ping' ? {} : { tools } })
  }
  if (message.method !== 'tools/call') return reply({ error: { code: -32601, message: 'Method not found' } })
  if (typeof params.name !== 'string' || (params.arguments !== undefined && (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) return reply({ error: { code: -32602, message: 'Invalid tool params' } })
  const selected = tools.find(t => t.name === params.name)
  if (!selected) return reply({ error: { code: -32602, message: 'This tool is not available to agents' } })
  if (!matches(params.arguments ?? {}, selected.inputSchema)) return reply({ error: { code: -32602, message: 'Arguments do not match the tool input schema' } })
  try {
   const before = new Map(state)
   const result = await invoke(c, params.name, params.arguments ?? {})
   if (c.activity.length || c.snapshots.length) await versionStructure(c, before, revision)
   if (c.activity.length || c.snapshots.length) await save(env.DB, person, before, state, revision, c.activity, c.snapshots, c.x.role === 'finance')
   else await readFence(env.DB, person, revision)
   return reply({ result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } })
  } catch (e) {
   if (!(e instanceof Fault)) throw e
   return reply({ result: { isError: true, content: [{ type: 'text', text: e.message }], structuredContent: { error: e.message, status: e.status } } })
  }
 } catch (e) {
  const status = e instanceof Fault ? e.status : 500
  return reply({ error: { code: -32000, message: e instanceof Fault ? e.message : 'Easel could not complete this request' } }, status)
 }
}
