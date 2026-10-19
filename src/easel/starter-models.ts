// Compose the ordinary validated setup/plan commands. The API persists the
// entire starter in its normal revision-fenced save, or none of it.
import { requireFinance } from './access'
import type { Context } from './context'
import { dashboards } from './dashboards'
import { addMonths, month } from './months'
import { plan } from './plan'
import { setup } from './setup'
import { STARTER_IDS, STARTERS } from './starter-catalog'
import { all, choice, find, requireThat, type Data } from './types'
import { cents } from './units'

export async function starterModels(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'starter-model') return undefined
 requireFinance(c.x)
 requireThat(!find(c.s, 'workspace', 'main') && !all(c.s, 'scenario').length, 'Starter models are available only before setting up the company', 409)
 const starterId = choice(b.starter, STARTER_IDS, 'a starter model'), starter = STARTERS[starterId]
 const planStart = month(b.planStart, 'First plan month')
 requireThat(planStart.endsWith('-01'), 'Starter models use a January fiscal year; choose YYYY-01')
 const openingCash = b.openingCash ?? starter.openingCash
 cents(openingCash, 'Opening cash', { negative: true })
 setup(c, 'workspace', { name: b.name, currency: 'USD', fiscalYearStart: 1, planStart })
 const scenario = all(c.s, 'scenario').find(s => s.kind === 'budget')!
 const departments: Record<string, string> = {}, lines: Record<string, string> = {}, origins: Record<string, string> = {}
 for (const [key, name] of Object.entries(starter.departments)) departments[key] = setup(c, 'department', { name })!.id
 for (const [key, line] of Object.entries(starter.lines)) lines[key] = setup(c, 'line', line)!.id
 for (const input of starter.inputs) {
  const source = input.values
  const values: Data = { ...source, scenario: scenario.id, line: lines[String(source.line)], department: departments[String(source.department)], start: planStart }
  if (input.op === 'revenue') values.collectionLag = starter.collectionLag
  if (source.revenueOrigin) {
   const origin = origins[String(source.revenueOrigin)]
   requireThat(origin, 'The starter revenue source must be created before its linked cost')
   values.revenueOrigin = origin
  }
  if (Array.isArray(source.milestones)) values.milestones = source.milestones.map((m: Data) => ({ name: m.name, month: addMonths(planStart, m.offset), amount: m.amount }))
  const saved = await plan(c, input.op, values)
  requireThat(saved, 'Starter input was not created')
  if (input.key) origins[input.key] = saved.originId
 }
 await plan(c, 'scenario-cash', { scenario: scenario.id, opening: openingCash, basis: 'estimate', receivables: '0', payables: '0', collectionLag: starter.collectionLag, paymentLag: starter.paymentLag,
  note: `Starter assumptions · ${starter.name}. Editable estimates, not imported actuals. ${starter.cashTiming}` })
 const dashboard = await dashboards(c, 'dashboard-save', { name: `${starter.name} starter`, scenario: scenario.id, audience: 'leadership', widgets: starter.metrics.map(metric => ({ metric, display: metric === 'closingCash' ? 'chart' : 'tile' })) })
 c.activity.push({ action: 'starter-model', record: 'main', scenario: scenario.id, detail: { starter: starterId, basis: 'starter assumptions', assumptions: starter.assumptions, cashTiming: starter.cashTiming, currency: 'USD' } })
 return { workspace: find(c.s, 'workspace', 'main'), scenario: find(c.s, 'scenario', scenario.id), dashboard, starter: starterId, basis: 'starter assumptions' }
}
