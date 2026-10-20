import type { Data } from './types'
import type { Cell, Sheet } from './xlsx-write'

export function balanceActualsSheets(trials: Data[], currency: string): Sheet[] {
 const rows: Cell[][] = [[`Cumulative accepted journal balances; ${currency} minor units; closed balances open forecast statements; schedule origins require reviewed allocation`], ['Month', 'Account', 'Source type', 'Source department', 'Target', 'Debit', 'Credit', 'Rows', 'Source imports', 'Source periods', 'Mapping status']]
 const totals: Cell[][] = [[`Trial balance; ${currency} minor units. Zero sum does not establish source completeness.`], ['Month', 'Debit', 'Credit', 'Difference', 'Mapping status']]
 const balances: Cell[][] = [[`Balance-sheet actuals; ${currency} minor units; assets debit-normal, liabilities/equity credit-normal`], ['Month', 'Balance', 'Amount', 'Source rows']]
 for (const t of trials) {
  const first = rows.length + 1
  for (const a of t.accounts) rows.push([t.period, a.account, a.accountType, a.department, a.target ?? '', Math.max(a.amount, 0), Math.max(-a.amount, 0), a.rows, a.batches.join(', '), a.periods.join(', '), a.blocked ? 'Blocked' : 'Mapped'])
  const last = rows.length, r = totals.length + 1
  totals.push([t.period, { formula: `SUM('Ledger balances'!F${first}:F${last})`, value: t.debit }, { formula: `SUM('Ledger balances'!G${first}:G${last})`, value: t.credit }, { formula: `B${r}-C${r}`, value: t.difference }, t.blocked ? 'Blocked' : t.balanced ? 'Reconciled' : 'Difference'])
  for (const b of t.balances) balances.push([t.period, b.label, b.amount, b.rows])
 }
 return [{ name: 'Ledger balances', rows }, { name: 'Trial balance', rows: totals }, { name: 'Balance-sheet actuals', rows: balances }]
}
