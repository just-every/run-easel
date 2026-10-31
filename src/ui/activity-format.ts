import { balanceTarget } from '../easel/balance-targets'
import { fiscalMonths, monthLabel, type D } from './shared'
export { activityAttribution } from '../easel/activity-attribution'

const events: Record<string, string> = {
 'token-issued': 'Issued an API token', 'token-revoked': 'Revoked an API token', 'api-token-used': 'Used an API token',
 workspace: 'Updated plan settings', department: 'Saved a department', 'department-delete': 'Deleted a department', line: 'Saved a planning line', 'line-delete': 'Deleted a planning line', member: 'Updated a person’s access', 'account-map': 'Mapped an account', 'department-map': 'Mapped a department', 'scenario-created': 'Created a budget', 'cash-changed': 'Changed opening cash and timing', branch: 'Branched a scenario', 'proposal-create': 'Created a proposal', 'proposal-submit': 'Submitted a proposal', 'proposal-promoted': 'Promoted a proposal', 'proposal-decline': 'Declined a proposal', 'scenario-adopt': 'Adopted scenario assumptions', 'scenario-delete': 'Deleted a scenario', 'request-submissions': 'Requested department submissions', submit: 'Submitted a department budget', 'return-submission': 'Returned a department budget', 'approve-budget': 'Approved the budget', 'forecast-opened': 'Opened the forecast', comment: 'Added a comment', 'close-month': 'Closed the month', explanation: 'Saved an explanation', 'explanation-confirm': 'Confirmed an explanation', 'pack-create': 'Started a review pack', 'pack-decision': 'Recorded a decision', 'pack-publish': 'Published a review pack', 'action-status': 'Updated an action',
}
for (const kind of ['revenue', 'position', 'expense', 'schedule', 'allocation']) for (const [suffix, verb] of [['added', 'Added'], ['changed', 'Changed'], ['removed', 'Removed']]) events[`${kind}-${suffix}`] = `${verb} ${kind === 'revenue' ? 'a revenue driver' : kind === 'allocation' ? 'a shared-cost allocation' : kind === 'schedule' ? 'a monthly schedule' : `a ${kind}`}`
for (const [prefix, noun] of [['actuals', 'actuals'], ['workbook', 'a workbook']]) {
 events[`${prefix}-import-started`] = `Started importing ${noun}`
 events[`${prefix}-import-failed`] = `Could not import ${noun}`
 events[`${prefix}-undo-started`] = `Started undoing ${noun}`
 events[`${prefix}-undone`] = `Undid ${noun}`
 events[`${prefix}-undo-partial`] = `Partly undid ${noun}`
}
events['actuals-accepted'] = 'Accepted actuals'; events['workbook-imported'] = 'Imported a workbook'
const isId = (value: string) => /[a-f\d]{8}-[a-f\d-]{27,}|[a-f\d]{64}|\bwb-[a-f\d]+(?::[\w-]+)?\b/i.test(value)
const safeText = (value: unknown) => typeof value === 'string' && !isId(value) ? value : ''
const named = (state: D, collection: string, id: unknown, missing: string) => state[collection]?.find((r: D) => r.id === id)?.name ?? missing
function snapshotName(state: D, id: unknown) {
 const sn = state.snapshots?.find((s: D) => s.id === id)
 if (!sn) return 'Kept snapshot'
 return safeText(sn.label) || `${sn.kind === 'approval' ? 'Approved budget' : sn.kind === 'forecast' ? 'Kept forecast' : 'Published pack'}: ${named(state, 'scenarios', sn.scenario, 'Removed scenario')}`
}
export const eventLabel = (action: string) => events[action] ?? 'Other activity'
const kinds: Record<string, string> = { workspace: 'Plan settings', scenario: 'Scenario', actual: 'Actuals row', batch: 'Actuals import', 'workbook-import': 'Workbook import', 'formula-source': 'Workbook source model', 'account-map': 'Account mapping', 'department-map': 'Department mapping', 'pay-grant': 'Pay-detail permission' }
export const activityKind = (kind: string) => kinds[kind] ?? kind.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase())

