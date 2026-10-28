import { filterCalculation } from './views'
import { ledgerEntity } from './ledger-scope'
import { scenarioAccess } from './scenario-access'
import { gaugeFreshness } from './gauge-freshness'
import { workingCalculation } from './calculation'
// Monthly review: actual against the approved budget and the forecast kept
// before the month closed, with the accepted rows and plan sources behind
// each difference. Drafts state what the evidence shows and mark anything
// else as an unconfirmed hypothesis; the department confirms the business
// explanation and finance publishes the pack.
import { requireCapability, requireDepartment, requireFinance, requireMember, seesDepartmentDetail, seesPayDetail } from './access'
import { rowsFor } from './actuals'
import { actorNames } from './actor-names'
import { linkedProposal } from './decision-followup'
import { mentions } from './notify'
import type { Context } from './context'
import { type Calculation, type Cell } from './engine'
import { departments, lines, model, workspace } from './model'
import { addMonths, monthLabel, monthsBetween, range } from './months'
import { snapshot } from './store'
import { packNumbers, packPeriod, templateBody } from './pack-body'
import { packTemplate, PACK_SECTIONS } from './pack-template'
import { versionComparison } from './version-comparison'
import { formatMoney } from './units'
import { all, find, get, put, requireThat, text, uid, type Access, type Data, type State } from './types'

const cellMap = (calc: Calculation, month: string) => new Map(calc.cells.filter(c => c.month === month).map(c => [`${c.line}|${c.department}`, c]))

export function forecastFor(s: State, month: string,scenario?:string) {
 const candidates=all(s,'scenario').filter(x=>x.kind==='forecast'&&!x.alternativeBudget)
 requireThat(scenario||candidates.length<=1,'Choose an explicit entity forecast for Review',409)
 const f=scenario?find(s,'scenario',scenario):candidates[0]
 requireThat(f?.kind==='forecast', 'Approve the budget first; the forecast opens then', 409)
 requireThat(f.actualsThrough && month <= f.actualsThrough, `${monthLabel(month)} is not closed yet`, 409)
 return f
}

/** Variance rows for a closed month. Detail the person may not see is removed here, on the server. */
export async function variance(c: Context, month: string,scenario?:string) {
 requireMember(c.x)
 const { s } = c
 const w = workspace(s)
 const forecast = forecastFor(s, month,scenario)
 scenarioAccess(s,c.x,forecast.id)
 const entity=ledgerEntity(s,forecast.id)
 const budget = await snapshot(c.db, forecast.budgetSnapshot)
 const prior = forecast.priorForecasts?.find((p: Data) => p.month === month)
 const priorBody = prior ? (await snapshot(c.db, prior.snapshot)).body : null
 const priorCalc: Calculation | null = priorBody?.calculation?filterCalculation(c.x,priorBody.calculation,lines(s).filter(l=>l.payroll).map(l=>l.id),s):null
 const currentCalc = filterCalculation(c.x,await workingCalculation(c,forecast.id,month),lines(s).filter(l=>l.payroll).map(l=>l.id),s)
 const actual = cellMap(currentCalc, month)
 const comparison = await versionComparison(c, forecast, budget, currentCalc, month)
 const budgetCalc=filterCalculation(c.x,budget.body.calculation,lines(s).filter(l=>l.payroll).map(l=>l.id),s)
 const planned = cellMap(budgetCalc, month)
 const kept = priorCalc ? cellMap(priorCalc, month) : new Map<string, Cell>()
 const next = cellMap(budgetCalc, addMonths(month, 1)), previous = cellMap(budgetCalc, addMonths(month, -1))
 const lineById = new Map<string, Data>([...comparison.lines, ...lines(s), ...budget.body.lines].map(l => [l.id, l])), deptById = new Map<string, Data>([...comparison.departments, ...departments(s), ...budget.body.departments].map(d => [d.id, d]))
 const money = (n: number) => formatMoney(n, currentCalc.currency)
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
  const citations = detail ? (await rowsFor(c.db,s,month,line,department,entity,c.x)) : []
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
  const saved = find(s,'explanation',`${entity?forecast.id+'|':''}${month}|${k}`)
  const explanation: Data | null = saved && (!payroll || seesPayDetail(c.x, department)) ? { ...saved, ...(saved.citationIds ? { citationIds: detail ? saved.citationIds : [] } : {}), ...(saved.claims ? { claims: saved.claims.map((claim: Data) => ({ ...claim, citationIds: detail ? claim.citationIds : [] })) } : {}) } : null
  rows.push({ key: k, line, lineName: l?.name ?? line, lineType: l?.type, payroll, department, departmentName: d?.name ?? 'No department', actual: a, budget: bud, priorForecast: priorCalc ? f : null, variance: v, forecastVariance: priorCalc ? a - f : null, favourable: v === 0 ? null : revenue ? v > 0 : v < 0, citations, planSources, hypotheses, draft, explanation, comparisons })
 }
 rows.sort((p, q) => Math.abs(q.variance) - Math.abs(p.variance) || p.key.localeCompare(q.key))
 const names = await actorNames(c.db, [budget.body.approvedBy?.email, ...rows.flatMap(row => [row.explanation?.writtenBy, row.explanation?.confirmedBy])])
 return { gaugeFreshness: [...(await gaugeFreshness(c, budget.body.inputs?.revenue ?? [], { months: [month] })).map(row => ({ ...row, version: 'Approved budget' })), ...(await gaugeFreshness(c, priorBody?.inputs?.revenue ?? [], { months: [month] })).map(row => ({ ...row, version: 'Prior forecast' }))], month, label: monthLabel(month), currency: currentCalc.currency, forecast: { id: forecast.id, revision: forecast.revision }, budget: { snapshot: budget.id, sha256: budget.sha256, approvedBy: budget.body.approvedBy, approvedAt: budget.body.approvedAt, revision: budget.body.revision }, priorForecast: prior ? prior.snapshot : null, rows, versions: comparison.versions, actorNames: names }
}

