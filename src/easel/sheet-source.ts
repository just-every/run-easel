// Explicit numeric rectangles only. Grid extent and stable sheet ID fence a
// removed column even when Sheets trims blank trailing cells from rowData.
import type { Bindings } from '../auth.server'
import type { Context } from './context'
import { sheetAccessToken } from './sheet-connection'
import { sheetJSON } from './sheet-provider'
import { Fault, requireThat } from './types'
import { cents } from './units'

export type SheetShape = {
 spreadsheetId: string; range: string; sheetId: number; sheetTitle: string
 gridRows: number; gridColumns: number; startRow: number; startColumn: number; rowCount: number; columnCount: number
}
export type SheetRange = { spreadsheetId: string; range: string }
export type SheetSource = SheetShape & { values: number[][]; cells: { address: string; cents: number }[]; fetchedAt: string }
const column = (letters: string) => [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1
function columnName(index: number): string {
 let name = ''
 for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
 return name
}

export function sheetRange(input: SheetRange) {
 requireThat(input && typeof input === 'object', 'Choose a Google spreadsheet and explicit A1 rectangle')
 requireThat(typeof input.spreadsheetId === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(input.spreadsheetId), 'Use a Google spreadsheet ID')
 requireThat(typeof input.range === 'string' && input.range.length <= 300, 'Use an explicit sheet-qualified A1 rectangle')
 const match = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6}):\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/.exec(input.range)
 requireThat(match, "Use a sheet-qualified rectangle such as 'Capacity'!B2:C4")
 const sheetTitle = (match[1] ? match[1].replace(/''/g, "'") : match[2])
 requireThat(sheetTitle.length > 0 && sheetTitle.length <= 100 && !/[\x00-\x1f]/.test(sheetTitle), 'Use a valid Google sheet title')
 const startColumn = column(match[3].toUpperCase()), endColumn = column(match[5].toUpperCase()), startRow = Number(match[4]) - 1, endRow = Number(match[6]) - 1
 const rowCount = endRow - startRow + 1, columnCount = endColumn - startColumn + 1
 requireThat(rowCount > 0 && columnCount > 0 && endColumn < 18278 && rowCount * columnCount <= 2000, 'Choose an ordered rectangle with at most 2,000 numeric cells')
 const range = `'${sheetTitle.replace(/'/g, "''")}'!${columnName(startColumn)}${startRow + 1}:${columnName(endColumn)}${endRow + 1}`
 return { spreadsheetId: input.spreadsheetId, range, sheetTitle, startRow, startColumn, rowCount, columnCount }
}

export async function sheetSource(c: Context, env: Bindings, input: SheetRange, expected?: SheetShape): Promise<SheetSource> {
 const rectangle = sheetRange(input)
 const token = await sheetAccessToken(c, env)
 const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${rectangle.spreadsheetId}`)
 url.searchParams.set('ranges', rectangle.range)
 url.searchParams.set('fields', 'spreadsheetId,sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(effectiveValue))))')
 const source = await sheetJSON(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
 requireThat(source.spreadsheetId === rectangle.spreadsheetId && Array.isArray(source.sheets), 'Google returned a different or missing spreadsheet; no values were imported', 409)
 const sheets = source.sheets.filter(s => s?.properties?.title === rectangle.sheetTitle)
 requireThat(sheets.length === 1, 'The linked Google sheet is missing; no values were imported', 409)
 const sheet = sheets[0], properties = sheet.properties, grid = properties.gridProperties
 requireThat((properties.sheetType === undefined || properties.sheetType === 'GRID') && Number.isSafeInteger(properties.sheetId) && properties.sheetId >= 0 && grid && Number.isSafeInteger(grid.rowCount) && grid.rowCount > 0 && Number.isSafeInteger(grid.columnCount) && grid.columnCount > 0, 'Google returned missing sheet grid metadata; no values were imported', 409)
 const shape: SheetShape = { ...rectangle, sheetId: properties.sheetId, gridRows: grid.rowCount, gridColumns: grid.columnCount }
 requireThat(shape.startRow + shape.rowCount <= shape.gridRows && shape.startColumn + shape.columnCount <= shape.gridColumns, 'The linked Google sheet changed shape; no values were imported', 409)
 if (expected) for (const field of Object.keys(shape) as (keyof SheetShape)[]) requireThat(shape[field] === expected[field], 'The linked Google sheet changed shape; review and relink its range before importing', 409)
 requireThat(Array.isArray(sheet.data) && sheet.data.length === 1, 'The linked Google range is missing; no values were imported', 409)
 const data = sheet.data[0]
 requireThat((data.startRow ?? 0) === shape.startRow && (data.startColumn ?? 0) === shape.startColumn && Array.isArray(data.rowData) && data.rowData.length === shape.rowCount, 'The linked Google range has missing rows or changed shape; no values were imported', 409)
 const values: number[][] = [], cells: SheetSource['cells'] = []
 for (let row = 0; row < shape.rowCount; row++) {
  const entries = data.rowData[row]?.values
  requireThat(Array.isArray(entries) && entries.length === shape.columnCount, 'The linked Google range has missing cells or changed shape; blank cells are never treated as zero', 409)
  const normalized: number[] = []
  for (let col = 0; col < shape.columnCount; col++) {
   const address = `'${shape.sheetTitle.replace(/'/g, "''")}'!${columnName(shape.startColumn + col)}${shape.startRow + row + 1}`
   const value = entries[col]?.effectiveValue
   requireThat(value && Object.keys(value).length === 1 && typeof value.numberValue === 'number' && Number.isFinite(value.numberValue), `Google sheet cell ${address} is missing or not numeric; no values were imported`, 409)
   let amount: number
   try { amount = cents(value.numberValue, 'Google sheet amount', { negative: true }) }
   catch { throw new Fault(409, `Google sheet cell ${address} must contain an exact amount with at most two decimal places`) }
   normalized.push(amount); cells.push({ address, cents: amount })
  }
  values.push(normalized)
 }
 return { ...shape, values, cells, fetchedAt: c.now }
}