export function activityRevision(row: D): string {
 const d = row.detail ?? {}
 const numeric = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : null
 const before = numeric(row.beforeRevision) ?? numeric(d.before?.revision)
 const after = numeric(row.afterRevision) ?? numeric(d.after?.revision)
 if (before !== null || after !== null) return `${before ?? '—'} → ${after ?? '—'}`
 return `Change ${row.seq}`
}

export function activityRecord(state: D, row: D) {
 const d = row.detail ?? {}
 const action = row.action as string
 if (['token-issued', 'token-revoked', 'api-token-used'].includes(action)) return safeText(d.label ?? d.token?.label) || 'API credential'
 if (action === 'structure-version') return d.scenarios?.length === 1 ? d.scenarios[0].name : 'Company model'
 if (action === 'record-changed') {
  const value = d.after ?? d.before ?? {}
  if (d.kind === 'workspace') return value.name || state.workspace.name
  if (d.kind === 'formula-source') return `Workbook source model · ${named(state, 'scenarios', value.scenario ?? row.scenario, 'Imported scenario')}`
  if (d.kind === 'actual') return [safeText(value.description) || safeText(value.accountName) || 'Actuals row', value.date ? monthLabel(value.date.slice(0, 7)) : ''].filter(Boolean).join(' · ')
  if (d.kind === 'account-map') return `Account ${safeText(value.account ?? row.record) || 'mapping'}`
  if (d.kind === 'department-map') return safeText(value.source ?? row.record) || 'Department mapping'
  if (d.kind === 'member' || d.kind === 'pay-grant') return state.actorNames?.[row.record] || safeText(row.record) || 'Person access'
  return safeText(value.name ?? value.title ?? value.file) || `${activityKind(d.kind)}${row.scenario ? ` · ${named(state, 'scenarios', row.scenario, 'Removed scenario')}` : ''}`
 }
 if (action === 'workspace') return state.workspace.name
 if (action === 'department' || action === 'department-delete') return safeText(d.name) || named(state, 'departments', row.record, 'Removed department')
 if (action === 'line' || action === 'line-delete') return safeText(d.name) || named(state, 'lines', row.record, 'Removed planning line')
 if (action === 'member') return state.members?.find((m: D) => m.email === row.record)?.name || state.actorNames?.[row.record] || safeText(row.record) || 'Unknown person'
 if (action === 'account-map') { const map = state.accountMaps?.find((m: D) => m.id === row.record); return safeText(map?.name) || safeText(row.record) || 'Source account' }
 if (action === 'department-map') return safeText(row.record) || 'Source department'
 if (action.startsWith('actuals-')) return safeText(d.file) || safeText(state.batches?.find((b: D) => b.id === row.record)?.file) || 'Actuals import'
 if (action.startsWith('workbook-')) return safeText(d.file) || safeText(state.workbooks?.find((w: D) => w.id === row.record)?.file) || 'Workbook import'
 if (action.startsWith('pack-') || action === 'action-status') return safeText(state.packs?.find((p: D) => p.id === row.record)?.title) || (d.month ? `${monthLabel(d.month)} review pack` : 'Review pack')
 if (action === 'explanation' || action === 'explanation-confirm') return `${named(state, 'lines', d.line, 'Removed planning line')} · ${named(state, 'departments', d.department, 'No department')}`
 if (['comment', 'submit', 'return-submission'].includes(action)) return named(state, 'departments', d.department, 'Removed department')
 if (/^(revenue|position|expense|schedule|allocation)-(added|changed|removed)$/.test(action)) return safeText(d.name) || `${action.startsWith('schedule-') ? 'Monthly schedule' : action.startsWith('allocation-') ? 'Shared-cost allocation' : 'Planning input'} · ${named(state, 'scenarios', row.scenario, 'Removed scenario')}`
 if (action === 'scenario-delete') return safeText(d.name) || 'Removed scenario'
 if (row.scenario) return named(state, 'scenarios', row.record, 'Removed scenario')
 return '—'
}
/** Typed event fields only: fingerprints and internal identities are never display text. */
export function activityDetail(state: D, row: D, displayDate: (value?: string | null) => string) {
 const d = row.detail ?? {}, parts: string[] = []
 if (row.action === 'api-token-used') return `${d.method} ${d.path} · HTTP ${d.status} · ${d.token?.scope} scope`
 if (row.action === 'token-issued' || row.action === 'token-revoked') return `${d.kind} · ${d.scope} scope · expires ${displayDate(new Date(d.expiresAt).toISOString())}`
 const text = (key: string, label: string) => { const value = safeText(d[key]); if (value) parts.push(`${label}: ${value}`) }
 for (const [key, label] of [['name', 'Name'], ['file', 'File'], ['reason', 'Reason'], ['request', 'Request'], ['currency', 'Currency'], ['status', 'Status'], ['state', 'Import status']]) text(key, label)
 if (d.due) parts.push(`Due: ${displayDate(d.due)}`)
 if (d.kind) parts.push(`Kind: ${d.kind === 'operating-expense' ? 'Operating expenses' : d.kind === 'cost-of-sales' ? 'Cost of sales' : safeText(d.kind)}`)
 if (d.type) parts.push(`Line type: ${d.type === 'operating-expense' ? 'Operating expenses' : d.type === 'cost-of-sales' ? 'Cost of sales' : safeText(d.type)}`)
 if (d.role) parts.push(`Role: ${safeText(d.role)}`)
 for (const [key, label, collection, missing] of [['department', 'Department', 'departments', 'Removed department'], ['line', 'Planning line', 'lines', 'Removed line'], ['from', 'From', 'scenarios', 'Removed scenario'], ['proposal', 'Proposal', 'scenarios', 'Removed proposal']]) if (d[key]) parts.push(`${label}: ${named(state, collection, d[key], missing)}`)
 if (d.departments) parts.push(`Departments: ${d.departments.map((id: string) => named(state, 'departments', id, 'Removed department')).join(', ')}`)
 if (d.target) parts.push(`Maps to: ${d.target === 'excluded' ? 'Excluded' : balanceTarget(d.target) ? balanceTarget(d.target)!.label : named(state, 'lines', d.target, 'Removed line')}`)
 if (d.basis) parts.push(`Opening cash: ${d.basis === 'imported' ? 'Imported from actuals' : 'Estimate'}`)
 if (d.fiscalYearStart) parts.push(`Fiscal year starts ${fiscalMonths[Number(d.fiscalYearStart) - 1]?.label}`)
 for (const [key, label] of [['month', 'Month'], ['planStart', 'First plan month']]) if (d[key]) parts.push(`${label}: ${monthLabel(d[key])}`)
 for (const [key, label] of [['fromRevision', 'From revision'], ['proposalRevision', 'Proposal revision'], ['rows', 'Rows'], ['accepted', 'Accepted rows'], ['rejected', 'Rejected rows']]) if (d[key] != null) parts.push(`${label}: ${d[key]}`)
 for (const [key, label] of [['snapshot', 'Snapshot'], ['priorForecast', 'Prior forecast']]) if (d[key]) parts.push(`${label}: ${snapshotName(state, d[key])}`)
 if (d.decision) { const decision = state.packs?.flatMap((p: D) => p.decisions ?? []).find((x: D) => x.id === d.decision); const value = decision?.text ?? safeText(d.decision); if (value) parts.push(`Decision: ${value}`) }
 if (d.error) parts.push('Import failed; no completed import was recorded')
 return parts.join('; ') || '—'
}
