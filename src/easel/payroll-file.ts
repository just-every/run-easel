import { sha256 as kitSha } from '../modules/import-kit/src/d1/index'
import { parseCsv } from './csv'
import { cents } from './units'
import { choice, Fault, requireThat, text, type Data } from './types'
import { readXlsx } from './xlsx'

type Cell = string | number | boolean | null
type SourceRow = { line: number; cells: Cell[] }
const rosterKeys = ['employeeId', 'name', 'department', 'title', 'employmentType', 'salary', 'hourlyRate', 'start', 'termination']
const registerKeys = ['employeeId', 'department', 'payDate', 'grossWages', 'employerTaxes', 'benefits', 'fees']
const headings: Record<string, string[]> = {
 employeeId: ['Employee ID'], name: ['Name'], department: ['Department'], title: ['Title'], employmentType: ['Employment Type'],
 salary: ['Salary', 'Annual Salary'], hourlyRate: ['Hourly Rate'], start: ['Start', 'Start Date'], termination: ['Termination', 'Termination Date'],
 payDate: ['Pay Date'], grossWages: ['Gross Wages'], employerTaxes: ['Employer Taxes'], benefits: ['Benefits'], fees: ['Fees'],
}

function dateValue(value: Cell, format: string, label: string): string {
 if (typeof value === 'number') {
  requireThat(Number.isInteger(value) && value >= 0 && value <= 2958465, `${label} must be a whole Excel date serial`)
  return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
 }
 requireThat(typeof value === 'string', `${label} is required`)
 const s = value.trim()
 const match = (format === 'YYYY-MM-DD' ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/).exec(s)
 requireThat(match, `${label} must be ${format}`)
 const [year, month, day] = format === 'YYYY-MM-DD' ? match.slice(1) : format === 'MM/DD/YYYY' ? [match[3], match[1], match[2]] : [match[3], match[2], match[1]]
 const iso = `${year}-${month}-${day}`, parsed = new Date(`${iso}T00:00:00Z`)
 requireThat(Number(year) > 0 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso, `${label} is not a real calendar date`)
 return iso
}

function moneyValue(value: Cell, label: string, optional = false) {
 if (value === null || typeof value === 'string' && value.trim() === '') {
  requireThat(optional, `${label} is required`)
  return { value: null, cents: null }
 }
 let normalized: string
 if (typeof value === 'number') {
  requireThat(Number.isFinite(value) && value >= 0 && value === Number(value.toFixed(2)), `${label} must be nonnegative with no fractional cent`)
  normalized = value.toFixed(2)
 } else {
  requireThat(typeof value === 'string', `${label} must be a decimal amount`)
  normalized = value.trim()
 }
 return { value: normalized, cents: cents(normalized, label) }
}

async function sourceFile(b: Data, kind: string, saved: Data) {
 const csv = typeof b.csv === 'string'
 requireThat(csv !== (typeof b.base64 === 'string'), 'Provide either CSV text or an .xlsx file')
 let bytes: Uint8Array, headers: string[], rows: SourceRow[], sheet: string | undefined
 if (csv) {
  bytes = new TextEncoder().encode(b.csv)
  requireThat(bytes.length > 0 && bytes.length <= 2_000_000, 'Choose a CSV file of at most 2 MB')
  ;({ headers, rows } = parseCsv(b.csv))
 } else {
  requireThat(b.base64.length > 0 && b.base64.length <= 6_666_668, 'Choose an .xlsx workbook of at most 5 MB')
  try { bytes = Uint8Array.from(atob(b.base64), c => c.charCodeAt(0)) }
  catch { throw new Fault(400, 'The workbook is not valid base64') }
  requireThat(bytes.length > 0 && bytes.length <= 5_000_000, 'Choose an .xlsx workbook of at most 5 MB')
  let sheets
  try { sheets = await readXlsx(bytes) }
  catch (error) { if (error instanceof Fault) throw error; throw new Fault(400, 'The workbook is damaged or unreadable') }
  const selection = b.sheet ?? saved.sheet
  requireThat(selection === undefined || typeof selection === 'string', 'Choose a worksheet by name')
  const selected = selection === undefined ? sheets[0] : sheets.find(s => s.name === selection)
  requireThat(selected, `The workbook has no sheet named ${selection}`)
  sheet = selected.name
  const byRow = new Map<number, Cell[]>()
  for (const cell of selected.cells) {
   requireThat(!cell.error, `Row ${cell.row}, ${cell.ref}: ${cell.error}`)
   requireThat(!cell.formula || cell.value !== null, `Row ${cell.row}, ${cell.ref}: formula has no cached value`)
   requireThat(cell.col >= 1 && cell.col <= 16384 && cell.row >= 1 && cell.row <= 1048576, 'The workbook has an invalid cell address')
   const row = byRow.get(cell.row) ?? []
   row[cell.col - 1] = cell.value
   byRow.set(cell.row, row)
  }
  const first = byRow.get(1)
  requireThat(first?.length, 'The worksheet needs a header in its first row')
  headers = Array.from(first, c => typeof c === 'string' ? c.trim() : '')
  requireThat(headers.every(Boolean) && new Set(headers).size === headers.length, 'Every column needs a unique heading')
  rows = [...byRow].filter(([line, cells]) => line > 1 && cells.some(c => c !== null && String(c).trim() !== ''))
   .sort(([a], [b]) => a - b).map(([line, cells]) => ({ line, cells }))
 }
 requireThat(rows.length > 0 && rows.length <= 5000, 'The file must contain 1 to 5000 payroll rows')
 const file = b.filename === undefined ? `${kind}.${csv ? 'csv' : 'xlsx'}` : text(b.filename, 'Filename', 200)
 return { file, bytes, headers, rows, sheet }
}

