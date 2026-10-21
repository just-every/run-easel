// Report authoring shares the established dashboard audience and revision fences.
import { requireDepartment, requireMember } from './access'
import type { Context } from './context'
import { canSeeDashboard } from './dashboard-access'
import { scenarioAccess } from './scenario-access'
import { reportDefinition, savedReport } from './saved-reports'
import { all, choice, find, get, put, remove, requireThat, text, uid, type Data } from './types'

export function savedReportList(c: Context) {
 requireMember(c.x)
 return all(c.s, 'dashboard').filter(d => d.report && canSeeDashboard(c.s, c.x, d)).sort((a, b) => a.name.localeCompare(b.name))
}

export async function savedReportCommands(c: Context, op: string, b: Data) {
 if (!['report-save', 'report-delete', 'report-layout'].includes(op)) return undefined
 requireMember(c.x)
 if (op === 'report-layout') {
  await savedReport(c, b.dashboard)
  const d = get(c.s, 'dashboard', b.dashboard), id = `${d.id}|${c.x.actor.email}`, prior = find(c.s, 'dashboard-layout', id)
  requireThat(Number(b.revision) === (prior?.revision ?? 0) && Number(b.definitionRevision) === d.revision, 'The report or your layout changed; reload', 409)
  const current = prior?.definitionRevision === d.revision
  put(c.s, 'dashboard-layout', id, { dashboard: d.id, owner: c.x.actor.email, definitionRevision: d.revision, revision: (prior?.revision ?? 0) + 1, widgets: current ? prior?.widgets : d.widgets, reportDisplay: choice(b.display, ['table', 'chart'] as const, 'a report display') })
  c.activity.push({ action: 'dashboard-layout', record: d.id, scenario: d.scenario, detail: {} })
  return { saved: true }
 }
 requireThat(c.x.role !== 'viewer', 'Viewers read shared reports; finance and department contributors build them', 403)
 const prior = b.id ? get(c.s, 'dashboard', b.id) : null
 requireThat(!prior || prior.report && canSeeDashboard(c.s, c.x, prior), 'Report not found', 404)
 requireThat(!prior || prior.createdBy === c.x.actor.email, 'Only the report creator changes its definition', 403)
 requireThat(!prior || Number(b.revision) === prior.revision, 'The report changed; reload before saving', 409)
 if (prior && c.x.role !== 'finance') requireDepartment(c.x, prior.department)
 if (op === 'report-delete') {
  requireThat(prior, 'Choose a report')
  remove(c.s, 'dashboard', prior.id)
  for (const layout of all(c.s, 'dashboard-layout').filter(l => l.dashboard === prior.id)) remove(c.s, 'dashboard-layout', layout.id)
  c.activity.push({ action: 'dashboard-report-delete', record: prior.id, scenario: prior.scenario, detail: { audience: prior.audience, department: prior.department, createdBy: prior.createdBy } })
  return { removed: prior.id }
 }
 const sc = scenarioAccess(c.s, c.x, b.scenario)
 requireThat(!sc.sandbox && sc.kind !== 'proposal', 'Choose a company-visible source version', 409)
 const department = b.department ? get(c.s, 'department', b.department).id : ''
 const audience = choice(b.audience, ['private', 'leadership', 'board', 'department'] as const, 'a report audience')
 if (c.x.role !== 'finance') {
  requireDepartment(c.x, department)
  requireThat(['private', 'department'].includes(audience), 'Department contributors share reports with their department only', 403)
 }
 requireThat(audience !== 'department' || department, 'A department audience needs a department')
 const report = reportDefinition(c, b.report)
 requireThat(report, 'Choose a report definition')
 const id = prior?.id ?? uid()
 put(c.s, 'dashboard', id, { name: text(b.name, 'Report name'), scenario: sc.id, department, audience,
  widgets: prior?.widgets ?? [{ metric: 'revenue', display: 'table' }], revision: (prior?.revision ?? 0) + 1,
  createdBy: c.x.actor.email, createdAt: prior?.createdAt ?? c.now, updatedAt: c.now, report,
  reportAuthorDepartment: prior?.reportAuthorDepartment ?? (c.x.role === 'contributor' ? department : '') })
 await savedReport(c, id)
 c.activity.push({ action: 'dashboard-report-save', record: id, scenario: sc.id, detail: { audience, department, createdBy: c.x.actor.email } })
 return get(c.s, 'dashboard', id)
}
