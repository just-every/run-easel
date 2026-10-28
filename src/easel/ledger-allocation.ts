import { ledgerScope } from './ledger-scope'
import { workingCalculation } from './calculation'
// Finance explicitly associates an accepted account balance with schedule origins.
// This never infers a source record from its name, department or relative size.
import { requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { ledgerContext } from './ledger-context'
import { scenarioAccess } from './scenario-access'
import { model, requireEditable } from './model'
import { bump } from './plan'
import { cents } from './units'
import { get, integer, put, requireThat, type Data } from './types'

export async function ledgerAllocation(c: Context, op: string, b: Data) {
 if (op !== 'ledger-allocation') return
 requireFinance(c.x)
 const scenario = scenarioAccess(c.s, c.x, b.scenario)
 requireEditable(c.s, c.x, scenario, null)
 requireThat(Number(b.revision) === scenario.revision, 'The scenario changed; review its current revision', 409)
 requireThat(scenario.actualsThrough && b.month === scenario.actualsThrough, 'Allocate the last closed month', 409)
 const ledger = await ledgerContext(c, b.month, [], false, ledgerScope(c.s,scenario))
 const trial = ledger?.trials.find(t => t.period === b.month)
 requireThat(trial?.balanced, 'Resolve the trial balance first', 409)
 const target = b.target
 requireThat(['bs:prepaid', 'bs:accrued-liabilities', 'bs:deferred-revenue', 'bs:fixed-assets'].includes(target), 'Choose a supported subledger target')
 const source = trial.balances.find((r: Data) => r.target === target)
 requireThat(Array.isArray(b.allocations), 'Enter explicit schedule allocations')
 const m = model(c.s, scenario.id), seen = new Set<string>()
 const allocations = b.allocations.map((a: Data) => {
  requireThat(a && typeof a === 'object', 'Enter a schedule allocation')
  const inputs = target === 'bs:fixed-assets' ? m.inputs.asset ?? [] : target === 'bs:deferred-revenue' ? m.inputs.revenue : target === 'bs:prepaid' ? m.inputs.expense : [...m.inputs.position, ...m.inputs.expense]
  const input = inputs.find(i => i.originId === a.originId)
  requireThat(input && !seen.has(input.originId), 'Choose each schedule origin once')
  seen.add(input.originId)
  if (target === 'bs:prepaid') requireThat(input.kind === 'prepaid' && input.paymentMonth <= b.month, 'Prepaid allocation requires an already paid prepaid schedule')
  if (target === 'bs:accrued-liabilities') { requirePayDetail(c.x); requireThat(input.payDay || input.kind === 'bonus', 'Accrual allocation requires a payroll or bonus schedule') }
  if (target === 'bs:deferred-revenue') requireThat(input.kind === 'contract', 'Deferred allocation requires a contract schedule')
  const amount = cents(a.amount, 'Allocated balance')
  return { originId: input.originId, amount, ...(target === 'bs:fixed-assets' ? { remainingLifeMonths: integer(a.remainingLifeMonths, 'Remaining life (months)', 1, 1200) } : {}) }
 })
 requireThat(allocations.reduce((n: number, a: Data) => n + a.amount, 0) === source.amount, 'Schedule allocations must equal the accepted target balance to the cent', 409)
 const entry = { month: b.month, target, amount: source.amount, sources: source.sources, allocations }
 const ledgerAllocations = [...(scenario.ledgerAllocations ?? []).filter((a: Data) => a.month !== b.month || a.target !== target), entry]
 put(c.s, 'scenario', scenario.id, { ...scenario, ledgerAllocations })
 await workingCalculation(c, scenario.id)
 bump(c, get(c.s, 'scenario', scenario.id), op, scenario.id, { month: b.month, target, amount: source.amount })
 return { month: b.month, target, amount: source.amount }
}
