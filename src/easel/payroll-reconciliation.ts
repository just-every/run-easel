import { ledgerScope } from './ledger-scope'
// Payroll files remain observations, separate from editable planned positions.
// Explicit source employee -> position links avoid guessing a person's identity.
import { requireMember, seesPayDetail } from './access'
import type { Context } from './context'
import { actualCells, reconciliation as ledgerReconciliation } from './actuals-read'
import { canSeeScenario } from './scenario-access'
import { datePeriod } from './fiscal-calendar'
import { workspace } from './model'
import { all, get, requireThat, type Data, type State } from './types'

export function rosterBuckets(s: State, scenario: string, roster: Data[]) {
 const positions = all(s, 'position').filter(p => p.scenario === scenario)
 const matched: Data[] = [], unplanned: Data[] = [], changedSalary: Data[] = []
 const linked = new Set<string>()
 for (const person of roster) {
  const position = positions.find(p => p.originId === person.positionOrigin)
  if (!position) { unplanned.push(person); continue }
  linked.add(position.originId)
  const row = { ...person, position: position.id, plannedTitle: position.title, plannedSalaryCents: position.annualSalaryCents }
  if (person.salaryCents === null || person.salaryCents !== position.annualSalaryCents) changedSalary.push(row)
  else matched.push(row)
 }
 return { matched, unplanned, changedSalary, plannedNotHired: positions.filter(p => !linked.has(p.originId)) }
}

/** A scenario's latest dated roster for each provider, plus reconciled pay runs. */
export async function payrollView(c: Context, scenario: string) {
 requireMember(c.x)
 const sc = get(c.s, 'scenario', scenario)
 // Reuse the same scenario door as the rest of the app (including sandboxes).
 requireThat(canSeeScenario(c.x, sc), 'Scenario not found', 404)
 const imports = all(c.s, 'payroll-import').filter(i => i.status === 'imported' && i.scenario === scenario)
 const rosters = all(c.s, 'roster-actual').filter(r => imports.some(i => i.destination === r.batch))
 const latest = new Map<string, string>()
 for (const r of imports.filter(i => i.kind === 'roster')) if (!latest.has(r.provider) || r.asOf > latest.get(r.provider)!) latest.set(r.provider, r.asOf)
 const current = rosters.filter(r => r.asOf === latest.get(r.provider))
 const buckets = rosterBuckets(c.s, scenario, current)
 const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]))
 const departments = all(c.s, 'department').map(d => {
  const people = current.filter(r => r.department === d.id && r.start <= r.asOf && (!r.termination || r.termination > r.asOf))
  return { department: d.id, name: d.name, headcount: people.length }
 })
 const payroll = all(c.s, 'payroll-run').filter(r => imports.some(i => i.destination === r.batch))
 const cells = await actualCells(c.db, c.s,undefined,ledgerScope(c.s,sc)), ledger = await ledgerReconciliation(c.db, c.s,ledgerScope(c.s,sc))
 const groups = new Map<string, Data>()
 for (const run of payroll) {
  const month = datePeriod(workspace(c.s), run.payDate), key = `${month}|${run.department}|${run.line}`
  const row = groups.get(key) ?? { month, department: run.department, line: run.line, grossWagesCents: 0, employerTaxesCents: 0, benefitsCents: 0, feesCents: 0, totalCents: 0, runs: 0 }
  for (const field of ['grossWagesCents','employerTaxesCents','benefitsCents','feesCents','totalCents']) row[field] += run[field]
  row.runs++
  groups.set(key, row)
 }
 const reconciliation = [...groups.values()].map(r => {
  const blocked = (ledger.months as Data[]).find(m => m.period === r.month)?.blocked
  const actual = blocked ? undefined : cells.find(a => a.month === r.month && a.department === r.department && a.line === r.line)
  return { ...r, ledgerCents: actual?.amount ?? null, differenceCents: actual ? r.totalCents - actual.amount : null, status: blocked ? 'blocked-ledger' : actual ? (r.totalCents === actual.amount ? 'reconciled' : 'difference') : 'missing-ledger' }
 })
 const detail = (r: Data) => seesPayDetail(c.x, r.department)
 return { scenario, departments, counts, reconciliation,
  buckets: Object.fromEntries(Object.entries(buckets).map(([k, rows]) => [k, rows.filter(detail)])),
  roster: current.filter(detail), runs: payroll.filter(detail),
  imports: c.x.role === 'finance' && c.x.payDetail ? imports : [],
 }
}
