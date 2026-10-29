// Finance defines the rule; a task never grants access to its underlying plan.
import { requireFinance, requireMember } from './access'
import type { Context } from './context'
import { workspace } from './model'
import { pipelineBlock } from './pipeline'
import { cents, hundredths, percentBps } from './units'
import { all, choice, find, get, integer, put, requireThat, text, uid, type Data } from './types'

export async function validMetricOwner(c: Context, rule: Data) {
 const operator = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(rule.owner).first<{ role: string }>()
 if (!operator) return false
 if (rule.kind === 'runway') return ['owner', 'admin'].includes(operator.role)
 const m = find(c.s, 'member', rule.owner)
 return !!m?.active && m.role === 'contributor' && m.departments?.includes(rule.department)
}

export function seesMetricTask(c: Context, task: Data) {
 if (c.x.role === 'finance') return true
 return c.x.role === 'contributor' && c.x.actor.email === task.owner && c.x.departments.includes(task.department)
}

export async function metricTaskList(c: Context) {
 requireMember(c.x)
 const tasks=all(c.s,'metric-task').filter(t=>seesMetricTask(c,t)).map(t=>t.evidence.kind==='pipeline-coverage'?{...t,blocked:pipelineBlock(c,get(c.s,'scenario',t.scenario),t.department)}:t)
 return { rules: c.x.role === 'finance' ? all(c.s, 'metric-rule') : [], tasks: tasks.sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id)) }
}

export async function metricRules(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op === 'metric-refresh') {
  requireFinance(c.x)
  // api.commit runs the evaluator after the command and every accepted refresh
  // or close, in the same revision/session-fenced model save.
  c.activity.push({ action: op, record: 'metric-rules' })
  return { created: [], blocked: [] }
 }
 if (op === 'metric-rule-save') {
  requireFinance(c.x)
  const prior = b.id ? get(c.s, 'metric-rule', b.id, 'metric rule') : null
  requireThat(!prior || prior.revision === Number(b.revision), 'The rule changed; reload before saving', 409)
 const kind = choice(b.kind, ['overspend', 'runway', 'pipeline-coverage'] as const, 'metric rule')
 const department = kind === 'overspend' || kind === 'pipeline-coverage' ? get(c.s, 'department', b.department).id : ''
  const rule: Data = { name: text(b.name, 'Rule name'), kind, department, owner: text(b.owner, 'Task owner').toLowerCase(), dueDays: integer(b.dueDays, 'Days until due', 0, 365), enabled: b.enabled !== false, currency: workspace(c.s).currency,
   ...(kind === 'overspend' ? { percentBps: percentBps(b.percent, 'Overspend percent', 10000), amountCents: cents(b.amount, 'Minimum overspend') } : kind === 'pipeline-coverage' ? {coverageBps:percentBps(b.coveragePercent,'Pipeline coverage threshold',10000)} : { runwayHundredths: hundredths(b.runway, 'Runway threshold') }),
   revision: (prior?.revision ?? 0) + 1, updatedBy: c.x.actor.email, updatedAt: c.now,
  }
  requireThat(await validMetricOwner(c, rule), kind === 'overspend' ? 'Choose an active contributor in this department' : 'Choose an active finance owner or admin')
  const id = prior?.id ?? uid()
  put(c.s, 'metric-rule', id, rule)
  c.activity.push({ action: op, record: id, detail: { revision: rule.revision, kind } })
  return get(c.s, 'metric-rule', id)
 }
 if (op === 'metric-task-complete') {
  requireMember(c.x)
  const task = get(c.s, 'metric-task', b.id, 'metric task')
  requireThat(seesMetricTask(c, task), 'Metric task not found', 404)
  requireThat(task.status === 'open' && task.revision === Number(b.revision), 'The task changed; reload before completing', 409)
  put(c.s, 'metric-task', task.id, { ...task, status: 'done', revision: task.revision + 1, completedBy: c.x.actor.email, completedAt: c.now })
  c.activity.push({ action: op, record: task.id, scenario: task.scenario, detail: { rule: task.rule } })
  return get(c.s, 'metric-task', task.id)
 }
 return undefined
}
