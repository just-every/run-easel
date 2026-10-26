import { activityKind } from './activity-format'
import { decimalText, money, monthLabel, Table, useDate, type D } from './shared'

const hidden = /^(id|originId|destination|revision|sha256|fingerprint|generated|snapshot|budgetSnapshot|priorForecast|closedRevisions|attempt|journal|authority)$/i
const label = (field: string) => field.replace(/(?:Cents|Bps)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('-', ' ').replace(/^./, c => c.toUpperCase())
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Show changed business fields; the exported trail retains the complete native records. */
export function ActivityValues({ state, detail }: { state: D; detail: D }) {
 const displayDate = useDate()
 const before = detail.before ?? {}, after = detail.after ?? {}
 const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(field => !hidden.test(field) && !same(before[field], after[field]))
 const reference = (id: string): string | undefined => {
  if (id === 'main') return state.workspace.name
  for (const collection of ['scenarios', 'departments', 'lines', 'packs', 'members', 'batches', 'workbooks', 'dimensions', 'dimensionMembers']) {
   const row = state[collection]?.find((r: D) => r.id === id)
   if (row) return row.name ?? row.title ?? row.file ?? row.email
  }
  return state.actorNames?.[id]
 }
 const value = (field: string, item: unknown): string => {
  if (item == null || item === '') return 'Not set'
  if (typeof item === 'boolean') return item ? 'Yes' : 'No'
  if (typeof item === 'number') {
   if (field.endsWith('Cents') || detail.kind === 'actual' && field === 'amount') return money(item, state.workspace.currency)
   if (field.endsWith('Bps')) return `${decimalText(item)}%`
   return String(item)
  }
  if (Array.isArray(item)) return item.map(x => value(field, x)).join('; ') || 'None'
  if (typeof item === 'object') return Object.entries(item).filter(([key]) => !hidden.test(key)).map(([key, x]) => `${reference(key) ?? value('field', label(key))}: ${value(key, x)}`).join('; ') || 'Recorded evidence'
  const text = String(item)
  if (/^\d{4}-\d{2}$/.test(text)) return monthLabel(text)
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return displayDate(text)
  const name = reference(text)
  if (name) return name
  if (/^(scenario|department|sourceDepartment|line|batch|workbook|commissionPosition|from|proposal|template|target)$/.test(field)) {
   if (text === 'excluded' || text === 'default') return label(text)
   return `Removed ${field === 'line' ? 'planning line' : label(field).toLowerCase()}`
  }
  return text.replace(/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|\bwb-[a-f\d]+(?::[\w-]+)?\b/gi, id => reference(id) ?? 'Referenced record').replace(/\b[a-f\d]{64}\b/gi, 'Recorded evidence')
 }
 return <details>
  <summary>Changed values ({activityKind(detail.kind)})</summary>
  {fields.length ? <Table caption="Changed record fields" heads={['Field', 'Before', 'After']}>
   {fields.map(field => <tr key={field}><td>{label(field)}</td><td className="wrap">{value(field, before[field])}</td><td className="wrap">{value(field, after[field])}</td></tr>)}
  </Table> : <p>{detail.before == null ? 'Created this record.' : detail.after == null ? 'Removed this record.' : 'Updated the stored evidence for this record.'}</p>}
 </details>
}
