// Ordinary commands build an isolated proposal. Nothing is merged until every check passes.
import { workingCalculation } from '../calculation'
import type { Context } from '../context'
import { scenarioInputs } from '../model'
import { parseExpression, visitExpression } from '../native-expression'
import { plan } from '../plan'
import { compareView } from '../views'
import { decimal } from '../units'
import { get, put, requireThat, type Data, type State } from '../types'
import { modelerOutput } from './modeler-schema'

const stamp = (line: string, department: string, month: string) => `${line}|${department}|${month}`
function freshName(used: Set<string>, value: string) { const name = value.trim().toLowerCase(); requireThat(name && !used.has(name), 'New positions and drivers need distinct unused names'); used.add(name) }
function formulaScope(formula: string) {
 const allowed = new Set(['DRIVER', 'PRIOR', 'LINE', 'GROWTH', 'PERIOD', 'IF', 'MIN', 'MAX', 'ROUND'])
 visitExpression(parseExpression(formula), node => requireThat(allowed.has(node.name), 'Modeler formulas can use only the reviewed scalar formula functions'))
}
export async function buildModelerProposal(c: Context, intent: Data, raw: unknown) {
 const output = modelerOutput(raw), source = JSON.parse(intent.request.input)
 const s: State = new Map([...c.s].map(([key, row]) => [key, structuredClone(row)]))
 const draft: Context = { ...c, s, activity: [], snapshots: [], extra: [] }
 const proposal = (await plan(draft, 'proposal-create', { from: intent.from, name: output.name, request: intent.requestText }))!
 const names = new Set([...scenarioInputs(s, proposal.id, 'revenue'), ...scenarioInputs(s, proposal.id, 'formula')].map(r => r.name.toLowerCase()))
 const titles = new Set(scenarioInputs(s, proposal.id, 'position').map(p => p.title.toLowerCase()))
 const touched = new Set<string>(), destinations: Data[] = []
 for (const position of output.positions) {
  freshName(titles, position.title)
  requireThat(get(s, 'line', position.line).payroll === true, 'New modeler positions require an existing payroll planning line')
  await plan(draft, 'position', { ...position, scenario: proposal.id })
  destinations.push(position)
 }
 for (const revenue of output.revenues) {
  const prior = revenue.sourceOrigin ? scenarioInputs(s, proposal.id, 'revenue').find(r => r.originId === revenue.sourceOrigin) : undefined
  if (revenue.sourceOrigin) {
   requireThat(prior && source.revenues.some((r: Data) => r.originId === revenue.sourceOrigin), 'Only a supplied simple volume driver can be updated')
   requireThat(prior.name === revenue.name, 'Keep the name of an updated revenue driver')
   requireThat(!touched.has(revenue.sourceOrigin), 'Each source driver may change once'); touched.add(revenue.sourceOrigin)
  } else freshName(names, revenue.name)
  await plan(draft, 'revenue', { ...revenue, scenario: proposal.id, kind: 'volume', ...(prior ? { id: prior.id, dimensions: prior.dimensions } : {}) })
  destinations.push(revenue)
 }
 for (const formula of output.formulas) {
  formulaScope(formula.formula)
  const prior = formula.sourceOrigin ? scenarioInputs(s, proposal.id, 'formula').find(f => f.originId === formula.sourceOrigin) : undefined
  if (formula.sourceOrigin) {
   requireThat(prior && source.formulas.some((f: Data) => f.originId === formula.sourceOrigin), 'Only a supplied scalar formula can be updated')
   requireThat(prior.name === formula.name, 'Keep the name of an updated formula driver')
   requireThat(!touched.has(formula.sourceOrigin), 'Each source driver may change once'); touched.add(formula.sourceOrigin)
  } else freshName(names, formula.name)
  await plan(draft, 'formula', { ...formula, scenario: proposal.id, revision: get(s, 'scenario', proposal.id).revision, ...(prior ? { id: prior.id, dimensions: prior.dimensions } : {}) })
  if (formula.line) destinations.push(formula)
 }
 const comparison = await compareView(draft, intent.from, proposal.id), calculation = await workingCalculation(draft, proposal.id)
 requireThat(comparison.changedInputs.length > 0 && comparison.changedCells.length > 0, 'The proposed operations do not move any financial cells')
 const expectedTests = output.tests.map((test: Data) => {
  requireThat(calculation.months.includes(test.month) && (!source.scenario.actualsThrough || test.month > source.scenario.actualsThrough), 'Expected-value checks must use an open plan month')
  let actual: number, unit = 'money'
  if (test.target === 'cell') {
   requireThat(!test.driver && get(s, 'line', test.line) && get(s, 'department', test.department), 'Choose an exact cell test target')
   actual = calculation.cells.find(cell => cell.line === test.line && cell.department === test.department && cell.month === test.month)?.amount ?? 0
  } else {
   requireThat(!test.line, 'Driver checks must leave the planning line empty')
   const value = calculation.formulaValues?.find(v => v.name === test.driver && v.month === test.month && !v.member && v.department === test.department)
   requireThat(value, 'The checked scalar formula value does not exist')
   actual = value.value; unit = value.unit
  }
  const expected = decimal(test.expected, 'Expected decimal value', 2, { negative: true })
  requireThat(actual === expected, `Expected-value check failed for ${test.driver || test.line}, ${test.month}: expected ${expected} minor units, calculated ${actual}`)
  return { ...test, expectedMinor: expected, actualMinor: actual, unit, passed: true }
 })
 const moved = new Set(comparison.changedCells.map(cell => stamp(cell.line, cell.department, cell.month)))
 for (const target of destinations) requireThat(expectedTests.some((test: Data) => test.target === 'cell' && test.line === target.line && test.department === target.department && test.month >= target.start && (!target.end || test.month <= target.end) && moved.has(stamp(test.line, test.department, test.month))), 'Every changed position or financial driver needs a passing test of a moved active cell')
 for (const formula of output.formulas) requireThat(expectedTests.some((test: Data) => test.target === 'driver' && test.driver === formula.name && test.department === formula.department && test.month >= formula.start && (!formula.end || test.month <= formula.end)), 'Every changed formula needs a passing scalar driver check')
 const current = get(s, 'scenario', proposal.id)
 put(s, 'scenario', proposal.id, { ...current, agent: 'Modeler', model: intent.model, modelerRun: intent.id })
 const usedLines = new Set(comparison.changedInputs.flatMap(i => [i.before?.line, i.after?.line]).filter(Boolean)), usedDepartments = new Set(comparison.changedInputs.flatMap(i => [i.before?.department, i.after?.department]).filter(Boolean))
 const proof = { proposal: proposal.id, proposalRevision: current.revision, from: intent.from, sourceRevision: intent.sourceRevision, sourceFingerprint: intent.sourceFingerprint, requestFingerprint: intent.fingerprint, agent: 'Modeler', model: intent.model, run: intent.id, createdAt: c.now, inputDiff: comparison.changedInputs, changedCells: comparison.changedCells, expectedTests,
  structureDiff: { reusedLines: [...usedLines].map(id => ({ before: get(c.s, 'line', id), after: get(s, 'line', id) })), reusedDepartments: [...usedDepartments].map(id => ({ before: get(c.s, 'department', id), after: get(s, 'department', id) })), formulaDefinitions: comparison.changedInputs.filter(i => i.kind === 'formula') } }
 put(s, 'modeler-proof', proposal.id, proof)
 return { context: draft, proof, proposal: get(s, 'scenario', proposal.id) }
}
