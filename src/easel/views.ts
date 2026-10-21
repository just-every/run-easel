import { scopedCalculation, scopedReader } from './group-projections'
import { dimensionStructure } from './dimensions'
import { visibleNativeDependencies, visibleNativeInput } from './native-visibility'
import { fiscalSummary } from './fiscal-summary'
import { historyOverlay } from './history-sources'
import { addMonths } from './months'
import { workingCalculation } from './calculation'
import { canSeeScenario, scenarioAccess } from './scenario-access'
import { aggregateFinancing } from './financing-view'
import { cashHealth } from './cash-health'
import { restrictDrivers } from './cash-drivers'
// Read models for the UI and for agents. Every view is filtered here, on the
// server, by the reader's role: individual positions, salaries and the rows
// and traces behind other departments' numbers never leave for people who
// may not see them.
import { dimensionAllowed, requireFinance, requireMember, seesDepartmentDetail, seesPayDetail, visibleInput } from './access'
import { reconciliation } from './actuals'
import { actorNames } from './actor-names'
import type { Context } from './context'
import { type Calculation } from './engine'
import { departments, INPUT_KINDS, lines, model, scenarioInputs, workspace } from './model'
import { snapshot, snapshotList } from './store'
import { frozenModel } from './reforecasts'
import { semanticEqual } from './semantic'
import { all, find, get, requireThat, type Access, type Data, type State } from './types'

export { canSeeScenario } from './scenario-access'

export function filterCalculation(x: Access, calc: Calculation, payrollLines: string[] = [], state?: State): Calculation {
 if (state) calc = scopedCalculation(state, x, calc, all(state, 'line') as any)
 const { nativeSources: _privateSources, ...publicCalculation } = calc
 const formulaRows=calc.formulaValues??[]
 const visibleFormula=(id:string|undefined)=>formulaRows.filter(r=>r.originId===id).every(r=>visibleNativeDependencies(x,r.dependencies??[],state))
 calc={...publicCalculation, ...(calc.cashDrivers?{cashDrivers:calc.cashDrivers.map(d=>!visibleFormula(d.source)?{...d,source:'',label:'Formula detail restricted'}:d)}:{}), ...(calc.formulaValues?{formulaValues:formulaRows.filter(r=>visibleNativeDependencies(x,r.dependencies??[],state)).map(r=>({...r,dependencies:[]}))}:{}),cells:calc.cells.map(cell=>({...cell,sources:cell.sources.map(source=>source.kind==='formula'&&!visibleFormula(source.id)?{kind:'restricted',label:'Formula detail restricted',amount:source.amount,trace:'Formula detail restricted to its source departments and permissions'}:source)}))}
 const restricted = (department: string) => !seesPayDetail(x, department)
 calc = { ...calc, ...(calc.taxes?{taxes:{...calc.taxes,payrollRows:calc.taxes.payrollRows.filter(row=>seesPayDetail(x,row.department))}}:{}), warnings: x.payDetail ? calc.warnings : calc.warnings.map(() => 'Calculation warning; source detail requires Pay detail permission'), cells: calc.cells.map(cell => ({ ...cell, sources: (payrollLines.includes(cell.line) || cell.sources.some(source => source.kind === 'position')) && restricted(cell.department) ? cell.sources.map(source => ({ kind: 'restricted', label: 'Compensation detail restricted', amount: source.amount, trace: 'Compensation detail restricted', ...(source.dimensions ? { dimensions: source.dimensions } : {}) })) : cell.sources })), ...(calc.workingCapital ? { workingCapital: { ...calc.workingCapital, rows: calc.workingCapital.rows.filter(row => !(['payroll', 'bonus'].includes(row.kind) || payrollLines.includes(row.line)) || !restricted(row.department)) } } : {}) }
 if (x.role === 'finance') return calc
 return { ...calc, ...(calc.cashDrivers ? { cashDrivers: restrictDrivers(calc.cashDrivers, false, department => seesDepartmentDetail(x, department)) } : {}), ...(calc.workingCapital ? { workingCapital: { ...calc.workingCapital, rows: calc.workingCapital.rows.filter(r => seesDepartmentDetail(x, r.department)), issues: calc.workingCapital.issues.filter(r => seesDepartmentDetail(x, r.department)) } } : {}), ...(calc.contracts ? { contracts: { ...calc.contracts, rows: calc.contracts.rows.filter(r => seesDepartmentDetail(x, r.department)), invoices: calc.contracts.invoices.filter(r => seesDepartmentDetail(x, r.department)) } } : {}), ...(calc.financing ? { financing: aggregateFinancing(calc.financing) } : {}), assets: calc.assets?.map(a => seesDepartmentDetail(x, a.department) ? a : { ...a, originId: '', name: 'Detail restricted', category: '', trace: 'Detail restricted to finance and this department' }), cells: calc.cells.map(c => seesDepartmentDetail(x, c.department) ? { ...c, sources: c.sources.map(source => source.kind === 'financing' ? { kind: 'financing', label: 'Financing interest', amount: source.amount, trace: 'Interest expense; instrument terms restricted to finance' } : source) } : { ...c, sources: [{ kind: 'restricted', label: 'Detail restricted to finance and this department', amount: c.amount, trace: 'Detail restricted to finance and this department' }] }) }
}

