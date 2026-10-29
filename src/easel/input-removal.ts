import { entityDimensions } from './entity-scope'
import { requireDimensionAccess } from './dimensions'
import { requireDepartment, requirePayDetail, requireFinance, requireMember } from './access'
import { inputDepartment, requireEditable, scenarioInputs, type InputKind } from './model'
import { scenarioAccess } from './scenario-access'
import type { Context } from './context'
import { all, get, requireThat, type Data } from './types'

/** Native removal authority and invariants, also used for retained deletion receipts. */
export function requireInputRemoval(c: Context, kind: InputKind, input: Data, revision?: unknown) {
 const { s, x } = c
  requireMember(x)
  if(kind==='tax-policy' || kind==='workbook-model') requireFinance(x)
  if(kind==='workbook-model') requirePayDetail(x)
  if (kind === 'position' || input.line && get(s, 'line', input.line).payroll) requirePayDetail(x)
  const scenario = scenarioAccess(s, x, input.scenario)
  requireEditable(s, x, scenario, inputDepartment(kind, input))
  requireDimensionAccess(s, x, entityDimensions(s, scenario.id, input.dimensions), inputDepartment(kind, input) ?? undefined)
  requireThat(kind !== 'revenue' || !all(s, 'expense').some(e => e.scenario === scenario.id && e.revenueOrigin === input.originId), 'Remove linked acquisition or inventory costs before deleting this revenue driver', 409)
  requireThat(kind !== 'asset-category' || !all(s, 'asset').some(a => a.scenario === input.scenario && a.category === input.originId), 'This category is used by assets; move or remove them first', 409)
  if (kind === 'revenue' && input.commissionPosition) {
   requirePayDetail(x)
   const position = scenarioInputs(s, scenario.id, 'position').find(p => p.originId === input.commissionPosition)
   requireThat(position, 'Commission position is not in this scenario', 409)
   requireDepartment(x, position!.department)
  }
  if (kind === 'position') requireThat(!scenarioInputs(s, scenario.id, 'revenue').some(r => r.commissionPosition === input.originId), 'Remove commission links before deleting this position', 409)
  if (kind === 'position') requireThat(!all(s,'position').some(p => p.scenario === scenario.id && p.backfillOrigin === input.originId), 'Remove the backfill link before deleting this position',409)
  if(kind==='workbook-model') requireThat(!all(s,'schedule').some(row=>row.scenario===scenario.id&&row.workbookOrigin===input.originId),'Remove linked workbook schedules before deleting the source graph',409)
  if(kind==='formula' && revision!==undefined) requireThat(Number(revision)===scenario.revision,'The plan changed; reload before deleting the formula',409)
 return scenario
}
