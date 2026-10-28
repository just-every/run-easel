import { workingCalculation } from './calculation'
import { pipelineCoverage } from './pipeline-coverage'
// Refresh creates explicit, cited work. A blocked source is visible to finance;
// it never supplies a made-up zero or a conclusion to a contributor.
import { cashHealth } from './cash-health'
import type { Context } from './context'
import { type Calculation } from './engine'
import { model, workspace } from './model'
import { validMetricOwner } from './metric-rules'
import { snapshot } from './store'
import { notify } from './notify'
import { Fault, all, put, uid, type Data } from './types'
import { formatHundredths, formatMoney } from './units'

const triggers = new Set(['metric-refresh', 'metric-rule-save', 'actuals-accepted', 'close-month','pipeline-refresh'])
export const needsMetricRefresh = (c: Context) => c.activity.some(e => triggers.has(e.action))

function overspend(rule: Data, c: Context, forecast: Data, calc: Calculation, budget: Data) {
 const budgetCalc = budget.body.calculation as Calculation
 const costLines = new Set(model(c.s, forecast.id).lines.filter(l => l.type !== 'revenue').map(l => l.id))
 const budgetCosts = new Set(budget.body.lines.filter((l: Data) => l.type !== 'revenue').map((l: Data) => l.id))
 const hits: Data[] = []
 for (const month of calc.months.filter(m => forecast.actualsThrough && m <= forecast.actualsThrough)) {
  // A missing budget period is unknown, rather than an invented zero budget.
  if (!budgetCalc.months.includes(month)) continue
  const actual = calc.cells.filter(r => r.month === month && r.department === rule.department && costLines.has(r.line)).reduce((sum, r) => sum + r.amount, 0)
  const planned = budgetCalc.cells.filter(r => r.month === month && r.department === rule.department && budgetCosts.has(r.line)).reduce((sum, r) => sum + r.amount, 0)
  const variance = actual - planned
  const exceedsPercent = planned <= 0 ? actual > 0 && variance > 0 : BigInt(variance) * 10000n > BigInt(planned) * BigInt(rule.percentBps)
  if (variance <= rule.amountCents || !exceedsPercent) continue
  const sources = all(c.s, 'batch').filter(b => b.status === 'accepted' && b.periods.includes(month)).map(b => `${b.file} · SHA-256 ${b.sha256}`)
  hits.push({ month, dedup: `${rule.id}|${month}`, evidence: { kind: 'overspend', currency: rule.currency, actual, budget: planned, variance, percentBps: rule.percentBps, minimumCents: rule.amountCents, budgetSnapshot: budget.id, budgetSha256: budget.sha256, forecastRevision: forecast.revision,
   summary: `${month}: actual expense ${formatMoney(actual, rule.currency)}, budget ${formatMoney(planned, rule.currency)}, variance ${formatMoney(variance, rule.currency)}; exceeds both ${formatHundredths(rule.percentBps)}% and ${formatMoney(rule.amountCents, rule.currency)}.`,
   sources: [`Approved budget revision ${budget.body.revision} · SHA-256 ${budget.sha256}`, `Forecast revision ${forecast.revision}`, ...sources] } })
 }
 return hits
}

function runway(rule: Data, forecast: Data, calc: Calculation) {
 const health = cashHealth(calc.cash, forecast.actualsThrough ?? null, calc.currency, { floorCents: 0, runwayMinimumHundredths: rule.runwayHundredths, currency: rule.currency, by: rule.updatedBy, at: rule.updatedAt })
 const r = health.months.find(r => (!forecast.actualsThrough || r.month > forecast.actualsThrough) && r.runwayBreached)
 if (!r) return []
 return [{ month: r.month, dedup: `${rule.id}|${forecast.id}`, evidence: { kind: 'runway', currency: rule.currency, closing: r.closing, trailingNetBurnCents: r.trailingNetBurnCents, trailingMonths: r.trailingMonths, runwayHundredths: r.runwayHundredths, runwayBasis: r.runwayBasis, thresholdHundredths: rule.runwayHundredths, forecastRevision: forecast.revision,
  summary: `${r.month}: closing cash ${formatMoney(r.closing, rule.currency)}, net burn ${formatMoney(r.trailingNetBurnCents, rule.currency)} over ${r.trailingMonths} month(s); runway ${r.runwayHundredths === null ? 'cash exhausted' : formatHundredths(r.runwayHundredths) + ' months'}, below ${formatHundredths(rule.runwayHundredths)} months.`,
  sources: [`Forecast ${forecast.name} revision ${forecast.revision}; trailing cash collections and payments (${r.trailingMonths} month(s)).`] } }]
}

