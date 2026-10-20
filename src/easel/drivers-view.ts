// The read model behind Easel's home screen, the cash driver tree: one scenario's monthly closing cash, its cash
// split into collections, payroll, spend and financing per line, department and input (cash-drivers.ts), headcount
// by department, the agreed floor, and the few input fields a driver card names. It is projected from the same
// role-filtered scenario view as everything else, so a reader sees exactly the detail scenarioView allows.
import type { Context } from './context'
import type { Data } from './types'
import { scenarioView } from './views'

const pick = (input: Data, keys: string[]) => Object.fromEntries(keys.filter(k => input[k] !== undefined).map(k => [k, input[k]]))
const FIELDS: Record<string, string[]> = {
 revenue: ['startCustomers', 'newPerMonth', 'newPerRep', 'repDepartment', 'churnBps', 'arpaCents', 'collectionLag', 'startDate', 'contractValueCents', 'termMonths', 'billingCadence', 'dsoDays', 'startVolume', 'rateCents'],
 expense: ['amountCents', 'end'],
 debt: ['debtKind', 'limitCents', 'openingCents', 'drawsCents', 'annualRateBps', 'maturity'],
 equity: ['month', 'amountCents'],
 position: ['title', 'end'],
}

export async function driversView(c: Context, id: string) {
 const view = await scenarioView(c, id)
 const calc = view.calculation
 const sc = view.scenario
 const inputs = Object.entries(FIELDS).flatMap(([kind, keys]) => (view.inputs[kind] ?? []).map((i: Data) => ({
  // `kind` is the input's category; `mode` is its own kind (a contract, a recurring expense).
  id: i.id, origin: i.originId, kind, mode: i.kind ?? '', name: i.name ?? i.title, line: i.line ?? '', department: i.department ?? '', start: i.start ?? '', ...pick(i, keys),
 })))
 return {
  scenario: pick(sc, ['id', 'name', 'kind', 'status', 'revision', 'actualsThrough', 'proposalStatus', 'submittedAt', 'submittedRevision', 'summary', 'request', 'createdBy', 'createdAt', 'branchedFrom', 'reforecast', 'approval', 'sandbox']),
  currency: calc.currency, months: calc.months, actualsThrough: calc.actualsThrough,
  opening: calc.cash[0]?.opening ?? 0,
  cash: calc.cash.map(m => ({ month: m.month, closing: m.closing })),
  drivers: calc.cashDrivers ?? null,
  headcount: calc.headcount,
  health: { lowestCash: view.cashHealth.lowestCash, agreement: view.cashHealth.agreement, agreementStatus: view.cashHealth.agreementStatus, firstFloorBreach: view.cashHealth.firstFloorBreach, incomplete: !!view.cashHealth.incompleteReasons?.length,
   runway: view.cashHealth.months.map((m: Data) => ({ month: m.month, runwayHundredths: m.runwayHundredths, basis: m.runwayBasis })) },
  lines: view.lines.map(l => ({ id: l.id, name: l.name, type: l.type, payroll: !!l.payroll })),
  departments: view.departments.map(d => ({ id: d.id, name: d.name })),
  inputs,
 }
}