/** AGENT-007: citations bind accepted rows visible in this exact variance, never client-supplied evidence. */
async function explanationCitations(c: Context, month: string, line: string, department: string, ids: unknown,scenario?:string): Promise<string[]> {
 if (ids === undefined) return []
 requireThat(Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string' && id.length > 0), 'Citation IDs must be an array of at most 100 row IDs')
 const unique = [...new Set(ids as string[])]
 if (!unique.length) return []
 const row = (await variance(c,month,scenario)).rows.find(row => row.line === line && row.department === department)
 const visible = new Set(row?.citations.map(row => row.id) ?? [])
 requireThat(unique.every(id => visible.has(id)), 'A citation is not an accepted row visible in this variance')
 return unique
}

export async function review(c: Context, op: string, b: Data): Promise<Data | undefined> {
 const { s, x } = c
 if (op === 'pack-action-department') {
  requireCapability(x, 'publishing', s)
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
  const forecast=forecastFor(s,month,b.scenario)
  scenarioAccess(s,x,forecast.id)
  const line = get(s, 'line', b.line).id
  const department = b.department ? get(s, 'department', b.department).id : ''
  requireDepartment(x, department)
  const id = `${ledgerEntity(s,forecast.id)?forecast.id+'|':''}${month}|${line}|${department}`
  const prior = find(s, 'explanation', id)
  if (op === 'explanation') {
   requireThat(!prior || prior.status !== 'confirmed' || x.role === 'finance', 'This explanation is confirmed; finance can reopen it', 409)
   const citationIds = await explanationCitations(c, month, line, department, b.citationIds,b.scenario)
   put(s, 'explanation', id, { month, line, department, text: text(b.text, 'Explanation', 4000), citationIds, status: 'draft', writtenBy: x.actor.email, at: c.now })
   await mentions(c, b.text, department, `Variance explanation · ${month} · ${get(s, 'line', line).name}`, 'review', id)
  } else {
   requireThat(prior, 'Write the explanation first', 409)
   await explanationCitations(c, month, line, department, prior.citationIds)
   put(s, 'explanation', id, { ...prior, status: 'confirmed', confirmedBy: x.actor.email, confirmedAt: c.now })
  }
  c.activity.push({ action: op, record: id, detail: { month, line, department } })
  return get(s, 'explanation', id)
 }
 if (op === 'pack-create') {
  requireCapability(x, 'publishing', s)
  const month = typeof b.month === 'string' ? b.month : ''
  const forecast = forecastFor(s,month,b.scenario)
  const period = await packPeriod(c, forecast, b), template = packTemplate(c, b.template), last = period.months.at(-1)!
  requireThat(!all(s, 'pack').some(p => p.month === last && p.forecast===forecast.id && p.status === 'draft' && (p.period ?? 'month') === period.period), `A draft pack for ${period.label} already exists`, 409)
  const id = uid(), draft = { months: period.months, forecast: forecast.id, template: template.id }
  const { fingerprint } = await packNumbers(c, draft)
  put(s, 'pack', id, { month: last, period: period.period, months: period.months, label: period.label, forecast: forecast.id, status: 'draft', title: `${period.label} review`, template: template.id, sections: template.sections, decisions: [], generated: { fingerprint, at: c.now, by: x.actor.email }, refreshes: [], createdBy: x.actor.email, createdAt: c.now })
  c.activity.push({ action: op, record: id, detail: { month: last, period: period.period, template: template.id } })
  return get(s, 'pack', id)
 }
 if (op === 'pack-refresh') {
  requireCapability(x, 'publishing', s)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.status === 'draft', 'A published pack cannot be refreshed; start a new pack for the period', 409)
  const { fingerprint } = await packNumbers(c, pack)
  const changed = fingerprint !== pack.generated?.fingerprint
  const commentary = all(s, 'explanation').filter(e => (pack.months ?? [pack.month]).includes(e.month)).length
  put(s, 'pack', pack.id, { ...pack, generated: { fingerprint, at: c.now, by: x.actor.email }, refreshes: [...(pack.refreshes ?? []), { at: c.now, by: x.actor.email, before: pack.generated?.fingerprint ?? null, after: fingerprint, changed }] })
  c.activity.push({ action: op, record: pack.id, detail: { changed, commentaryKept: commentary } })
  return { pack: get(s, 'pack', pack.id), changed, commentaryKept: commentary }
 }
 if (op === 'pack-decision') {
  requireCapability(x, 'publishing', s)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.status === 'draft', 'A published pack cannot change; record follow-up on its actions', 409)
  const proposal = b.proposal ? linkedProposal(s, pack.forecast, b.proposal).id : ''
  const decision = { id: uid(), department: b.department ? get(s, 'department', b.department).id : '', text: text(b.text, 'Decision or action', 2000), owner: typeof b.owner === 'string' ? b.owner.slice(0, 200) : '', due: typeof b.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : '', status: 'open', ...(proposal ? { proposal } : {}) }
  put(s, 'pack', pack.id, { ...pack, decisions: [...pack.decisions, decision] })
  c.activity.push({ action: op, record: pack.id, detail: { decision: decision.text } })
  return get(s, 'pack', pack.id)
 }
 if (op === 'pack-publish') {
  requireCapability(x, 'publishing', s)
  const pack = get(s, 'pack', b.pack)
  requireThat(pack.status === 'draft', 'This pack is already published', 409)
  const w = workspace(s)
  const { numbers, fingerprint } = await packNumbers(c, pack)
  requireThat(b.fingerprint === undefined || b.fingerprint === fingerprint, 'The numbers changed after you reviewed this pack; refresh it and review the changes before publishing', 409)
  const sections: string[] = pack.sections ?? [...PACK_SECTIONS]
  const snapshotId = uid()
  c.snapshots.push({ id: snapshotId, kind: 'pack', scenario: pack.forecast, label: pack.title, body: {
   ...templateBody(numbers, sections),
   title: pack.title, company: w.name, month: pack.month, period: pack.period ?? 'month', months: pack.months ?? [pack.month], label: pack.label ?? monthLabel(pack.month), currency: w.currency, status: 'published',
   template: pack.template ?? 'default', sections, fingerprint,
   decisions: sections.includes('decisions') ? pack.decisions : [], publishedBy: { email: x.actor.email, name: x.actor.name }, publishedAt: c.now,
  } })
  put(s, 'pack', pack.id, { ...pack, status: 'published', snapshot: snapshotId, publishedBy: x.actor.email, publishedAt: c.now })
  c.activity.push({ action: op, record: pack.id, detail: { month: pack.month, snapshot: snapshotId } })
  return get(s, 'pack', pack.id)
 }
 if (op === 'action-status') {
  requireCapability(x, 'publishing', s)
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
