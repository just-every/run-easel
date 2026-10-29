import type { JsonSchema } from '../modules/agent-door/index.ts'
const string = { type: 'string' }, object = { type: 'object' }
const records = { type: 'array', items: object }
const scenario = { type: 'object', required: ['id','name','kind','status','revision'], properties: {
 id: string, name: string, kind: string, status: string, revision: { type: 'integer' },
} }
const input = { type: 'object', required: ['id','scenario','originId'], properties: { id: string, scenario: string, originId: string } }
const job = { type: 'object', required: ['id','scenarios','status','startedAt'], properties: {
 id: string, scenarios: { type: 'array', items: string }, status: { type: 'string', enum: ['running','completed','failed','interrupted'] },
 startedAt: string, completedAt: string, error: string,
}, additionalProperties: false }
const pending = { type: 'object', required: ['calculationJob'], properties: { calculationJob: job }, additionalProperties: false }
const inputs = new Set(['revenue','position','expense','schedule','formula','asset-category','asset','allocation','debt','tax-policy','equity'])

/** Public native response shapes, independent of tool input or imported narratives. */
export function outputSchema(name: string): JsonSchema {
 if (inputs.has(name)) return input
 if (['proposal-create','proposal-submit','forecast-window'].includes(name)) return scenario
 if (name === 'scenarios') return { type: 'object', required: ['scenarios','lines','departments','workspace','references'], properties: {
  scenarios: { type: 'array', items: scenario }, lines: records, departments: records, workspace: object,
  references: { type: 'object', properties: { forecast: string, lines: object, departments: object } },
 } }
 if (name === 'scenario') return { oneOf: [pending, { type: 'object', required: ['scenario','inputs','calculation'], properties: { scenario, inputs: object, calculation: object } }] }
 if (name === 'compare') return { type: 'object', required: ['changedCells'], properties: { changedCells: records } }
 if (name === 'variance') return { type: 'object', required: ['month','rows'], properties: { month: string, rows: records } }
 if (name === 'metrics') return { oneOf: [pending, { type: 'object', required: ['currency','months','profit','cash','headcount'], properties: {
  currency: string, months: { type: 'array', items: string }, profit: records, cash: records, headcount: { type: ['array','object'] },
 } }] }
 if (name === 'calculation_status') return { oneOf: [
  { type: 'object', required: ['jobs'], properties: { jobs: { type: 'array', items: { type: 'object', required: ['calculationJob'], properties: { calculationJob: job, responseStatus: { type: 'integer' } }, additionalProperties: false } } }, additionalProperties: false },
  { type: 'object', required: ['calculationJob'], properties: { calculationJob: job, responseStatus: { type: 'integer' } }, additionalProperties: false },
 ] }
 if (name === 'input-delete') return { type: 'object', required: ['removed'], properties: { removed: string }, additionalProperties: false }
 if (name === 'comment') return { type: 'object', required: ['id','scenario','author','text'], properties: { id: string, scenario: string, author: string, text: string } }
 if (name === 'explanation') return { type: 'object', required: ['id','month','line','text','status'], properties: { id: string, month: string, line: string, text: string, status: string, citationIds: { type: 'array', items: string } } }
 throw new Error(`Native response schema missing for ${name}`)
}
