import { requireThat, type Data } from './types'
import { add, compareRationals, decimalRational, divide, integerValue, multiply, negate, power, rational, rationalCents, rationalText, type Rational } from './workbook-formula-rational'
import { FORMULA_LIMITS, rangeRows, workbookCellKey, type Expression, type WorkbookGraph } from './workbook-formula-types'

type Unavailable = { unavailable: string }
type Value = Rational | string | boolean | null | Unavailable
const isRational = (value: Value): value is Rational => typeof value === 'object' && value !== null && 'numerator' in value
function available(value: Value): asserts value is Exclude<Value, Unavailable> {
 requireThat(!(typeof value === 'object' && value !== null && 'unavailable' in value), typeof value === 'object' && value !== null && 'unavailable' in value ? value.unavailable : 'Workbook value is unavailable')
}
function numeric(value: Value): Rational {
 available(value)
 if (isRational(value)) return value
 if (value === null) return rational(0n)
 if (typeof value === 'boolean') return rational(value ? 1n : 0n)
 requireThat(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()), 'Workbook arithmetic requires a numeric value')
 return decimalRational(value.trim())
}
function truth(value: Value): boolean {
 available(value)
 if (isRational(value)) return value.numerator !== 0n
 if (typeof value === 'string') {
  requireThat(/^(TRUE|FALSE)$/i.test(value), 'Workbook IF condition must be a boolean or number')
  return value.toUpperCase() === 'TRUE'
 }
 return value === true
}
function comparison(left: Value, right: Value): number {
 available(left); available(right)
 // Excel compares blank references with zero, empty text, or FALSE as appropriate.
 if (left === null) left = typeof right === 'string' ? '' : typeof right === 'boolean' ? false : rational(0n)
 if (right === null) right = typeof left === 'string' ? '' : typeof left === 'boolean' ? false : rational(0n)
 if (isRational(left) && isRational(right)) return compareRationals(left, right)
 if (typeof left === 'string' && typeof right === 'string') {
  const a = left.toLocaleUpperCase('en-US'), b = right.toLocaleUpperCase('en-US')
  return a < b ? -1 : a > b ? 1 : 0
 }
 if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
 const rank = (value: Exclude<Value, Unavailable>) => isRational(value) ? 0 : typeof value === 'string' ? 1 : 2
 return rank(left) - rank(right)
}

function assertGraph(graph: Data): asserts graph is WorkbookGraph {
 requireThat(graph.version === 1 && Array.isArray(graph.sheets) && graph.cells && typeof graph.cells === 'object' && !Array.isArray(graph.cells), 'Unsupported workbook formula graph')
 requireThat(Object.keys(graph.cells).length <= FORMULA_LIMITS.cells && graph.sheets.every((sheet: unknown) => typeof sheet === 'string'), 'Workbook formula graph exceeds the supported size')
}

export function directWorkbookDependencies(expression: Expression): string[] {
 const keys = new Set<string>()
 let visited = 0
 function visit(node: Expression, depth: number) {
  requireThat(++visited <= FORMULA_LIMITS.tokens && depth <= FORMULA_LIMITS.depth, 'Workbook formula expression exceeds supported limits')
  if (node.kind === 'ref') keys.add(workbookCellKey(node.sheet, node.ref))
  else if (node.kind === 'range') for (const row of rangeRows(node)) for (const key of row) keys.add(key)
  else if (node.kind === 'unary') visit(node.value, depth + 1)
  else if (node.kind === 'binary') { visit(node.left, depth + 1); visit(node.right, depth + 1) }
  else if (node.kind === 'call') for (const arg of node.args) visit(arg, depth + 1)
 }
 visit(expression, 0)
 return [...keys]
}

/** Transitive dependencies, including blank references and each cell in a range. */
export function workbookDependencies(data: Data, key: string): string[] {
 assertGraph(data)
 const dependencies = new Set<string>(), expanded = new Set<string>(), pending = [key]
 while (pending.length) {
  const next = pending.pop()!
  if (expanded.has(next)) continue
  expanded.add(next)
  const expression = data.cells[next]?.expression
  if (!expression) continue
  for (const dependency of directWorkbookDependencies(expression)) {
   dependencies.add(dependency)
   if (!expanded.has(dependency)) pending.push(dependency)
  }
  requireThat(dependencies.size <= FORMULA_LIMITS.dependencies, 'Workbook formula dependency graph is too large')
 }
 return [...dependencies]
}

