import { nativeTools } from '../easel/agent-actions'

export const specialist = 'finance planner'
export const agentLimits = { requestsPerMinute: 600, maxBodyBytes: 1048576 }
export const agentErrors = [
 ['HeaderMismatch', 'Transport headers must match the method, name and protocol version.'],
 ['UnsupportedProtocolVersion', 'Use a supported version returned by discovery.'],
 ['unauthenticated', 'Sign in again; expired, revoked or suspended authority cannot be reused.'],
 ['insufficient_scope', 'The Bearer challenge names the required scope; native grants still apply.'],
 ['rate_limited', 'Wait for Retry-After before retrying.'],
 ['policy_unset', 'A person must complete policy setup at setup_url.'],
 ['policy_unavailable', 'The current company policy is unavailable; no work runs.'],
 ['policy_blocked', 'The named class, rule and revision refuse this action.'],
 ['agents_paused', 'A person must resume agents through the native controls.'],
 ['self_escalation', 'Agents cannot expand their own authority or change policy or Pause.'],
 ['approval_required', 'Legacy clients must hand the saved action to its named person.'],
 ['approval_rejected', 'The named person rejected the saved action.'],
 ['approval_expired', 'The saved approval expired without an effect.'],
 ['approval_evidence_changed', 'The saved evidence changed; inspect and prepare a new action.'],
 ['idempotency_key_required', 'Every mutation needs an idempotency_key.'],
 ['idempotency_conflict', 'This key already belongs to different arguments.'],
 ['revision_conflict', 'Read current_revision and review the changed plan before a new action.'],
 ['invalid_arguments', 'Correct the input using the tool schema.'],
 ['output_invalid', 'The result failed its declared schema; inspect the outcome before retrying.'],
 ['forbidden', 'The sponsoring person lacks the current native planning permission.'],
 ['resource_unavailable', 'The record is missing or outside the sponsoring person’s current scope.'],
 ['call_in_progress', 'The key is already claimed; inspect the original outcome, never blindly resend.'],
 ['decision_busy', 'An overlapping admission was refused without an effect.'],
 ['capability_not_declared', 'This installation does not offer the requested optional family.'],
] as const

const bindings: Record<string, [string, string[]]> = {
 'forecast-window': ['calendar.update', ['MODEL-002']],
 calculation_status: ['calculations.status', ['MODEL-007']],
 scenarios: ['scenarios.list', ['EASEL-011']], scenario: ['scenarios.read', ['EASEL-005','EASEL-011']],
 compare: ['scenarios.compare', ['EASEL-011']], variance: ['variance.read', ['EASEL-013','AGENT-007']], metrics: ['metrics.read', ['FIN-005']],
 'proposal-create': ['proposals.create', ['EASEL-012']], 'proposal-submit': ['proposals.submit', ['EASEL-012']],
 revenue: ['revenue.update', ['EASEL-006','REV-003','REV-004']], position: ['positions.update', ['EASEL-007','PEOPLE-004']],
 expense: ['expenses.update', ['EASEL-008']], schedule: ['schedules.update', ['EASEL-008','MODEL-009']], formula: ['formulas.update', ['MODEL-004','MODEL-005']],
 'asset-category': ['asset_categories.update', ['FIN-004']], asset: ['assets.update', ['FIN-004']], allocation: ['allocations.update', ['EASEL-008']],
 debt: ['debt.update', ['FIN-003']], 'tax-policy': ['taxes.update', ['FIN-006']], equity: ['equity.update', ['FIN-003']],
 'input-delete': ['inputs.delete', ['EASEL-008']], comment: ['comments.create', ['EASEL-009']], explanation: ['explanations.draft', ['AGENT-007']],
}
export const catalogue = nativeTools.map(tool => {
 const binding = bindings[tool.name]
 if (!binding) throw new Error(`Native agent action lacks a door mapping: ${tool.name}`)
 const readOnly = tool.annotations.readOnlyHint
 return { ...tool, nativeName: tool.name, name: `easel.${binding[0]}`, readOnly, scope: `planning:${readOnly ? 'read' : 'write'}`,
  clauses: [...binding[1], 'API-003'], classes: ['standard', ...(['scenario','compare','variance','proposal-create','position','input-delete','revenue'].includes(tool.name) ? ['sensitive'] : [])] as ('standard'|'sensitive')[] }
})
export const notTools = [
 { clauses: ['EASEL-015','PEOPLE-007','SHEET-003','MOVE-001','MOVE-002','MOVE-003','MOVE-004','EASEL-002','EASEL-003','EASEL-004'], reason: 'import-door' as const },
 { clauses: ['SHEET-001','SHEET-002','SHEET-005','CONNECT-001','CONNECT-002','CONNECT-003','CONNECT-004','CONNECT-009','CONNECT-010','CONNECT-011','PEOPLE-001','PEOPLE-002','PEOPLE-003','REV-001','REV-002','SPEND-001'], reason: 'connector' as const },
 { clauses: ['MOBILE-001'], reason: 'screen' as const }, { clauses: ['MOBILE-002'], reason: 'device' as const },
 { clauses: ['EASEL-017','HOST-001','EASEL-001'], reason: 'installation' as const },
]
