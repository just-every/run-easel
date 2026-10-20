// A trial balance is the cumulative accepted ledger, including opening journal
// and P&L accounts, not a repeated month-end snapshot or a balancing plug.
import { BALANCE_TARGETS } from './balance-targets'
import type { Data } from './types'

export function balanceActuals(groups: Data[], periods: string[]) {
 return periods.map(period => {
  const accounts = new Map<string, Data>()
  for (const g of groups) {
   if (g.period > period) continue
   const key = JSON.stringify([g.account, g.accountType, g.department])
   const a = accounts.get(key) ?? { account: g.account, accountType: g.accountType, department: g.department, target: g.target, blocked: g.blocked, amount: 0, rows: 0, batches: [] as string[], periods: [] as string[] }
   a.amount += g.amount; a.rows += g.rows
   a.batches = [...new Set([...a.batches, ...g.batches])]
   a.periods = [...new Set([...a.periods, g.period])].sort()
   accounts.set(key, a)
  }
  const rows = [...accounts.values()].sort((a, b) => a.account.localeCompare(b.account) || a.department.localeCompare(b.department) || a.accountType.localeCompare(b.accountType))
  const debit = rows.reduce((n, a) => n + Math.max(a.amount, 0), 0)
  const credit = rows.reduce((n, a) => n + Math.max(-a.amount, 0), 0)
  const blocked = rows.some(a => a.blocked)
  return { period, accounts: rows, debit, credit, difference: debit - credit, balanced: !blocked && debit === credit, blocked,
   balances: BALANCE_TARGETS.map(t => {
    const sources = rows.filter(a => !a.blocked && a.target === t.value)
    return { target: t.value, label: t.label, amount: blocked ? null : sources.reduce((n, a) => n + a.amount * t.sign, 0), rows: sources.reduce((n, a) => n + a.rows, 0), sources }
   }),
  }
 })
}
