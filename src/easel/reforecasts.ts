import { workingCalculation } from './calculation'
import { scenarioAccess } from './scenario-access'
import { requireFinance } from './access'
import { approvedModel } from './approved'
import type { Context } from './context'
import { type Calculation, type Model } from './engine'
import { model } from './model'
import { snapshot } from './store'
import { all, get, put, requireThat, text, uid, type Data } from './types'

/** Frozen versions always read their captured structure, inputs and arithmetic. */
export async function frozenModel(c: Context, scenario: Data): Promise<Model & { calculation: Calculation; actualsHistory?: Data }> {
 if (scenario.kind !== 'reforecast') return approvedModel(c, scenario)
 const sn = await snapshot(c.db, scenario.reforecast?.snapshot)
 const b = sn.body
 requireThat(sn.kind === 'reforecast' && sn.scenario === scenario.id && b.scenario.id === scenario.id && b.revision === scenario.revision && b.scenario.revision === b.revision, 'The saved reforecast does not match this version', 409)
 return { scenario: b.scenario, workspace: b.workspace, lines: b.lines, departments: b.departments, inputs: b.inputs, calculation: b.calculation, actualsHistory: b.actualsHistory }
}

/** Saving a version leaves its working source unchanged. The revision fence in
 * store.save makes the captured revision and the new snapshot one atomic save. */
export async function reforecasts(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'reforecast-save') return undefined
 requireFinance(c.x)
 const from = scenarioAccess(c.s, c.x, b.from)
 requireThat(!from.sandbox, 'Submit a private sandbox as a proposal before saving an official version', 409)
 requireThat(from.status === 'working' && ['forecast', 'scenario'].includes(from.kind), 'Save a reforecast from a working forecast or scenario', 409)
 requireThat(Number(b.revision) === from.revision, 'The plan changed after you reviewed it; reload before saving a reforecast', 409)
 const name = text(b.name, 'Reforecast name')
 requireThat(!all(c.s, 'scenario').some(sc => sc.kind === 'reforecast' && sc.name.toLowerCase() === name.toLowerCase()), 'A reforecast already has this name; choose a new version name', 409)
 const m = model(c.s, from.id)
 const calculation = await workingCalculation(c, from.id)
 const id = uid(), snapshotId = uid()
 const source = { scenario: from.id, revision: from.revision, name: from.name }
 const saved = {
  id, name, kind: 'reforecast', status: 'frozen', revision: from.revision,
  createdBy: c.x.actor.email, createdAt: c.now, parent: from.id, branchedFrom: source,
  horizon: m.workspace.horizon, actualsThrough: from.actualsThrough ?? null, cash: from.cash,
  reforecast: { snapshot: snapshotId, by: c.x.actor.email, at: c.now, revision: from.revision },
 }
 put(c.s, 'scenario', id, saved)
 c.snapshots.push({ id: snapshotId, kind: 'reforecast', scenario: id, label: name, body: {
  scenario: saved, workspace: m.workspace, lines: m.lines, departments: m.departments, inputs: m.inputs, calculation,
  source, sourceScenario: from, revision: from.revision, savedBy: { email: c.x.actor.email, name: c.x.actor.name }, savedAt: c.now,
 } })
 c.activity.push({ action: op, record: id, scenario: id, before: from.revision, after: from.revision, detail: { snapshot: snapshotId, source: from.id, revision: from.revision } })
 return get(c.s, 'scenario', id)
}
