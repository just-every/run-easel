import { columnName } from './xlsx'
import type { Cell, Sheet } from './xlsx-write'
import type { Data } from './types'

export function versionComparisonSheet(view: Data): Sheet {
 const versions: Data[] = view.versions
 const rows: Cell[][] = [['Actual against saved versions and current forecast · minor units; difference = actual − version; blank if outside its horizon or currencies differ'], ['Line', 'Department', `Actual (${view.currency})`, ...versions.flatMap(v => [`${v.name} (${v.currency})`, `Difference: ${v.name}`])]]
 for (const v of view.rows) {
  const r = rows.length + 1
  rows.push([v.lineName, v.departmentName, v.actual, ...versions.flatMap((version, i) => {
   const value = v.comparisons.find((entry: Data) => entry.id === version.id)
   return [value.amount, value.variance === null ? null : { formula: `C${r}-${columnName(4 + i * 2)}${r}`, value: value.variance }]
  })])
 }
 return { name: 'Version comparison', rows }
}
