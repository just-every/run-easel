import { requireThat } from './types'
import { FORMULA_LIMITS, UnsupportedFormula, normalizeCellRef, rangeRows, type Expression } from './workbook-formula-types'

type Token = { kind: 'number' | 'string' | 'name' | 'sheet' | 'symbol' | 'end'; text: string }
function tokenize(formula: string): Token[] {
 requireThat(formula.length <= 32_768, 'A workbook formula is too long')
 const tokens: Token[] = []
 let cursor = formula.startsWith('=') ? 1 : 0
 while (cursor < formula.length) {
  if (/\s/.test(formula[cursor])) { cursor++; continue }
  const rest = formula.slice(cursor), char = formula[cursor]
  if (char === '"' || char === "'") {
   const quote = char
   let value = '', closed = false
   cursor++
   while (cursor < formula.length) {
    const next = formula[cursor++]
    if (next !== quote) { value += next; continue }
    if (formula[cursor] === quote) { value += quote; cursor++; continue }
    closed = true; break
   }
   requireThat(closed, 'Workbook formula has an unterminated quoted value')
   tokens.push({ kind: quote === '"' ? 'string' : 'sheet', text: value })
  } else {
   const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
   const name = /^[$A-Za-z_\\][$A-Za-z_0-9.\\]*/.exec(rest)
   const operator = /^(?:<>|<=|>=|[+\-*/^=<>(),!:])/.exec(rest)
   if (number) { tokens.push({ kind: 'number', text: number[0] }); cursor += number[0].length }
   else if (name) { tokens.push({ kind: 'name', text: name[0] }); cursor += name[0].length }
   else if (operator) { tokens.push({ kind: 'symbol', text: operator[0] }); cursor += operator[0].length }
   else throw new UnsupportedFormula(`Unsupported formula syntax: ${char}`)
  }
  requireThat(tokens.length <= FORMULA_LIMITS.tokens, 'A workbook formula has too many tokens')
 }
 return [...tokens, { kind: 'end', text: '' }]
}

const precedence: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 }
const isRef = (text: string) => /^\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}$/.test(text)
function literalNumber(expression: Expression): number | undefined {
 if (expression.kind === 'number') return Number(expression.value)
 if (expression.kind === 'unary') {
  const value = literalNumber(expression.value)
  return value === undefined ? undefined : expression.op === '-' ? -value : value
 }
 return undefined
}

