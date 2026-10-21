import { ENTITY_BALANCE, ENTITY_CASH, ENTITY_PROFIT } from './entity-consolidation'
import { columnName } from './xlsx'
import { workbook, type Cell, type Sheet } from './xlsx-write'
import type { Data } from './types'

/** The same authorized consolidation projection, with editable sum-less-elimination formulas. */
export function entityWorkbook(view: Data): Uint8Array {
 const sheets: Sheet[] = []
 for (const [name, statement, keys] of [['Profit and loss', 'profit', ENTITY_PROFIT], ['Balance sheet', 'balanceSheet', ENTITY_BALANCE], ['Cash bridge', 'cash', ENTITY_CASH]] as const) {
  const count = view.entities.length
  const rows: Cell[][] = [[`${view.group.name} · ${view.currency} integer cents (100 = 1 currency unit)`], ['Month', 'Line', ...view.entities.map((e: Data) => e.name), 'Sum', 'Eliminations', 'Consolidated']]
  for (const month of view.consolidated) {
   if (!month[statement]) { rows.push([month.month, month.unavailable.join('; ')]); continue }
   for (const key of keys) {
    const r = rows.length + 1
    const values = view.entities.map((e: Data) => e.translated.months.find((m: Data) => m.month === month.month)[statement][key])
    const before = month.before[statement][key], result = month[statement][key]
    rows.push([month.month, key, ...values, { formula: `SUM(C${r}:${columnName(count + 2)}${r})`, value: before }, before - result, { formula: `${columnName(count + 3)}${r}-${columnName(count + 4)}${r}`, value: result }])
   }
  }
  sheets.push({ name, rows })
 }
 sheets.push({ name: 'Basis', rows: [[view.cashBasis], ['Scope', view.scope], ['Eliminations are explicit finance-reviewed rules; no counterparties or amounts are inferred.']] })
 return workbook(sheets)
}
