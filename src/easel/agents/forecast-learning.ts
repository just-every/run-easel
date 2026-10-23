import { requireAgent } from './governance'
// AGENT-004: the company's own forecast errors. Every kept forecast is compared
// with what closed afterwards; the error is split into timing (it reversed
// inside the closed window), driver (a measured assumption miss that the
// revision below would have removed) and permanent (the rest). Each measured
// miss is backtested on the last six to twelve kept forecasts. Easel calls no
// model, writes nothing here, and a suggestion becomes a proposal only through
// `learning-propose`, which still needs finance to submit and promote it.
import { requireFinance } from '../access'
import { actualCells } from '../actuals-read'
import { workingCalculation } from '../calculation'
import type { Context } from '../context'
import { headcountView } from '../headcount'
import { model } from '../model'
import { addMonths, monthLabel } from '../months'
import { sha256 } from '../store'
import { find, get, requireThat, type Data } from '../types'
import { dealHistory } from './deal-outcomes'
import { cellErrors, isFault, keptForecasts, rebuild, sameCells, sumAbs, type Kept } from './learning-backtest'
import { closeSlippage, collectionLag, collectionsByMonth, hireSlippage, MAX_KEPT, MEASURES, MIN_KEPT, MIN_SAMPLES, revise, type MeasureKey, type Observed } from './learning-measures'
import { datePeriod } from '../fiscal-calendar'

const MAX_ROWS = 600

