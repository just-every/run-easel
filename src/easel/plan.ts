// Scenario inputs, branching and agent-ready proposals. A proposal is a
// branch bound to the exact revision of the scenario it would change; finance
// promotes the exact proposal revision it reviewed, or nothing changes.
import { actualCells } from './actuals-read'
import { assertHistorySources } from './history-sources'
import { referenceMonths, historySchedule } from './history-schedules'
import { range } from './months'
import { scenarioAccess, requireScenarioEdit } from './scenario-access'
import { requireDepartment, requirePayDetail, requireFinance, requireMember } from './access'
import type { Context } from './context'
import { INPUT_KINDS, inputDepartment, requireEditable, scenarioInputs, validateInput, workspace, type InputKind } from './model'
import { cents } from './units'
import { cashBalance } from './actuals'
import { frozenModel } from './reforecasts'
import { all, choice, find, get, integer, optionalText, put, remove, requireThat, text, uid, type Data, type State } from './types'

export function bump(c: Context, scenario: Data, action: string, record: string, detail: Data = {}) {
 const before = scenario.revision, after = before + 1
 put(c.s, 'scenario', scenario.id, { ...scenario, revision: after })
 c.activity.push({ action, record, scenario: scenario.id, before, after, detail })
 return after
}

/** Copies every input of one scenario into another, keeping each input's origin so changes can be compared. */
export function copyInputs(s: State, from: string, to: string) {
 for (const kind of INPUT_KINDS) for (const input of scenarioInputs(s, from, kind)) put(s, kind, uid(), { ...input, scenario: to })
}

/** A frozen version may outlive its source, so branch from its captured inputs. */
async function copyVersionInputs(c: Context, from: Data, to: string) {
 if (from.status !== 'frozen') { copyInputs(c.s, from.id, to); return }
 const m = await frozenModel(c, from)
 for (const kind of INPUT_KINDS) for (const input of m.inputs[kind] ?? []) put(c.s, kind, uid(), { ...input, scenario: to })
}

export function clearInputs(s: State, scenario: string) {
 for (const kind of INPUT_KINDS) for (const input of scenarioInputs(s, scenario, kind)) remove(s, kind, input.id)
}

