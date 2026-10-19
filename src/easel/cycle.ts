// The budget cycle: finance requests department submissions, contributors
// revise and submit their own scope, finance returns or approves. Approval
// freezes the budget into an immutable snapshot and opens the forecast.
// Closing a month keeps the prior forecast before actuals replace the plan.
import { requireDepartment, requireFinance, requireMember } from './access'
import type { Context } from './context'
import { calculate } from './engine'
import { departments, model, scenarioInputs, workspace, INPUT_KINDS } from './model'
import { addMonths, fiscalYearLabel, monthLabel, monthsBetween } from './months'
import { bump, copyInputs } from './plan'
import { all, find, get, put, requireThat, text, uid, integer, type Data } from './types'

export async function cycle(c: Context, op: string, b: Data): Promise<Data | undefined> {
 const { s, x } = c
 if (op === 'request-submissions') {
  requireFinance(x)
  const budget = get(s, 'scenario', b.scenario, 'budget')
  requireThat(budget.kind === 'budget' && budget.status === 'working', 'Submissions are requested for a working budget', 409)
  const ids: string[] = Array.isArray(b.departments) ? b.departments : [b.departments]
  requireThat(ids.length > 0 && ids.every(Boolean), 'Choose departments')
  const due = typeof b.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : ''
  for (const d of ids) {
   const dept = get(s, 'department', d)
   const prior = find(s, 'submission', `${budget.id}|${dept.id}`)
   requireThat(!prior || prior.status !== 'submitted', `${dept.name} has already submitted`, 409)
   put(s, 'submission', `${budget.id}|${dept.id}`, { scenario: budget.id, department: dept.id, status: 'requested', due, requestedBy: x.actor.email, requestedAt: c.now, history: [...(prior?.history ?? []), { status: 'requested', by: x.actor.email, at: c.now }] })
  }
  c.activity.push({ action: op, record: budget.id, scenario: budget.id, detail: { departments: ids, due } })
  return { submissions: all(s, 'submission').filter(x => x.scenario === budget.id) }
 }
 if (op === 'comment') {
  requireMember(x)
  const scenario = get(s, 'scenario', b.scenario)
  const dept = get(s, 'department', b.department)
  requireDepartment(x, dept.id)
  const id = uid()
  put(s, 'comment', id, { scenario: scenario.id, department: dept.id, author: x.actor.email, authorName: x.actor.name, text: text(b.text, 'Comment', 4000), at: c.now, revision: scenario.revision })
  c.activity.push({ action: op, record: id, scenario: scenario.id, detail: { department: dept.id } })
  return get(s, 'comment', id)
 }
 if (op === 'submit') {
  requireMember(x)
  const sub = get(s, 'submission', `${b.scenario}|${b.department}`, 'submission')
  requireDepartment(x, sub.department)
  requireThat(['requested', 'returned'].includes(sub.status), 'This department has already submitted', 409)
  const scenario = get(s, 'scenario', sub.scenario)
  requireThat(scenario.status === 'working', 'The budget is already approved', 409)
  put(s, 'submission', sub.id, { ...sub, status: 'submitted', submittedBy: x.actor.email, submittedAt: c.now, submittedRevision: scenario.revision, note: typeof b.note === 'string' ? b.note.slice(0, 2000) : '', history: [...sub.history, { status: 'submitted', by: x.actor.email, at: c.now, revision: scenario.revision }] })
  c.activity.push({ action: op, record: sub.id, scenario: scenario.id, before: scenario.revision, after: scenario.revision, detail: { department: sub.department } })
  return get(s, 'submission', sub.id)
 }
 if (op === 'return-submission') {
  requireFinance(x)
  const sub = get(s, 'submission', `${b.scenario}|${b.department}`, 'submission')
  requireThat(sub.status === 'submitted', 'Only a submitted department can be returned', 409)
  const reason = text(b.reason, 'Reason', 2000)
  put(s, 'submission', sub.id, { ...sub, status: 'returned', history: [...sub.history, { status: 'returned', by: x.actor.email, at: c.now, reason }] })
  c.activity.push({ action: op, record: sub.id, scenario: sub.scenario, detail: { department: sub.department, reason } })
  return get(s, 'submission', sub.id)
 }
 if (op === 'approve-budget') {
  requireFinance(x)
  const budget = get(s, 'scenario', b.scenario, 'budget')
  requireThat(budget.kind === 'budget' && budget.status === 'working', 'Only a working budget can be approved', 409)
  requireThat(Number(b.revision) === budget.revision, 'The budget changed after you reviewed it; review its current revision', 409)
  const open = all(s, 'submission').filter(x => x.scenario === budget.id && x.status !== 'submitted')
  requireThat(!open.length, `Waiting for submissions from ${open.map(o => find(s, 'department', o.department)?.name).join(', ')}`, 409)
  const w = workspace(s)
  const m = model(s, budget.id)
  const calculation = calculate(m)
  const snapshotId = uid()
  c.snapshots.push({ id: snapshotId, kind: 'approval', scenario: budget.id, label: `${budget.name} approved at revision ${budget.revision}`, body: {
   scenario: { ...budget, status: 'frozen' }, workspace: w, lines: m.lines, departments: m.departments, inputs: m.inputs, calculation,
   approvedBy: { email: x.actor.email, name: x.actor.name }, approvedAt: c.now, revision: budget.revision,
   submissions: all(s, 'submission').filter(x => x.scenario === budget.id), note: typeof b.note === 'string' ? b.note.slice(0, 2000) : '',
  } })
  put(s, 'scenario', budget.id, { ...budget, status: 'frozen', approval: { snapshot: snapshotId, by: x.actor.email, at: c.now, revision: budget.revision } })
  c.activity.push({ action: op, record: budget.id, scenario: budget.id, before: budget.revision, after: budget.revision, detail: { snapshot: snapshotId } })
  const forecastId = uid()
  put(s, 'scenario', forecastId, { name: `${fiscalYearLabel(w.planStart)} forecast`, kind: 'forecast', status: 'working', revision: 1, createdBy: x.actor.email, createdAt: c.now, parent: budget.id, branchedFrom: { scenario: budget.id, revision: budget.revision, name: budget.name }, budgetSnapshot: snapshotId, actualsThrough: null, cash: budget.cash })
  copyInputs(s, budget.id, forecastId)
  c.activity.push({ action: 'forecast-opened', record: forecastId, scenario: forecastId, after: 1, detail: { from: budget.id } })
  return { budget: get(s, 'scenario', budget.id), forecast: get(s, 'scenario', forecastId), snapshot: snapshotId }
 }
 if (op === 'forecast-window') {
  requireFinance(x)
  const forecast = get(s, 'scenario', b.scenario, 'forecast')
  requireThat(forecast.kind === 'forecast' && forecast.status === 'working', 'Set the window on the working forecast', 409)
  requireThat(Number(b.revision) === forecast.revision, 'The forecast changed; reload before changing its window', 409)
  const rollingWindow = integer(b.months, 'Months ahead', 12, 60)
  const w = workspace(s)
  const closed = forecast.actualsThrough ? monthsBetween(w.planStart, forecast.actualsThrough) + 1 : 0
  put(s, 'scenario', forecast.id, { ...forecast, rollingWindow, horizon: closed + rollingWindow })
  bump(c, get(s, 'scenario', forecast.id), op, forecast.id, { rollingWindow })
  return get(s, 'scenario', forecast.id)
 }
 if (op === 'close-month') {
  requireFinance(x)
  const forecast = get(s, 'scenario', b.scenario, 'forecast')
  requireThat(forecast.kind === 'forecast' && forecast.status === 'working', 'Months close on the working forecast', 409)
  const w = workspace(s)
  const next = forecast.actualsThrough ? addMonths(forecast.actualsThrough, 1) : w.planStart
  requireThat(b.month === next, `The next month to close is ${monthLabel(next)}`, 409)
  requireThat(next <= addMonths(w.planStart, (forecast.horizon ?? w.horizon) - 1), 'Every plan month is already closed', 409)
  const covered = await c.db.prepare('SELECT COUNT(*) AS n FROM e_actuals WHERE period=?').bind(next).first<{ n: number }>()
  requireThat(Number(covered?.n) > 0, `No accepted actuals cover ${monthLabel(next)} yet`, 409)
  const pending = all(s, 'batch').filter(x => x.status === 'importing' || x.status === 'undoing')
  requireThat(!pending.length, 'Finish or undo the import in progress first', 409)
  const priorCalc = calculate(model(s, forecast.id), await c.actuals(next))
  const snapshotId = uid()
  c.snapshots.push({ id: snapshotId, kind: 'forecast', scenario: forecast.id, label: `Forecast before closing ${monthLabel(next)}`, body: { scenario: forecast, workspace: model(s, forecast.id).workspace, month: next, calculation: priorCalc, inputs: Object.fromEntries(INPUT_KINDS.map(k => [k, scenarioInputs(s, forecast.id, k)])), keptBy: x.actor.email, at: c.now } })
  put(s, 'scenario', forecast.id, { ...forecast, ...(forecast.rollingWindow ? { horizon: monthsBetween(w.planStart, next) + 1 + forecast.rollingWindow } : {}), actualsThrough: next, priorForecasts: [...(forecast.priorForecasts ?? []), { month: next, snapshot: snapshotId }] })
  bump(c, get(s, 'scenario', forecast.id), op, forecast.id, { month: next, priorForecast: snapshotId })
  return get(s, 'scenario', forecast.id)
 }
 return undefined
}

export const departmentNames = (c: Context) => Object.fromEntries(departments(c.s).map(d => [d.id, d.name]))
