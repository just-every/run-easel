// The test worker with every D1 statement's rows_read recorded, read back at GET /__reads (?reset=1 clears it).
import base from './easel-worker'
const log: { sql: string; read: number }[] = []
const real = new WeakMap<object, { sql: string; stmt: any }>()
function wrap(sql: string, stmt: any): any {
 const metered = new Proxy(stmt, { get(t, k) {
  if (k === 'bind') return (...a: unknown[]) => wrap(sql, t.bind(...a))
  if (k === 'all' || k === 'run') return async (...a: unknown[]) => { const r = await t[k](...a); log.push({ sql, read: r.meta.rows_read }); return r }
  if (k === 'first') return async (col?: string) => { const r = await t.all(); log.push({ sql, read: r.meta.rows_read }); const row = r.results[0] ?? null; return col && row ? row[col] : row }
  const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v
 } })
 real.set(metered, { sql, stmt })
 return metered
}
function counting(db: any): any {
 return new Proxy(db, { get(t, k) {
  if (k === 'prepare') return (sql: string) => wrap(sql, t.prepare(sql))
  if (k === 'batch') return async (stmts: any[]) => { const rs = await t.batch(stmts.map(s => real.get(s)?.stmt ?? s)); rs.forEach((r: any, i: number) => log.push({ sql: real.get(stmts[i])?.sql ?? '?', read: r.meta?.rows_read ?? 0 })); return rs }
  const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v
 } })
}
export default {
 async fetch(request: Request, env: any, ctx: any) {
  const u = new URL(request.url)
  if (u.pathname === '/__reads') { const out = JSON.stringify(log); if (u.searchParams.get('reset')) log.length = 0; return new Response(out) }
  return (base as any).fetch(request, { ...env, DB: counting(env.DB) }, ctx)
 },
 async scheduled(c: any, env: any, ctx: any) { return (base as any).scheduled(c, { ...env, DB: counting(env.DB) }, ctx) },
}
