// Monthly department statements are scoped before they are stored or mailed.
import { requireFinance, requireMember } from './access'
import type { Context } from './context'
import { departments, workspace } from './model'
import { monthLabel } from './months'
import { variance } from './review'
import { all, find, get, put, requireThat, uid, type Data } from './types'

export function queueDepartmentStatements(c: Context, month: string) {
 const ids: string[] = []
 for (const d of departments(c.s)) {
  const recipients = all(c.s, 'member').filter(m => m.active && m.role === 'contributor' && m.departments?.includes(d.id)).map(m => m.email)
  if (!recipients.length || all(c.s, 'department-statement').some(s => s.month === month && s.department === d.id)) continue
  const id = uid()
  put(c.s, 'department-statement', id, { month, label: monthLabel(month), currency: workspace(c.s).currency, department: d.id, departmentName: d.name, createdAt: c.now, rows: null,
   deliveries: recipients.map(recipient => ({ recipient, deliveryId: uid(), status: 'pending', attempts: 0 })) })
  c.activity.push({ action: 'department-statement-queued', record: id, detail: { month, department: d.id, recipients: recipients.length } })
  ids.push(id)
 }
 return ids
}

const canRead = (c: Context, s: Data) => c.x.role === 'finance' || c.x.role === 'contributor' && c.x.departments.includes(s.department)

export function statementWork(c: Context, s: Data): Data {
 const rows = (s.rows ?? []).map((r: Data) => ({ ...r, explanation: find(c.s, 'explanation', `${s.month}|${r.line}|${s.department}`) ?? null }))
 const metricTasks = all(c.s, 'metric-task').filter(t => t.department === s.department && t.status === 'open').map(t => ({ id: t.id, name: t.name, owner: t.owner, due: t.due, revision: t.revision, evidence: { summary: t.evidence.summary } }))
 const submissions = all(c.s, 'submission').filter(t => t.department === s.department && ['requested', 'returned'].includes(t.status)).map(t => ({ id: t.id, name: `Submit department budget · ${s.departmentName}`, owner: 'Department contributors', due: t.due, evidence: { summary: `Submission ${t.status}; requested ${t.requestedAt}.` } }))
 const actions = all(c.s, 'pack').filter(p => p.status === 'published').flatMap(p => p.decisions.filter((d: Data) => p.progress?.[d.id]?.status !== 'done' && (find(c.s, 'pack-action-department', `${p.id}|${d.id}`)?.department ?? d.department ?? '') === s.department).map((d: Data) => ({ id: `${p.id}|${d.id}`, name: d.text, owner: d.owner, due: d.due, evidence: { summary: `Published action in ${p.title}.` } })))
 const tasks = [...metricTasks, ...submissions, ...actions]
 const toConfirm = rows.filter((r: Data) => r.explanation?.status !== 'confirmed' && (r.variance !== 0 || r.explanation))
 return { ...s, rows, topVariances: [...rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5), tasks, toConfirm }
}

export async function captureDepartmentStatement(c: Context, id: string) {
 const statement = get(c.s, 'department-statement', id)
 if (statement.rows !== null) return statement
 const v = await variance(c, statement.month)
 const rows = v.rows.filter(r => r.department === statement.department).map(r => ({ key: r.key, line: r.line, lineName: r.lineName, actual: r.actual, budget: r.budget, variance: r.variance, citations: r.citations }))
 const captured = { ...statement, rows, capturedAt: c.now }
 put(c.s, 'department-statement', id, captured)
 c.activity.push({ action: 'department-statement-captured', record: id, detail: { month: statement.month, department: statement.department, rows: rows.length } })
 return captured
}

export async function departmentStatementList(c: Context, month?: string) {
 requireMember(c.x)
 requireThat(c.x.role !== 'viewer', 'Department statements are for finance and department contributors', 403)
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
