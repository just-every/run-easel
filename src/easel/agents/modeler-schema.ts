import { requireThat, text, type Data } from '../types'

const string = { type: 'string' }, integer = { type: 'integer' }
const object = (properties: Data) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const array = (items: Data, maxItems: number, minItems = 0) => ({ type: 'array', minItems, maxItems, items })
export const MODELER_SCHEMA = object({
 name: string,
 positions: array(object({ title: string, department: string, line: string, start: string, end: string, annualSalary: string, onCostPercent: string }), 8),
 revenues: array(object({ sourceOrigin: string, name: string, department: string, line: string, start: string, startVolume: string, rate: string, growthPercent: string, collectionLag: integer }), 8),
 formulas: array(object({ sourceOrigin: string, name: string, unit: { type: 'string', enum: ['money', 'count', 'percent'] }, department: string, line: string, start: string, end: string, formula: string }), 8),
 tests: array(object({ target: { type: 'string', enum: ['cell', 'driver'] }, line: string, department: string, driver: string, month: string, expected: string }), 24, 1),
})
const fields = {
 position: ['title', 'department', 'line', 'start', 'end', 'annualSalary', 'onCostPercent'],
 revenue: ['sourceOrigin', 'name', 'department', 'line', 'start', 'startVolume', 'rate', 'growthPercent', 'collectionLag'],
 formula: ['sourceOrigin', 'name', 'unit', 'department', 'line', 'start', 'end', 'formula'],
 test: ['target', 'line', 'department', 'driver', 'month', 'expected'],
}
function exact(value: unknown, keys: string[]) {
 requireThat(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'The model returned unsupported fields or operations')
 return value as Data
}
/** Provider schemas are guidance; every shape is checked again on the server. */
export function modelerOutput(value: unknown) {
 const v = exact(value, ['name', 'positions', 'revenues', 'formulas', 'tests'])
 text(v.name, 'Proposal name')
 let operations = 0
 for (const [key, kind] of [['positions', 'position'], ['revenues', 'revenue'], ['formulas', 'formula'], ['tests', 'test']] as const) {
  requireThat(Array.isArray(v[key]) && v[key].length <= (key === 'tests' ? 24 : 8), 'The model returned too many operations or checks')
  if (key !== 'tests') operations += v[key].length
  for (const entry of v[key]) {
   const row = exact(entry, fields[kind])
   for (const field of fields[kind]) requireThat(field === 'collectionLag' ? Number.isInteger(row[field]) && row[field] >= 0 && row[field] <= 3 : typeof row[field] === 'string' && row[field].length <= (field === 'formula' ? 2000 : 200), `Invalid model field ${field}`)
  }
 }
 requireThat(operations > 0 && operations <= 12 && v.tests.length > 0, 'The model must return 1–12 safe operations and expected-value checks')
 requireThat(v.formulas.every((f: Data) => ['money', 'count', 'percent'].includes(f.unit)) && v.tests.every((t: Data) => ['cell', 'driver'].includes(t.target)), 'Unknown formula unit or test target')
 return v
}
