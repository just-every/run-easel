import { cashHealth } from './cash-health'
// Read models for the UI and for agents. Every view is filtered here, on the
// server, by the reader's role: individual positions, salaries and the rows
// and traces behind other departments' numbers never leave for people who
// may not see them.
import { requireFinance, requireMember, seesDepartmentDetail, visibleInput } from './access'
import { reconciliation } from './actuals'
import { actorNames } from './actor-names'
import type { Context } from './context'
import { calculate, type Calculation } from './engine'
import { departments, INPUT_KINDS, lines, model, scenarioInputs, workspace } from './model'
import { snapshot, snapshotList } from './store'
import { frozenModel } from './reforecasts'
import { semanticEqual } from './semantic'
import { all, find, get, requireThat, type Access, type Data, type State } from './types'

export function canSeeScenario(x: Access, sc: Data) {
 if (x.role === 'finance') return true
 if (sc.kind === 'proposal') return x.role === 'contributor' && sc.createdBy === x.actor.email
 return x.role !== null
}

export function filterCalculation(x: Access, calc: Calculation): Calculation {
 if (x.role === 'finance') return calc
 return { ...calc, assets: calc.assets?.map(a => seesDepartmentDetail(x, a.department) ? a : { ...a, originId: '', name: 'Detail restricted', category: '', trace: 'Detail restricted to finance and this department' }), cells: calc.cells.map(c => seesDepartmentDetail(x, c.department) ? c : { ...c, sources: [{ kind: 'restricted', label: 'Detail restricted to finance and this department', amount: c.amount, trace: 'Detail restricted to finance and this department' }] }) }
}

const filterInputs = (x: Access, inputs: Record<string, Data[]>) =>
 Object.fromEntries(Object.entries(inputs).map(([k, list]) => [k, list.filter(i => k === 'asset-category' || visibleInput(x, k, i))]))

export async function stateView(c: Context) {
 const { s, x } = c
 const finance = x.role === 'finance'
 const workspace = find(s, 'workspace', 'main') ?? null
 const me = { email: x.actor.email, name: x.actor.name, role: x.role, departments: x.departments }
 if (!x.role) return { me, workspace: null }
 const snapshots = (await snapshotList(c.db)).filter(sn => finance || sn.kind !== 'forecast' || x.role === 'contributor')
 const view = {
  me, workspace, lines: lines(s), departments: departments(s),
  members: finance ? all(s, 'member') : [],
  scenarios: await Promise.all(all(s, 'scenario').filter(sc => canSeeScenario(x, sc)).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).map(async sc => sc.status === 'frozen' ? (await frozenModel(c, sc)).scenario : sc)),
  submissions: all(s, 'submission'),
  comments: all(s, 'comment').filter(cm => finance || x.departments.includes(cm.department)).sort((a, b) => a.at.localeCompare(b.at)),
  accountMaps: finance ? all(s, 'account-map') : [],
  departmentMaps: finance ? all(s, 'department-map') : [],
  batches: finance ? all(s, 'batch').sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [],
  workbooks: finance ? all(s, 'workbook-import') : [],
  packs: all(s, 'pack').filter(p => finance || p.status === 'published'),
  snapshots,
 }
 // Collect from the finished view, never from records the reader cannot see.
 // `me` already carries its name. This contextual native-name projection is
 // not portable; the persisted attribution emails remain the source of truth.
 const emails = [
  ...view.members.map(m => m.email),
  ...view.scenarios.flatMap(sc => [sc.createdBy, sc.approval?.by, sc.reforecast?.by, sc.promotedBy, sc.declinedBy]),
  ...view.submissions.flatMap(sub => [sub.requestedBy, sub.submittedBy, ...(sub.history ?? []).map((entry: Data) => entry.by)]),
  ...view.comments.map(cm => cm.author),
  ...[...view.batches, ...view.workbooks].flatMap(item => [item.createdBy, item.acceptedBy, item.undoneBy]),
  ...view.packs.flatMap(pack => [pack.createdBy, pack.publishedBy, ...Object.values(pack.progress ?? {}).map((entry: any) => entry.by)]),
  ...view.snapshots.map(sn => sn.actor),
 ]
 return { ...view, actorNames: await actorNames(c.db, emails) }
}

