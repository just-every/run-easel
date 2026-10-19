import { addMonths } from './months'
import type { Data } from './types'
import type { Cell, Sheet } from './xlsx-write'

export function historySheet(view: Data, prefix = '', department = ''): Sheet | null {
 if (!view.actualsHistory) return null
 const history = view.actualsHistory, calc = view.calculation
 const pairs = new Map<string, Data>()
 for (const cell of [...calc.cells, ...history.cells]) if (!department || cell.department === department) pairs.set(`${cell.line}|${cell.department}`, cell)
 const rows: Cell[][] = [[`${view.workspace.currency} minor units; difference = scenario − actual; missing/blocked source cells are blank`], ['Month', 'Line', 'Department', 'Scenario', 'Actual', 'Prior year', 'Difference', 'Source status']]
 const actual = (line: string, department: string, month: string) => history.cells.find((c: Data) => c.month === month && c.line === line && c.department === department)?.amount ?? null
 for (const pair of pairs.values()) for (const month of calc.months) {
  const cells = calc.cells.filter((c: Data) => c.month === month && c.line === pair.line && c.department === pair.department)
  const planned = cells.length ? cells.reduce((sum: number, c: Data) => sum + c.amount, 0) : null
  const value = actual(pair.line, pair.department, month), previous = actual(pair.line, pair.department, addMonths(month, -12)), r = rows.length + 1
  rows.push([month, view.lines.find((l: Data) => l.id === pair.line)?.name ?? pair.line, view.departments.find((d: Data) => d.id === pair.department)?.name ?? pair.department,
   planned, value, previous, planned === null || value === null ? null : { formula: `D${r}-E${r}`, value: planned - value },
   history.status === 'not-captured' ? 'Not captured in this version' : history.blockedMonths.includes(month) ? 'Source blocked' : value === null ? 'Missing actual cell' : 'Accepted actuals'])
 }
 return { name: `${prefix}Actuals history`, rows }
}