export async function plan(c: Context, op: string, b: Data): Promise<Data | undefined> {
 const { s, x } = c
 if ((INPUT_KINDS as readonly string[]).includes(op)) {
  requireMember(x)
  const kind = op as InputKind
  if(kind==='tax-policy' || kind==='workbook-model') requireFinance(x)
  if(kind==='workbook-model') requirePayDetail(x)
  if (kind === 'position' || b.line && get(s, 'line', b.line).payroll) requirePayDetail(x)
  const scenario = scenarioAccess(s, x, b.scenario)
  const prior = b.id ? get(s, kind, b.id) : undefined
  requireThat(!prior || prior.scenario === scenario.id, 'This input belongs to another scenario')
  if (prior?.line && get(s, 'line', prior.line).payroll) requirePayDetail(x)
  if (prior) requireEditable(s, x, scenario, inputDepartment(kind, prior))
  const originId = prior?.originId ?? uid()
  const value: Data = { ...validateInput(s, kind, { ...b, originId }, scenario.id), scenario: scenario.id, originId }
  requireEditable(s, x, scenario, inputDepartment(kind, value))
  if (kind === 'revenue' && prior?.kind === 'services' && value.kind === 'services' && prior.gaugeActuals) {
   requireThat(value.department === prior.department, 'Undo Gauge utilization imports before changing the driver department', 409)
   Object.assign(value, { gaugeActuals: prior.gaugeActuals, gaugeUndo: null })
  }
  if (kind === 'schedule' && b.scenarioRevision !== undefined) requireThat(Number(b.scenarioRevision) === scenario.revision, 'The plan changed; reload before saving the grid', 409)
  if (kind === 'schedule' && prior?.workbookOrigin) {
   requireThat(!value.history && value.line===prior.line && value.department===prior.department,'Keep workbook rows on their reviewed line and department',409)
   for (const month of Object.keys(prior.provenance?.formulas ?? {})) requireThat(value.values[month]===prior.values[month],'Edit the source driver instead of a workbook formula cell',409)
   Object.assign(value,{workbookOrigin:prior.workbookOrigin,workbookCells:prior.workbookCells,provenance:prior.provenance})
  }
  if (kind === 'schedule' && prior && !value.history) {
   for (const [m, parts] of Object.entries(prior.subrows ?? {})) requireThat(!(parts as Data[]).length || value.values[m] === prior.values[m], 'Edit split cells through the planning grid', 409)
   Object.assign(value, { notes: prior.notes ?? {}, subrows: prior.subrows ?? {}, gridRevisions: prior.gridRevisions ?? {} })
  }
  if (kind === 'schedule' && value.history) {
   requireDepartment(x, value.history.sourceDepartment)
   const months = range(workspace(s).planStart, scenario.horizon ?? workspace(s).horizon).filter(m => !scenario.actualsThrough || m > scenario.actualsThrough)
   await assertHistorySources(c, months.flatMap(m => referenceMonths(value.history, m)))
   historySchedule(value, await actualCells(c.db, s), months, workspace(s).currency)
  }
  const id = prior?.id ?? uid()
  put(s, kind, id, value)
  bump(c, scenario, prior ? `${kind}-changed` : `${kind}-added`, id, { name: value.name ?? value.title, department: value.department ?? value.sourceDepartment })
  return { ...value, id }
 }
 if (op === 'input-delete') {
  requireMember(x)
  const kind = choice(b.kind, INPUT_KINDS, 'an input kind')
  if(kind==='tax-policy' || kind==='workbook-model') requireFinance(x)
  if(kind==='workbook-model') requirePayDetail(x)
  const input = get(s, kind, b.id)
  if (kind === 'position' || input.line && get(s, 'line', input.line).payroll) requirePayDetail(x)
  const scenario = scenarioAccess(s, x, input.scenario)
  requireEditable(s, x, scenario, inputDepartment(kind, input))
  requireThat(kind !== 'revenue' || !all(s, 'expense').some(e => e.scenario === scenario.id && e.revenueOrigin === input.originId), 'Remove linked acquisition or inventory costs before deleting this revenue driver', 409)
  requireThat(kind !== 'asset-category' || !all(s, 'asset').some(a => a.scenario === input.scenario && a.category === input.originId), 'This category is used by assets; move or remove them first', 409)
  if (kind === 'position') requireThat(!all(s,'position').some(p => p.scenario === scenario.id && p.backfillOrigin === input.originId), 'Remove the backfill link before deleting this position',409)
  if(kind==='workbook-model') requireThat(!all(s,'schedule').some(row=>row.scenario===scenario.id&&row.workbookOrigin===input.originId),'Remove linked workbook schedules before deleting the source graph',409)
  remove(s, kind, input.id)
  bump(c, scenario, `${kind}-removed`, input.id, { name: input.name ?? input.title })
  return { removed: input.id }
 }
 if (op === 'scenario-cash') {
  requireFinance(x)
  const scenario = scenarioAccess(s, x, b.scenario)
  requireEditable(s, x, scenario, null)
  const basis = choice(b.basis, ['estimate', 'imported'] as const, 'whether opening cash is an estimate or imported')
  const imported = basis === 'imported' ? await cashBalance(c.db, s, workspace(s).planStart) : undefined
  requireThat(!imported || imported.rows > 0, 'No accepted actuals rows are mapped to the cash balance before the first plan month', 409)
  const cash = {
   openingCents: imported ? imported.cents : cents(b.opening, 'Opening cash', { negative: true }),
   basis, note: optionalText(b.note, 'Note', 500),
   receivablesCents: cents(b.receivables ?? '0', 'Opening receivables'), payablesCents: cents(b.payables ?? '0', 'Opening payables'),
   collectionLag: integer(b.collectionLag ?? 0, 'Collection timing (months)', 0, 3), paymentLag: integer(b.paymentLag ?? 0, 'Payment timing (months)', 0, 3),
   ...(imported ? { importedFrom: { rows: imported.rows, batches: imported.batches, before: workspace(s).planStart } } : {}),
  }
  put(s, 'scenario', scenario.id, { ...scenario, cash })
  bump(c, get(s, 'scenario', scenario.id), 'cash-changed', scenario.id, { basis })
  return get(s, 'scenario', scenario.id)
 }
 if (op === 'branch' || op === 'proposal-create') {
  requireMember(x)
  const from = scenarioAccess(s, x, b.from)
  requireThat(from.kind !== 'proposal', 'Branch from a plan, not from a proposal')
  if (op === 'branch') {
   if (b.privateSandbox === true) requireThat(x.role === 'finance' || x.role === 'contributor', 'Only planners create sandboxes', 403)
   else requireFinance(x)
  }
  else {
   requireThat(!from.sandbox, 'Use Submit sandbox to propose its reviewed changes', 409)
   requireThat(x.role === 'finance' || x.role === 'contributor', 'Viewers cannot propose changes', 403)
   requireThat(from.status === 'working', 'Proposals change a working scenario; this one is frozen', 409)
  }
  const id = uid()
  const kind = op === 'branch' ? 'scenario' : 'proposal'
  put(s, 'scenario', id, {
   name: text(b.name, op === 'branch' ? 'Scenario name' : 'Proposal name'), kind, status: 'working', revision: 1, createdBy: x.actor.email, createdAt: c.now,
   ...(from.horizon ? { horizon: from.horizon } : {}),
   ...((b.privateSandbox === true || from.sandbox) ? { sandbox: { grants: {} } } : {}),
   parent: from.id, branchedFrom: { scenario: from.id, revision: from.revision, name: from.name }, actualsThrough: from.actualsThrough ?? null, cash: from.cash,
   ...(kind === 'proposal' ? { request: text(b.request, 'What should change', 2000), proposalStatus: 'draft' } : {}),
  })
  await copyVersionInputs(c, from, id)
  c.activity.push({ action: op, record: id, scenario: id, after: 1, detail: { from: from.id, fromRevision: from.revision } })
  return get(s, 'scenario', id)
 }
 if (op === 'proposal-submit') {
  requireMember(x)
  requireThat(x.role === 'finance' || x.role === 'contributor', 'Only finance and contributors submit proposals', 403)
  const p = proposal(s, b.id, x)
  requireThat(p.createdBy === x.actor.email || x.role === 'finance', 'Only the proposer submits a proposal', 403)
  requireProposalScope(s, x, p)
  requireThat(p.proposalStatus === 'draft', 'This proposal was already submitted', 409)
  put(s, 'scenario', p.id, { ...p, proposalStatus: 'submitted', submittedRevision: p.revision, submittedAt: c.now, summary: optionalText(b.summary, 'Summary', 4000) })
  c.activity.push({ action: op, record: p.id, scenario: p.id, before: p.revision, after: p.revision, detail: {} })
  return get(s, 'scenario', p.id)
 }
 if (op === 'proposal-promote') {
  requireFinance(x)
  const p = proposal(s, b.id, x)
  requireThat(p.proposalStatus === 'submitted', 'Only a submitted proposal can be promoted', 409)
  const reviewed = integer(b.revision, 'Reviewed proposal revision', 1, Number.MAX_SAFE_INTEGER)
  requireThat(reviewed === p.revision, 'The proposal changed after you reviewed it; review its current revision', 409)
  const target = scenarioAccess(s, x, p.branchedFrom.scenario)
  requireScenarioEdit(x, target)
  requireThat(target.status === 'working', 'The target scenario is frozen', 409)
  requireThat(target.revision === p.branchedFrom.revision, `${target.name} changed since this proposal was made (revision ${p.branchedFrom.revision} → ${target.revision}); make a fresh proposal from its current revision`, 409)
  clearInputs(s, target.id)
  copyInputs(s, p.id, target.id)
  put(s, 'scenario', target.id, { ...target, cash: p.cash })
  const after = bump(c, get(s, 'scenario', target.id), 'proposal-promoted', p.id, { proposal: p.id, proposalRevision: p.revision, request: p.request })
  put(s, 'scenario', p.id, { ...p, status: 'closed', proposalStatus: 'promoted', promotedBy: x.actor.email, promotedAt: c.now, promotedInto: { scenario: target.id, revision: after } })
  return { target: get(s, 'scenario', target.id), proposal: get(s, 'scenario', p.id) }
 }
 if (op === 'proposal-decline') {
  requireFinance(x)
  const p = proposal(s, b.id, x)
  requireThat(p.proposalStatus === 'submitted' || p.proposalStatus === 'draft', 'This proposal is already closed', 409)
  put(s, 'scenario', p.id, { ...p, status: 'closed', proposalStatus: 'declined', declinedBy: x.actor.email, reason: text(b.reason, 'Reason', 2000) })
  c.activity.push({ action: op, record: p.id, scenario: p.id, detail: { reason: b.reason } })
  return get(s, 'scenario', p.id)
 }
 if (op === 'scenario-adopt') {
  // Finance replaces a working plan's inputs with another scenario's, for
  // example a budget moved in from a workbook, at the revision it reviewed.
  requireFinance(x)
  const from = scenarioAccess(s, x, b.from)
  requireThat(!from.sandbox, 'Submit this private sandbox as a proposal before adopting it', 409)
  const into = scenarioAccess(s, x, b.into)
  requireThat(from.id !== into.id && from.kind !== 'proposal', 'Choose a different scenario to adopt')
  requireEditable(s, x, into, null)
  requireThat(Number(b.revision) === into.revision, `${into.name} changed since you reviewed it; review its current revision`, 409)
  clearInputs(s, into.id)
  await copyVersionInputs(c, from, into.id)
  bump(c, get(s, 'scenario', into.id), op, into.id, { from: from.id, fromRevision: from.revision, name: from.name })
  return get(s, 'scenario', into.id)
 }
 if (op === 'scenario-delete') {
  requireFinance(x)
  const sc = scenarioAccess(s, x, b.id)
  requireThat(!sc.sandbox, 'Private sandboxes are retained with their sharing history', 409)
  requireThat(sc.kind === 'scenario' || (sc.kind === 'proposal' && sc.status === 'closed'), 'Only branched scenarios and closed proposals can be deleted', 409)
  requireThat(!all(s, 'scenario').some(o => o.parent === sc.id && o.status === 'working'), 'Close or delete the proposals made from this scenario first', 409)
  clearInputs(s, sc.id)
  remove(s, 'scenario', sc.id)
  c.activity.push({ action: op, record: sc.id, detail: { name: sc.name } })
  return { removed: sc.id }
 }
 return undefined
}

