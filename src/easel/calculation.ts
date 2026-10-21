import { activeCalculationJob } from './calculation-jobs'
import { requireThat } from './types'
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
 const pending = await activeCalculationJob(c, scenario, c.calculationJob)
 requireThat(!pending || pending.id === c.calculationJob, 'This scenario is recalculating in the background; affected values are unavailable until it completes', 425)
 const m = model(c.s, scenario)
 if (m.inputs.formula?.length) return calculateNativeContext(c,scenario,through)
 const consumed = historySourceMonths(m)
 await assertHistorySources(c, consumed)
 const close = through ?? m.scenario.actualsThrough ?? undefined
 const actuals = close || consumed.length ? await actualCells(c.db, c.s, close) : []
 const ledger = close ? await ledgerContext(c, close, m.scenario.ledgerAllocations ?? [], m.scenario.balanceLedger === true) : undefined
 return calculate(m, actuals, ledger)
}