export async function evaluateMetricTasks(c: Context) {
 const created: string[] = [], blocked: Data[] = []
 const forecast = all(c.s, 'scenario').find(s => s.kind === 'forecast' && !s.alternativeBudget)
 const w = workspace(c.s)
 // Pending multi-batch imports must not produce final conclusions.
 const pending = all(c.s, 'batch').some(b => ['importing', 'undoing'].includes(b.status))
 for (const rule of all(c.s, 'metric-rule').filter(r => r.enabled)) {
  let reason = ''
  if (!forecast) reason = 'Approve the operating budget before checking metrics.'
  else if (pending) reason = 'Complete the in-progress actuals import before checking metrics.'
  else if (rule.currency !== w.currency) reason = 'The reporting currency changed; review and save this rule in the new currency.'
  else if (!(await validMetricOwner(c, rule))) reason = 'The task owner no longer has the required active role and department; choose another owner.'
  let hits: Data[] = []
  if (!reason && forecast) {
   try {
    const calc = await workingCalculation(c, forecast.id)
    if(rule.kind==='pipeline-coverage'){
     const inputs=model(c.s,forecast.id).inputs.revenue
     const coverage=pipelineCoverage(inputs,forecast.actualsThrough ?? c.now.slice(0,7),w.fiscalYearStart ?? 1,forecast.pipelineCoverageTargetCents ?? 0,rule.department,forecast.pipelineSources,w.currency)
     if(coverage.coverageBps===null)reason='Accepted pipeline and a positive finance-set quarterly bookings target are required; coverage is unavailable.'
     else if(coverage.coverageBps<rule.coverageBps)hits=[{month:coverage.from,dedup:`${rule.id}|${forecast.id}|${coverage.from}`,evidence:{kind:'pipeline-coverage',currency:w.currency,...coverage,thresholdBps:rule.coverageBps,forecastRevision:forecast.revision,summary:`${coverage.from} through ${coverage.to}: weighted open bookings ${formatMoney(coverage.weightedCents,w.currency)} / finance quarterly target ${formatMoney(coverage.targetCents,w.currency)} = ${formatHundredths(coverage.coverageBps)}% coverage, below ${formatHundredths(rule.coverageBps)}%.`,sources:coverage.sources}}]
    } else if (rule.kind === 'overspend') {
     const budget = await snapshot(c.db, forecast.budgetSnapshot)
     if (budget.body.calculation.currency !== rule.currency) reason = 'The approved budget has a different currency; this rule cannot compare those amounts.'
     else if (forecast.actualsThrough && !budget.body.calculation.months.includes(forecast.actualsThrough)) reason = 'The latest closed month has no approved budget period; only covered months can be compared.'
     if (!reason) hits = overspend(rule, c, forecast, calc, budget)
    } else if (calc.cash.some(row => row.incompleteReasons?.length)) reason = 'Incomplete contract receipt allocation; runway conclusions unavailable until the cash reconciliation is resolved.'
    else hits = runway(rule, forecast, calc)
   } catch (e) {
    if (e instanceof Fault && e.status === 409) reason = e.message
    else throw e
   }
  }
  put(c.s, 'metric-rule', rule.id, { ...rule, lastEvaluatedAt: c.now, blocked: reason })
  if (reason) { blocked.push({ rule: rule.id, reason }); continue }
  for (const hit of hits) {
   if (all(c.s, 'metric-task').some(t => t.dedup === hit.dedup && t.status === 'open')) continue
   const due = new Date(c.now)
   due.setUTCDate(due.getUTCDate() + rule.dueDays)
   const id = uid()
   put(c.s, 'metric-task', id, { name: rule.name, rule: rule.id, ruleRevision: rule.revision, scenario: forecast!.id, department: rule.department, month: hit.month, owner: rule.owner, due: due.toISOString().slice(0, 10), status: 'open', revision: 1, createdAt: c.now, dedup: hit.dedup, evidence: hit.evidence })
   c.activity.push({ action: 'metric-task-created', record: id, scenario: forecast!.id, detail: { rule: rule.id, ruleRevision: rule.revision, month: hit.month, owner: rule.owner, due: due.toISOString().slice(0, 10) } })
   notify(c, 'metric-task', [rule.owner], { title: `${rule.name} · ${hit.month}`, tab: 'cycle', record: id, department: rule.department })
   created.push(id)
  }
 }
 return { created, blocked }
}