function proposal(s: State, id: unknown, x: import('./types').Access) {
 const p = scenarioAccess(s, x, id)
 requireThat(p.kind === 'proposal', 'Not a proposal')
 return p
}

export const findScenario = (s: State, id: string) => find(s, 'scenario', id)

/** Recheck every changed department against today's grant, including deletions.
 * The proposal carries a copy of other departments, not authority to submit them. */
function requireProposalScope(s: State, x: import('./types').Access, p: Data) {
 if (x.role === 'finance') return
 const parent = get(s, 'scenario', p.branchedFrom.scenario)
 requireThat(JSON.stringify(p.cash) === JSON.stringify(parent.cash), 'Only finance can propose cash changes', 403)
 const value = (row: Data) => { const { id: _id, scenario: _sc, ...rest } = row; return JSON.stringify(rest) }
 for (const kind of INPUT_KINDS) {
  const before = new Map(scenarioInputs(s, parent.id, kind).map(i => [i.originId, i]))
  const after = new Map(scenarioInputs(s, p.id, kind).map(i => [i.originId, i]))
  for (const origin of new Set([...before.keys(), ...after.keys()])) {
   const a = before.get(origin), b = after.get(origin)
   if (a && b && value(a) === value(b)) continue
   if (kind === 'position' || [a, b].some(row => row?.line && get(s, 'line', row.line).payroll)) requirePayDetail(x)
   requireThat(kind !== 'allocation', 'Only finance can propose allocation changes', 403)
   for (const row of [a, b]) if (row) requireDepartment(x, inputDepartment(kind, row)!)
  }
 }
}
