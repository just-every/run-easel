import type { Data } from './types'
import { workbook, type Cell } from './xlsx-write'

/** The dashboard exports the same aggregate projection, never its pay inputs. */
export function dashboardWorkbook(view: Data) {
 const rows: Cell[][] = [[`${view.dashboard.name} · ${view.scenarioName} · ${view.currency} minor units; headcount people; runway hundredths of months`],
  ['Month', 'Revenue', 'Cost of sales', 'Gross margin', 'Headcount', 'Monthly recurring revenue', 'ARR', 'Net burn', 'Runway', 'Closing cash', 'ARR basis', 'Runway basis']]
 for (const m of view.rows) {
  const r = rows.length + 1
  rows.push([m.month, m.revenue, m.revenue === null ? null : m.revenue - m.grossMargin,
   m.grossMargin === null ? null : { formula: `B${r}-C${r}`, value: m.grossMargin }, m.headcount,
   m.arr === null ? null : m.arr / 12, m.arr === null ? null : { formula: `F${r}*12`, value: m.arr },
   m.burn, m.runway, m.closingCash, m.arrBasis, m.runwayBasis])
 }
 // A period total for flows and a last-month value for stocks. The distinction
 // avoids pretending that twelve monthly headcounts or ARR values are additive.
 const last = rows.length
 rows.push(['Period total / ending balance', ...['B', 'C', 'D'].map(col => view.rows.some((m: Data) => m.revenue === null) ? null : ({ formula: `SUM(${col}3:${col}${last})`, value: view.rows.reduce((sum: number, m: Data) => sum + (col === 'B' ? m.revenue : col === 'C' ? m.revenue - m.grossMargin : m.grossMargin), 0) })),
  { formula: `E${last}`, value: view.rows.at(-1).headcount }])
 return workbook([{ name: 'Dashboard', rows }])
}
