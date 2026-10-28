import { get } from './types'
import { scenarioAccess } from './scenario-access'
import { requireFinance } from './access'
import { actualCells } from './actuals-read'
import type { Context } from './context'
import { assertHistorySources } from './history-sources'
import { historySchedule } from './history-schedules'
import { departments, lines, workspace } from './model'
import { addMonths, range } from './months'
import { decimal } from './units'
import { all, put, requireThat, text, uid, type Data } from './types'

/** A seed captures its source once. Its ordinary schedules remain editable. */
export async function historyBudget(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'budget-from-actuals') return undefined
 requireFinance(c.x)
 const entity=b.entity?get(c.s,'entity',b.entity):undefined
 if(entity)scenarioAccess(c.s,c.x,entity.scenario)
 const scope=entity?.id??'', w = {...workspace(c.s),...(entity?{currency:entity.currency}:{})}, months = range(w.planStart, w.horizon)
 await assertHistorySources(c, months.map(m => addMonths(m, -12)),scope)
 const actuals = await actualCells(c.db, c.s,undefined,scope)
 const growth = b.growth ?? {}
 requireThat(growth && typeof growth === 'object' && !Array.isArray(growth), 'Enter growth percentages by line')
 requireThat(Object.keys(growth).every(id => lines(c.s).some(line => line.id === id)), 'Growth names an unknown planning line')
 const definitions: Data[] = []
 for (const line of lines(c.s)) {
  const growthBps = decimal(growth[line.id] ?? '0', `Growth for ${line.name}`, 2, { negative: true, max: 100000n })
  requireThat(growthBps >= -10000, 'Growth cannot be below -100%')
  for (const department of departments(c.s)) {
   if (!actuals.some(a => a.line === line.id && a.department === department.id && months.some(m => a.month === addMonths(m, -12)))) continue
   const schedule = { name: `${line.name} · ${department.name} from prior-year actuals`, line: line.id, department: department.id, history: { sourceLine: line.id, sourceDepartment: department.id, offset: 12, window: 1, growthBps } }
   const calculated = historySchedule(schedule, actuals, months, w.currency)
   definitions.push({ name: schedule.name, line: line.id, department: department.id, values: Object.fromEntries(calculated.map(row => [row.month, row.amount])),
    provenance: { file: 'Accepted actuals at budget creation', sheet: 'Actuals', cells: Object.fromEntries(months.map(m => [m, `${addMonths(m, -12)}:${line.id}:${department.id}`])) } })
  }
 }
 requireThat(definitions.length || entity, 'No mapped prior-year line and department history is available', 409)
 const id = uid(), name = text(b.name, 'Budget name')
 const original = all(c.s, 'scenario').find(sc => sc.kind === 'budget' && !sc.alternativeBudget)
 const budget = { name, kind: 'budget', alternativeBudget: true, status: 'working', revision: 1, horizon: w.horizon, createdBy: c.x.actor.email, createdAt: c.now, parent: entity?.scenario??null, ...(entity?{entity:entity.id,currency:entity.currency}:{}), actualsThrough: null,
  cash: original?.cash ?? { openingCents: 0, basis: 'estimate', receivablesCents: 0, payablesCents: 0, collectionLag: 0, paymentLag: 0 }, seededFromActuals: { at: c.now, by: c.x.actor.email, months: months.map(m => addMonths(m, -12)), growth } }
 put(c.s, 'scenario', id, budget)
 for (const definition of definitions) put(c.s, 'schedule', uid(), { ...definition, ...(entity?{dimensions:{[entity.dimension]:entity.member}}:{}), scenario: id, originId: uid() })
 c.activity.push({ action: op, record: id, scenario: id, after: 1, detail: { sourceMonths: budget.seededFromActuals.months, schedules: definitions.length } })
 return { ...budget, id }
}
