import { find, type Access, type Data, type State } from './types'

/** A saved layout never confers access to its dashboard or its source. */
export function canSeeDashboard(s: State, x: Access, dashboard: Data) {
 const source = find(s, 'scenario', dashboard.scenario)
 if (!x.role || !source || source.sandbox || source.kind === 'proposal') return false
 if (dashboard.createdBy === x.actor.email) return true
 if (dashboard.audience === 'leadership') return x.role === 'finance'
 if (dashboard.audience === 'board') return x.role === 'viewer'
 return dashboard.audience === 'department' && x.role === 'contributor' && x.departments.includes(dashboard.department)
}
