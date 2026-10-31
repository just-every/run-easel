import { erasedView } from './erasure'
import { visibleActivity } from './scenario-access'
import { requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { requireThat, type Data } from './types'
import { activityAttribution } from './activity-attribution'

export type AuditFilters = { actor?: string; record?: string; scenario?: string; from?: string; to?: string; before?: string; action?: string }

export async function activityView(c: Context, filters: AuditFilters = {}): Promise<Data[]> {
 requireFinance(c.x)
 requirePayDetail(c.x)
 const conditions: string[] = [], params: (string | number)[] = []
 for (const field of ['actor', 'record', 'scenario', 'action'] as const) if (filters[field]) {
  requireThat(filters[field]!.length <= 320, 'Filter is too long')
  if (field === 'scenario') {
   conditions.push("(a.scenario=? OR (a.action='structure-version' AND EXISTS(SELECT 1 FROM json_each(a.detail,'$.scenarios') j WHERE json_extract(j.value,'$.id')=?)))")
   params.push(filters[field]!, filters[field]!)
  } else { conditions.push(`a.${field}=?`); params.push(filters[field]!) }
 }
 for (const field of ['from', 'to'] as const) if (filters[field]) {
  const date = filters[field]!
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, 'Use a valid YYYY-MM-DD date')
  conditions.push(`substr(a.at,1,10)${field === 'from' ? '>=' : '<='}?`); params.push(date)
 }
 if (filters.before) {
  requireThat(/^\d+$/.test(filters.before) && Number.isSafeInteger(Number(filters.before)), 'Invalid activity cursor')
  conditions.push('a.seq<?'); params.push(Number(filters.before))
 }
 const { results } = await c.db.prepare(`SELECT a.seq,a.at,a.actor,o.display_name AS actorName,a.action,a.record,a.scenario,a.before_revision AS beforeRevision,a.after_revision AS afterRevision,a.detail
  FROM e_activity a LEFT JOIN oa_operators o ON o.email=a.actor ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY a.seq DESC LIMIT 300`).bind(...params).all<Data>()
 const visible = results.map(r => visibleActivity(c.s, c.x, { ...r, detail: JSON.parse(r.detail) })).filter((r): r is Data => r !== null)
 if (results.length === 300 && visible.length < 300) {
  const more = await activityView(c, { ...filters, before: String(results.at(-1)!.seq) })
  return erasedView(c.db, [...visible, ...more].slice(0, 300))
 }
 return erasedView(c.db, visible)
}

// Prevent spreadsheet formulas in all user-controlled fields, including names.
const csvCell = (value: unknown) => {
 const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
 return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
}
export async function activityCsv(c: Context, filters: AuditFilters = {}) {
 const lines = [['Sequence', 'Time', 'Actor', 'Action', 'Record', 'Scenario', 'Revision before', 'Revision after', 'Changed values and attribution', 'Attribution'].map(csvCell).join(',')]
 let before = filters.before
 do {
  const rows = await activityView(c, { ...filters, before })
  for (const r of rows) lines.push([r.seq, r.at, r.actor, r.action, r.record, r.scenario, r.beforeRevision, r.afterRevision, r.detail, activityAttribution(r)].map(csvCell).join(','))
  if (rows.length < 300) break
  before = String(rows.at(-1)!.seq)
 } while (true)
 return lines.join('\r\n') + '\r\n'
}
