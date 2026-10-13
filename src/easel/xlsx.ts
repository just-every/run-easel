// A small reader for Excel workbooks (.xlsx). It reads each cell's cached
// value and keeps its formula text as provenance. It never evaluates a formula
// and runs no macro: what Excel last calculated is what Easel sees.
import { requireThat } from './types'

export type XlsxCell = { ref: string; row: number; col: number; value: string | number | boolean | null; formula?: string; error?: string }
export type XlsxSheet = { name: string; cells: XlsxCell[] }

const MAX_ENTRY = 40_000_000

async function inflate(data: Uint8Array): Promise<Uint8Array> {
 const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
 const out = new Uint8Array(await new Response(stream).arrayBuffer())
 requireThat(out.length <= MAX_ENTRY, 'A workbook part is too large to read')
 return out
}

async function unzip(bytes: Uint8Array): Promise<Map<string, () => Promise<Uint8Array>>> {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
 let end = -1
 for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
 requireThat(end >= 0, 'This is not an .xlsx workbook (no zip directory found)')
 const count = view.getUint16(end + 10, true)
 let p = view.getUint32(end + 16, true)
 const files = new Map<string, () => Promise<Uint8Array>>()
 const decoder = new TextDecoder()
 for (let i = 0; i < count; i++) {
  requireThat(p + 46 <= bytes.length && view.getUint32(p, true) === 0x02014b50, 'The workbook\'s zip directory is damaged')
  const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true)
  const nameLength = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true)
  const local = view.getUint32(p + 42, true)
  const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength))
  requireThat(local + 30 <= bytes.length && view.getUint32(local, true) === 0x04034b50, 'The workbook\'s zip entries are damaged')
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
  const data = bytes.subarray(start, start + size)
  requireThat(method === 0 || method === 8, `Workbook part ${name} uses an unsupported compression`)
  files.set(name, () => method === 0 ? Promise.resolve(data) : inflate(data))
  p += 46 + nameLength + extra + comment
 }
 return files
}

const decodeXml = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
 e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))))
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decodeXml(m[1]) : undefined }
const texts = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map(m => decodeXml(m[1] ?? '')).join('')

export function columnIndex(ref: string) {
 const letters = /^[A-Z]+/.exec(ref)![0]
 return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}
export const columnName = (index: number): string => (index > 26 ? columnName(Math.floor((index - 1) / 26)) : '') + String.fromCharCode(65 + ((index - 1) % 26))

export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
 requireThat(bytes.length > 0 && bytes.length <= 5_000_000, 'Choose an .xlsx workbook of at most 5 MB')
 const files = await unzip(bytes)
 const read = async (name: string) => { const f = files.get(name); return f ? new TextDecoder().decode(await f()) : null }
 const workbook = await read('xl/workbook.xml')
 requireThat(workbook, 'This zip file is not an Excel workbook (xl/workbook.xml is missing)')
 const rels = (await read('xl/_rels/workbook.xml.rels')) ?? ''
 const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]))
 const shared = [...((await read('xl/sharedStrings.xml')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]))
 const sheets: XlsxSheet[] = []
 for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
  const name = attr(m[0], 'name') ?? 'Sheet'
  const target = targets.get(attr(m[0], 'r:id'))
  if (!target) continue
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  const xml = await read(path)
  if (!xml) continue
  const cells: XlsxCell[] = []
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
   const tag = `<c${c[1]}>`, body = c[2] ?? ''
   const ref = attr(tag, 'r')
   if (!ref) continue
   const type = attr(tag, 't') ?? 'n'
   const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
   const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]
   const cell: XlsxCell = { ref, row: Number(/\d+$/.exec(ref)![0]), col: columnIndex(ref), value: null, ...(f !== undefined ? { formula: '=' + decodeXml(f) } : {}) }
   if (type === 's' && v !== undefined) cell.value = shared[Number(v)] ?? ''
   else if (type === 'inlineStr') cell.value = texts(body)
   else if (type === 'str') cell.value = v === undefined ? '' : decodeXml(v)
   else if (type === 'b') cell.value = v === '1'
   else if (type === 'e') cell.error = v === undefined ? '#ERROR' : decodeXml(v)
   else if (v !== undefined && v !== '') cell.value = Number(v)
   cells.push(cell)
  }
  sheets.push({ name, cells })
 }
 requireThat(sheets.length > 0, 'The workbook has no readable worksheets')
 return sheets
}
