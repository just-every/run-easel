import { gaugeFreshness } from './gauge-freshness'
import type { Calculation } from './engine'
import { scopedCalculation, scopedReader } from './group-projections'
import { reportDefinition, savedReport } from './saved-reports'
import { workingCalculation } from './calculation'
import { requireFinance, requireMember, visibleInput } from './access'
import { canSeeDashboard } from './dashboard-access'
import { dashboardMetrics } from './dashboard-metrics'
import type { Context } from './context'
import { model } from './model'
import { frozenModel } from './reforecasts'
import { scenarioAccess } from './scenario-access'
import { all, choice, find, get, put, remove, requireThat, text, uid, type Data } from './types'

const METRICS = ['revenue', 'grossMargin', 'headcount', 'arr', 'burn', 'runway', 'closingCash'] as const
const DISPLAYS = ['tile', 'chart', 'table'] as const

function widgets(value: unknown): Data[] {
 requireThat(Array.isArray(value) && value.length > 0 && value.length <= METRICS.length, 'Choose one to seven dashboard widgets')
 const result = value.map(w => ({ metric: choice(w?.metric, METRICS, 'a dashboard metric'), display: choice(w?.display, DISPLAYS, 'a widget display') }))
 requireThat(new Set(result.map(w => w.metric)).size === result.length, 'Each metric may appear once')
 return result
}

export function dashboardList(c: Context) {
 requireMember(c.x)
 return all(c.s, 'dashboard').filter(d => canSeeDashboard(c.s, c.x, d)).sort((a, b) => a.name.localeCompare(b.name))
}

function accessible(c: Context, id: unknown) {
 requireMember(c.x)
 const d = get(c.s, 'dashboard', id)
 requireThat(canSeeDashboard(c.s, c.x, d), 'Dashboard not found', 404)
 return d
}

export async function dashboardView(c: Context, id: unknown) {
 const dashboard = accessible(c, id)
 const sc = scenarioAccess(c.s, c.x, dashboard.scenario)
 const m = sc.status === 'frozen' ? await frozenModel(c, sc) : model(c.s, sc.id)
 // Aggregate raw arithmetic locally; no input, source, salary or name leaves
 // this view. Reading frozen versions uses their original sources and values.
 const pending = sc.status !== 'frozen' && !!sc.actualsThrough && all(c.s, 'batch').some(b => ['importing', 'undoing'].includes(b.status))
 const calculation: Calculation = 'calculation' in m ? m.calculation as Calculation : await workingCalculation(c, sc.id)
 const rows = dashboardMetrics({ lines: m.lines, calculation: scopedCalculation(c.s, c.x, calculation, m.lines) }, m.inputs.revenue.filter(input => !scopedReader(c.x) || visibleInput(c.x, 'revenue', input)), dashboard.department)
 if (scopedReader(c.x)) for (const row of rows) row.headcount = null
 const blocked = pending ? 'Complete the in-progress actuals import before reading final dashboard metrics.' : null
 if (blocked) for (const row of rows) {
  for (const metric of METRICS) if (metric !== 'headcount') row[metric] = null
  row.arrBasis = blocked; row.runwayBasis = blocked
 }
 const layout = find(c.s, 'dashboard-layout', `${dashboard.id}|${c.x.actor.email}`)
 // A revised definition changes the available widgets. A stale personal
 // layout is not silently rewritten and cannot supply removed widgets.
 const personal = layout && layout.definitionRevision === dashboard.revision
 return { gaugeFreshness: await gaugeFreshness(c, m.inputs.revenue, { department: dashboard.department, months: calculation.months.filter(month => !calculation.actualsThrough || month > calculation.actualsThrough) }), dashboard, widgets: personal ? layout.widgets : dashboard.widgets, layoutRevision: layout?.revision ?? 0,
  currency: m.workspace.currency, scenarioName: sc.name, departmentName: m.departments.find(d => d.id === dashboard.department)?.name ?? '', rows, blocked }
}

export async function dashboards(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['dashboard-save', 'dashboard-delete', 'dashboard-layout'].includes(op)) return undefined
 if (op === 'dashboard-layout') {
  const d = accessible(c, b.dashboard), id = `${d.id}|${c.x.actor.email}`
  const prior = find(c.s, 'dashboard-layout', id)
  requireThat(Number(b.revision) === (prior?.revision ?? 0), 'Your layout changed; reload before saving', 409)
  requireThat(Number(b.definitionRevision) === d.revision, 'The dashboard changed; reload before saving your layout', 409)
  const next = widgets(b.widgets)
  requireThat(next.length === d.widgets.length && next.every(w => d.widgets.some((v: Data) => v.metric === w.metric)), 'A personal layout must contain the dashboard metrics exactly once')
  put(c.s, 'dashboard-layout', id, { dashboard: d.id, owner: c.x.actor.email, definitionRevision: d.revision, reportDisplay: prior?.definitionRevision === d.revision ? prior?.reportDisplay : undefined, revision: (prior?.revision ?? 0) + 1, widgets: next })
  c.activity.push({ action: op, record: d.id, scenario: d.scenario, detail: {} })
  return { saved: true }
 }
 requireFinance(c.x)
 const prior = b.id ? accessible(c, b.id) : null
 requireThat(!prior || prior.createdBy === c.x.actor.email, 'Only the dashboard creator changes its definition', 403)
 requireThat(!prior || Number(b.revision) === prior.revision, 'The dashboard changed; reload before saving', 409)
 if (op === 'dashboard-delete') {
  requireThat(prior, 'Choose a dashboard')
  remove(c.s, 'dashboard', prior.id)
  for (const layout of all(c.s, 'dashboard-layout').filter(l => l.dashboard === prior.id)) remove(c.s, 'dashboard-layout', layout.id)
  c.activity.push({ action: op, record: prior.id, scenario: prior.scenario, detail: { createdBy: prior.createdBy, audience: prior.audience, department: prior.department } })
  return { removed: prior.id }
 }
 const sc = scenarioAccess(c.s, c.x, b.scenario)
 requireThat(!sc.sandbox && sc.kind !== 'proposal', 'Choose a company-visible plan, never a sandbox or proposal', 409)
 const audience = choice(b.audience, ['private', 'leadership', 'board', 'department'] as const, 'an audience')
 const department = b.department ? get(c.s, 'department', b.department).id : ''
 requireThat(audience !== 'department' || department, 'A department audience needs a department')
 const id = prior?.id ?? uid()
 const value = { name: text(b.name, 'Dashboard name'), scenario: sc.id, department, audience, widgets: widgets(b.widgets), revision: (prior?.revision ?? 0) + 1, createdBy: prior?.createdBy ?? c.x.actor.email, createdAt: prior?.createdAt ?? c.now, updatedAt: c.now, report: b.report === undefined ? prior?.report ?? null : reportDefinition(c, b.report) }
 put(c.s, 'dashboard', id, value)
 // Validate source versions, horizon and filters before the atomic API save.
 if (value.report) await savedReport(c, id)
 c.activity.push({ action: op, record: id, scenario: sc.id, detail: { createdBy: value.createdBy, audience, department } })
 return get(c.s, 'dashboard', id)
}
