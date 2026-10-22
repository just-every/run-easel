import { parseCsv } from './csv'
import { readXlsx, columnName } from './xlsx'
import { requireThat, type Data } from './types'
import { moveBytes, moveText } from './move-source'
import type { MoveArtifact, MoveExport } from './move-source'

type SourceRow = { values: Record<string, string>; location: string; cells: Record<string, string>; formulas: string[] }
type Table = { headers: string[]; rows: SourceRow[] }
type Provider = 'planful' | 'anaplan' | 'runway' | 'pigment'
const roles = ['levels', 'accounts', 'versions', 'dimension', 'data', 'personnel', 'unmapped']

function planfulDimension(raw: string, file: string): Table {
 let payload: Data = {}
 try { payload = JSON.parse(raw) } catch { requireThat(false, `planful: ${file}: invalid dimension export JSON`) }
 requireThat(payload && Array.isArray(payload.members), `planful: ${file}: expected the original members export`)
 const rows = payload.members.map((member: Data, index: number): SourceRow => {
  requireThat(member && typeof member === 'object' && !Array.isArray(member), `${file}: invalid dimension member`)
  const location = `${file}:members[${index}]`, values: Record<string, string> = {}, cells: Record<string, string> = {}
  for (const [name, value] of Object.entries(member)) if (name !== 'mapping') {
   requireThat(typeof value === 'string', `${location}: unsupported structured member property ${name}`)
   values[name] = value; cells[name] = `${location}.${name}`
  }
  requireThat(member.mapping === undefined || Array.isArray(member.mapping), `${location}: invalid attribute mapping`)
  for (const [i, mapping] of (member.mapping ?? []).entries()) {
   requireThat(typeof mapping.attribute === 'string' && typeof mapping.attributeCode === 'string' && !Object.hasOwn(values, mapping.attribute), `${location}: choose a dimension export with distinct single attribute values`)
   values[mapping.attribute] = mapping.attributeCode; cells[mapping.attribute] = `${location}.mapping[${i}].attributeCode`
  }
  return { location, values, cells, formulas: [] }
 })
 const headers = [...new Set(rows.flatMap((r: SourceRow) => Object.keys(r.values)))] as string[]
 for (const row of rows) for (const h of headers) if (!Object.hasOwn(row.values, h)) { row.values[h] = ''; row.cells[h] = row.location }
 return { headers, rows }
}

// Convert a semicolon CSV to RFC 4180 without treating commas within its fields as separators.
function commaCsv(raw: string): string {
 let quoted = false, closed = false, field = '', row: string[] = [], output = ''
 const endField = () => { row.push('"' + field.replaceAll('"', '""') + '"'); field = ''; closed = false }
 const endRow = () => { endField(); output += row.join(',') + '\n'; row = [] }
 for (let i = 0; i < raw.length; i++) {
  const c = raw[i]
  if (quoted) {
   if (c === '"' && raw[i + 1] === '"') { field += '"'; i++ }
   else if (c === '"') { quoted = false; closed = true }
   else field += c
  } else if (c === ';') endField()
  else if (c === '\n' || c === '\r') { if (c === '\r' && raw[i + 1] === '\n') i++; endRow() }
  else {
   requireThat(!closed, 'Unexpected text after a closing quote in the semicolon CSV')
   if (c === '"' && field === '') quoted = true
   else field += c
  }
 }
 requireThat(!quoted, 'The CSV ends inside a quoted field')
 endRow()
 return output
}

