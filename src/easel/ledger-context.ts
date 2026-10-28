import { acceptedLedgerFilter,entityReceipts,requireIntacctHistory } from './ledger-scope'
import { reconcileIntacctLedger } from './intacct-trial'
// Accepted cumulative ledger context. P&L-only extracts retain their published
// flow; a ledger containing balance-sheet accounts additionally supplies closes.
import { reconciliation } from './actuals-read'
import { requireXeroHistory } from './xero-month'
import { requireQboHistory } from './qbo-month'
import type { Context } from './context'
import { all,requireThat, type Data } from './types'

export type LedgerContext = { trials: Data[]; allocations: Data[] }
export async function ledgerContext(c: Context, through: string, allocations: Data[] = [], required = false,entity?:string): Promise<LedgerContext | undefined> {
 requireIntacctHistory(c.s,through,entity)
 if(!entity)requireQboHistory(c.s,through)
 if(!entity)requireXeroHistory(c.s,through)
 const report = await reconciliation(c.db,c.s,entity)
 const trials = report.trialBalances.filter(t => t.period <= through)
 const enabled = trials.some(t => t.accounts.some((a: Data) => String(a.target).startsWith('bs:')))
 if (!enabled && !required) return undefined
 for (const trial of trials) {
  requireThat(!trial.blocked, `Balance-sheet reconciliation blocked for ${trial.period}; restore every cumulative account and department mapping`, 409)
 }
 return { trials, allocations }
}
export async function requireBalancedClose(c:Context,ledger: LedgerContext | undefined, month: string,entity?:string) {
 // A historical correcting journal can change this boundary after its receipt
 // was accepted. Zero-sum accounting alone cannot recertify that old report.
 if(entity){
  const receipt=entityReceipts(c.s,entity).find(r=>r.month===month)
  requireThat(receipt,'Review and accept this entity month before closing it',409)
  const history=all(c.s,'intacct-month').filter(r=>r.entity===entity&&r.company===receipt.company&&r.book===receipt.book)
  const filter=acceptedLedgerFilter(c.s)
  const accepted=await c.db.prepare(`SELECT value FROM e_actuals WHERE json_extract(value,'$.entity')=? AND json_extract(value,'$.intacctCompany')=? AND json_extract(value,'$.intacctBook')=? AND json_extract(value,'$.intacctMonth')<=? AND ${filter.sql}`).bind(entity,receipt.company,receipt.book,month,...filter.params).all<{value:string}>()
  const comparison=reconcileIntacctLedger(receipt.inventory.chart,receipt.trialBalance,accepted.results.map(r=>JSON.parse(r.value)),[],history,month)
  const differences=comparison.differences.map(r=>`${r.account}: opening ${r.openingDifference}, closing ${r.difference} minor units`).join('; ')
  requireThat(receipt.trialBalance.balanced&&comparison.balanced,`Cannot close ${month}: Intacct reviewed trial balance differs from the accepted ledger (${differences}); preview and accept this entity month again`,409)
 }
 if (!ledger) return
 const trial = ledger.trials.find(t => t.period === month)
 requireThat(trial?.balanced, `Cannot close ${month}: trial balance debit minus credit is ${trial?.difference ?? 'unavailable'} minor units; import the correcting ledger journal first`, 409)
}
