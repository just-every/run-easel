// Writes fixtures/fy27-budget.xlsx: a synthetic planning workbook in the
// shape the Excel planning kit documents (IMPORTING.md). It is a test input,
// not an export from any real company. Run: node fixtures/build-workbook.mjs
import { crc32, deflateRawSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const months = ['Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26', 'Jan-27', 'Feb-27', 'Mar-27', 'Apr-27', 'May-27', 'Jun-27']
const strings = []
const s = text => { let i = strings.indexOf(text); if (i < 0) { strings.push(text); i = strings.length - 1 } return i }
const col = n => (n > 26 ? col(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26))
const rows = []
const str = (ref, text) => `<c r="${ref}" t="s"><v>${s(text)}</v></c>`
const num = (ref, value, formula) => `<c r="${ref}">${formula ? `<f>${formula}</f>` : ''}<v>${value}</v></c>`

rows.push(`<row r="1">${str('A1', 'Harbour Analytics FY27 budget (synthetic fixture)')}</row>`)
rows.push(`<row r="3">${str('A3', 'Line')}${str('B3', 'Department')}${months.map((m, i) => str(`${col(i + 3)}3`, m)).join('')}${str('O3', 'Notes')}</row>`)
const plan = [
 ['Subscription revenue', 'Sales', months.map((_, i) => 96000 + i * 1500), null],
 ['Hosting', 'Engineering', months.map((_, i) => 15000 + i * 250), i => i > 0 ? `${col(i + 2)}5+250` : null],
 ['Software', 'Engineering', months.map(() => 2400), null],
 ['Rent', 'Operations', months.map(() => 9000), null],
 ['Advertising', 'Marketing', months.map((_, i) => (i === 2 ? 15000 : 7500)), null],
 ['Travel', 'Sales', months.map((_, i) => (i % 3 === 1 ? 1200.333 : null)), null],
]
plan.forEach(([line, dept, values, formula], k) => {
 const r = 4 + k
 rows.push(`<row r="${r}">${str(`A${r}`, line)}${str(`B${r}`, dept)}${values.map((v, i) => v === null ? '' : num(`${col(i + 3)}${r}`, v, formula?.(i))).join('')}${k === 4 ? str(`O${r}`, 'Conference sponsorship in September') : ''}</row>`)
})
const total = 4 + plan.length
rows.push(`<row r="${total}">${str(`A${total}`, 'Total')}${months.map((_, i) => num(`${col(i + 3)}${total}`, plan.reduce((a, p) => a + (p[2][i] ?? 0), 0), `SUM(${col(i + 3)}4:${col(i + 3)}${total - 1})`)).join('')}</row>`)

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`
const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(t => `<si><t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`
const files = {
 '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
 '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml': sheet,
 'xl/sharedStrings.xml': shared,
}

const local = [], central = []
let offset = 0
for (const [name, text] of Object.entries(files)) {
 const data = Buffer.from(text), packed = deflateRawSync(data), nameBytes = Buffer.from(name), crc = crc32(data)
 const header = Buffer.alloc(30)
 header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6); header.writeUInt16LE(8, 8)
 header.writeUInt16LE(0, 10); header.writeUInt16LE(0x5b21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18)
 header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26); header.writeUInt16LE(0, 28)
 local.push(header, nameBytes, packed)
 const entry = Buffer.alloc(46)
 entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0, 8); entry.writeUInt16LE(8, 10)
 entry.writeUInt16LE(0, 12); entry.writeUInt16LE(0x5b21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24)
 entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42)
 central.push(entry, nameBytes)
 offset += 30 + nameBytes.length + packed.length
}
const dir = Buffer.concat(central), end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10)
end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
writeFileSync(new URL('./fy27-budget.xlsx', import.meta.url), Buffer.concat([...local, dir, end]))
