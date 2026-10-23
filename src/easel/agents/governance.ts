import { requireCapability, requireFinance } from '../access'
import type { Context } from '../context'
import { all, find, put, requireThat, uid, type Data, type State } from '../types'
import { decimal } from '../units'

export const AGENTS = {
 constraints: 'Constraint watch', responses: 'Constraint responses', questions: 'Owner questions',
 learning: 'Forecast learning', sources: 'Source review', chases: 'Action chases',
 commentary: 'Variance commentary', modeler: 'Modeler', analyst: 'Analyst', missions: 'Recurring missions', mcp: 'MCP client',
} as const
export type AgentId = keyof typeof AGENTS
// Existing agents retain their native opt-in and authority. New agents start disabled.
export const governance = (s: State) => find(s, 'agent-governance', 'main') ?? { stopped: false, revision: '', agents: {} }
export const agentEnabled = (s: State, id: AgentId) => !governance(s).stopped && (governance(s).agents[id] ?? !['analyst', 'missions'].includes(id))
export function requireAgent(c: Pick<Context, 's'>, id: AgentId) { requireThat(agentEnabled(c.s, id), `${AGENTS[id]} is disabled or all agents are stopped`, 409) }
export function modelAllowance(c: Context) {
 return ['commentary-run', 'modeler-run', 'analyst-run'].flatMap(kind => all(c.s, kind)).filter(r => r.billingMonth === c.now.slice(0, 7)).reduce((n, r) => n + r.reserveMicroUsd, 0)
}
export function requireAgentBudget(c: Context, reserve: number) {
 const config = governance(c.s)
 if (config.budgetMicroUsd !== undefined) requireThat(BigInt(modelAllowance(c)) + BigInt(reserve) <= BigInt(config.budgetMicroUsd), 'The monthly total agent budget cannot cover this conservative allowance', 409)
}
function finance(c: Context) {
 requireFinance(c.x); requireCapability(c.x, 'approvals', c.s)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use a native finance session for agent governance', 403)
}
export async function governanceStatus(c: Context) {
 finance(c)
 const config = governance(c.s)
 return { ...config, agents: Object.entries(AGENTS).map(([id, label]) => ({ id, label, enabled: config.agents[id] ?? !['analyst', 'missions'].includes(id) })), reservedMicroUsd: modelAllowance(c), billingMonth: c.now.slice(0, 7), costBasis: 'Conservative reserved allowance; provider-reported cost unavailable', forbidden: ['approve', 'close', 'publish', 'promote', 'connect', 'pay', 'hire'] }
}
export async function governanceSettings(c: Context, op: string, b: Data) {
 finance(c)
 requireThat(['configure', 'stop', 'resume'].includes(op), 'Unknown agent governance setting', 404)
 const prior = governance(c.s)
 let next: Data = { ...prior, stopped: op === 'stop' }
 if (op === 'configure') {
  requireThat(b.consent === true, 'Explicitly confirm the reviewed agent controls and shared monthly allowance')
  requireThat(b.agents && typeof b.agents === 'object' && !Array.isArray(b.agents) && Object.entries(b.agents).every(([id, value]) => Object.hasOwn(AGENTS, id) && typeof value === 'boolean'), 'Choose known agent enablement controls')
  const budgetMicroUsd = decimal(b.monthlyUsd, 'Monthly total agent USD budget', 6)
  requireThat(budgetMicroUsd >= 0, 'The monthly budget cannot be negative')
  next = { ...prior, agents: { ...prior.agents, ...b.agents }, budgetMicroUsd, consentBy: c.x.actor.email, consentAt: c.now }
 }
 put(c.s, 'agent-governance', 'main', { ...next, revision: uid(), by: c.x.actor.email, at: c.now })
 c.activity.push({ action: `agent-governance-${op}`, record: 'main', detail: { agent: 'Agent governance', stopped: next.stopped, agents: next.agents, budgetMicroUsd: next.budgetMicroUsd ?? null } })
 return governanceStatus(c)
}