export function parseWorkbookFormula(formula: string, currentSheet: string, sheets: Map<string, string>): Expression {
 const tokens = tokenize(formula)
 let cursor = 0
 const peek = () => tokens[cursor]
 const take = () => tokens[cursor++]
 const expect = (text: string) => { requireThat(peek().text === text, `Workbook formula expected '${text}'`); take() }
 const sheetName = (name: string) => {
  const canonical = sheets.get(name.toLowerCase())
  requireThat(canonical !== undefined, `Workbook formula refers to missing worksheet '${name}'`)
  return canonical
 }
 function reference(sheet: string, first: string): Expression {
  const ref = normalizeCellRef(first)
  if (peek().text !== ':') return { kind: 'ref', sheet, ref }
  take()
  let endpoint = take(), lastSheet = sheet
  if (peek().text === '!') { take(); lastSheet = sheetName(endpoint.text); endpoint = take() }
  requireThat(lastSheet === sheet, 'A workbook range cannot span multiple worksheets')
  requireThat(endpoint.kind === 'name' && isRef(endpoint.text), 'Workbook formula range needs a cell endpoint')
  const range: Extract<Expression, { kind: 'range' }> = { kind: 'range', sheet, first: ref, last: normalizeCellRef(endpoint.text) }
  rangeRows(range)
  return range
 }
 function call(name: string, depth: number): Expression {
  const normalized = name.replace(/^_xlfn\./i, '').toUpperCase()
  if (!['SUM', 'IF', 'VLOOKUP', 'XLOOKUP', 'TRUE', 'FALSE'].includes(normalized)) throw new UnsupportedFormula(`Unsupported function: ${name}`)
  expect('(')
  const args: Expression[] = []
  if (peek().text !== ')') {
   for (;;) {
    args.push(expression(0, depth + 1))
    if (peek().text !== ',') break
    take()
   }
  }
  expect(')')
  if (normalized === 'TRUE' || normalized === 'FALSE') {
   requireThat(args.length === 0, `${normalized} expects no arguments`)
   return { kind: 'literal', value: normalized === 'TRUE' }
  }
  if (normalized === 'IF') requireThat(args.length === 2 || args.length === 3, 'IF expects two or three arguments')
  if (normalized === 'VLOOKUP') {
   requireThat(args.length === 3 || args.length === 4, 'VLOOKUP expects three or four arguments')
   const mode = args[3]
   if (!mode || !(literalNumber(mode) === 0 || (mode.kind === 'literal' && mode.value === false))) throw new UnsupportedFormula('Only exact VLOOKUP with FALSE or 0 is translated')
   if (args[1].kind !== 'range') throw new UnsupportedFormula('VLOOKUP requires a worksheet table range')
  }
  if (normalized === 'XLOOKUP') {
   requireThat(args.length >= 3 && args.length <= 6, 'XLOOKUP expects three to six arguments')
   if (args[4] && literalNumber(args[4]) !== 0) throw new UnsupportedFormula('Only exact XLOOKUP match mode 0 is translated')
   if (args[5] && ![1, -1].includes(literalNumber(args[5]) ?? 0)) throw new UnsupportedFormula('Only linear XLOOKUP search modes 1 and -1 are translated')
   if (![args[1].kind, args[2].kind].every(kind => kind === 'range' || kind === 'ref')) throw new UnsupportedFormula('XLOOKUP requires worksheet lookup and result ranges')
  }
  return { kind: 'call', name: normalized as Extract<Expression, { kind: 'call' }>['name'], args }
 }
 function primary(depth: number): Expression {
  requireThat(depth <= FORMULA_LIMITS.depth, 'Workbook formula nesting is too deep')
  const token = take()
  if (token.kind === 'number') return { kind: 'number', value: token.text }
  if (token.kind === 'string') return { kind: 'literal', value: token.text }
  if (token.text === '+' || token.text === '-') return { kind: 'unary', op: token.text, value: primary(depth + 1) }
  if (token.text === '(') { const value = expression(0, depth + 1); expect(')'); return value }
  if (token.kind === 'name' || token.kind === 'sheet') {
   if (peek().text === '!') {
    take()
    const ref = take()
    requireThat(ref.kind === 'name' && isRef(ref.text), 'Workbook worksheet reference needs a cell address')
    return reference(sheetName(token.text), ref.text)
   }
   if (token.kind === 'sheet') throw new UnsupportedFormula('Quoted worksheet names require a cell reference')
   if (peek().text === '(') return call(token.text, depth)
   if (/^(TRUE|FALSE)$/i.test(token.text)) return { kind: 'literal', value: token.text.toUpperCase() === 'TRUE' }
   if (isRef(token.text)) return reference(currentSheet, token.text)
   throw new UnsupportedFormula(`Unsupported defined name: ${token.text}`)
  }
  requireThat(false, `Invalid workbook formula near '${token.text || 'end of formula'}'`)
 }
 function expression(minimum: number, depth: number): Expression {
  let left = primary(depth)
  while (peek().kind === 'symbol' && (precedence[peek().text] ?? -1) >= minimum) {
   const op = take().text
   left = { kind: 'binary', op, left, right: expression(precedence[op] + 1, depth + 1) }
  }
  return left
 }
 const parsed = expression(0, 0)
 requireThat(peek().kind === 'end', `Invalid workbook formula near '${peek().text}'`)
 return parsed
}
