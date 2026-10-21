import type { Context } from './context'
import type { Calculation, Model } from './engine'
import { snapshot } from './store'
import { requireThat, type Data } from './types'

/** Approved metadata, assumptions and arithmetic have one immutable source. */
export async function approvedModel(c: Context, scenario: Data): Promise<Model & { calculation: Calculation; dimensionStructure?: Data; actualsHistory?: Data }> {
 const sn = await snapshot(c.db, scenario.approval?.snapshot)
 const b = sn.body
 requireThat(sn.kind === 'approval' && sn.scenario === scenario.id && b.scenario.id === scenario.id && b.revision === scenario.approval.revision && b.scenario.revision === b.revision, 'The approval does not match this budget', 409)
 return {
  scenario: { ...b.scenario, approval: { snapshot: sn.id, by: b.approvedBy.email, at: b.approvedAt, revision: b.revision } },
  workspace: b.workspace, lines: b.lines, departments: b.departments, inputs: b.inputs, calculation: b.calculation, dimensionStructure: b.dimensionStructure ?? b.structure, actualsHistory: b.actualsHistory,
 }
}
