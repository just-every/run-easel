import { balanceActualsSheets } from './balance-actuals-workbook'
// Finance's reconciliation and activity reports share the workbook export door.
import { workbook, type Cell } from './xlsx-write'
import type { Data } from './types'

export function actualsWorkbook(view: Data, currency: string): Uint8Array {
 const rows: Cell[][] = [[`Reconciliation · ${currency} minor units`], ['Month', 'Rows', 'Imported', 'Mapped', 'Excluded', 'Cash', 'Unmapped', 'Revenue', 'Costs', 'Difference', 'Mapping status', 'Other balance sheet']]
 for (const m of view.months) { const r = rows.length + 1; rows.push([m.period, m.rows, m.imported, m.mapped, m.excluded, m.cash, m.unmapped, m.revenue, m.costs, { formula: `C${r}-D${r}-E${r}-F${r}-G${r}-L${r}`, value: m.imported - m.mapped - m.excluded - m.cash - m.unmapped - m.balanceSheet }, m.blocked ? `Blocked: ${[...m.unmappedAccounts, ...m.unmappedDepartments].join(', ')}` : 'Complete', m.balanceSheet]) }
 const count = rows.length
 rows.push(['Total', ...['B','C','D','E','F','G','H','I','J'].map((col, i) => (i === 6 || i === 7) && view.months.some((m: Data) => m.blocked) ? null : ({ formula: count > 2 ? `SUM(${col}3:${col}${count})` : '0', value: view.months.reduce((n: number, m: Data) => n + [m.rows,m.imported,m.mapped,m.excluded,m.cash,m.unmapped,m.revenue,m.costs,0][i], 0) })), '', { formula: count > 2 ? `SUM(L3:L${count})` : '0', value: view.months.reduce((n: number, m: Data) => n + m.balanceSheet, 0) }])
 return workbook([{ name: 'Reconciliation', rows }, { name: 'Unmapped accounts', rows: [['Period', 'Account', 'Rows', 'Amount in minor units', 'Reason'], ...view.unmapped.map((m: Data) => [m.period, m.account, m.rows, m.amount, m.reason])] }, ...balanceActualsSheets(view.trialBalances, currency)])
}
export function activityWorkbook(events: Data[]): Uint8Array {
 const rows: Cell[][] = [['Complete filtered activity'], ['Sequence', 'At', 'Actor', 'Name', 'Action', 'Record', 'Scenario', 'Before revision', 'After revision', 'Detail', 'Events']]
 for (const e of events) rows.push([e.seq, e.at, e.actor, e.actorName ?? '', e.action, e.record, e.scenario ?? '', e.beforeRevision ?? null, e.afterRevision ?? null, JSON.stringify(e.detail), 1])
 const last = rows.length
 rows.push(['Total events', '', '', '', '', '', '', '', '', '', { formula: last > 2 ? `SUM(K3:K${last})` : '0', value: events.length }])
 return workbook([{ name: 'Activity', rows }])
}