export async function scenarioView(c: Context, id: string) {
 requireMember(c.x)
 const sc = get(c.s, 'scenario', id)
 requireThat(canSeeScenario(c.x, sc), 'Scenario not found', 404)
 const frozen = sc.status === 'frozen' ? await frozenModel(c, sc) : null
 const m = frozen ?? model(c.s, id)
 const calc = frozen ? frozen.calculation : calculate(m, sc.actualsThrough ? await c.actuals() : [])
 return { cashHealth: cashHealth(calc.cash, calc.actualsThrough, calc.currency, workspace(c.s).cashAgreement), scenario: m.scenario, workspace: m.workspace, lines: m.lines, departments: m.departments, inputs: filterInputs(c.x, m.inputs), calculation: filterCalculation(c.x, calc) }
}

const comparable = (input: Data) => { const { id: _i, scenario: _s, ...rest } = input; return rest }

/** Two scenarios side by side: monthly profit and cash, the inputs that differ, and every cell that moved. */
export async function compareView(c: Context, a: string, b: string) {
 requireMember(c.x)
 const [left, right] = await Promise.all([scenarioView(c, a), scenarioView(c, b)])
 const currencyComparable = left.workspace.currency === right.workspace.currency
 const changedInputs: Data[] = []
 for (const kind of INPUT_KINDS) {
  const l = new Map((left.inputs[kind] ?? []).map((i: Data) => [i.originId, i])), r = new Map((right.inputs[kind] ?? []).map((i: Data) => [i.originId, i]))
  for (const [origin, i] of r) if (!l.has(origin)) changedInputs.push({ kind, change: 'added', name: i.name ?? i.title, after: i })
  for (const [origin, i] of l) if (!r.has(origin)) changedInputs.push({ kind, change: 'removed', name: i.name ?? i.title, before: i })
  for (const [origin, i] of l) { const j = r.get(origin); if (j && !semanticEqual(comparable(i), comparable(j))) changedInputs.push({ kind, change: 'changed', name: j.name ?? j.title, before: i, after: j }) }
 }
 const key = (cell: Data) => `${cell.line}|${cell.department}|${cell.month}`
 const lc = new Map(left.calculation.cells.map(cell => [key(cell), cell.amount])), rc = new Map(right.calculation.cells.map(cell => [key(cell), cell.amount]))
 const changedCells = [...new Set([...lc.keys(), ...rc.keys()])].flatMap(k => {
  const before = lc.get(k) ?? 0, after = rc.get(k) ?? 0
  if (before === after) return []
  const [line, department, month] = k.split('|')
  return [{ line, department, month, before, after, difference: currencyComparable ? after - before : null }]
 }).sort((p, q) => p.month.localeCompare(q.month) || p.line.localeCompare(q.line))
 return {
  left: { scenario: left.scenario, workspace: left.workspace, lines: left.lines, departments: left.departments, profit: left.calculation.profit, cash: left.calculation.cash, cashHealth: left.cashHealth },
  right: { scenario: right.scenario, workspace: right.workspace, lines: right.lines, departments: right.departments, profit: right.calculation.profit, cash: right.calculation.cash, cashHealth: right.cashHealth },
  currencyComparable, changedInputs, changedCells,
 }
}

export async function snapshotView(c: Context, id: string) {
 requireMember(c.x)
 const sn = await snapshot(c.db, id)
 if (sn.kind === 'pack' || c.x.role === 'finance') return sn
 requireThat(sn.kind === 'approval' || sn.kind === 'reforecast' || c.x.role === 'contributor', 'Snapshot not found', 404)
 const body = { ...sn.body, calculation: filterCalculation(c.x, sn.body.calculation), inputs: filterInputs(c.x, sn.body.inputs ?? {}) }
 return { ...sn, body }
}

export async function actualsView(c: Context) {
 requireFinance(c.x)
 return reconciliation(c.db, c.s)
}

export { activityView } from './audit'

export const visibleScenarioInputs = (s: State, x: Access, id: string) => Object.fromEntries(INPUT_KINDS.map(k => [k, scenarioInputs(s, id, k).filter(i => visibleInput(x, k, i))]))
