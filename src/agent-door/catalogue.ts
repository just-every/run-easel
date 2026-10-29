import { nativeTools } from '../easel/agent-actions'

const bindings: Record<string, [string, string[]]> = {
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
 { clauses: ['SHEET-001','SHEET-002','SHEET-005','CONNECT-001','CONNECT-002','CONNECT-003','CONNECT-004','CONNECT-009','CONNECT-010','CONNECT-011'], reason: 'connector' as const },
 { clauses: ['MOBILE-001'], reason: 'screen' as const }, { clauses: ['MOBILE-002'], reason: 'device' as const },
 { clauses: ['EASEL-017','HOST-001','EASEL-001'], reason: 'installation' as const },
]
