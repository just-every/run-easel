// Cash diagnostics use the saved cash series, including for frozen budgets.
// The current finance agreement is a read-time check, never a snapshot rewrite.
import type { CashMonth } from './engine'
import { mulDiv } from './units'

export type CashAgreement = { floorCents: number; runwayMinimumHundredths: number; currency: string; by: string; at: string }

export function cashHealth(cash: CashMonth[], actualsThrough: string | null, currency: string, agreement?: CashAgreement) {
 const applicable = !!agreement && agreement.currency === currency
 const months = cash.map((row, i) => {
  const window = cash.slice(Math.max(0, i - 2), i + 1)
  const trailingNetBurnCents = window.reduce((n, c) => n + c.payments - c.collections, 0)
  const exhausted = row.closing <= 0
  const runwayHundredths = trailingNetBurnCents > 0 ? mulDiv(row.closing, window.length * 100, trailingNetBurnCents) : null
  // Compare the exact ratio, before rounding its display to hundredths.
  const runwayBreached = applicable ? (trailingNetBurnCents > 0 ? BigInt(row.closing) * BigInt(window.length * 100) < BigInt(agreement!.runwayMinimumHundredths) * BigInt(trailingNetBurnCents) : exhausted && agreement!.runwayMinimumHundredths > 0) : null
  return { month: row.month, closing: row.closing, grossBurnCents: row.payments, netBurnCents: row.payments - row.collections,
   trailingNetBurnCents, trailingMonths: window.length, runwayHundredths,
   runwayBasis: exhausted ? 'cash-exhausted' : trailingNetBurnCents <= 0 ? 'not-burning' : 'trailing-net-burn',
   floorBreached: applicable ? row.closing < agreement!.floorCents : null, runwayBreached }
 })
 const lowest = months.reduce<(typeof months)[number] | null>((best, row) => !best || row.closing < best.closing ? row : best, null)
 return { agreement: agreement ?? null, agreementStatus: !agreement ? 'not-agreed' : applicable ? 'applied' : 'different-currency', months,
  lowestCash: lowest ? { month: lowest.month, closing: lowest.closing } : null,
  cashZeroMonth: months.find(row => (!actualsThrough || row.month > actualsThrough) && row.closing < 0)?.month ?? null,
  firstFloorBreach: months.find(row => row.floorBreached)?.month ?? null,
  firstRunwayBreach: months.find(row => row.runwayBreached)?.month ?? null }
}