async function readTable(provider: Provider, file: MoveArtifact, spec: Data): Promise<Table> {
 if (/\.xlsx$/i.test(file.name)) {
  const sheets = await readXlsx(moveBytes(file))
  const selected = spec.sheet ?? file.sheet
  requireThat(selected || sheets.length === 1, `${file.name}: choose the exported worksheet`)
  const sheet = selected ? sheets.find(s => s.name === selected) : sheets[0]
  requireThat(sheet, `${file.name}: worksheet not found`)
  const headerRow = spec.headerRow ?? 1
  requireThat(Number.isInteger(headerRow) && headerRow > 0, 'Choose a positive header row')
  const headerCells = sheet.cells.filter(c => c.row === headerRow)
  const width = Math.max(0, ...headerCells.map(c => c.col))
  const headers = Array.from({ length: width }, (_, i) => String(headerCells.find(c => c.col === i + 1)?.value ?? '').trim())
  requireThat(headers.length && headers.every(Boolean) && new Set(headers).size === headers.length, `${file.name}: every exported column needs a unique heading`)
  const rows = [...new Set(sheet.cells.filter(c => c.row > headerRow).map(c => c.row))].sort((a, b) => a - b).map(row => {
   const cells = sheet.cells.filter(c => c.row === row)
   requireThat(cells.every(c => c.col <= width || c.value === null), `${file.name}: data outside the headed columns`)
   requireThat(cells.every(c => !c.error), `${file.name}!${sheet.name}:${row}: source cell error; recalculate the export`)
   return { location: `${file.name}!${sheet.name}:${row}`, values: Object.fromEntries(headers.map((h, i) => [h, String(cells.find(c => c.col === i + 1)?.value ?? '')])), cells: Object.fromEntries(headers.map((h, i) => [h, `${file.name}!${sheet.name}!${columnName(i + 1)}${row}`])), formulas: cells.filter(c => c.formula).map(c => `${file.name}!${sheet.name}!${c.ref}`) }
  }).filter(r => Object.values(r.values).some(Boolean))
  return { headers, rows }
 }
 requireThat(!/\.xls$/i.test(file.name), `${provider}: ${file.name}: choose CSV or .xlsx; binary .xls is unsupported`)
 let raw = moveText(file)
 if (provider === 'planful' && spec.envelope === 'planful-dimension') return planfulDimension(raw, file.name)
 if (provider === 'runway' && spec.envelope === 'export-api') {
  let envelope: Data = {}
  try { envelope = JSON.parse(raw) } catch { requireThat(false, `${provider}: ${file.name}: invalid Runway export response`) }
  requireThat(envelope && typeof envelope === 'object', `${provider}: ${file.name}: invalid Runway export response`)
  requireThat(typeof envelope.filename === 'string' && typeof envelope.contents === 'string', `${file.name}: Runway export needs filename and contents`)
  raw = envelope.contents
 }
 requireThat(!spec.headerRow || spec.headerRow === 1, 'CSV exports require the heading row first; use the source export settings')
 requireThat(!spec.delimiter || [',', ';'].includes(spec.delimiter), 'Choose comma or semicolon CSV')
 const parsed = parseCsv(spec.delimiter === ';' ? commaCsv(raw) : raw)
 return { headers: parsed.headers, rows: parsed.rows.map(row => {
  requireThat(row.cells.length === parsed.headers.length, `${file.name}:${row.line}: the row does not match its headings`)
  return { location: `${file.name}:${row.line}`, values: Object.fromEntries(parsed.headers.map((h, i) => [h, row.cells[i]])), cells: Object.fromEntries(parsed.headers.map(h => [h, `${file.name}:${row.line}:${h}`])), formulas: [] }
 }) }
}

function stringMap(value: unknown, label: string): Record<string, string> {
 requireThat(value === undefined || value && typeof value === 'object' && !Array.isArray(value), `${label} must be a header mapping`)
 const map = (value ?? {}) as Record<string, string>
 requireThat(Object.values(map).every(v => typeof v === 'string'), `${label} values must be strings`)
 return map
}

function month(value: string, spec: Data, location: string) {
 const result = spec.monthValues?.[value] ?? value
 requireThat(/^\d{4}-(0[1-9]|1[0-2])$/.test(result), `${location}: map the exported period explicitly to YYYY-MM`)
 return result
}

