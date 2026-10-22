// AGENT-004 commands. The agent's only write is a draft proposal that cites
// its backtest; the forecast changes only when finance submits and promotes
// that exact proposal revision through the ordinary doors.
import { requireFinance } from '../access'
import type { Context } from '../context'
import { model, scenarioInputs } from '../model'
import { addMonths } from '../months'
import { bump, plan } from '../plan'
import { formatMoney } from '../units'
import { get, put, requireThat, text, type Data } from '../types'
import { dealOutcomes } from './deal-outcomes'
import { forecastLearning } from './forecast-learning'
import { MEASURES, revise, type MeasureKey } from './learning-measures'

export async function learningCommands(c: Context, op: string, b: Data): Promise<Data | undefined> {
 const deals = dealOutcomes(c, op, b)
 if (deals) return deals
 if (op !== 'learning-propose') return undefined
 requireFinance(c.x)
 const key = MEASURES.find(m => m.key === b.measure)?.key as MeasureKey | undefined
 requireThat(key, 'Choose a measured assumption')
 const analysis = await forecastLearning(c, b.scenario)
 const measure = analysis.measures.find(m => m.key === key)
 requireThat(measure, 'No history measures this assumption yet', 409)
 requireThat(measure.suggestion.eligible, `Not suggested: ${measure.suggestion.reasons.join('; ')}`, 409)
 requireThat(b.evidence === measure.evidenceSha, 'The evidence changed since you reviewed the backtest; review it again', 409)
 const forecast = get(c.s, 'scenario', analysis.scenario.id)
 const { days } = measure.suggestion, money = (n: number) => formatMoney(n, analysis.currency)
 const request = text(`${measure.label}: ${days > 0 ? '+' : ''}${days} days from ${measure.samples} reviewed observations (${measure.evidence}). Backtest on ${measure.backtest.keptForecasts} kept forecasts: absolute error ${money(measure.backtest.baselineError)} before, ${money(measure.backtest.revisedError)} with this revision; lower on ${measure.backtest.lowerOn}, higher on ${measure.backtest.worseOn}. ${measure.suggestion.affectedCount} input(s) that have not started move.`, 'Request', 2000)
 const proposal = (await plan(c, 'proposal-create', { from: forecast.id, name: `Learned: ${measure.label} ${days > 0 ? '+' : ''}${days} days`.slice(0, 200), request }))!
 const inputs = { revenue: scenarioInputs(c.s, proposal.id, 'revenue'), position: scenarioInputs(c.s, proposal.id, 'position') }
 const revised = revise(key, days, inputs, model(c.s, proposal.id).workspace, addMonths(forecast.actualsThrough, 1))
 const byOrigin = new Map(revised.changes.map(x => [x.originId, x]))
 for (const kind of ['revenue', 'position'] as const) for (const input of revised.inputs[kind]) if (byOrigin.has(input.originId) && byOrigin.get(input.originId)!.kind === kind) put(c.s, kind, input.id, input)
 put(c.s, 'scenario', proposal.id, { ...get(c.s, 'scenario', proposal.id), learning: { measure: key, days, samples: measure.samples, evidenceSha: measure.evidenceSha, backtest: { keptForecasts: measure.backtest.keptForecasts, baselineError: measure.backtest.baselineError, revisedError: measure.backtest.revisedError, lowerOn: measure.backtest.lowerOn, worseOn: measure.backtest.worseOn }, changes: revised.changes, forecastRevision: forecast.revision } })
 bump(c, get(c.s, 'scenario', proposal.id), 'learning-proposal', proposal.id, { measure: key, days, changes: revised.changes.length })
 return get(c.s, 'scenario', proposal.id)
}