export function evaluateWorkbook(data: Data, overrides: Record<string, number | string> = {}): { cents: Record<string, number>; values: Record<string, unknown> } {
 assertGraph(data)
 const graph = data, memo = new Map<string, Value>(), active = new Set<string>()
 const sheetNames = new Set(graph.sheets)
 const overrideValues = new Map<string, Rational>()
 for (const [key, value] of Object.entries(overrides)) {
  requireThat(Object.hasOwn(graph.cells, key), `Workbook override cell is missing: ${key}`)
  requireThat(typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)), 'Workbook numeric overrides must be integer cents or exact decimal strings')
  overrideValues.set(key, typeof value === 'number' ? rational(BigInt(value), 100n) : decimalRational(value))
 }
 function read(key: string, depth: number): Value {
  requireThat(depth <= FORMULA_LIMITS.depth, 'Workbook formula dependency chain is too deep')
  const existing = memo.get(key)
  if (memo.has(key)) return existing!
  requireThat(!active.has(key), `Workbook formula cycle at ${key}`)
  if (overrideValues.has(key)) return overrideValues.get(key)!
  const cell = graph.cells[key]
  if (!cell) return null
  requireThat(sheetNames.has(cell.sheet), `Workbook formula refers to missing worksheet '${cell.sheet}'`)
  active.add(key)
  let value: Value
  try {
   if (cell.expression) value = evaluate(cell.expression, depth + 1)
   else if (cell.error) value = { unavailable: `Workbook cell ${key} contains ${cell.error}` }
   else if (cell.formula && cell.value === null) value = { unavailable: `Unsupported formula ${key} has no cached value` }
   else value = typeof cell.value === 'number' ? decimalRational(cell.value) : cell.value
  } finally { active.delete(key) }
  memo.set(key, value)
  return value
 }
 function array(expression: Expression): string[][] {
  if (expression.kind === 'range') return rangeRows(expression)
  requireThat(expression.kind === 'ref', 'Workbook lookup requires a worksheet range')
  return [[workbookCellKey(expression.sheet, expression.ref)]]
 }
 function evaluate(node: Expression, depth: number): Value {
  requireThat(depth <= FORMULA_LIMITS.depth, 'Workbook formula evaluation is too deep')
  if (node.kind === 'number') return decimalRational(node.value)
  if (node.kind === 'literal') return node.value
  if (node.kind === 'ref') return read(workbookCellKey(node.sheet, node.ref), depth)
  if (node.kind === 'range') { requireThat(false, 'Workbook range cannot be used as a scalar value') }
  if (node.kind === 'unary') { const value = numeric(evaluate(node.value, depth + 1)); return node.op === '-' ? negate(value) : value }
  if (node.kind === 'binary') {
   const left = evaluate(node.left, depth + 1), right = evaluate(node.right, depth + 1)
   if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
    const result = comparison(left, right)
    return node.op === '=' ? result === 0 : node.op === '<>' ? result !== 0 : node.op === '<' ? result < 0 : node.op === '>' ? result > 0 : node.op === '<=' ? result <= 0 : result >= 0
   }
   const a = numeric(left), b = numeric(right)
   if (node.op === '+') return add(a, b)
   if (node.op === '-') return add(a, negate(b))
   if (node.op === '*') return multiply(a, b)
   if (node.op === '/') return divide(a, b)
   requireThat(node.op === '^', `Unsupported workbook operator '${node.op}'`)
   return power(a, b)
  }
  const args = node.args
  if (node.name === 'IF') return truth(evaluate(args[0], depth + 1)) ? evaluate(args[1], depth + 1) : args[2] ? evaluate(args[2], depth + 1) : false
  if (node.name === 'SUM') {
   let sum = rational(0n)
   for (const arg of args) {
    if (arg.kind === 'range' || arg.kind === 'ref') {
     for (const row of array(arg)) for (const key of row) {
      const value = read(key, depth + 1)
      available(value)
      if (isRational(value)) sum = add(sum, value)
     }
    } else sum = add(sum, numeric(evaluate(arg, depth + 1)))
   }
   return sum
  }
  const target = evaluate(args[0], depth + 1)
  available(target)
  if (node.name === 'VLOOKUP') {
   const table = array(args[1]), index = integerValue(numeric(evaluate(args[2], depth + 1)), 'VLOOKUP column index')
   requireThat(index >= 1 && index <= table[0].length, 'VLOOKUP column index is outside the table range')
   for (const row of table) if (comparison(read(row[0], depth + 1), target) === 0) return read(row[index - 1], depth + 1)
   requireThat(false, 'Exact VLOOKUP found no matching workbook value')
  }
  requireThat(node.name === 'XLOOKUP', 'Unsupported workbook function')
  const lookup = array(args[1]), result = array(args[2])
  const vertical = lookup[0].length === 1
  requireThat(vertical || lookup.length === 1, 'XLOOKUP lookup range must have one row or one column')
  requireThat(vertical ? result[0].length === 1 && result.length === lookup.length : result.length === 1 && result[0].length === lookup[0].length, 'XLOOKUP result range must match the lookup range shape')
  const keys = vertical ? lookup.map(row => row[0]) : lookup[0]
  const outputs = vertical ? result.map(row => row[0]) : result[0]
  const reverse = args[5] && integerValue(numeric(evaluate(args[5], depth + 1)), 'XLOOKUP search mode') === -1
  for (let step = 0; step < keys.length; step++) {
   const index = reverse ? keys.length - 1 - step : step
   if (comparison(read(keys[index], depth + 1), target) === 0) return read(outputs[index], depth + 1)
  }
  if (args[3]) return evaluate(args[3], depth + 1)
  requireThat(false, 'Exact XLOOKUP found no matching workbook value')
 }
 const cents: Record<string, number> = {}, values: Record<string, unknown> = {}
 for (const key of Object.keys(graph.cells)) {
  const value = read(key, 0)
  if (isRational(value)) { cents[key] = rationalCents(value); values[key] = rationalText(value) }
  else values[key] = typeof value === 'object' && value !== null ? null : value
 }
 return { cents, values }
}