function addUnique<T extends { id: string }>(items: T[], item: T, location: string) {
 const prior = items.find(i => i.id === item.id)
 requireThat(!prior || JSON.stringify(prior) === JSON.stringify(item), `${location}: conflicting metadata for ${item.id}`)
 if (!prior) items.push(item)
}

/** Model-specific exports retain their original columns; the buyer describes the exported layout. */
export async function parseTabular(provider: Provider, files: MoveArtifact[], options: Data): Promise<MoveExport> {
 requireThat(Array.isArray(options.tables) && options.tables.length > 0, 'Describe the original exported files in options.tables')
 requireThat(new Set(files.map(f => f.name)).size === files.length, 'Original export filenames must be unique')
 if (provider === 'planful') requireThat(options.measure === 'MTD', 'Planful requires an MTD export; YTD and account-based measures need source conversion')
 const result: MoveExport = { levels: [], accounts: [], dimensions: [], versions: [], data: [], personnel: [], unmapped: [] }
 const read = new Map<string, Promise<Table>>(), used = new Set<string>(), recognized = new Map<string, Set<string>>()
 for (const spec of options.tables as Data[]) {
  requireThat(spec && roles.includes(spec.role) && typeof spec.file === 'string', 'Every table needs an original filename and a supported role')
  const file = files.find(f => f.name === spec.file)
  requireThat(file, `Attach original export ${spec.file}`)
  used.add(file.name)
  const cacheKey = JSON.stringify([file.name, spec.sheet ?? file.sheet, spec.headerRow, spec.delimiter, spec.envelope])
  if (!read.has(cacheKey)) read.set(cacheKey, readTable(provider, file, spec))
  const table = await read.get(cacheKey)!
  const columns = stringMap(spec.columns, 'Columns'), constants = stringMap(spec.constants, 'Constants')
  const dimensionColumns = stringMap(spec.dimensions, 'Dimensions'), months = stringMap(spec.months, 'Months'), metrics = stringMap(spec.metrics, 'Metrics')
  const personnelColumns = stringMap(spec.personnelColumns ?? options.personnelColumns, 'Personnel columns')
  const rowFilter = stringMap(spec.rowFilter, 'Source row filter')
  requireThat(['data', 'personnel'].includes(spec.role) || !Object.keys(dimensionColumns).length, 'Dimension values belong on data or personnel tables')
  requireThat(spec.role === 'data' || !Object.keys(months).length && !Object.keys(metrics).length, 'Month and metric columns belong on data tables')
  const sourceHeaders = [...Object.values(columns), ...Object.values(dimensionColumns), ...Object.keys(months), ...Object.keys(metrics), ...Object.keys(rowFilter), ...(spec.role === 'personnel' ? Object.values(personnelColumns) : [])]
  for (const header of sourceHeaders) requireThat(table.headers.includes(header), `${file.name}: exported heading ${header} was not found`)
  const known = recognized.get(cacheKey) ?? new Set<string>()
  sourceHeaders.forEach(h => known.add(h)); recognized.set(cacheKey, known)
  const allowed = spec.role === 'data' ? ['version', 'level', 'account', 'month', 'year', 'period', 'amount'] : spec.role === 'personnel' ? ['id', 'version', 'level', 'account'] : spec.role === 'accounts' ? ['id', 'name', 'type'] : spec.role === 'versions' ? ['id', 'name'] : ['id', 'name', 'parent']
  requireThat([...Object.keys(columns), ...Object.keys(constants)].every(k => allowed.includes(k)), `${file.name}: unsupported mapped field; retain it as an unmapped source column`)
  for (const row of table.rows) {
   if (Object.entries(rowFilter).some(([h, expected]) => row.values[h] !== expected)) {
    result.unmapped.push({ location: row.location, reason: 'Source row excluded by the explicit buyer row filter' }); continue
   }
   const value = (key: string, required = false): string => {
    const raw = columns[key] ? row.values[columns[key]].trim() : constants[key] ?? (key === 'version' ? file.version ?? '' : '')
    const v = spec.valueMap?.[key]?.[raw] ?? raw
    requireThat(typeof v === 'string' && (!required || v.length > 0), `${row.location}: ${key} is required`)
    return v
   }
   if (spec.role === 'unmapped') { result.unmapped.push({ location: row.location, reason: String(spec.reason || 'Source modeled row or access rule has no Easel equivalent') }); continue }
   if (['levels', 'accounts', 'versions', 'dimension'].includes(spec.role)) {
    const id = value('id', true), name = value('name', true), parent = value('parent'), type = value('type')
    if (spec.role === 'dimension') {
     requireThat(spec.dimension?.id && spec.dimension?.name, 'A dimension table needs its source identity and name')
     let dimension = result.dimensions.find(d => d.id === spec.dimension.id)
     if (!dimension) { dimension = { id: spec.dimension.id, name: spec.dimension.name, members: [] }; result.dimensions.push(dimension) }
     requireThat(dimension.name === spec.dimension.name, 'Conflicting source dimension names')
     addUnique(dimension.members, { id, name, ...(parent ? { parent } : {}) }, row.location)
    } else if (spec.role === 'levels') addUnique(result.levels, { id, name, ...(parent ? { parent } : {}) }, row.location)
    else if (spec.role === 'accounts') addUnique(result.accounts, { id, name, ...(type ? { type } : {}) }, row.location)
    else addUnique(result.versions, { id, name }, row.location)
    continue
   }
   const version = value('version', true), level = value('level', true)
   if (spec.role === 'personnel') {
    const dimensions = Object.fromEntries(Object.entries(dimensionColumns).map(([id, h]) => [id, row.values[h].trim()]).filter(([, v]) => v))
    result.personnel.push({ id: value('id', true), version, level, account: value('account', true), values: { ...row.values }, location: row.location, ...(Object.keys(dimensions).length ? { dimensions } : {}) })
    continue
   }
   const dimensions = Object.fromEntries(Object.entries(dimensionColumns).map(([id, h]) => [id, row.values[h].trim()]).filter(([, v]) => v))
   const emit = (account: string, period: string, amount: string, location: string) => {
    requireThat(account && amount.trim(), `${location}: account and amount are required`)
    requireThat(!amount.trim().startsWith('='), `${location}: export calculated values rather than formula text`)
    result.data.push({ version, account, level, month: month(period, spec, location), amount: amount.trim(), ...(Object.keys(dimensions).length ? { dimensions } : {}), location })
   }
   requireThat(!(Object.keys(months).length && Object.keys(metrics).length), 'Choose month columns or metric columns, not both')
   if (Object.keys(months).length) {
    for (const [header, period] of Object.entries(months)) if (row.values[header].trim()) emit(value('account', true), period, row.values[header], row.cells[header])
   } else {
    const period = columns.year || constants.year ? spec.periods?.[`${value('year', true)}/${value('period', true)}`] : value('month', true)
    requireThat(typeof period === 'string', `${row.location}: explicitly map the fiscal year/month to a calendar month`)
    if (Object.keys(metrics).length) {
     for (const [header, account] of Object.entries(metrics)) if (row.values[header].trim()) emit(account, period, row.values[header], row.cells[header])
    } else emit(value('account', true), period, value('amount', true), columns.amount ? row.cells[columns.amount] : row.location)
   }
  }
 }
 // Union recognized columns across roles: a Scenario catalog may use the same original data file.
 for (const [cacheKey, pending] of read) {
  const table = await pending, known = recognized.get(cacheKey)!
  for (const row of table.rows) {
   for (const h of table.headers) if (!known.has(h) && row.values[h].trim()) result.unmapped.push({ location: row.cells[h], reason: `Source column ${h} has no configured Easel equivalent` })
   for (const location of row.formulas) result.unmapped.push({ location, reason: 'Source formula was not translated; only its exported cached value is retained' })
  }
 }
 for (const file of files) if (!used.has(file.name)) result.unmapped.push({ location: file.name, reason: 'Original file has no configured import role' })
 return result
}
