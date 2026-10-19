// Scenario sharing adds a boundary; it never replaces department/pay authority.
import { canSeeDashboard } from './dashboard-access'
import { find, get, requireThat, type Access, type Data, type State } from './types'

export function canSeeScenario(x: Access, sc: Data) {
 if (!x.role) return false
 if (sc.sandbox) return sc.createdBy === x.actor.email || ['read', 'edit'].includes(sc.sandbox.grants?.[x.actor.email])
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
 if (sc.sandbox) requireThat(sc.createdBy === x.actor.email || sc.sandbox.grants?.[x.actor.email] === 'edit', 'This scenario is shared read-only', 403)
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
 if (event.scenario && !visible(event.scenario)) return null
 if (event.action !== 'structure-version') return event
 const detail = event.detail
 const changes = (detail.changes ?? []).filter((change: Data) => {
  const ids = change.kind === 'scenario' ? [change.id] : [change.before?.scenario, change.after?.scenario].filter(Boolean)
  return ids.every(visible)
 })
 const scenarios = (detail.scenarios ?? []).filter((sc: Data) => visible(sc.id))
 if (!changes.length && !scenarios.length) return null
 return { ...event, detail: { ...detail, changes, scenarios } }
}
