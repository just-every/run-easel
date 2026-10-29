import { visiblePipelineMetadata } from './pipeline-visibility'
import { dimensionAllowed } from './access'
// Scenario sharing adds a boundary; it never replaces department/pay authority.
import { canSeeDashboard } from './dashboard-access'
import { find, get, requireThat, type Access, type Data, type State } from './types'

export function canSeeScenario(x: Access, sc: Data) {
 if (!x.role || x.scenarioDimensions?.[sc.id] && !dimensionAllowed(new Map(), x, x.scenarioDimensions[sc.id])) return false
 if (sc.sandbox) return x.actor.token ? ['read', 'edit'].includes(x.scenarioGrants?.[sc.id] ?? '') : sc.createdBy === x.actor.email || ['read', 'edit'].includes(sc.sandbox.grants?.[x.actor.email]) || ['read', 'edit'].includes(x.scenarioGrants?.[sc.id] ?? '')
 if (sc.kind === 'proposal') return x.role === 'finance' || (x.role === 'contributor' && sc.createdBy === x.actor.email)
 return true
}
export function scenarioAccess(s: State, x: Access, id: unknown) {
 const sc = get(s, 'scenario', id)
 requireThat(canSeeScenario(x, sc), 'Scenario not found', 404)
 return sc
}
export function requireScenarioEdit(x: Access, sc: Data) {
 requireThat(canSeeScenario(x, sc), 'Scenario not found', 404)
 if (sc.sandbox) requireThat(x.actor.token ? x.scenarioGrants?.[sc.id] === 'edit' : sc.createdBy === x.actor.email || sc.sandbox.grants?.[x.actor.email] === 'edit' || x.scenarioGrants?.[sc.id] === 'edit', 'This scenario is shared read-only', 403)
}

/** Activity remains append-only; its projection follows today's scenario grant. */
export function visibleActivity(s: State, x: Access, event: Data): Data | null {
 const visible = (id: string) => { const sc = find(s, 'scenario', id); return !sc || canSeeScenario(x, sc) }
 if (event.action === 'record-changed' && event.detail.kind === 'dashboard') {
  const dashboard = find(s, 'dashboard', event.record) ?? event.detail.after ?? event.detail.before
  if (!dashboard || !canSeeDashboard(s, x, dashboard)) return null
 }
 if (event.action === 'record-changed' && event.detail.kind === 'dashboard-layout') {
  const layout = event.detail.after ?? event.detail.before
  const dashboard = layout && find(s, 'dashboard', layout.dashboard)
  if (!layout || layout.owner !== x.actor.email || !dashboard || !canSeeDashboard(s, x, dashboard)) return null
 }
 if (event.action.startsWith('dashboard-')) {
  const dashboard = find(s, 'dashboard', event.record) ?? { ...event.detail, scenario: event.scenario }
  if (!canSeeDashboard(s, x, dashboard)) return null
 }
 if (event.action === 'record-changed' && ['report-schedule', 'report-delivery'].includes(event.detail.kind)) {
  const row = event.detail.after ?? event.detail.before
  const dashboard = row && find(s, 'dashboard', row.dashboard)
  if (!dashboard || !canSeeDashboard(s, x, dashboard)) return null
  const safe = (value: Data | null) => value ? { ...value, message: null } : value
  return { ...event, detail: { ...event.detail, before: safe(event.detail.before), after: safe(event.detail.after) } }
 }
 if (event.scenario && !visible(event.scenario)) return null
 if (event.action !== 'structure-version') return String(event.detail?.kind??'').startsWith('pipeline-')?{...event,detail:visiblePipelineMetadata(s,x,event.detail)}:event
 const detail = event.detail
 const changes = (detail.changes ?? []).filter((change: Data) => {
  const ids = change.kind === 'scenario' ? [change.id] : [change.before?.scenario, change.after?.scenario].filter(Boolean)
  return ids.every(visible)
 })
 const scenarios = (detail.scenarios ?? []).filter((sc: Data) => visible(sc.id))
 if (!changes.length && !scenarios.length) return null
 return { ...event, detail: { ...detail, changes, scenarios } }
}
