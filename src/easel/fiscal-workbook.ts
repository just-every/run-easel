import { fiscalSummary } from './fiscal-summary'
import { columnName } from './xlsx'
import type { Cell, Sheet } from './xlsx-write'
import type { Data } from './types'

/** Roll-up formula cells reference the exported monthly P&L, including scoped exports. */
export function fiscalSheets(view: Data, monthlyRows: Cell[][], prefix: string, department: string): Sheet[] {
 const { calculation: calc, workspace, lines } = view
 const fiscal = fiscalSummary(workspace, calc, lines, department)
 const sheet = `'${`${prefix}Profit and loss`.replaceAll("'", "''")}'`
 const sheets: Sheet[] = [{ name: `${prefix}Accounting periods`, rows: [
  [`${fiscal.calendar}; inclusive dates; retail YYYY-MM keys are ordinal aliases, with consecutive 52-week years`],
  ['Key', 'Fiscal year', 'Quarter', 'Period', 'Start date', 'End date', 'Weeks'],
  ...fiscal.periods.map(p => [p.key, p.fiscalYear, p.quarter, p.period, p.fromDate, p.throughDate, p.weeks]),
 ] }]
 for (const [name, groups] of [['Fiscal quarters', fiscal.quarters], ['Fiscal years', fiscal.years]] as const) {
  sheets.push({ name: `${prefix}${name}`, rows: [
   [`${workspace.currency} minor units; flows sum monthly P&L cells without further rounding`],
   ['Line', ...groups.map(g => `${g.label}${g.complete ? '' : ' (partial)'}`)],
   ...monthlyRows.slice(2).map((row, index) => [row[0], ...groups.map(g => {
    const refs = g.periods.map(m => `${sheet}!${columnName(calc.months.indexOf(m) + 2)}${index + 3}`)
    const value = g.periods.reduce((n, m) => {
     const cell = row[calc.months.indexOf(m) + 1]
     return n + (typeof cell === 'number' ? cell : cell && typeof cell === 'object' && 'value' in cell ? cell.value : 0)
    }, 0)
    return { formula: refs.join('+'), value }
   })]),
  ] })
 }
 return sheets
}
