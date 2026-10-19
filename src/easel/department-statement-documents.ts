import type { Data } from './types'
import { formatMoney } from './units'
import { workbook, type Cell } from './xlsx-write'

// The caller supplies the department-scoped statement. These renderers neither
// load additional records nor decide who may receive or open the result.
const explanation = (row: Data): string => row.explanation ? `${row.explanation.text} [${row.explanation.status}]` : 'No explanation recorded'
const sum = (rows: Data[], field: string): number => rows.reduce((total, row) => total + row[field], 0)

export function statementEmail(statement: Data, appUrl: string): { subject: string; text: string } {
 const money = (amount: number) => formatMoney(amount, statement.currency)
 const line = (row: Data) => `${row.lineName} (${row.key}): actual ${money(row.actual)}; budget ${money(row.budget)}; variance ${money(row.variance)}. ${explanation(row)}`
 const rows: Data[] = statement.rows
 const sections = [
  `Monthly statement · ${statement.departmentName} · ${statement.label}`,
  `Statement ${statement.id}; month ${statement.month}; department ${statement.department}; currency ${statement.currency}. Variance = actual minus budget.`,
  'Actual, budget and variance',
  ...rows.map(line),
  `Total: actual ${money(sum(rows, 'actual'))}; budget ${money(sum(rows, 'budget'))}; variance ${money(sum(rows, 'variance'))}.`,
  '', 'Top variances',
  ...(statement.topVariances.length ? statement.topVariances.map(line) : ['No variances listed.']),
  '', 'Accepted supporting rows',
 ]
 for (const row of rows) {
  sections.push(`${row.lineName} (${row.key})`)
  if (!row.citations.length) sections.push('No accepted supporting rows recorded.')
  for (const citation of row.citations) sections.push(`File: ${citation.file}; line: ${citation.line}; date: ${citation.date}; description: ${citation.description}; reference: ${citation.reference}; amount: ${money(citation.amount)}.`)
 }
 sections.push('', 'Open tasks', ...(statement.tasks.length ? statement.tasks.map((task: Data) => `${task.name} (${task.id}); owner: ${task.owner ?? 'Unassigned'}; due: ${task.due ?? 'Not set'}; evidence: ${task.evidence.summary}`) : ['No open tasks.']))
 sections.push('', 'Confirmation work', ...(statement.toConfirm.length ? statement.toConfirm.map(line) : ['No confirmation work.']), '', `Open statement (sign-in required): ${appUrl}`)
 return { subject: `Monthly statement · ${statement.departmentName} · ${statement.label}`, text: sections.join('\n') }
}

export function departmentStatementWorkbook(statement: Data): Uint8Array {
 const rows: Data[] = statement.rows
 const metadata: Cell[][] = [
  ['Monthly statement', statement.label],
  ['Statement', statement.id, 'Month', statement.month],
  ['Department', statement.departmentName, 'Department ID', statement.department],
  [`${statement.currency} minor units (100 = 1 currency unit). Variance = actual minus budget.`],
 ]
 const headers: Cell[] = ['Line key', 'Line', 'Actual', 'Budget', 'Variance', 'Explanation', 'Explanation status']
 const statementRows: Cell[][] = [...metadata, headers]
 for (const row of rows) {
  const r = statementRows.length + 1
  statementRows.push([row.key, row.lineName, row.actual, row.budget, { formula: `C${r}-D${r}`, value: row.actual - row.budget }, row.explanation?.text ?? '', row.explanation?.status ?? ''])
 }
 const end = statementRows.length
 const totalRow = end + 1
 statementRows.push(['Total', '',
  { formula: rows.length ? `SUM(C6:C${end})` : '0', value: sum(rows, 'actual') },
  { formula: rows.length ? `SUM(D6:D${end})` : '0', value: sum(rows, 'budget') },
  { formula: `C${totalRow}-D${totalRow}`, value: sum(rows, 'actual') - sum(rows, 'budget') },
 ])
 statementRows.push([], ['Top variances'], headers)
 for (const row of statement.topVariances) {
  const r = statementRows.length + 1
  statementRows.push([row.key, row.lineName, row.actual, row.budget, { formula: `C${r}-D${r}`, value: row.actual - row.budget }, row.explanation?.text ?? '', row.explanation?.status ?? ''])
 }
 const accepted: Cell[][] = [...metadata, ['Line key', 'Line', 'File', 'Source line', 'Date', 'Description', 'Reference', 'Amount']]
 for (const row of rows) for (const citation of row.citations) accepted.push([row.key, row.lineName, citation.file, citation.line, citation.date, citation.description, citation.reference, citation.amount])
 const tasks: Cell[][] = [...metadata, ['Task ID', 'Task', 'Owner', 'Due', 'Evidence']]
 for (const task of statement.tasks) tasks.push([task.id, task.name, task.owner ?? '', task.due ?? '', task.evidence.summary])
 const confirmations: Cell[][] = [...metadata, headers]
 for (const row of statement.toConfirm) confirmations.push([row.key, row.lineName, row.actual, row.budget, row.variance, row.explanation?.text ?? '', row.explanation?.status ?? ''])
 return workbook([
  { name: 'Statement', rows: statementRows },
  { name: 'Accepted rows', rows: accepted },
  { name: 'Open tasks', rows: tasks },
  { name: 'Confirmation work', rows: confirmations },
 ])
}
