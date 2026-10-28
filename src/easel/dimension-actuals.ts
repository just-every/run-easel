import { ledgerPredicate,ledgerDimensions } from './ledger-scope'
import { resolveAccount } from './account-rules'
import { resolveDimensions } from './dimension-mapping'
import { lines } from './model'
import { find, type Data, type State } from './types'
import type { Cell } from './engine'

/** Resolve source metadata before aggregation so two classes on one account never merge. */
export async function dimensionActuals(db: D1Database, s: State, scope = '') {
 const { results } = await db.prepare(`SELECT value,amount FROM e_actuals WHERE ${ledgerPredicate} ORDER BY period,id`).bind(scope).all<{ value: string; amount: number }>()
 const types = new Map(lines(s).map(l => [l.id, l.type]))
 const cells: Cell[] = [], blocked: Data[] = []
 for (const row of results) {
  const value = JSON.parse(row.value), account = resolveAccount(s, value.account, value.accountType ?? '')
  const department = find(s, 'department-map', value.department)?.department
  const resolved = resolveDimensions(s, value.sourceDimensions ?? { department: value.department });resolved.dimensions=ledgerDimensions(s,scope,resolved.dimensions)
  if (account.target === 'excluded' || account.target && !types.has(account.target)) continue
  if (!account.target || department === undefined || resolved.unresolved.length) {
   blocked.push({ month: value.period, line: account.target ?? null, department: department ?? null, dimensions: resolved.unresolved, reason: !account.target ? 'Account mapping unavailable' : department === undefined ? 'Department mapping unavailable' : 'Dimension mapping unavailable' })
   if (!account.target || department === undefined) continue
  }
  const amount = Number(row.amount) * (types.get(account.target) === 'revenue' ? -1 : 1)
  cells.push({ line: account.target, department, month: value.period, amount, basis: 'actual', sources: [{ kind: 'actual', label: 'Accepted actuals', amount, trace: 'Accepted source rows mapped by live dimension rules', dimensions: resolved.dimensions }] })
 }
 return { cells, blocked, months: [...new Set(results.map(r => JSON.parse(r.value).period as string))].sort() }
}