const filterHistory = (x: Access, history: Data) => ({ ...history, cells: history.cells.map((cell: Data) => seesDepartmentDetail(x, cell.department) ? cell : { ...cell, rows: 0, batches: [] }) })

const paySafeInput = (x: Access, input: Data, positions: Data[]) => {
 const position = positions.find(p => p.originId === input.commissionPosition)
 if (!input.commissionPosition || position && seesPayDetail(x, position.department)) return input
 const { commissionPosition: _link, ...safe } = input
 return safe
}
const filterInputs = (x: Access, inputs: Record<string, Data[]>, payrollLines: string[] = [], state?: State) =>
 Object.fromEntries(Object.entries(inputs).map(([k, list]) => [k, list.filter(i => (!state || dimensionAllowed(state, x, i.dimensions)) && (k !== 'formula' || !state || visibleNativeInput(state,x,i,new Set(),inputs.formula??[])) && (k === 'asset-category' || visibleInput(x, k, i) && (!payrollLines.includes(i.line) || seesPayDetail(x, i.department)))).map(i => paySafeInput(x, i, inputs.position ?? []))]))

export async function stateView(c: Context) {
 const { s, x } = c
 const finance = x.role === 'finance'
 const workspace = find(s, 'workspace', 'main') ?? null
 const me = { email: x.actor.email, name: x.actor.name, role: x.role, departments: x.departments, payDetail: x.payDetail === true, capabilities: x.capabilities ?? [], readDepartments: x.readDepartments ?? [], groupOnly: x.groupOnly === true, owner: x.actor.baseRole === 'owner' && !x.actor.token }
 if (!x.role) return { me, workspace: null }
 const snapshots = (await snapshotList(c.db)).filter(sn => (!sn.scenario || canSeeScenario(x, get(s, 'scenario', sn.scenario))) && ( finance || sn.kind !== 'forecast' || x.role === 'contributor'))
 const view = {
  accessGroups: finance ? all(s, 'access-group').map(g => ({ id: g.id, name: g.name })) : [],
  me, workspace, lines: lines(s), departments: departments(s), dimensions: all(s, 'dimension'), dimensionMembers: all(s, 'dimension-member').filter(m => x.role === 'finance' || !x.dimensionRead?.[m.dimension] || x.dimensionRead[m.dimension].includes(m.id)), lineGroups: all(s, 'line-group'), dimensionMaps: finance ? all(s, 'dimension-map') : [],
  members: finance ? all(s, 'member').map((m): Data => ({ ...m, payDetail: m.role !== 'viewer' && find(s, 'pay-grant', m.email)?.granted === true })) : [],
  scenarios: await Promise.all(all(s, 'scenario').filter(sc => canSeeScenario(x, sc)).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).map(async (sc): Promise<Data> => sc.status === 'frozen' ? { ...(await frozenModel(c, sc)).scenario, ...(find(s, 'scenario-designation', sc.id) ? { official: find(s, 'scenario-designation', sc.id)!.official } : {}) } : { ...sc, ...(find(s, 'scenario-designation', sc.id) ? { official: find(s, 'scenario-designation', sc.id)!.official } : {}) })),
  submissions: scopedReader(x) ? [] : all(s, 'submission'),
  comments: (scopedReader(x) ? [] : all(s, 'comment')).filter(cm => canSeeScenario(x, get(s, 'scenario', cm.scenario)) && (finance || x.departments.includes(cm.department))).sort((a, b) => a.at.localeCompare(b.at)),
  accountMaps: finance ? all(s, 'account-map') : [],
  accountRules: finance ? all(s, 'account-rule') : [],
  departmentMaps: finance ? all(s, 'department-map') : [],
  batches: finance ? all(s, 'batch').sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [],
  workbooks: finance ? all(s, 'workbook-import') : [],
  actionDepartments: finance ? all(s, 'pack-action-department') : [],
  fxTable: finance ? find(s, 'fx-table', 'main') ?? null : null,
  packs: (scopedReader(x) ? [] : all(s, 'pack')).filter(p => finance || p.status === 'published'),
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
 view.scenarios = view.scenarios.map(sc => ({ ...sc, ledgerAllocations: undefined, effectiveAccess: sc.sandbox ? (sc.createdBy === x.actor.email || sc.sandbox.grants?.[x.actor.email] === 'edit' || x.scenarioGrants?.[sc.id] === 'edit' ? 'edit' : 'read') : x.role === 'viewer' ? 'read' : 'edit' }))
 return { ...view, actorNames: await actorNames(c.db, emails) }
}

