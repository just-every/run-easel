// Google Apps Script is the platform boundary. No Easel calculation or access
// code is replaced. The small independent SUM/dependency evaluator is explicitly
// a host simulation, never a receipt from Google's calculation engine.
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

export function googleBook(id = 'synthetic-google-spreadsheet') {
 const book = { id, sheets: [], active: null, context: null, closed: false, selection: [1, 1], getId() { return id }, getSheets() { return this.sheets },
  getSheetByName(name) { return this.sheets.find(s => s.name === name) }, insertSheet(name) { const sheet = makeSheet(this, name); this.sheets.push(sheet); return sheet },
  getActiveRange() { return this.sheets[0].getRange(...this.selection) },
 }
 book.insertSheet('Plan'); return book
}
function makeSheet(book, name) {
 return { name, data: [], formulas: [], hidden: false, getName() { return name }, hideSheet() { this.hidden = true }, isSheetHidden() { return this.hidden },
  clearContents() { this.data = []; this.formulas = [] }, getRange(row, col, rows = 1, cols = 1) { return range(this, row, col, rows, cols) },
  getDataRange() { const rows = Math.max(this.data.length, this.formulas.length, 1), cols = Math.max(2, ...Array.from(this.data, r => r?.length ?? 0), ...Array.from(this.formulas, r => r?.length ?? 0)); return range(this, 1, 1, rows, cols) }, book,
 }
}
function range(sheet, r, c, rows, cols) {
 const write = (matrix, row, col, value) => { matrix[row] ??= []; matrix[row][col] = value }
 return { getSheet: () => sheet, getCell: (row, col) => range(sheet, r + row - 1, c + col - 1, 1, 1),
  getValue: () => sheet.data[r - 1]?.[c - 1] ?? '',
  setValue(value) { write(sheet.data, r - 1, c - 1, value); return this },
  setValues(values) { values.forEach((row, i) => row.forEach((value, j) => write(sheet.data, r - 1 + i, c - 1 + j, value))); return this },
  setFormula(value) { write(sheet.formulas, r - 1, c - 1, value); return this },
  getValues: () => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => sheet.data[r - 1 + i]?.[c - 1 + j] ?? '')),
  getFormulas: () => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => sheet.formulas[r - 1 + i]?.[c - 1 + j] ?? '')),
 }
}
export async function googleHost({ origin, book, properties = new Map() }) {
 let active = book, fault = null, calls = [], triggers = [], locked = false
 const ui = { createAddonMenu: () => menu, showSidebar: () => {} }, menu = { addItem() { return this }, addToUi() {} }
 const context = vm.createContext({
  console: { log() { throw new Error('Apps Script must not log credentials or provider bodies') } },
  SpreadsheetApp: { getActiveSpreadsheet: () => { if (!active) throw new Error('No open spreadsheet'); return active }, openById: id => { assert.equal(id, book.id); return book },
   getUi: () => ui, flush: () => calculate() },
  PropertiesService: { getUserProperties: () => ({ getProperty: k => properties.get(k) ?? null, setProperty: (k, v) => properties.set(k, v), deleteProperty: k => properties.delete(k), getProperties: () => Object.fromEntries(properties) }) },
  Utilities: { getUuid: randomUUID },
  LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true }, releaseLock() { locked = false } }) },
  ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger: t => { triggers = triggers.filter(x => x !== t) }, newTrigger(handler) {
   const t = { handler, source: null, kind: null, getHandlerFunction() { return handler }, getTriggerSourceId() { return this.source } }
   return { forSpreadsheet(b) { t.source = b.id; return this }, onOpen() { t.kind = 'open'; return this }, timeBased() { t.kind = 'time'; return this }, everyHours(n) { assert.equal(n, 1); return this }, create() { triggers.push(t); return t } }
  } },
  HtmlService: { createHtmlOutputFromFile: name => ({ setTitle() { return this } }) },
  UrlFetchApp: { fetch(url, options) {
   calls.push({ path: new URL(url).pathname, options: { ...options, headers: { 'X-Easel-Spreadsheet': options.headers['X-Easel-Spreadsheet'] } } })
   assert.equal(options.followRedirects, false)
   if (fault) { if (fault.throw) throw new Error('network failure'); return { getResponseCode: () => fault.status, getContentText: () => fault.body } }
   assert.ok(url.startsWith('https://easel.example.test/api/easel/google-sheets/'))
   const args = ['-sS', '--max-time', '30', '-w', '\n%{http_code}', '-X', options.method.toUpperCase(), '-H', 'content-type: application/json']
   for (const [name, value] of Object.entries(options.headers)) args.push('-H', `${name}: ${value}`)
   if (options.payload !== undefined) args.push('--data-binary', options.payload)
   args.push(origin + new URL(url).pathname)
   const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
   assert.equal(result.status, 0, 'Apps Script UrlFetch reached the running Easel')
   const split = result.stdout.lastIndexOf('\n'), body = result.stdout.slice(0, split), status = Number(result.stdout.slice(split + 1))
   return { getResponseCode: () => status, getContentText: () => body }
  } },
 })
 vm.runInContext(await readFile('public/google-sheets/Code.gs', 'utf8'), context, { filename: 'Code.gs' })
 function calculate() {
  for (const sheet of book.sheets.filter(s => s.name !== '_Easel_Data')) {
   sheet.formulas.forEach((row, i) => row.forEach((formula, j) => {
    if (!formula?.startsWith('=EASEL_')) return
    const match = /^=EASEL_(VALUE|REPORT)\((.*),'_Easel_Data'!\$A\$1\)$/.exec(formula)
    let value
    try {
     if (!match) throw new Error('Unsupported formula')
     const args = JSON.parse(`[${match[2]}]`), epoch = book.getSheetByName('_Easel_Data')?.data[0]?.[0]
     active = book; value = context[`EASEL_${match[1]}`](...args, epoch)
    } catch (error) { value = `#ERROR ${error.message}` }
    sheet.data[i] ??= []; sheet.data[i][j] = value
   }))
   // Independent plain spreadsheet SUM over the two function cells, not API totals.
   if (sheet.formulas[0]?.[2] === '=SUM(A1:B1)') {
    const a = sheet.data[0]?.[0], b = sheet.data[0]?.[1]
    sheet.data[0][2] = typeof a === 'number' && typeof b === 'number' ? a + b : '#ERROR unavailable'
   }
  }
  if (book.closed) active = null
 }
 return { context, book, properties, calls, get triggers() { return triggers },
  open() { book.closed = false; active = book }, close() { book.closed = true; active = null },
  fire(handler) { const trigger = triggers.find(t => t.handler === handler); assert.ok(trigger, `Installable ${handler} exists`); return context[handler](trigger.kind === 'open' ? { source: book } : undefined) },
  fault(value) { fault = value }, formula(row, col, value) { book.sheets[0].getRange(row, col).setFormula(value) },
  values() { return JSON.parse(JSON.stringify(book.sheets[0].data)) },
 }
}
