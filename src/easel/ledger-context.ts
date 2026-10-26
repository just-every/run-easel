// Accepted cumulative ledger context. P&L-only extracts retain their published
// flow; a ledger containing balance-sheet accounts additionally supplies closes.
import { reconciliation } from './actuals-read'
import { requireXeroHistory } from './xero-month'
import { requireQboHistory } from './qbo-month'
import type { Context } from './context'
import { requireThat, type Data } from './types'

export type LedgerContext = { trials: Data[]; allocations: Data[] }
export async function ledgerContext(c: Context, through: string, allocations: Data[] = [], required = false): Promise<LedgerContext | undefined> {
 requireQboHistory(c.s,through)
 requireXeroHistory(c.s,through)
 const report = await reconciliation(c.db, c.s)
 const trials = report.trialBalances.filter(t => t.period <= through)
 const enabled = trials.some(t => t.accounts.some((a: Data) => String(a.target).startsWith('bs:')))
 if (!enabled && !required) return undefined
 for (const trial of trials) {
  requireThat(!trial.blocked, `Balance-sheet reconciliation blocked for ${trial.period}; restore every cumulative account and department mapping`, 409)
 }
 return { trials, allocations }
}
export function requireBalancedClose(ledger: LedgerContext | undefined, month: string) {
 if (!ledger) return
 const trial = ledger.trials.find(t => t.period === month)
 requireThat(trial?.balanced, `Cannot close ${month}: trial balance debit minus credit is ${trial?.difference ?? 'unavailable'} minor units; import the correcting ledger journal first`, 409)
}
