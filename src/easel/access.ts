// Who may see and change what. Base owners and admins plan as finance;
// everyone else needs an active Easel membership naming their role and,
// for contributors, the departments they plan for.
import { find, requireThat, type Access, type Actor, type Data, type State } from './types'

function currentAccess(s: State, a: Actor): Access {
 if (a.baseRole === 'owner' || a.baseRole === 'admin') return { actor: a, role: 'finance', departments: [] }
 const m = find(s, 'member', a.email)
 if (!m || !m.active || m.role === 'finance') return { actor: a, role: null, departments: [] }
 return { actor: a, role: m.role, departments: m.role === 'contributor' ? m.departments ?? [] : [] }
}

export function access(s: State, a: Actor): Access {
 const current = currentAccess(s, a)
 if (!a.token) return current
 if (current.role !== a.token.role) return { ...current, role: null, departments: [] }
 return { ...current, departments: current.departments.filter(id => a.token!.departments.includes(id)) }
}

export function requireMember(x: Access) {
 requireThat(x.role, 'Finance has not added you to this plan yet', 403)
}

export function requireFinance(x: Access) {
 requireThat(x.role === 'finance', 'Only finance can do this', 403)
}

/** Finance or a contributor for this department. */
export function requireDepartment(x: Access, department: string) {
 requireThat(x.role === 'finance' || (x.role === 'contributor' && x.departments.includes(department)), 'You can only change your own departments', 403)
}

export const seesDepartmentDetail = (x: Access, department: string) =>
 x.role === 'finance' || (x.role === 'contributor' && x.departments.includes(department))

/** Individual positions and salaries are private to finance and the department's own contributors. */
export function visibleInput(x: Access, kind: string, input: Data) {
 if (x.role === 'finance') return true
 if (x.role !== 'contributor') return false
 return x.departments.includes(input.department)
}