export async function scenarioView(c: Context, id: string) {
 requireMember(c.x)
 const sc = get(c.s, 'scenario', id)
 requireThat(canSeeScenario(c.x, sc), 'Scenario not found', 404)
 const frozen = sc.status === 'frozen' ? await frozenModel(c, sc) : null
 const m = frozen ?? model(c.s, id)
 const calc = frozen ? frozen.calculation : await workingCalculation(c, id)
 const actualsHistory = frozen ? (frozen.actualsHistory ?? { status: 'not-captured', cells: [], months: [], blockedMonths: [], missingMonths: [] }) : await historyOverlay(c, [...new Set(calc.months.flatMap(m => [m, addMonths(m, -12)]))])
 const visibleHistory = scopedReader(c.x) ? { cells: [], months: [], blockedMonths: [], missingMonths: [], status: 'unavailable-for-scope' } : filterHistory(c.x, actualsHistory)
 return { dimensionStructure: (m as Data).dimensionStructure ?? dimensionStructure(c.s), fiscal: fiscalSummary(m.workspace, scopedCalculation(c.s, c.x, calc, m.lines), m.lines), actualsHistory: visibleHistory, cashHealth: scopedReader(c.x) ? null : cashHealth(calc.cash, calc.actualsThrough, calc.currency, workspace(c.s).cashAgreement), scenario: { ...m.scenario, ledgerAllocations: undefined, ...(find(c.s, 'scenario-designation', sc.id) ? { official: find(c.s, 'scenario-designation', sc.id)!.official } : {}) } as Data, workspace: m.workspace, lines: m.lines, departments: m.departments, inputs: filterInputs(c.x, m.inputs, m.lines.filter(l => l.payroll).map(l => l.id), c.s), calculation: filterCalculation(c.x, calc, m.lines.filter(l => l.payroll).map(l => l.id), c.s) }
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
 if (sn.scenario) scenarioAccess(c.s, c.x, sn.scenario)
 if (sn.kind === 'pack') { requireThat(!scopedReader(c.x), 'This aggregate pack is unavailable for dimension-scoped access', 403); return paySafePack(sn) }
 requireThat(sn.kind === 'approval' || sn.kind === 'reforecast' || c.x.role === 'finance' || c.x.role === 'contributor', 'Snapshot not found', 404)
 const { nativeSources: _privateSources, ...safeBody } = sn.body
 const body = { ...safeBody, ...(sn.body.actualsHistory ? { actualsHistory: filterHistory(c.x, sn.body.actualsHistory) } : {}), calculation: filterCalculation(c.x, sn.body.calculation, (sn.body.lines ?? []).filter((l: Data) => l.payroll).map((l: Data) => l.id), c.s), inputs: filterInputs(c.x, sn.body.inputs ?? {}, (sn.body.lines ?? []).filter((l: Data) => l.payroll).map((l: Data) => l.id), c.s) }
 return { ...sn, body }
}

export async function actualsView(c: Context) {
 requireFinance(c.x)
 return reconciliation(c.db, c.s)
}

export { activityView } from './audit'

export const visibleScenarioInputs = (s: State, x: Access, id: string) => filterInputs(x, Object.fromEntries(INPUT_KINDS.map(k => [k, scenarioInputs(s, id, k)])), lines(s).filter(l => l.payroll).map(l => l.id), s)

/** Published packs have an aggregate audience, including their older snapshots. */
export function paySafePack(sn: Data): Data {
 const payroll = new Set((sn.body.structure?.line ?? []).filter((line: Data) => line.payroll).map((line: Data) => line.name))
 const {nativeDefinitions: _nativeDefinitions,...body}=sn.body
 return { ...sn, body: { ...body, variances: (sn.body.variances ?? []).map((row: Data) => payroll.has(row.line) ? { ...row, explanation: null, evidence: [] } : row) } }
}
