import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

export async function readWorkbook(bytes) {
 const book = new ExcelJS.Workbook()
 await book.xlsx.load(Buffer.from(bytes))
 return book
}
// Independent arithmetic interpreter for the Excel formulas emitted by reports.
// References are resolved through ExcelJS, including cross-sheet assumptions.
export function evaluate(sheet, address, overrides = new Map(), visiting = new Set()) {
 if (overrides.has(address)) return overrides.get(address)
 const identity = `${sheet.name}!${address}`
 assert.ok(!visiting.has(identity), `No formula cycle at ${identity}`)
 const cell = sheet.getCell(address), value = cell.value
 if (value === null) return 0
 if (typeof value === 'number') return value
 assert.ok(value && typeof value === 'object' && 'formula' in value, `${identity} is numeric or a formula`)
 visiting.add(identity)
 let text = value.formula.replace(/^=/, '').replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (_, a, b, c, d) => {
  const first = sheet.getCell(`${a}${b}`), last = sheet.getCell(`${c}${d}`)
  let total = 0
  for (let r = first.row; r <= last.row; r++) for (let col = first.col; col <= last.col; col++) total += evaluate(sheet, sheet.getCell(r, col).address, overrides, visiting)
  return String(total)
 }).replace(/(?:'([^']+)'!)?(\$?[A-Z]+\$?\d+)/g, (_, name, ref) => {
  const target = name ? sheet.workbook.getWorksheet(name) : sheet
  assert.ok(target, `Referenced sheet ${name} exists`)
  return String(evaluate(target, ref.replaceAll('$', ''), target === sheet ? overrides : new Map(), visiting))
 })
 const tokens = text.match(/ROUND|\d+(?:\.\d+)?|[()+*/,-]/g) ?? []
 assert.equal(tokens.join(''), text.replace(/\s/g, ''), `Supported arithmetic: ${text}`)
 let i = 0
 const take = token => { assert.equal(tokens[i++], token) }
 const atom = () => {
  if (tokens[i] === '-') { i++; return -atom() }
  if (tokens[i] === '+') { i++; return atom() }
  if (tokens[i] === '(') { i++; const n = expression(); take(')'); return n }
  if (tokens[i] === 'ROUND') { i++; take('('); const n = expression(); take(','); const digits = expression(); take(')'); const scale = 10 ** digits; return Math.sign(n) * Math.round(Math.abs(n) * scale) / scale }
  assert.match(tokens[i] ?? '', /^\d+(?:\.\d+)?$/)
  return Number(tokens[i++])
 }
 const product = () => { let n = atom(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++], r = atom(); n = op === '*' ? n * r : n / r } return n }
 const expression = () => { let n = product(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++], r = product(); n = op === '+' ? n + r : n - r } return n }
 const result = expression()
 assert.equal(i, tokens.length)
 visiting.delete(identity)
 return result
}
export function proveFormulas(book) {
 let count = 0
 for (const sheet of book.worksheets) sheet.eachRow(row => row.eachCell(cell => {
  if (cell.formula) { assert.equal(evaluate(sheet, cell.address), cell.result, `${sheet.name}!${cell.address}`); count++ }
 }))
 assert.ok(count > 0, 'Export contains live arithmetic')
}
