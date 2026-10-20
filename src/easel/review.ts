import { workingCalculation } from './calculation'
import { aggregateFinancing } from './financing-view'
// Monthly review: actual against the approved budget and the forecast kept
// before the month closed, with the accepted rows and plan sources behind
// each difference. Drafts state what the evidence shows and mark anything
// else as an unconfirmed hypothesis; the department confirms the business
// explanation and finance publishes the pack.
import { requireDepartment, requireFinance, requireMember, seesDepartmentDetail, seesPayDetail } from './access'
import { rowsFor } from './actuals'
import { actorNames } from './actor-names'
import { mentions } from './notify'
import type { Context } from './context'
import { type Calculation, type Cell } from './engine'
import { departments, lines, model, workspace } from './model'
import { addMonths, monthLabel, range } from './months'
import { snapshot } from './store'
import { versionComparison } from './version-comparison'
import { formatMoney } from './units'
import { all, find, get, put, requireThat, text, uid, type Access, type Data, type State } from './types'

const cellMap = (calc: Calculation, month: string) => new Map(calc.cells.filter(c => c.month === month).map(c => [`${c.line}|${c.department}`, c]))

export function forecastFor(s: State, month: string) {
 const f = all(s, 'scenario').find(x => x.kind === 'forecast' && !x.alternativeBudget)
 requireThat(f, 'Approve the budget first; the forecast opens then', 409)
 requireThat(f.actualsThrough && month <= f.actualsThrough, `${monthLabel(month)} is not closed yet`, 409)
 return f
}

/** Variance rows for a closed month. Detail the person may not see is removed here, on the server. */
export async function variance(c: Context, month: string) {
 requireMember(c.x)
 const { s } = c
 const w = workspace(s)
 const forecast = forecastFor(s, month)
 const budget = await snapshot(c.db, forecast.budgetSnapshot)
 const prior = forecast.priorForecasts?.find((p: Data) => p.month === month)
 const priorCalc: Calculation | null = prior ? (await snapshot(c.db, prior.snapshot)).body.calculation : null
 const currentCalc = await workingCalculation(c, forecast.id, month)
 const actual = cellMap(currentCalc, month)
 const comparison = await versionComparison(c, forecast, budget, currentCalc, month)
 const planned = cellMap(budget.body.calculation, month)
 const kept = priorCalc ? cellMap(priorCalc, month) : new Map<string, Cell>()
 const next = cellMap(budget.body.calculation, addMonths(month, 1)), previous = cellMap(budget.body.calculation, addMonths(month, -1))
 const lineById = new Map<string, Data>([...comparison.lines, ...lines(s), ...budget.body.lines].map(l => [l.id, l])), deptById = new Map<string, Data>([...comparison.departments, ...departments(s), ...budget.body.departments].map(d => [d.id, d]))
 const money = (n: number) => formatMoney(n, w.currency)
 const keys = [...new Set([...actual.keys(), ...planned.keys(), ...kept.keys(), ...comparison.keys])]
 const rows = []
 for (const k of keys) {
  const [line, department] = k.split('|')
  const a = actual.get(k)?.amount ?? 0, bud = planned.get(k)?.amount ?? 0, f = kept.get(k)?.amount ?? 0
  const comparisons = comparison.comparisons(k, a)
  if (a === 0 && bud === 0 && f === 0 && comparisons.every(v => !v.amount)) continue
  const l = lineById.get(line), d = deptById.get(department)
  const v = a - bud
  const revenue = l?.type === 'revenue'
  const payroll = l?.payroll === true || (planned.get(k)?.sources ?? []).some(source => source.kind === 'position')
  const detail = seesDepartmentDetail(c.x, department) && (!payroll || seesPayDetail(c.x, department))
  const citations = detail ? (await rowsFor(c.db, s, month, line, department)) : []
  const planSources = detail ? (planned.get(k)?.sources ?? []).map(x => x.trace) : []
  // A budgeted item in the neighbouring month that matches the difference
  // suggests timing. It stays a hypothesis until the department confirms it.
  const near = (amount: number) => Math.abs(Math.abs(v) - Math.abs(amount)) <= Math.max(100, Math.abs(v) / 20)
  const hypotheses = v === 0 || !detail ? [] : ([[next, addMonths(month, 1)], [previous, addMonths(month, -1)]] as const).flatMap(([cells, m]) =>
   (cells.get(k)?.sources ?? []).filter(src => src.amount !== 0 && near(src.amount) && !(planned.get(k)?.sources ?? []).some(here => here.id === src.id)).map(src => `Possibly timing: ${src.label} (${money(src.amount)}) is budgeted in ${monthLabel(m)}. This is a hypothesis until the department confirms it.`))
  const direction = v === 0 ? 'on budget' : `${v > 0 ? 'above' : 'below'} budget by ${money(Math.abs(v))} (${(revenue ? v > 0 : v < 0) ? 'favourable' : 'unfavourable'})`
  const draft = [
   `${l?.name ?? 'Unknown line'} · ${d?.name ?? 'No department'}, ${monthLabel(month)}: actual ${money(a)} against budget ${money(bud)}, ${direction}.`,
   detail ? (citations.length ? `Actuals come from accepted rows including ${citations.slice(0, 3).map(r => `${r.file} line ${r.line} (${r.description || r.reference || r.account}, ${money(r.amount)})`).join('; ')}.` : 'No accepted rows map to this line and department.') : 'Row-level detail is restricted to finance and this department.',
   detail && planSources.length ? `The budget came from: ${planSources.slice(0, 3).join(' | ')}.` : '',
   ...hypotheses,
  ].filter(Boolean).join(' ')
  const saved = find(s, 'explanation', `${month}|${k}`)
  rows.push({ key: k, line, lineName: l?.name ?? line, lineType: l?.type, payroll, department, departmentName: d?.name ?? 'No department', actual: a, budget: bud, priorForecast: priorCalc ? f : null, variance: v, forecastVariance: priorCalc ? a - f : null, favourable: v === 0 ? null : revenue ? v > 0 : v < 0, citations, planSources, hypotheses, draft, explanation: !payroll || seesPayDetail(c.x, department) ? saved ?? null : null, comparisons })
 }
 rows.sort((p, q) => Math.abs(q.variance) - Math.abs(p.variance) || p.key.localeCompare(q.key))
 const names = await actorNames(c.db, [budget.body.approvedBy?.email, ...rows.flatMap(row => [row.explanation?.writtenBy, row.explanation?.confirmedBy])])
 return { month, label: monthLabel(month), currency: w.currency, forecast: { id: forecast.id, revision: forecast.revision }, budget: { snapshot: budget.id, sha256: budget.sha256, approvedBy: budget.body.approvedBy, approvedAt: budget.body.approvedAt, revision: budget.body.revision }, priorForecast: prior ? prior.snapshot : null, rows, versions: comparison.versions, actorNames: names }
}

