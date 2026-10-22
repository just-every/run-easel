// A reviewed mapping creates an isolated native model before the journal writes.
import { calculate } from './engine'
import { validateDimensions } from './dimensions'
import { model, validateInput, workspace } from './model'
import { range } from './months'
import type { MoveExport } from './move-source'
import { decimal } from './units'
import { all, choice, find, get, put, requireThat, text, type Data, type State } from './types'
import { sha256 } from '../modules/import-kit/src/d1/index'

export function mapMove(source: MoveExport, original: State, mapping: Data, id: string, actor: string, provider: string) {
 const state = new Map(original), records: { kind: string; id: string; value: Data; location: string }[] = [], unmapped = [...source.unmapped]
 const w = workspace(state), months = range(w.planStart, w.horizon)
 const makeId = (kind: string, source: string) => `${id}:${kind}:${sha256(source).slice(0,16)}`
 const add = (kind: string, source: string, value: Data, location = source) => {
  const target = makeId(kind, source)
  put(state, kind, target, value); records.push({ kind, id: target, value, location }); return target
 }
 const unresolved: string[] = []
 const resolve = (kind: string, row: Data, selected: unknown, value: () => Data): string | undefined => {
  if (selected === 'exclude') { unmapped.push({ location: `${kind}:${row.id}`, reason: 'Explicitly excluded by the reviewed mapping' }); return }
  if (selected === 'create' || selected && typeof selected === 'object') {
   const input = { ...value(), ...(typeof selected === 'object' ? selected : {}) }
   input.name = text(input.name, `${kind} name`)
   requireThat(!all(state, kind).some(r => r.name.toLowerCase() === input.name.toLowerCase()), `Map ${row.id} to the existing ${kind} named ${input.name}`)
   return add(kind, row.id, input)
  }
  if (typeof selected === 'string') return get(state, kind, selected).id
  unresolved.push(`${kind}:${row.id}`); return
 }
 const levels = new Map(source.levels.map(row => [row.id, resolve('department', row, mapping.levels?.[row.id], () => ({ name: row.name, shared: false, onCostDefaultBps: 0 }))]))
 const accounts = new Map(source.accounts.map(row => [row.id, resolve('line', row, mapping.accounts?.[row.id], () => {
  const config = mapping.accounts?.[row.id]
  const type = choice(config?.type, ['revenue', 'cost-of-sales', 'operating-expense'] as const, 'an account planning type')
  requireThat(!(config.payroll && type === 'revenue'), 'Payroll accounts must be expenses')
  return { name: row.name, type, payroll: config.payroll === true, nonCash: config.nonCash === true, order: all(state, 'line').length }
 })]))
 // Each source account keeps an independently checkable native line.
 const mappedAccounts = [...accounts.values()].filter(Boolean)
 requireThat(new Set(mappedAccounts).size === mappedAccounts.length, 'Map each imported account to a separate planning line for exact reconciliation')
 const dimensions = new Map<string, string>(), members = new Map<string, Map<string, string>>()
 for (const dimension of source.dimensions) {
  const target = resolve('dimension', dimension, mapping.dimensions?.[dimension.id], () => ({ name: dimension.name }))
  if (!target) continue
  dimensions.set(dimension.id, target)
  const mapped = new Map<string, string>(); members.set(dimension.id, mapped)
  const pending = [...dimension.members]
  while (pending.length) {
   const before = pending.length
   for (let i = pending.length - 1; i >= 0; i--) {
    const row = pending[i]
    if (row.parent && !mapped.has(row.parent)) continue
    const member = resolve('dimension-member', row, mapping.members?.[dimension.id]?.[row.id], () => ({ name: row.name, dimension: target, parent: row.parent ? mapped.get(row.parent) : '' }))
    if (member) { requireThat(get(state, 'dimension-member', member).dimension === target, 'A mapped member belongs to another dimension'); mapped.set(row.id, member) }
    pending.splice(i, 1)
   }
   requireThat(pending.length < before, 'Source dimension hierarchy has a missing parent or cycle')
  }
 }
 const tags = (sourceTags: Record<string, string> = {}) => validateDimensions(state, Object.fromEntries(Object.entries(sourceTags).flatMap(([dimension, member]) => {
  const target = dimensions.get(dimension), mapped = members.get(dimension)?.get(member)
  if (!target || !mapped) { unresolved.push(`dimension:${dimension}:${member}`); return [] }
  return [[target, mapped]]
 })))
 const scenarios = new Map<string, string>()
 for (const version of source.versions) scenarios.set(version.id, add('scenario', version.id, { name: version.name, kind: 'scenario', status: 'working', revision: 1, createdBy: actor, actualsThrough: null, parent: null, horizon: w.horizon,
  cash: { openingCents: 0, basis: 'estimate', note: 'Opening balance unavailable in the imported export', receivablesCents: 0, payablesCents: 0, collectionLag: 0, paymentLag: 0 }, imported: { move: id, sourceVersion: version.id } }))
 const payrollKeys = new Set<string>()
 const positions: Data[] = []
 const mappedColumns = new Set(Object.values(mapping.personnelColumns ?? {}))
 for (const row of source.personnel) {
  const scenario = scenarios.get(row.version), department = levels.get(row.level), line = accounts.get(row.account)
  if (!scenario || !department || !line) { unresolved.push(`personnel:${row.location}`); continue }
  requireThat(get(state, 'line', line).payroll, 'Personnel rows require a payroll-classified account')
  const values: Data = Object.fromEntries(Object.entries(mapping.personnelColumns ?? {}).map(([field, column]) => [field, row.values[column as string] ?? '']))
  for (const column of Object.keys(row.values)) if (!mappedColumns.has(column) && !['InternalID', 'ParentID', 'IsParent'].includes(column)) unmapped.push({ location: `${row.location}:${column}`, reason: 'Modeled-sheet column has no mapped Easel equivalent' })
  const startDate = String(values.start ?? ''), endDate = String(values.end ?? '')
  const request = { ...values, start: startDate.slice(0,7), end: endDate.slice(0,7), plannedStartDate: values.plannedStartDate || (/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : ''), annualSalary: values.annualSalary || '0', onCostPercent: values.onCostPercent || '0', department, line, dimensions: tags((row as Data).dimensions), originId: makeId('position', `${row.version}:${row.id}`) }
  const value = { ...validateInput(state, 'position', request, scenario), originId: request.originId, scenario, provider: `move:${provider}`, employeeId: row.id, imported: { move: id, location: row.location } }
  add('position', `${row.version}:${row.id}`, value, row.location); positions.push(value)
  payrollKeys.add(`${row.version}:${row.account}`)
 }
 const expected = new Map<string, number>(), schedules = new Map<string, Data>()
 for (const row of source.data) {
  const scenario = scenarios.get(row.version), line = accounts.get(row.account), department = levels.get(row.level)
  if (!scenario || !line || !department) { unresolved.push(`data:${row.location}`); continue }
  requireThat(months.includes(row.month), `Export period ${row.month} is outside the current plan`)
  const amount = decimal(row.amount, 'Export amount', 2, { negative: true })
  const key = JSON.stringify([row.version,row.account,row.level,row.month])
  const total = (expected.get(key) ?? 0) + amount
  requireThat(Number.isSafeInteger(total), 'Export totals exceed the supported exact range'); expected.set(key, total)
  if (payrollKeys.has(`${row.version}:${row.account}`)) continue
  const dimensions = tags(row.dimensions)
  const scheduleKey = JSON.stringify([row.version,row.account,row.level,dimensions])
  const schedule = schedules.get(scheduleKey) ?? { scenario, originId: makeId('schedule', scheduleKey), name: `${get(state,'line',line).name} · ${get(state,'department',department).name}`, line, department, dimensions, values: {}, provenance: { move:id, locations:[] } }
  schedule.values[row.month] = (schedule.values[row.month] ?? 0) + amount; schedule.provenance.locations.push(row.location); schedules.set(scheduleKey,schedule)
 }
 for (const [key,value] of schedules) add('schedule',key,value)
 const calculations = [...scenarios].map(([version, scenario]) => ({ version, scenario, calculation: calculate(model(state,scenario)) }))
 const reconciliation: Data[] = []
 for (const [version, scenario] of scenarios) for (const [account, line] of accounts) {
  if (!line) continue
  for (const [level, department] of levels) {
   if (!department) continue
   for (const month of months) {
    const key = JSON.stringify([version,account,level,month])
    const hasPositions = positions.some(p=>p.scenario===scenario && p.line===line && p.department===department)
    if (!expected.has(key) && !hasPositions) continue
    const actual = calculations.find(c=>c.scenario===scenario)!.calculation.cells.filter(c=>c.line===line && c.department===department && c.month===month).reduce((sum,c)=>sum+c.amount,0)
    reconciliation.push({ version, scenario, account, line, level, department, month, exported: expected.get(key) ?? null, imported: actual, difference: expected.has(key) ? actual-expected.get(key)! : null, status: expected.has(key) && actual === expected.get(key) ? 'reconciled' : 'unreconciled' })
   }
  }
 }
 return { state, records, unresolved: [...new Set(unresolved)], unmapped, calculations, reconciliation, positions,
  created: records.filter(r=>['department','line','dimension','dimension-member','scenario','position'].includes(r.kind)).map(r=>({kind:r.kind,id:r.id,name:r.value.name ?? r.value.title})), scenarios: [...scenarios.values()] }
}
