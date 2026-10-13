import { requireThat } from './types'

/** RFC 4180 CSV with a header row. Returns the header and each data row with its file line number. */
export function parseCsv(raw: string): { headers: string[]; rows: { line: number; cells: string[] }[] } {
 const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
 const rows: { line: number; cells: string[] }[] = []
 let row: string[] = [], field = '', quoted = false, closed = false, line = 1, rowLine = 1
 const endField = () => { row.push(field); field = ''; closed = false }
 const endRow = () => { endField(); if (row.some(c => c.trim() !== '')) rows.push({ line: rowLine, cells: row }); row = []; rowLine = line }
 for (let i = 0; i < text.length; i++) {
  const ch = text[i]
  if (quoted) {
   if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
   else if (ch === '"') { quoted = false; closed = true }
   else { if (ch === '\n') line++; field += ch }
   continue
  }
  if (ch === ',') endField()
  else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; line++; endRow() }
  else {
   requireThat(!closed, `CSV line ${line}: unexpected text after a closing quote`)
   if (ch === '"' && field === '') quoted = true
   else field += ch
  }
 }
 requireThat(!quoted, 'The CSV ends inside a quoted field')
 endRow()
 const header = rows.shift()
 requireThat(header, 'The file has no header row')
 const headers = header.cells.map(h => h.trim())
 requireThat(headers.every(Boolean) && new Set(headers).size === headers.length, 'Every column needs a unique heading')
 return { headers, rows }
}
