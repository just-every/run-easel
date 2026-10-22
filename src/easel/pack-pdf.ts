// REPORT-003: a published pack as a PDF 1.4 document written directly, with
// the built-in Helvetica fonts, no timestamps and no random identifiers, so
// the same snapshot always produces the same bytes and the same digest.
import { monthLabel } from './months'
import { formatMoney } from './units'
import type { Block, Chart } from './pack-blocks'

const W = 842, H = 595, M = 40
const encoder = new TextEncoder()
const ascii = (text: string) => text.replace(/[‐-―−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
const literal = (text: string) => '(' + [...ascii(text)].map(ch => { const c = ch.charCodeAt(0); return ch === '(' || ch === ')' || ch === '\\' ? '\\' + ch : c >= 32 && c < 127 ? ch : c > 127 && c < 256 ? '\\' + c.toString(8).padStart(3, '0') : '?' }).join('') + ')'
const width = (text: string, size: number, bold = false) => [...text].length * size * (bold ? 0.56 : 0.52)
const fmt = (n: number) => String(Math.round(n * 100) / 100)

function wrap(text: string, max: number, size: number, bold = false): string[] {
 const out: string[] = []
 for (const paragraph of ascii(text).split('\n')) {
  let line = ''
  for (let word of paragraph.split(/\s+/).filter(Boolean)) {
   while (width(word, size, bold) > max) { const fit = Math.max(1, Math.floor(max / (size * 0.56))); if (line) { out.push(line); line = '' } out.push(word.slice(0, fit)); word = word.slice(fit) }
   const next = line ? `${line} ${word}` : word
   if (width(next, size, bold) <= max) line = next; else { out.push(line); line = word }
  }
  out.push(line)
 }
 return out.filter((l, i, a) => l || a.length === 1 || i === 0)
}

class Page {
 ops: string[] = []
 y = H - M
}

export function packPdf(title: string, subtitle: string, blocks: Block[]): Uint8Array {
 const pages: Page[] = [new Page()]
 let page = pages[0]
 const need = (height: number) => { if (page.y - height < M + 14) { page = new Page(); pages.push(page) } }
 const text = (x: number, y: number, value: string, size: number, bold = false) => page.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${fmt(x)} ${fmt(y)} Td ${literal(value)} Tj ET`)
 const line = (x1: number, y1: number, x2: number, y2: number, grey = 0.6) => page.ops.push(`${grey} G 0.5 w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`)
 const paragraph = (value: string, size: number, bold = false) => { for (const l of wrap(value, W - 2 * M, size, bold)) { need(size + 4); page.y -= size + 2; text(M, page.y, l, size, bold) } page.y -= 4 }

 need(60); page.y -= 22; text(M, page.y, ascii(title).slice(0, 110), 18, true); page.y -= 18; text(M, page.y, ascii(subtitle), 11); page.y -= 8
 for (const block of blocks) {
  if (block.type === 'heading') { need(40); page.y -= 8; paragraph(block.text, 13, true) }
  else if (block.type === 'text') paragraph(block.text, 8)
  else if (block.type === 'table') {
   const weights = block.heads.map((h, j) => Math.min(48, Math.max(8, h.length, ...block.rows.map(r => Math.min(48, (r[j] ?? '').length)))))
   const total = weights.reduce((a, b) => a + b, 0), usable = W - 2 * M, cols = weights.map(w => w / total * usable)
   const size = 7.5, lead = 9.5
   const row = (cells: string[], bold: boolean) => {
    const wrapped = cells.map((c, j) => wrap(c, cols[j] - 6, size, bold)), lines = Math.max(...wrapped.map(w => w.length))
    need(lines * lead + 6)
    page.y -= 3
    let x = M
    wrapped.forEach((w, j) => { w.forEach((l, k) => text(x + 3, page.y - (k + 1) * lead + 2, l, size, bold)); x += cols[j] })
    page.y -= lines * lead + 3
    line(M, page.y, W - M, page.y, bold ? 0.2 : 0.8)
   }
   row(block.heads, true)
   for (const r of block.rows) row(r, false)
  } else chart(block.chart, block.currency)
 }
 function chart(c: Chart, currency: string) {
  const h = 150; need(h + 46)
  const top = page.y - 26, bottom = top - h, left = M + 70, right = W - M
  const values = c.series.flatMap(s => s.values), max = Math.max(1, ...values), min = Math.min(0, ...values), span = max - min
  const y = (v: number) => bottom + (v - min) / span * h
  line(left, bottom, right, bottom, 0.3); line(left, top, left, bottom, 0.3)
  text(M, top - 8, formatMoney(max, currency), 7); text(M, bottom, formatMoney(min, currency), 7)
  const slot = (right - left) / c.months.length, bar = slot * 0.7 / c.series.length
  const grey = ['0.15 0.35 0.55', '0.65 0.65 0.65']
  c.months.forEach((m, i) => {
   c.series.forEach((s, k) => { const x = left + i * slot + slot * 0.15 + k * bar; page.ops.push(`${grey[k % 2]} rg ${fmt(x)} ${fmt(Math.min(y(0), y(s.values[i])))} ${fmt(bar)} ${fmt(Math.max(0.5, Math.abs(y(s.values[i]) - y(0))))} re f`) })
   text(left + i * slot + 2, bottom - 9, m.slice(5), 6)
  })
  page.ops.push('0 g'); c.series.forEach((s, k) => { page.ops.push(`${grey[k % 2]} rg ${fmt(left + k * 90)} ${fmt(top + 4)} 8 8 re f 0 g`); text(left + k * 90 + 11, top + 4, s.name, 7) })
  page.y = bottom - 22
 }
 // Objects: 1 catalog, 2 pages, 3-4 fonts, then page and content per page, then info.
 const objects: string[] = []
 const pageIds = pages.map((_, i) => 5 + i * 2)
 objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
 objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
 objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
 objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
 pages.forEach((p, i) => {
  const footer = `BT /F1 7 Tf ${M} 22 Td ${literal(`${ascii(title).slice(0, 90)} - page ${i + 1} of ${pages.length}`)} Tj ET`
  const stream = [...p.ops, footer].join('\n')
  objects[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`
  objects[6 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
 })
 const infoId = objects.length
 objects[infoId] = `<< /Title ${literal(title)} /Producer (Easel) >>`
 let out = '%PDF-1.4\n'
 const offsets: number[] = []
 for (let id = 1; id < objects.length; id++) { offsets[id] = out.length; out += `${id} 0 obj\n${objects[id]}\nendobj\n` }
 const xref = out.length
 out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return encoder.encode(out.replace(/[^\x00-\x7f]/g, '?'))
}