/** Read and validate the complete payroll file without writing any records. */
export async function readPayrollFile(b: Data, savedConfig: Data = {}) {
 const kind = choice(b.kind, ['roster', 'register'] as const, 'a payroll file kind')
 const provider = text(b.provider, 'Payroll provider')
 const rawFormat = b.dateFormat ?? savedConfig.dateFormat ?? 'YYYY-MM-DD'
 const dateFormat = choice(rawFormat === 'ISO' ? 'YYYY-MM-DD' : rawFormat, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] as const, 'a date format')
 const source = await sourceFile(b, kind, savedConfig)
 const keys = kind === 'roster' ? rosterKeys : registerKeys
 const mapping = b.columns ?? savedConfig.columns ?? Object.fromEntries(keys.flatMap(key => {
  const header = [key, ...headings[key]].find(h => source.headers.includes(h))
  return header ? [[key, header]] : []
 }))
 requireThat(mapping && typeof mapping === 'object' && !Array.isArray(mapping), 'Choose payroll columns')
 const columns: Record<string, string> = {}
 for (const [key, header] of Object.entries(mapping)) {
  requireThat(keys.includes(key), `Unknown payroll field: ${key}`)
  requireThat(typeof header === 'string' && source.headers.includes(header), `Choose an existing column for ${key}`)
  columns[key] = header
 }
 requireThat(new Set(Object.values(columns)).size === Object.values(columns).length, 'Choose a separate column for each payroll field')
 const required = kind === 'roster' ? rosterKeys.filter(k => !['salary', 'hourlyRate', 'termination'].includes(k)) : registerKeys
 for (const key of required) requireThat(columns[key], `Choose the ${key} column`)
 if (kind === 'roster') requireThat(columns.salary || columns.hourlyRate, 'Choose a salary or hourlyRate column')
 const indexes = Object.fromEntries(Object.entries(columns).map(([key, header]) => [key, source.headers.indexOf(header)]))
 const seen = new Map<string, number>()
 const rows: Data[] = source.rows.map(({ line, cells }) => {
  try {
   requireThat(cells.length <= source.headers.length && (source.sheet !== undefined || cells.length === source.headers.length), 'The row has a different number of columns than the header')
   const at = (key: string): Cell => cells[indexes[key]] ?? null
   const row: Data = { row: line, line }
   for (const key of required.filter(k => !['start', 'payDate', 'grossWages', 'employerTaxes', 'benefits', 'fees'].includes(k))) {
    const value = at(key)
    requireThat(typeof value === 'string' || typeof value === 'number' && Number.isFinite(value), `${key} is required`)
    row[key] = text(String(value), key)
   }
   if (kind === 'roster') {
    row.employmentType = choice(row.employmentType, ['W-2', '1099'] as const, 'employmentType')
    row.start = dateValue(at('start'), dateFormat, 'start')
    const termination = at('termination')
    row.termination = termination === null || typeof termination === 'string' && termination.trim() === '' ? '' : dateValue(termination, dateFormat, 'termination')
    requireThat(!row.termination || row.termination >= row.start, 'termination must be on or after start')
    for (const key of ['salary', 'hourlyRate']) {
     const amount = moneyValue(at(key), key, true)
     row[key] = amount.value; row[`${key}Cents`] = amount.cents
    }
    requireThat(row.salaryCents !== null || row.hourlyRateCents !== null, 'A salary or hourly rate is required')
   } else {
    row.payDate = dateValue(at('payDate'), dateFormat, 'payDate')
    row.totalCents = 0
    for (const key of ['grossWages', 'employerTaxes', 'benefits', 'fees']) {
     const amount = moneyValue(at(key), key)
     row[key] = amount.value; row[`${key}Cents`] = amount.cents
     row.totalCents += amount.cents!
    }
   }
   const key = JSON.stringify(kind === 'roster' ? [row.employeeId] : [row.employeeId, row.payDate])
   requireThat(!seen.has(key), `Duplicate employee${kind === 'register' ? ' and pay date' : ''}; already on row ${seen.get(key)}`)
   seen.set(key, line)
   return row
  } catch (error) { throw new Fault(400, `Row ${line}: ${error instanceof Error ? error.message : 'Invalid payroll data'}`) }
 })
 return { file: source.file, bytes: source.bytes, sha: kitSha(source.bytes), headers: source.headers, rows,
  config: { kind, provider, columns, dateFormat, ...(source.sheet !== undefined ? { sheet: source.sheet } : {}) } }
}
