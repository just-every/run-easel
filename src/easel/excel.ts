// Excel uses native session authority and the same filtered model and grid save.
import { requireDepartment, requireMember } from './access'
import type { Context } from './context'
import { officeReport } from './office-report'
import { grid } from './grid'
import { plan } from './plan'
import { scenarioAccess } from './scenario-access'
import { scenarioView } from './views'
import { all, find, get, integer, requireThat, type Data } from './types'

export async function excelValues(c: Context, id: string, input: Data) {
 requireMember(c.x)
 requireThat(!c.x.actor.token, 'Use your signed-in session for Excel reads', 403)
 const view = await scenarioView(c, id)
 const select = (items: Data[], selector: unknown, label: string) => {
  const matches = items.filter(item => item.id === selector || item.name === selector)
  requireThat(matches.length === 1, `Choose one available ${label}`, 409)
  return matches[0].id
 }
 const line = select(view.lines, input.line, 'line')
 const department = select(view.departments, input.department, 'department')
 requireThat(view.calculation.months.includes(String(input.month)), 'The month is outside this plan', 409)
 const cells = view.calculation.cells.filter(cell => cell.line === line && cell.department === department && cell.month === input.month)
 requireThat(cells.length === 1, 'This cell is unavailable in your current view', 409)
 // No input, source, trace, name or compensation detail crosses this door.
 return { scenario: id, revision: view.scenario.revision, currency: view.calculation.currency, line, department, month: input.month, amount: cells[0].amount }
}

export async function excelReport(c: Context, id: string, input: Data) {
 requireMember(c.x)
 requireThat(!c.x.actor.token, 'Use your signed-in session for Excel reads', 403)
 const report = await officeReport(c, id, { ...input, kind: 'table' })
 return { table: report.table, currency: report.currency, revision: report.revision }
}

export async function excelWrite(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'excel-write') return
 requireMember(c.x)
 requireThat(!c.x.actor.token, 'Use your signed-in session for Excel write-back', 403)
 const source = scenarioAccess(c.s, c.x, b.scenario)
 requireThat(integer(b.revision, 'Reviewed scenario revision', 1, Number.MAX_SAFE_INTEGER) === source.revision, 'The plan changed; refresh Excel before writing', 409)
 requireThat(source.status === 'working' && source.kind !== 'proposal' && !source.sandbox, 'Excel write-back requires a working plan; approved budgets and kept forecasts are read-only', 409)
 const row = get(c.s, 'schedule', b.schedule)
 requireThat(row.scenario === source.id, 'This row belongs to another scenario', 409)
 requireDepartment(c.x, row.department)
 requireThat(c.x.role !== 'viewer', 'Viewers cannot write back', 403)
 const sub = find(c.s, 'submission', `${source.id}|${row.department}`)
 let target = source, targetRow = row
 if (c.x.role === 'contributor' && (source.kind !== 'budget' || ['submitted', 'reviewing'].includes(sub?.status))) {
  target = (await plan(c, 'proposal-create', { from: source.id, name: 'Excel input change', request: 'Review the submitted Excel input change' }))!
  targetRow = all(c.s, 'schedule').find(r => r.scenario === target.id && r.originId === row.originId)!
  requireThat(targetRow, 'The input could not be copied to a proposal', 409)
 }
 const changes = [{ schedule: targetRow.id, month: b.month, value: b.value }]
 const request = { scenario: target.id, revision: target.revision, changes }
 const preview = (await grid(c, 'grid-preview', request))!
 requireThat(!preview.refused.length, preview.refused.map((r: Data) => r.error).join('; '), 409)
 const saved = (await grid(c, 'grid-save', { ...request, fingerprint: preview.fingerprint }))!
 if (target.id !== source.id) {
  const proposal = (await plan(c, 'proposal-submit', { id: target.id, summary: 'Excel write-back for finance review' }))!
  return { mode: 'proposal', proposal, targetRevision: source.revision }
 }
 return { mode: 'entry', ...saved }
}
