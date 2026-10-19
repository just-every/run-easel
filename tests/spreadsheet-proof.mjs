import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

export async function readWorkbook(bytes) {
 const book = new ExcelJS.Workbook()
 await book.xlsx.load(Buffer.from(bytes))
 return book
}
// Independent evaluation of the exported arithmetic after parsing with ExcelJS.
// Deliberately supports only the arithmetic emitted by these report exports.
export function evaluate(sheet, address, overrides = new Map(), visiting = new Set()) {
 if (overrides.has(address)) return overrides.get(address)
 assert.ok(!visiting.has(address), `No formula cycle at ${address}`)
 const cell = sheet.getCell(address), value = cell.value
 if (value === null) return 0
 if (typeof value === 'number') return value
 assert.ok(value && typeof value === 'object' && 'formula' in value, `${sheet.name}!${address} is numeric or a formula`)
 visiting.add(address)
 const read = ref => evaluate(sheet, ref, overrides, visiting)
 let text = value.formula.replace(/^=/, '').replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (_, a, b, c, d) => {
  const first = sheet.getCell(`${a}${b}`), last = sheet.getCell(`${c}${d}`)
  let total = 0
  for (let r = first.row; r <= last.row; r++) for (let col = first.col; col <= last.col; col++) total += read(sheet.getCell(r, col).address)
  return String(total)
 }).replace(/[A-Z]+\d+/g, ref => String(read(ref)))
 assert.match(text, /^-?\d+(?:[+-]-?\d+)*$/)
 const result = [...text.matchAll(/(^|[+-])(-?\d+)/g)].reduce((n, m) => n + (m[1] === '-' ? -1 : 1) * Number(m[2]), 0)
 visiting.delete(address)
 return result
}
export function proveFormulas(book) {
 let count = 0
 for (const sheet of book.worksheets) sheet.eachRow(row => row.eachCell(cell => {
  if (cell.formula) { assert.equal(evaluate(sheet, cell.address), cell.result, `${sheet.name}!${cell.address}`); count++ }
 }))
 assert.ok(count > 0, 'Export contains live arithmetic')
}
