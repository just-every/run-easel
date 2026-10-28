import { ledgerEntity } from './ledger-scope'
import { canSeeScenario } from './scenario-access'
import { filterCalculation } from './views'
import type { Context } from './context'
import type { Calculation } from './engine'
import { frozenModel } from './reforecasts'
import { all, type Data } from './types'

/** Report columns use frozen arithmetic for saved versions and live arithmetic
 * for the current forecast. Missing periods are absent, rather than zero. */
export async function versionComparison(c: Context, forecast: Data, budget: Data, current: Calculation, month: string) {
 const named = await Promise.all(all(c.s, 'scenario').filter(sc => sc.kind === 'reforecast'&&canSeeScenario(c.x,sc)&&ledgerEntity(c.s,sc.id)===ledgerEntity(c.s,forecast.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)).map(sc => frozenModel(c, sc)))
 const entries = [
  { scenario: budget.body.scenario, calculation: budget.body.calculation as Calculation, snapshot: budget.id, sha256: budget.sha256 },
  ...named.map(m => ({ scenario: m.scenario, calculation: m.calculation, snapshot: m.scenario.reforecast.snapshot })),
  { scenario: forecast, calculation: current },
 ]
 for(const e of entries.slice(0,-1))e.calculation=filterCalculation(c.x,e.calculation,all(c.s,'line').filter(l=>l.payroll).map(l=>l.id),c.s)
 const versions = entries.map(e => ({ id: e.scenario.id, name: e.scenario.name, kind: e.scenario.kind, revision: e.scenario.revision, currency: e.calculation.currency, ...('snapshot' in e ? { snapshot: e.snapshot } : {}) }))
 const cells = entries.map(e => new Map(e.calculation.cells.filter(cell => cell.month === month).map(cell => [`${cell.line}|${cell.department}`, cell.amount])))
 const keys = [...new Set(cells.flatMap(map => [...map.keys()]))]
 const comparisons = (key: string, actual: number) => entries.map((e, i) => {
  const amount = e.calculation.months.includes(month) ? cells[i].get(key) ?? 0 : null
  return { id: e.scenario.id, amount, variance: amount === null || e.calculation.currency !== current.currency ? null : actual - amount }
 })
 return { versions, comparisons, keys, lines: named.flatMap(m => m.lines), departments: named.flatMap(m => m.departments) }
}
