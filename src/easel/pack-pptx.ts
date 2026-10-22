// REPORT-003: a published pack as a PowerPoint (.pptx) package written
// directly: one title slide, then a slide per heading with its tables split
// across slides and charts drawn as native shapes. Content comes from the
// same blocks as the PDF, and the bytes depend only on the snapshot.
import { formatMoney } from './units'
import { zipFiles } from './xlsx-write'
import type { Block, Chart } from './pack-blocks'

const encoder = new TextEncoder()
const esc = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const SW = 12192000, SH = 6858000, MX = 457200, ROWS = 11

const box = (id: number, name: string, x: number, y: number, w: number, h: number, paragraphs: { text: string; size: number; bold?: boolean }[]) =>
 `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs.map(p => `<a:p><a:r><a:rPr lang="en-US" sz="${p.size * 100}"${p.bold ? ' b="1"' : ''}/><a:t>${esc(p.text)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`
const rect = (id: number, x: number, y: number, w: number, h: number, fill: string) =>
 `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Bar ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></p:spPr></p:sp>`

function tableFrame(id: number, heads: string[], rows: string[][], y: number) {
 const weights = heads.map((h, j) => Math.min(40, Math.max(6, h.length, ...rows.map(r => Math.min(40, (r[j] ?? '').length))))), total = weights.reduce((a, b) => a + b, 0), usable = SW - 2 * MX
 const widths = weights.map(w => Math.floor(w / total * usable))
 const cell = (value: string, bold: boolean) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="900"${bold ? ' b="1"' : ''}/><a:t>${esc(value)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
 const tr = (cells: string[], bold: boolean) => `<a:tr h="370840">${heads.map((_, j) => cell(cells[j] ?? '', bold)).join('')}</a:tr>`
 return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${MX}" y="${y}"/><a:ext cx="${widths.reduce((a, b) => a + b, 0)}" cy="${370840 * (rows.length + 1)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map(w => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${tr(heads, true)}${rows.map(r => tr(r, false)).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

function chartShapes(start: number, chart: Chart, currency: string, y: number) {
 const out: string[] = [], left = MX + 1200000, right = SW - MX, top = y + 300000, h = 3300000, bottom = top + h
 const values = chart.series.flatMap(s => s.values), max = Math.max(1, ...values), min = Math.min(0, ...values), span = max - min
 const at = (v: number) => bottom - Math.round((v - min) / span * h)
 const slot = Math.floor((right - left) / chart.months.length), bar = Math.floor(slot * 0.7 / chart.series.length)
 let id = start
 out.push(box(id++, 'Scale high', MX, top - 100000, 1100000, 250000, [{ text: formatMoney(max, currency), size: 9 }]), box(id++, 'Scale low', MX, bottom - 150000, 1100000, 250000, [{ text: formatMoney(min, currency), size: 9 }]))
 chart.months.forEach((m, i) => {
  chart.series.forEach((s, k) => { const v = s.values[i], a = at(v), z = at(0); out.push(rect(id++, left + i * slot + Math.floor(slot * 0.15) + k * bar, Math.min(a, z), bar, Math.abs(a - z), k % 2 ? 'A6A6A6' : '26598C')) })
  out.push(box(id++, `Month ${m}`, left + i * slot, bottom + 30000, slot, 250000, [{ text: m.slice(5), size: 9 }]))
 })
 out.push(box(id++, 'Legend', left, bottom + 330000, right - left, 250000, [{ text: chart.series.map((s, k) => `${k % 2 ? 'Grey' : 'Blue'} = ${s.name}`).join('   '), size: 10 }]))
 return out.join('')
}

const slide = (shapes: string) => `${XML}<p:sld ${NS}><p:cSld><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`

export function packPptx(title: string, subtitle: string, blocks: Block[]): Uint8Array {
 const slides: string[] = []
 slides.push(slide(box(2, 'Title', MX, 2200000, SW - 2 * MX, 1000000, [{ text: title, size: 32, bold: true }]) + box(3, 'Subtitle', MX, 3300000, SW - 2 * MX, 600000, [{ text: subtitle, size: 18 }])))
 let heading = '', shapes: string[] = [], y = 1000000, id = 3, started = false, count = 0
 const flush = () => { if (started) slides.push(slide(shapes.join(''))); shapes = []; started = false; y = 1000000; id = 3 }
 const open = (name: string) => { flush(); started = true; count++; heading = name; shapes = [box(2, 'Heading', MX, 300000, SW - 2 * MX, 600000, [{ text: name + (count > 1 && false ? '' : ''), size: 24, bold: true }])] }
 for (const block of blocks) {
  if (block.type === 'heading') open(block.text)
  else {
   if (!started) open(heading || 'Summary')
   if (block.type === 'text') { shapes.push(box(id++, 'Note', MX, y, SW - 2 * MX, 700000, [{ text: block.text, size: 11 }])); y += 700000 }
   else if (block.type === 'chart') { shapes.push(chartShapes(id, block.chart, block.currency, y)); id += 200; }
   else {
    for (let i = 0; i < Math.max(1, block.rows.length); i += ROWS) {
     if (i > 0) open(`${heading} (continued)`)
     shapes.push(tableFrame(id++, block.heads, block.rows.slice(i, i + ROWS), y)); y += 370840 * (Math.min(ROWS, block.rows.length - i) + 1) + 150000
    }
   }
  }
 }
 flush()
 const files: { name: string; bytes: Uint8Array }[] = []
 const add = (name: string, contents: string) => files.push({ name, bytes: encoder.encode(contents) })
 const rel = (items: [string, string, string][]) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`
 const O = 'application/vnd.openxmlformats-officedocument'
 add('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${O}.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${O}.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${O}.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${O}.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${O}.presentationml.slide+xml"/>`).join('')}</Types>`)
 add('_rels/.rels', rel([['rId1', 'officeDocument', 'ppt/presentation.xml']]))
 add('ppt/presentation.xml', `${XML}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)
 add('ppt/_rels/presentation.xml.rels', rel([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...slides.map((_, i): [string, string, string] => [`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`])]))
 add('ppt/slideMasters/slideMaster1.xml', `${XML}<p:sldMaster ${NS}><p:cSld><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`)
 add('ppt/slideMasters/_rels/slideMaster1.xml.rels', rel([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]))
 add('ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
 add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rel([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]))
 const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>', line = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>', effect = '<a:effectStyle><a:effectLst/></a:effectStyle>'
 add('ppt/theme/theme1.xml', `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Easel"><a:themeElements><a:clrScheme name="Easel"><a:dk1><a:srgbClr val="1B2724"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="26598C"/></a:dk2><a:lt2><a:srgbClr val="EEF2F0"/></a:lt2><a:accent1><a:srgbClr val="26598C"/></a:accent1><a:accent2><a:srgbClr val="A6A6A6"/></a:accent2><a:accent3><a:srgbClr val="4A5A55"/></a:accent3><a:accent4><a:srgbClr val="9AA8A3"/></a:accent4><a:accent5><a:srgbClr val="5B8DB8"/></a:accent5><a:accent6><a:srgbClr val="7A8B85"/></a:accent6><a:hlink><a:srgbClr val="26598C"/></a:hlink><a:folHlink><a:srgbClr val="4A5A55"/></a:folHlink></a:clrScheme><a:fontScheme name="Easel"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Easel"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line}${line}${line}</a:lnStyleLst><a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`)
 slides.forEach((xml, i) => { add(`ppt/slides/slide${i + 1}.xml`, xml); add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rel([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])) })
 return zipFiles(files)
}
