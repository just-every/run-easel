import { resolveAccount } from './account-rules'
import { resolveDimensions } from './dimension-mapping'
import { lines } from './model'
import { find, type Data, type State } from './types'
import type { Cell } from './engine'

/** Resolve source metadata before aggregation so two classes on one account never merge. */
export async function dimensionActuals(db: D1Database, s: State,entity?:string) {
 const { results } = await db.prepare("SELECT value,amount FROM e_actuals WHERE COALESCE(json_extract(value,'$.entity'),'')=? ORDER BY period,id").bind(entity??'').all<{ value: string; amount: number }>()
 const types = new Map(lines(s).map(l => [l.id, l.type]))
 const cells: Cell[] = [], blocked: Data[] = []
 const reversed=new Set(results.filter(r=>JSON.parse(r.value).intacctReversal).map(r=>{const v=JSON.parse(r.value);return JSON.stringify([v.intacctRealm,v.intacctLine,v.account,v.accountType,v.department,v.sourceDimensions])}))
 const totals=new Map<string,number>()
 for(const row of results){const v=JSON.parse(row.value),k=JSON.stringify([v.intacctRealm,v.intacctLine,v.account,v.accountType,v.department,v.sourceDimensions]);totals.set(k,(totals.get(k)??0)+Number(row.amount))}
 for (const row of results) {
  const provenance=JSON.parse(row.value),identity=JSON.stringify([provenance.intacctRealm,provenance.intacctLine,provenance.account,provenance.accountType,provenance.department,provenance.sourceDimensions])
  if(provenance.intacctLine&&reversed.has(identity)&&totals.get(identity)===0)continue
  const value = JSON.parse(row.value), account = resolveAccount(s, value.account, value.accountType ?? '')
  const department = find(s, 'department-map', value.department)?.department
  const resolved = resolveDimensions(s, value.sourceDimensions ?? { department: value.department })
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
