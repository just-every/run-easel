import { ledgerScope } from './ledger-scope'
import { sourceGuardBlock } from './agents/source-guard'
import { get, requireThat } from './types'
import { activeCalculationJob } from './calculation-jobs'
import { CalculationPending } from './calculation-status'
import { unfinishedWorkbook } from './calculation-dispatch'
import { calculateNativeContext } from './native-context'
import { ledgerContext } from './ledger-context'
import { actualCells } from './actuals-read'
import type { Context } from './context'
import { calculate } from './engine'
import { assertHistorySources, historySourceMonths } from './history-sources'
import { model } from './model'

/** Every working calculation uses the same historical dependency checks.
 * Frozen models continue to read their immutable captured arithmetic. */
export async function workingCalculation(c: Context, scenario: string, through?: string) {
 const blocked = sourceGuardBlock(c, get(c.s, 'scenario', scenario))
 requireThat(!blocked, blocked ?? '', 409)
 const pending = await activeCalculationJob(c, scenario, c.calculationJob)
 if (pending) throw new CalculationPending([scenario], pending)
 if (!c.calculationJob && unfinishedWorkbook(c.s, scenario)) throw new CalculationPending([scenario])
 const m = model(c.s, scenario)
 if (m.inputs.formula?.length) return calculateNativeContext(c,scenario,through)
 const consumed = historySourceMonths(m)
 await assertHistorySources(c, consumed, ledgerScope(c.s,scenario))
 const close = through ?? m.scenario.actualsThrough ?? undefined
 const actuals = close || consumed.length ? await actualCells(c.db, c.s, close, ledgerScope(c.s,scenario)) : []
 const ledger = close ? await ledgerContext(c, close, m.scenario.ledgerAllocations ?? [], m.scenario.balanceLedger === true, ledgerScope(c.s,scenario)) : undefined
 return calculate(m, actuals, ledger)
}