export async function review(c: Context, op: string, b: Data): Promise<Data | undefined> {
 const { s, x } = c
 if (op === 'pack-action-department') {
  requireFinance(x)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.decisions.some((d: Data) => d.id === b.decision), 'Action not found', 404)
  const department = b.department ? get(s, 'department', b.department).id : ''
  const id = `${pack.id}|${b.decision}`
  put(s, 'pack-action-department', id, { pack: pack.id, decision: b.decision, department, by: x.actor.email, at: c.now })
  c.activity.push({ action: op, record: id, detail: { pack: pack.id, decision: b.decision, department } })
  return get(s, 'pack-action-department', id)
 }
 if (op === 'explanation' || op === 'explanation-confirm') {
  requireMember(x)
  const month = typeof b.month === 'string' ? b.month : ''
  forecastFor(s, month)
  const line = get(s, 'line', b.line).id
  const department = b.department ? get(s, 'department', b.department).id : ''
  requireDepartment(x, department)
  const id = `${month}|${line}|${department}`
  const prior = find(s, 'explanation', id)
  if (op === 'explanation') {
   requireThat(!prior || prior.status !== 'confirmed' || x.role === 'finance', 'This explanation is confirmed; finance can reopen it', 409)
   put(s, 'explanation', id, { month, line, department, text: text(b.text, 'Explanation', 4000), status: 'draft', writtenBy: x.actor.email, at: c.now })
   await mentions(c, b.text, department, `Variance explanation · ${month} · ${get(s, 'line', line).name}`, 'review', id)
  } else {
   requireThat(prior, 'Write the explanation first', 409)
   put(s, 'explanation', id, { ...prior, status: 'confirmed', confirmedBy: x.actor.email, confirmedAt: c.now })
  }
  c.activity.push({ action: op, record: id, detail: { month, line, department } })
  return get(s, 'explanation', id)
 }
 if (op === 'pack-create') {
  requireFinance(x)
  const month = typeof b.month === 'string' ? b.month : ''
  const forecast = forecastFor(s, month)
  requireThat(!all(s, 'pack').some(p => p.month === month && p.status === 'draft'), `A draft pack for ${monthLabel(month)} already exists`, 409)
  const id = uid()
  put(s, 'pack', id, { month, forecast: forecast.id, status: 'draft', title: `${monthLabel(month)} review`, decisions: [], createdBy: x.actor.email, createdAt: c.now })
  c.activity.push({ action: op, record: id, detail: { month } })
  return get(s, 'pack', id)
 }
 if (op === 'pack-decision') {
  requireFinance(x)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.status === 'draft', 'A published pack cannot change; record follow-up on its actions', 409)
  const decision = { id: uid(), department: b.department ? get(s, 'department', b.department).id : '', text: text(b.text, 'Decision or action', 2000), owner: typeof b.owner === 'string' ? b.owner.slice(0, 200) : '', due: typeof b.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : '', status: 'open' }
  put(s, 'pack', pack.id, { ...pack, decisions: [...pack.decisions, decision] })
  c.activity.push({ action: op, record: pack.id, detail: { decision: decision.text } })
  return get(s, 'pack', pack.id)
 }
 if (op === 'pack-publish') {
  requireFinance(x)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.status === 'draft', 'This pack is already published', 409)
  const w = workspace(s)
  const v = await variance(c, pack.month)
  const forecast = get(s, 'scenario', pack.forecast)
  const forecastCalc = await workingCalculation(c, forecast.id, forecast.actualsThrough)
  const budget = await snapshot(c.db, forecast.budgetSnapshot)
  const ytd = range(w.planStart, w.horizon).filter(m => m <= pack.month)
  const reportLines: Data[] = [...new Map([...lines(s), ...budget.body.lines].map(l => [l.id, l])).values()]
  const lineRows = reportLines.map(l => ({
   line: l.name, type: l.type,
   actual: forecastCalc.lineTotals[l.id]?.[pack.month] ?? 0, budget: budget.body.calculation.lineTotals[l.id]?.[pack.month] ?? 0,
   ytdActual: ytd.reduce((a, m) => a + (forecastCalc.lineTotals[l.id]?.[m] ?? 0), 0), ytdBudget: ytd.reduce((a, m) => a + (budget.body.calculation.lineTotals[l.id]?.[m] ?? 0), 0),
  }))
  const batches = all(s, 'batch').filter(x => x.status === 'accepted' && x.periods.includes(pack.month)).map(x => ({ file: x.file, sha256: x.sha256, rows: x.accepted, acceptedBy: x.acceptedBy, acceptedAt: x.acceptedAt }))
  const snapshotId = uid()
  c.snapshots.push({ id: snapshotId, kind: 'pack', scenario: forecast.id, label: pack.title, body: {
   title: pack.title, company: w.name, month: pack.month, currency: w.currency, status: 'published',
   versionComparison: { currency: w.currency, versions: v.versions, rows: v.rows.map(r => ({ key: r.key, lineName: r.lineName, departmentName: r.departmentName, actual: r.actual, comparisons: r.comparisons })) },
   budget: v.budget, forecast: { id: forecast.id, name: forecast.name, revision: forecast.revision, actualsThrough: forecast.actualsThrough }, priorForecast: v.priorForecast,
   lines: lineRows, profit: { month: forecastCalc.profit.find(p => p.month === pack.month), budget: budget.body.calculation.profit.find((p: Data) => p.month === pack.month) },
   ...(forecastCalc.contracts ? { contracts: { ...forecastCalc.contracts, rows: [], invoices: [] }, balanceSheet: forecastCalc.balanceSheet, cashFlow: forecastCalc.cashFlow } : {}),
   ...(forecastCalc.workingCapital ? { workingCapital: { ...forecastCalc.workingCapital, rows: [], issues: [] } } : {}),
   ...(forecastCalc.financing ? { financing: aggregateFinancing(forecastCalc.financing) } : {}),
   assets: forecastCalc.months.map(month => ({ month, ...Object.fromEntries(['openingBookValue', 'depreciation', 'disposalBookValue', 'closingBookValue', 'capex', 'disposalProceeds'].map(key => [key, (forecastCalc.assets ?? []).filter(a => a.month === month).reduce((n, a) => n + Number(a[key as keyof typeof a]), 0)])) })),
   cash: forecastCalc.cash.map(m => ({ ...(m.incompleteReasons ? { incompleteReasons: m.incompleteReasons } : {}), month: m.month, closing: m.closing, budget: budget.body.calculation.cash.find((b: Data) => b.month === m.month)?.closing ?? null })),
   // Pack readers include viewers: individual pay detail never enters the pack.
   variances: v.rows.map(r => ({ line: r.lineName, department: r.departmentName, actual: r.actual, budget: r.budget, priorForecast: r.priorForecast, variance: r.variance, favourable: r.favourable, explanation: !r.payroll && r.explanation ? { text: r.explanation.text, status: r.explanation.status, confirmedBy: r.explanation.confirmedBy ?? null } : null, evidence: [...lines(s), ...budget.body.lines].some(l => l.id === r.line && l.payroll) ? [] : r.citations.map((x: Data) => `${x.file} line ${x.line}`) })),
   sources: batches, decisions: pack.decisions, publishedBy: { email: x.actor.email, name: x.actor.name }, publishedAt: c.now,
  } })
  put(s, 'pack', pack.id, { ...pack, status: 'published', snapshot: snapshotId, publishedBy: x.actor.email, publishedAt: c.now })
  c.activity.push({ action: op, record: pack.id, detail: { month: pack.month, snapshot: snapshotId } })
  return get(s, 'pack', pack.id)
 }
 if (op === 'action-status') {
  requireFinance(x)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.decisions.some((d: Data) => d.id === b.decision), 'Action not found', 404)
  const status = b.status === 'done' ? 'done' : 'open'
  put(s, 'pack', pack.id, { ...pack, progress: { ...(pack.progress ?? {}), [b.decision]: { status, by: x.actor.email, at: c.now, note: typeof b.note === 'string' ? b.note.slice(0, 1000) : '' } } })
  c.activity.push({ action: op, record: pack.id, detail: { decision: b.decision, status } })
  return get(s, 'pack', pack.id)
 }
 return undefined
}

export const canReadPack = (x: Access) => x.role !== null
