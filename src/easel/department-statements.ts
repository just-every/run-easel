import { captureStatementDimensions, scopedStatementRows } from './statement-dimensions'
// Monthly department statements are scoped before they are stored or mailed.
import { access, dimensionAllowed, requireCapability, requireFinance, requireMember, seesDepartmentDetail, seesPayDetail } from './access'
import type { Context } from './context'
import { departments, workspace } from './model'
import { monthLabel } from './months'
import { variance } from './review'
import { all, find, get, put, requireThat, uid, type Data } from './types'

export function queueDepartmentStatements(c: Context, month: string) {
 const ids: string[] = []
 for (const d of departments(c.s)) {
  const recipients = all(c.s, 'member').filter(m => statementOwner(c.s, m.email, d.id)).map(m => m.email)
  if (!recipients.length || all(c.s, 'department-statement').some(s => s.month === month && s.department === d.id)) continue
  const id = uid()
  put(c.s, 'department-statement', id, { month, label: monthLabel(month), currency: workspace(c.s).currency, department: d.id, departmentName: d.name, createdAt: c.now, rows: null,
   deliveries: recipients.map(recipient => ({ recipient, deliveryId: uid(), status: 'pending', attempts: 0 })) })
  c.activity.push({ action: 'department-statement-queued', record: id, detail: { month, department: d.id, recipients: recipients.length } })
  ids.push(id)
 }
 return ids
}

/** Ownership controls delivery, while current department read controls the app. */
export function statementOwner(s: Context['s'], email: string, department: string) {
 const member = find(s, 'member', email)
 if (!member?.active || member.role !== 'contributor') return false
 const x = access(s, { id: '', email, name: member.name, baseRole: 'member', session: '', version: 0 })
 return x.statementDepartments?.includes(department) === true && seesDepartmentDetail(x, department)
}
const canRead = (c: Context, s: Data) => c.x.role === 'finance' || seesDepartmentDetail(c.x, s.department)

export function statementWork(c: Context, s: Data): Data {
 const dimensionRestricted = Object.keys(c.x.dimensionRead ?? {}).length > 0
 const rows: Data[] = scopedStatementRows(c, s).map((r: Data) => {
  const explanation = find(c.s, 'explanation', `${s.month}|${r.line}|${s.department}`) ?? null
  const restricted = (r.payroll || find(c.s, 'line', r.line)?.payroll) && !seesPayDetail(c.x, s.department)
  return { ...r, citations: restricted ? [] : r.citations.filter((citation: Data) => dimensionAllowed(c.s, c.x, citation.dimensions ?? {})), explanation: restricted || dimensionRestricted ? null : explanation }
 })
 const metricTasks = all(c.s, 'metric-task').filter(t => t.department === s.department && t.status === 'open').map(t => ({ id: t.id, name: t.name, owner: t.owner, due: t.due, revision: t.revision, evidence: { summary: t.evidence.summary } }))
 const submissions = all(c.s, 'submission').filter(t => t.department === s.department && ['requested', 'returned'].includes(t.status)).map(t => ({ id: t.id, name: `Submit department budget · ${s.departmentName}`, owner: 'Department contributors', due: t.due, evidence: { summary: `Submission ${t.status}; requested ${t.requestedAt}.` } }))
 const actions = all(c.s, 'pack').filter(p => p.status === 'published').flatMap(p => p.decisions.filter((d: Data) => p.progress?.[d.id]?.status !== 'done' && (find(c.s, 'pack-action-department', `${p.id}|${d.id}`)?.department ?? d.department ?? '') === s.department).map((d: Data) => ({ id: `${p.id}|${d.id}`, name: d.text, owner: d.owner, due: d.due, evidence: { summary: `Published action in ${p.title}.` } })))
 const calendarTasks = all(c.s, 'calendar-task').filter(t => t.department === s.department && t.status === 'open').map(t => ({ id: t.id, name: t.name, owner: t.owner, due: t.due, evidence: { summary: `Planning calendar task; due ${t.due}.` } }))
 const tasks = dimensionRestricted ? [] : [...metricTasks, ...submissions, ...calendarTasks, ...actions]
 const toConfirm = rows.filter((r: Data) => {
  if (dimensionRestricted) return false
  const explanation = find(c.s, 'explanation', `${s.month}|${r.line}|${s.department}`)
  return explanation?.status !== 'confirmed' && (r.variance !== 0 || explanation)
 })
 const { dimensionCells: _privateSlices, ...visible } = s
 return { ...visible, rows, topVariances: [...rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5), tasks, toConfirm }
}

export async function captureDepartmentStatement(c: Context, id: string) {
 requireCapability(c.x, 'approvals', c.s)
 const statement = get(c.s, 'department-statement', id)
 if (statement.rows !== null) return statement
 // Capture complete evidence internally even when the finance operator cannot
 // read pay. App reads, workbooks and each mail recipient apply their own grant.
 const v = await variance({ ...c, x: { ...c.x, payDetail: true } }, statement.month)
 const rows = v.rows.filter(r => r.department === statement.department).map(r => ({ key: r.key, line: r.line, lineName: r.lineName, payroll: r.payroll || find(c.s, 'line', r.line)?.payroll === true, actual: r.actual, budget: r.budget, variance: r.variance, citations: r.citations }))
 const dimensionCells = await captureStatementDimensions(c, statement, v.budget.snapshot)
 const captured = { ...statement, rows, dimensionCells, capturedAt: c.now }
 put(c.s, 'department-statement', id, captured)
 c.activity.push({ action: 'department-statement-captured', record: id, detail: { month: statement.month, department: statement.department, rows: rows.length } })
 return captured
}

export async function departmentStatementList(c: Context, month?: string) {
 requireMember(c.x)
 requireThat(c.x.role !== 'viewer' || (c.x.readDepartments?.length ?? 0) > 0, 'Department statements require department read access', 403)
 return all(c.s, 'department-statement').filter(s => canRead(c, s) && (!month || s.month === month)).map(s => ({ id: s.id, month: s.month, label: s.label, department: s.department, departmentName: s.departmentName, createdAt: s.createdAt })).sort((a, b) => b.month.localeCompare(a.month) || a.departmentName.localeCompare(b.departmentName))
}

export async function departmentStatementView(c: Context, id: string) {
 requireMember(c.x)
 const s = get(c.s, 'department-statement', id)
 requireThat(canRead(c, s), 'Department statement not found', 404)
 requireThat(s.rows !== null, 'Statement is queued for preparation; finance can retry it', 409)
 const { deliveries, ...view } = statementWork(c, s)
 return { ...view, deliveries: deliveries.filter((d: Data) => c.x.role === 'finance' || d.recipient === c.x.actor.email).map(({ message: _message, ...d }: Data) => d) }
}

export async function departmentStatements(c: Context, op: string, b: Data) {
 if (op !== 'department-statement-retry') return undefined
 requireFinance(c.x)
 const s = get(c.s, 'department-statement', b.id)
 c.activity.push({ action: op, record: s.id, detail: { month: s.month, department: s.department } })
 return { id: s.id }
}
