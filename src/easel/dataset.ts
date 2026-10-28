// REPORT-007, REPORT-009: a saved report as a flat, read-only dataset for BI tools. Rows
// come only from the saved-report view, so every report door's rules apply:
// the reader's current audience and department grants, no individual
// compensation detail, unavailable values left empty (never zero) and the
// same versions the report compares. One row per report row, month and series.
import type { Context } from './context'
import { csvCell } from './pack-documents'
import { parquetFile, type ParquetColumn, type ParquetValue } from './parquet'
import { savedReport } from './saved-reports'
import type { Data } from './types'

export const DATASET_COLUMNS: ParquetColumn[] = [
 { name: 'row_id', type: 'string' }, { name: 'row_name', type: 'string' }, { name: 'month', type: 'string' }, { name: 'series', type: 'string' },
 { name: 'amount_minor', type: 'int64', optional: true }, { name: 'currency', type: 'string' },
]

export async function dataset(c: Context, id: string) {
 const view = await savedReport(c, id)
 const series: { name: string; value: (m: Data) => number | null }[] = [
  { name: 'Actual', value: m => m.actual }, { name: view.sourceName, value: m => m.budget },
  ...(view.comparisonName ? [{ name: view.comparisonName as string, value: (m: Data) => m.comparison }] : []),
  ...view.versions.map((v: Data) => ({ name: v.name as string, value: (m: Data) => m.versions[v.id] })),
 ]
 const rows = view.monthly.flatMap((m: Data) => series.map(s => [m.row, m.name, m.month, s.name, s.value(m), view.currency] as ParquetValue[]))
 return { id, name: view.name, currency: view.currency, units: 'amount_minor is integer minor units; empty or null means unavailable, never zero', columns: DATASET_COLUMNS.map(c => c.name), rows }
}

export type Dataset = Awaited<ReturnType<typeof dataset>>
export const datasetCsv = (d: Dataset) => [d.columns.join(','), ...d.rows.map(r => r.map(v => csvCell(v === null ? '' : v)).join(','))].join('\r\n') + '\r\n'
export const datasetParquet = (d: Dataset) => parquetFile(DATASET_COLUMNS, d.rows)
export const datasetJson = (d: Dataset) => ({ ...d, rows: d.rows.map(r => Object.fromEntries(d.columns.map((name, i) => [name, r[i]]))) })
