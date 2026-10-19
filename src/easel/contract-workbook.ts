import type { ContractCalculation } from './contract-revenue'
import type { Cell, Sheet } from './xlsx-write'

/** Captured ledger and visible source detail; no calculation or hidden input reads. */
export function contractSheets(contracts: ContractCalculation, currency: string, prefix: string): Sheet[] {
 const rows: Cell[][] = [[`${currency} minor units. Billing and recognition are distinct. DSO uses exact invoice dates.`], ['Month', 'Bookings', 'Billings', 'Revenue', 'Collections', 'Receivables', 'Deferred revenue', 'Unbilled revenue', 'Billings less revenue', 'Trace', 'Actuals reconciliation']]
 for (const c of contracts.months) {
  const r = rows.length + 1
  rows.push([c.month, c.bookings, c.billings, c.revenue, c.collections, c.receivables, c.deferredRevenue, c.unbilledRevenue, { formula: `C${r}-D${r}`, value: c.billings - c.revenue }, c.trace, contracts.actualsIssues?.filter(issue => issue.month <= c.month).map(issue => issue.reason).join('\n') ?? ''])
 }
 const r = rows.length + 1
 rows.push(['Total flows / final balances', ...['B', 'C', 'D', 'E'].map(col => ({ formula: `SUM(${col}3:${col}${r - 1})`, value: contracts.months.reduce((n, c) => n + ({ B: c.bookings, C: c.billings, D: c.revenue, E: c.collections }[col] ?? 0), 0) })), ...['F', 'G', 'H'].map((col, index) => ({ formula: `${col}${r - 1}`, value: [contracts.months.at(-1)!.receivables, contracts.months.at(-1)!.deferredRevenue, contracts.months.at(-1)!.unbilledRevenue][index] })), { formula: `SUM(I3:I${r - 1})`, value: contracts.months.reduce((n, c) => n + c.billings - c.revenue, 0) }])
 return [{ name: `${prefix}Contracts`, rows }, { name: `${prefix}Contract detail`, rows: [[`${currency} minor units. Only source detail visible to this reader.`], ['Contract', 'Month', 'Bookings', 'Billings', 'Revenue', 'Collections', 'Receivables', 'Deferred revenue', 'Unbilled revenue', 'Trace'], ...contracts.rows.map(c => [c.name, c.month, c.bookings, c.billings, c.revenue, c.collections, c.receivables, c.deferredRevenue, c.unbilledRevenue, c.trace])] }, { name: `${prefix}Contract invoices`, rows: [['Invoice dates and collection dates are UTC calendar dates; no payments are executed.'], ['Contract', 'Invoice date', 'Collection date', 'Amount'], ...contracts.invoices.map(i => [i.name, i.date, i.collectionDate, i.amount])] }]
}
