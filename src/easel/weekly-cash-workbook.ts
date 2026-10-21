import type { Data } from './types'
import { workbook, type Cell } from './xlsx-write'
export function weeklyCashWorkbook(view: Data): Uint8Array {
 const rows: Cell[][] = [[`${view.currency} minor units (100 = 1 currency unit)`], [view.basis ?? view.reason], ['Start', 'End', 'Opening', 'Collections', 'Payments', 'Adjustment', 'Closing', 'Note', 'Assumed dates']]
 for (const w of view.weeks) {
  const r = rows.length + 1
  rows.push(w.available ? [w.start, w.end, r === 4 ? w.opening : { formula: `G${r - 1}`, value: w.opening }, w.collections, w.payments, w.adjustment, { formula: `C${r}+D${r}-E${r}+F${r}`, value: w.closing }, w.note, w.assumedDates ? 'Yes' : 'No'] : [w.start, w.end, null, null, null, null, null, 'Unavailable outside captured horizon'])
 }
 const rec: Cell[][] = [[`${view.currency} minor units; difference = weekly − monthly`], ['Period end', 'Monthly forecast', 'Dated schedule', 'Overrides to date', 'Weekly closing', 'Difference', 'Source coverage']]
 for (const m of view.reconciliation) {
  const r = rec.length + 1
  rec.push([m.date, m.monthly, m.scheduled, m.adjustment, { formula: `C${r}+D${r}`, value: m.weekly }, { formula: `E${r}-B${r}`, value: m.difference }, m.incomplete ? 'Incomplete' : 'Current plan schedule'])
 }
 return workbook([{ name: 'Weekly cash', rows }, { name: 'Reconciliation', rows: rec }])
}
