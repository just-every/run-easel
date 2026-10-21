import type { Data } from './types'

/** Calculation-local indexes retain the input order of each matching scan. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
 const groups = new Map<K, T[]>()
 for (const row of rows) {
  const k = key(row), group = groups.get(k)
  if (group) group.push(row)
  else groups.set(k, [row])
 }
 return groups
}

/** Preserve Array.find's first match, including when source keys repeat. */
export function firstBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T> {
 const index = new Map<K, T>()
 for (const row of rows) {
  const k = key(row)
  if (!index.has(k)) index.set(k, row)
 }
 return index
}

export const lineDepartmentKey = (row: Data) => JSON.stringify([row.line, row.department])
export const lineMonthKey = (row: Data) => `${row.line}|${row.department}|${row.month}`
export const originMonthKey = (row: Data) => JSON.stringify([row.originId, row.month])
