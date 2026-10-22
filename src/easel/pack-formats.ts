// REPORT-003: every document door renders from the immutable pack snapshot.
import { packBlocks } from './pack-blocks'
import { packCsv, packHtml } from './pack-documents'
import { packPdf } from './pack-pdf'
import { packPptx } from './pack-pptx'
import { packWorkbook } from './pack-workbook'
import type { Data } from './types'

export const PACK_FORMATS = ['html', 'csv', 'xlsx', 'pdf', 'pptx'] as const
export type PackFormat = typeof PACK_FORMATS[number]
export const PACK_TYPES: Record<PackFormat, string> = {
 html: 'text/html; charset=utf-8', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
export const packFileName = (sn: Data, format: PackFormat) => `easel-${sn.body.period === 'quarter' ? 'quarter' : 'review'}-${sn.body.month}.${format}`

export function renderPack(sn: Data, format: PackFormat): string | Uint8Array {
 if (format === 'html') return packHtml(sn)
 if (format === 'csv') return packCsv(sn)
 if (format === 'xlsx') return packWorkbook(sn)
 const { title, subtitle, blocks } = packBlocks(sn)
 return format === 'pdf' ? packPdf(title, subtitle, blocks) : packPptx(title, subtitle, blocks)
}
