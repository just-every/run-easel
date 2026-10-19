export type Cell = string | number | null | { formula: string; value: number }
export type Sheet = { name: string; rows: Cell[][] }

const encoder = new TextEncoder()

function xmlSafe(value: string): string {
 let clean = ''
 for (const char of value) {
  const point = char.codePointAt(0)!
  if (point === 9 || point === 10 || point === 13 || (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff)) clean += char
 }
 return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function sheetNames(sheets: Sheet[]): string[] {
 if (sheets.length === 0) throw new Error('A workbook needs at least one sheet')
 if (sheets.length > 65535) throw new Error('A workbook cannot contain more than 65,535 sheets')
 const used = new Set<string>()
 return sheets.map((sheet, index) => {
  const base = (sheet.name || `Sheet${index + 1}`).replace(/[\\/:*?\[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || `Sheet${index + 1}`
  let name = base, suffix = 2
  while (used.has(name.toLowerCase())) {
   const ending = ` (${suffix++})`
   name = `${base.slice(0, 31 - ending.length)}${ending}`
  }
  used.add(name.toLowerCase())
  return name
 })
}

function columnName(index: number): string {
 let name = ''
 while (index > 0) {
  index--
  name = String.fromCharCode(65 + index % 26) + name
  index = Math.floor(index / 26)
 }
 return name
}

function worksheet(sheet: Sheet): string {
 if (sheet.rows.length > 1_048_576) throw new Error('A worksheet cannot contain more than 1,048,576 rows')
 const rows = sheet.rows.map((cells, rowIndex) => {
  if (cells.length > 16_384) throw new Error('A worksheet cannot contain more than 16,384 columns')
  const entries: string[] = []
  cells.forEach((cell, columnIndex) => {
   if (cell === null) return
   const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`
   if (typeof cell === 'string') {
    entries.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlSafe(cell)}</t></is></c>`)
   } else if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) throw new Error(`Cell ${ref} must contain a finite number`)
    entries.push(`<c r="${ref}"><v>${cell}</v></c>`)
   } else {
    if (!Number.isFinite(cell.value)) throw new Error(`Cell ${ref} must contain a finite formula value`)
    const formula = cell.formula.startsWith('=') ? cell.formula.slice(1) : cell.formula
    entries.push(`<c r="${ref}"><f>${xmlSafe(formula)}</f><v>${cell.value}</v></c>`)
   }
  })
  return `<row r="${rowIndex + 1}">${entries.join('')}</row>`
 }).join('')
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

export function workbook(sheets: Sheet[]): Uint8Array {
 const names = sheetNames(sheets)
 const files: { name: string; bytes: Uint8Array }[] = []
 const add = (name: string, contents: string) => files.push({ name, bytes: encoder.encode(contents) })
 const sheetOverrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
 add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}</Types>`)
 add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 const sheetRefs = names.map((name, i) => `<sheet name="${xmlSafe(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
 add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetRefs}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`)
 const sheetRels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
 add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}</Relationships>`)
 sheets.forEach((sheet, i) => add(`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet)))
 return zipFiles(files)
}

const crcTable = (() => {
 const table = new Uint32Array(256)
 for (let n = 0; n < 256; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  table[n] = value >>> 0
 }
 return table
})()

function crc32(bytes: Uint8Array): number {
 let crc = 0xffffffff
 for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
 return (crc ^ 0xffffffff) >>> 0
}

export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
 if (files.length > 65535) throw new Error('A ZIP archive cannot contain more than 65,535 files')
 const names = new Set<string>()
 const encoded = files.map(file => {
  if (names.has(file.name)) throw new Error(`Duplicate ZIP entry: ${file.name}`)
  names.add(file.name)
  const name = encoder.encode(file.name)
  if (!name.length || name.length > 65535) throw new Error('ZIP entry names must be 1 to 65,535 UTF-8 bytes')
  if (file.bytes.length > 0xffffffff) throw new Error('ZIP entries cannot exceed 4 GiB')
  return { name, bytes: file.bytes, crc: crc32(file.bytes) }
 })
 const localSize = encoded.reduce((sum, file) => sum + 30 + file.name.length + file.bytes.length, 0)
 const centralSize = encoded.reduce((sum, file) => sum + 46 + file.name.length, 0)
 if (localSize + centralSize + 22 > 0xffffffff) throw new Error('ZIP archive exceeds the classic ZIP size limit')
 const output = new Uint8Array(localSize + centralSize + 22)
 const view = new DataView(output.buffer)
 let offset = 0
 const directory: { name: Uint8Array; bytes: Uint8Array; crc: number; offset: number }[] = []
 for (const file of encoded) {
  const localOffset = offset
  view.setUint32(offset, 0x04034b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint16(offset + 6, 0x0800, true)
  view.setUint16(offset + 8, 0, true)
  view.setUint16(offset + 10, 0, true)
  view.setUint16(offset + 12, 0x0021, true)
  view.setUint32(offset + 14, file.crc, true)
  view.setUint32(offset + 18, file.bytes.length, true)
  view.setUint32(offset + 22, file.bytes.length, true)
  view.setUint16(offset + 26, file.name.length, true)
  view.setUint16(offset + 28, 0, true)
  output.set(file.name, offset + 30)
  output.set(file.bytes, offset + 30 + file.name.length)
  directory.push({ ...file, offset: localOffset })
  offset += 30 + file.name.length + file.bytes.length
 }
 const centralOffset = offset
 for (const file of directory) {
  view.setUint32(offset, 0x02014b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint16(offset + 6, 20, true)
  view.setUint16(offset + 8, 0x0800, true)
  view.setUint16(offset + 10, 0, true)
  view.setUint16(offset + 12, 0, true)
  view.setUint16(offset + 14, 0x0021, true)
  view.setUint32(offset + 16, file.crc, true)
  view.setUint32(offset + 20, file.bytes.length, true)
  view.setUint32(offset + 24, file.bytes.length, true)
  view.setUint16(offset + 28, file.name.length, true)
  view.setUint16(offset + 30, 0, true)
  view.setUint16(offset + 32, 0, true)
  view.setUint16(offset + 34, 0, true)
  view.setUint16(offset + 36, 0, true)
  view.setUint32(offset + 38, 0, true)
  view.setUint32(offset + 42, file.offset, true)
  output.set(file.name, offset + 46)
  offset += 46 + file.name.length
 }
 view.setUint32(offset, 0x06054b50, true)
 view.setUint16(offset + 4, 0, true)
 view.setUint16(offset + 6, 0, true)
 view.setUint16(offset + 8, directory.length, true)
 view.setUint16(offset + 10, directory.length, true)
 view.setUint32(offset + 12, centralSize, true)
 view.setUint32(offset + 16, centralOffset, true)
 view.setUint16(offset + 20, 0, true)
 return output
}
