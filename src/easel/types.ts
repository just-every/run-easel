export type Data = Record<string, any>

/** One row of the editable model, as stored in e_records. */
export type Row = { destination: string; kind: string; id: string; revision: string; value: Data }
export type State = Map<string, Row>

export type Role = 'finance' | 'contributor' | 'viewer'
export type Actor = {
 id: string
 email: string
 name: string
 token?: { id: string; label: string; kind: 'personal' | 'service'; scope: 'read' | 'write'; role: Role; departments: string[]; write: boolean }
 agent?: { name: string; via: string }
 session: string
 version: number
 /** Base operator role: owner and admin plan as finance. */
 baseRole: 'owner' | 'admin' | 'member'
}
/** What the actor may do in this installation, resolved from Base role and Easel membership. */
export type Access = { actor: Actor; role: Role | null; departments: string[] }

export class Fault extends Error {
 constructor(public status: number, message: string) { super(message) }
}

export function requireThat(value: unknown, message: string, status = 400): asserts value {
 if (!value) throw new Fault(status, message)
}

export const key = (kind: string, id: string) => `${kind}:${id}`
export const uid = () => crypto.randomUUID()

export function all(s: State, kind: string): Data[] {
 return [...s.values()].filter(r => r.kind === kind).map(r => ({ ...r.value, id: r.id }))
}

export function find(s: State, kind: string, id: string): Data | undefined {
 const r = s.get(key(kind, id))
 return r ? { ...r.value, id: r.id } : undefined
}

export function get(s: State, kind: string, id: unknown, label = kind): Data {
 requireThat(typeof id === 'string' && id.length > 0, `Choose a ${label}`)
 const r = find(s, kind, id)
 requireThat(r, `${label[0].toUpperCase()}${label.slice(1)} not found`, 404)
 return r
}

/** Writes a record, keeping the destination of an existing row (a move-in kit's rows stay in its journal). */
export function put(s: State, kind: string, id: string, value: Data) {
 const { id: _ignored, ...rest } = value
 s.set(key(kind, id), { destination: s.get(key(kind, id))?.destination ?? 'main', kind, id, revision: uid(), value: rest })
}

export function remove(s: State, kind: string, id: string) {
 s.delete(key(kind, id))
}

export function text(v: unknown, label: string, max = 200): string {
 requireThat(typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max, `${label} is required (at most ${max} characters)`)
 return v.trim()
}

export function optionalText(v: unknown, label: string, max = 2000): string {
 if (v === undefined || v === null || v === '') return ''
 requireThat(typeof v === 'string' && v.length <= max, `${label} must be at most ${max} characters`)
 return v.trim()
}

export function choice<T extends string>(v: unknown, options: readonly T[], label: string): T {
 requireThat(typeof v === 'string' && (options as readonly string[]).includes(v), `Choose ${label}: ${options.join(', ')}`)
 return v as T
}

export function integer(v: unknown, label: string, min: number, max: number): number {
 const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v
 requireThat(Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max, `${label} must be a whole number from ${min} to ${max}`)
 return n as number
}