export async function forecastLearning(c: Context, scenario: unknown) {
 requireAgent(c, 'learning')
 requireFinance(c.x)
 const forecast = get(c.s, 'scenario', scenario, 'forecast')
 requireThat(forecast.kind === 'forecast' && forecast.status === 'working' && forecast.actualsThrough, 'Learning reads a working forecast with at least one closed month', 409)
 const m = model(c.s, forecast.id), payOK = c.x.payDetail === true
 const current = await workingCalculation(c, forecast.id)
 const actuals = await actualCells(c.db, c.s)
 const kept = await keptForecasts(c, forecast)
 const lineById = new Map(m.lines.map(l => [l.id, l])), deptName = new Map(m.departments.map(d => [d.id, d.name]))
 const firstOpen = addMonths(forecast.actualsThrough, 1)
 const hiddenPayroll = (k: string, keptCells: Data[] = []) => {
  if (payOK) return false
  const [line, department, month] = k.split('|')
  return lineById.get(line)?.payroll === true || keptCells.some(x => x.line === line && x.department === department && x.month === month && x.sources.some((s: Data) => s.kind === 'position'))
 }

 // What the history says. Hire slippage reads pay-detail roster rows, so it is offered only with pay detail.
 const deals = dealHistory(c)
 const observed: Observed[] = [closeSlippage(deals), payOK ? hireSlippage((await headcountView(c, forecast.id)).history) : null, collectionLag(deals, m.inputs.revenue)].filter((x): x is Observed => x !== null)
 const candidates = observed.filter(o => o.samples >= MIN_SAMPLES && o.meanDays !== 0)

 // Recalculate each kept forecast unchanged and with every candidate revision.
 type Trial = { kept: Kept; errors: Map<string, number>; revisedErrors: Map<string, Map<string, number>>; combinedErrors: Map<string, number> | null; collections: Map<string, { baseline: number; revised: number }> }
 const trials: Trial[] = [], excluded: { month: string; reason: string }[] = []
 for (const k of kept) {
  if (!k.window.length) { excluded.push({ month: k.month, reason: 'No closed month follows this kept forecast yet' }); continue }
  if (k.body.inputs?.formula?.length) { excluded.push({ month: k.month, reason: 'Native-formula forecasts are compared but not recalculated for backtests' }); continue }
  try {
   const base = await rebuild(c, k, k.body.inputs, actuals)
   if (!sameCells(k.body.calculation.cells, base.cells, k.window)) { excluded.push({ month: k.month, reason: 'This kept forecast no longer recalculates to its stored cells' }); continue }
   const errors = cellErrors(k.body.calculation.cells, current.cells, k.window)
   const revisedErrors = new Map<string, Map<string, number>>(), collections = new Map<string, { baseline: number; revised: number }>()
   for (const o of candidates) {
    const revision = revise(o.key, o.meanDays, k.body.inputs, k.body.workspace, k.month)
    const calc = revision.changes.length ? await rebuild(c, k, revision.inputs, actuals) : base
    if (o.key === 'collection-lag') {
     const ids = new Set(deals.filter(d => d.contract && d.amountCents && d.paidDate).map(d => d.contract as string))
     const observedByMonth = new Map<string, number>()
     for (const d of deals) if (ids.has(d.contract) && d.amountCents && d.paidDate) { const p = datePeriod(k.body.workspace, d.paidDate); if (k.window.includes(p)) observedByMonth.set(p, (observedByMonth.get(p) ?? 0) + d.amountCents) }
     const err = (calcCollections: Map<string, number>) => k.window.reduce((n, p) => n + Math.abs((observedByMonth.get(p) ?? 0) - (calcCollections.get(p) ?? 0)), 0)
     collections.set(o.key, { baseline: err(collectionsByMonth(k.body.calculation, ids)), revised: err(collectionsByMonth(calc, ids)) })
     continue
    }
    revisedErrors.set(o.key, cellErrors(calc.cells, current.cells, k.window))
   }
   const both = candidates.filter(o => o.key !== 'collection-lag')
   let combined: Map<string, number> | null = null
   if (both.length === 1) combined = revisedErrors.get(both[0].key) ?? null
   else if (both.length > 1) {
    let inputs = k.body.inputs
    for (const o of both) inputs = revise(o.key, o.meanDays, inputs, k.body.workspace, k.month).inputs
    combined = cellErrors((await rebuild(c, k, inputs, actuals)).cells, current.cells, k.window)
   }
   trials.push({ kept: k, errors, revisedErrors, combinedErrors: combined, collections })
  } catch (error) {
   if (!isFault(error)) throw error
   excluded.push({ month: k.month, reason: `Could not recalculate this kept forecast: ${error.message}` })
  }
 }

 // Error decomposition for every kept forecast with a closed window.
 const rows: Data[] = []
 const perForecast = kept.map(k => {
  const trial = trials.find(t => t.kept === k)
  const errors = trial?.errors ?? cellErrors(k.body.calculation.cells, current.cells, k.window)
  const groups = new Map<string, { line: string; department: string; byMonth: Map<string, number> }>()
  for (const [key, e] of errors) {
   if (hiddenPayroll(key, k.body.calculation.cells)) continue
   const [line, department, month] = key.split('|'), g = groups.get(`${line}|${department}`) ?? { line, department, byMonth: new Map() }
   g.byMonth.set(month, e); groups.set(`${line}|${department}`, g)
  }
  const total = { gross: 0, timing: 0, driver: 0, permanent: 0 }
  for (const g of groups.values()) {
   let pos = 0, neg = 0
   for (const e of g.byMonth.values()) e > 0 ? pos += e : neg -= e
   const gross = pos + neg, timing = 2 * Math.min(pos, neg), net = Math.abs(pos - neg)
   let gain = 0
   if (trial?.combinedErrors) for (const [month, e] of g.byMonth) gain += Math.max(0, Math.abs(e) - Math.abs(trial.combinedErrors.get(`${g.line}|${g.department}|${month}`) ?? 0))
   const driver = Math.min(net, gain), permanent = net - driver
   total.gross += gross; total.timing += timing; total.driver += driver; total.permanent += permanent
   if (rows.length < MAX_ROWS) {
    const cells = k.body.calculation.cells.filter((x: Data) => x.line === g.line && x.department === g.department && k.window.includes(x.month))
    const sources = new Map<string, number>()
    for (const x of cells) for (const s of x.sources) sources.set(`${s.kind}|${s.label}`, (sources.get(`${s.kind}|${s.label}`) ?? 0) + s.amount)
    const explanations = k.window.flatMap(month => { const ex = find(c.s, 'explanation', `${month}|${g.line}|${g.department}`); return ex?.status === 'confirmed' ? [{ month, text: ex.text, confirmedBy: ex.confirmedBy }] : [] })
    rows.push({ keptMonth: k.month, line: g.line, lineName: lineById.get(g.line)?.name ?? g.line, department: g.department, departmentName: deptName.get(g.department) ?? 'No department', gross, timing, driver, permanent, net: pos - neg,
     months: k.window.filter(month => g.byMonth.has(month)).map(month => ({ month, forecast: cells.find((x: Data) => x.month === month)?.amount ?? 0, actual: current.cells.find(x => x.line === g.line && x.department === g.department && x.month === month)?.amount ?? 0, error: g.byMonth.get(month)! })),
     drivers: [...sources].filter(([, amount]) => amount !== 0).map(([id, amount]) => ({ kind: id.split('|')[0], label: id.slice(id.indexOf('|') + 1), amount })), explanations })
   }
  }
  return { month: k.month, label: monthLabel(k.month), snapshot: k.snapshot, sha256: k.sha256, window: k.window, backtested: Boolean(trial), reason: excluded.find(x => x.month === k.month)?.reason ?? null, ...total }
 })

 // Backtest each candidate on the reproducible kept forecasts.
 const measures = []
 for (const o of observed) {
  const meta = MEASURES.find(x => x.key === o.key)!
  const rowsByKept = trials.map(t => {
   if (o.key === 'collection-lag') { const x = t.collections.get(o.key); return x ? { month: t.kept.month, baseline: x.baseline, revised: x.revised } : null }
   const r = t.revisedErrors.get(o.key)
   if (!r) return null
   const keep = (key: string) => !hiddenPayroll(key, t.kept.body.calculation.cells)
   return { month: t.kept.month, baseline: sumAbs(t.errors, keep), revised: sumAbs(r, keep) }
  }).filter((x): x is { month: string; baseline: number; revised: number } => x !== null)
  const baseline = rowsByKept.reduce((n, r) => n + r.baseline, 0), revised = rowsByKept.reduce((n, r) => n + r.revised, 0)
  const changes = revise(o.key, o.meanDays, { revenue: m.inputs.revenue, position: m.inputs.position }, m.workspace, firstOpen).changes
  const reasons = []
  if (o.samples < MIN_SAMPLES) reasons.push(`Needs at least ${MIN_SAMPLES} reviewed observations; has ${o.samples}`)
  if (o.meanDays === 0) reasons.push('The measured miss rounds to zero days')
  if (trials.length < MIN_KEPT) reasons.push(`Needs at least ${MIN_KEPT} kept forecasts that recalculate; ${trials.length} do`)
  if (revised >= baseline) reasons.push('The revision would not have lowered the error on past kept forecasts')
  if (!changes.length) reasons.push('No input that has not started would change')
  const evidence = await sha256(JSON.stringify({ forecast: forecast.id, revision: forecast.revision, key: o.key, days: o.meanDays, baseline, revised, kept: trials.map(t => [t.kept.snapshot, t.kept.sha256]) }))
  measures.push({ ...o, label: meta.label, unit: meta.unit, evidenceSha: evidence,
   backtest: { forecasts: rowsByKept, keptForecasts: rowsByKept.length, baselineError: baseline, revisedError: revised, lowerOn: rowsByKept.filter(r => r.revised < r.baseline).length, worseOn: rowsByKept.filter(r => r.revised > r.baseline).length },
   suggestion: { eligible: reasons.length === 0, days: o.meanDays, reasons, affected: changes.slice(0, 50), affectedCount: changes.length } })
 }
 return {
  scenario: { id: forecast.id, name: forecast.name, revision: forecast.revision, actualsThrough: forecast.actualsThrough }, currency: m.workspace.currency,
  rules: { minKeptForecasts: MIN_KEPT, maxKeptForecasts: MAX_KEPT, minObservations: MIN_SAMPLES, metric: 'Absolute error in minor units summed over line, department and closed month; collection lag sums absolute monthly collections error for linked invoices' },
  kept: perForecast, excluded, decomposition: rows, measures, payDetail: payOK,
  deals: deals.length, stageProbabilities: 'Unavailable until REV-001 supplies stages and probabilities', churn: 'Unavailable until REV-002 supplies subscription churn',
 }
}
