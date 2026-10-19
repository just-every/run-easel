// Easel's HTTP surface. Every private route resolves the native session,
// loads one model revision, checks the person's role inside the command, and
// saves atomically behind the revision and session fence.
import { Hono, type Context as HonoContext } from 'hono'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { deploymentHealth } from '../base/deployment-health'
import { activityCsv, activityView as filteredActivity } from './audit'
import { access, requireFinance, requireMember } from './access'
import { actualCells, actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { cycle } from './cycle'
import { handleMcp } from './mcp'
import { packCsv, packHtml } from './pack-documents'
import { plan } from './plan'
import { review, variance } from './review'
import { setup } from './setup'
import { actor, load, readFence, save, snapshot } from './store'
import { tokenAdmin } from './token-admin'
import { tokenRate, tokenUse } from './token-auth'
import { Fault, get, requireThat, type Actor, type Data } from './types'
import { actualsView, compareView, scenarioView, snapshotView, stateView } from './views'
import { workbookCommand } from './workbook'

type Env = { Bindings: Bindings; Variables: { apiActor: Actor } }
export const api = new Hono<Env>()

api.get('/health', c => c.json({ status: 'ok', ...deploymentHealth(c.env) }))
api.use('/api/easel/*', async (c, next) => { await next(); c.header('cache-control', 'no-store'); c.header('x-content-type-options', 'nosniff') })
api.use('/api/easel/*', async (c, next) => {
 if (!c.req.raw.headers.has('authorization')) return next()
 const person = await actor(c.req.raw, c.env)
 c.set('apiActor', person)
 let status = 500
 try {
  const limit = await tokenRate(c.env.DB, person)
  if (!limit.allowed) { c.header('Retry-After', String(limit.retryAfter)); throw new Fault(429, 'API request limit reached; try again after Retry-After seconds') }
  requireThat(!/^\/api\/easel\/(tokens(?:\/|$)|invite$|mcp$)/.test(c.req.path), 'Use a signed-in session for credential administration, invitations and MCP', 403)
  requireThat(['GET', 'HEAD'].includes(c.req.method) || person.token?.scope === 'write', 'This API token has read scope only', 403)
  await next()
  status = c.res.status
 } catch (e) { status = e instanceof Fault ? e.status : 500; throw e }
 finally { await tokenUse(c.env.DB, person, c.req.raw, status) }
})
api.onError((e, c) => {
 if (e instanceof Fault) return c.json({ error: e.message }, e.status as 400)
 const message = String((e as Error).message ?? e)
 if (/IMPORT_|PlanTooLarge/.test(message)) return c.json({ error: message }, 409)
 console.error(e)
 return c.json({ error: 'Easel could not complete this request' }, 500)
})

async function open(c: HonoContext<Env>): Promise<Context & { revision: number; before: Map<string, any> }> {
 const a = c.get('apiActor') ?? await actor(c.req.raw, c.env)
 const { state, revision } = await load(c.env.DB)
 if (a.token) requireMember(access(state, a))
 let cached: ReturnType<typeof actualCells> | undefined
 return { s: state, before: new Map(state), revision, x: access(state, a), db: c.env.DB, activity: [], snapshots: [], now: new Date().toISOString(), actuals: () => (cached ??= actualCells(c.env.DB, state)) }
}

async function commit(ctx: Awaited<ReturnType<typeof open>>) {
 const changed = ctx.activity.length > 0 || ctx.snapshots.length > 0 || [...ctx.s].some(([k, r]) => ctx.before.get(k)?.revision !== r.revision) || [...ctx.before.keys()].some(k => !ctx.s.has(k))
 if (changed) await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, ctx.snapshots, ctx.x.role === 'finance')
 else await readFence(ctx.db, ctx.x.actor, ctx.revision)
}

async function body(c: HonoContext<Env>, limit = 1_600_000): Promise<Data> {
 requireThat(Number(c.req.header('content-length') ?? 0) <= limit, 'Request too large', 413)
 const value = await c.req.json().catch(() => null)
 requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Send a JSON object')
 return value
}

async function read<T>(c: HonoContext<Env>, view: (ctx: Context) => Promise<T>) {
 const ctx = await open(c)
 const result = await view(ctx)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return c.json(result as any)
}

api.get('/api/easel/tokens', async c => c.json(await tokenAdmin(await open(c), c.req.raw, c.env, 'list', {})))
api.post('/api/easel/tokens/:op', async c => {
 const op = c.req.param('op')
 requireThat(op === 'issue' || op === 'revoke', 'Unknown token action', 404)
 return c.json(await tokenAdmin(await open(c), c.req.raw, c.env, op, await body(c)))
})

api.all('/api/easel/mcp', c => handleMcp(c.req.raw, c.env))

api.get('/api/easel/state', c => read(c, stateView))
api.get('/api/easel/scenario/:id', c => read(c, ctx => scenarioView(ctx, c.req.param('id'))))
api.get('/api/easel/compare', c => read(c, ctx => compareView(ctx, c.req.query('a') ?? '', c.req.query('b') ?? '')))
api.get('/api/easel/snapshot/:id', c => read(c, ctx => snapshotView(ctx, c.req.param('id'))))
api.get('/api/easel/actuals', c => read(c, actualsView))
api.get('/api/easel/variance/:month', c => read(c, ctx => variance(ctx, c.req.param('month'))))
api.get('/api/easel/activity', c => read(c, ctx => filteredActivity(ctx, c.req.query())))
api.get('/api/easel/activity.csv', async c => {
 const ctx = await open(c)
 const csv = await activityCsv(ctx, c.req.query())
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="easel-activity.csv"' } })
})

api.get('/api/easel/pack/:id/:format{document\\.(html|csv)}', async c => {
 const ctx = await open(c)
 requireThat(ctx.x.role, 'Finance has not added you to this plan yet', 403)
 const pack = get(ctx.s, 'pack', c.req.param('id'), 'pack')
 requireThat(pack.status === 'published', 'This pack is not published yet', 409)
 const sn = await snapshot(ctx.db, pack.snapshot)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const csv = c.req.param('format') === 'document.csv'
 const name = `easel-review-${pack.month}.${csv ? 'csv' : 'html'}`
 return new Response(csv ? packCsv(sn) : packHtml(sn), { headers: { 'content-type': csv ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
})

const commands = [setup, plan, cycle, review]

api.post('/api/easel/command/:op', async c => {
 const ctx = await open(c)
 const b = await body(c)
 const op = c.req.param('op')
 let result: Data | undefined
 for (const command of commands) { result = await command(ctx, op, b); if (result !== undefined) break }
 requireThat(result !== undefined, 'Unknown action', 404)
 await commit(ctx)
 return c.json(result)
})

api.post('/api/easel/import/:kit/:op', async c => {
 const kit = c.req.param('kit')
 requireThat(kit === 'actuals' || kit === 'workbook', 'Unknown move-in kit', 404)
 const ctx = await open(c)
 const b = await body(c, kit === 'workbook' ? 8_000_000 : 3_000_000)
 const step: KitStep | undefined = await (kit === 'actuals' ? actualsCommand : workbookCommand)(ctx, c.req.param('op'), b)
 requireThat(step, 'Unknown import action', 404)
 await commit(ctx)
 if (!step.kit) return c.json(step.result)
 let outcome: unknown
 try { outcome = await step.kit() } catch (e) {
  if (step.failed) { const after = await open(c); requireFinance(after.x); await step.failed(after, e as Error); await commit(after) }
  throw e
 }
 const after = await open(c)
 requireFinance(after.x)
 const result = step.record!(after, outcome)
 await commit(after)
 return c.json(result)
})

api.post('/api/easel/invite', async c => {
 const ctx = await open(c)
 requireThat(ctx.x.role === 'finance', 'Only finance invites people', 403)
 const b = await body(c)
 const member = get(ctx.s, 'member', typeof b.email === 'string' ? b.email.toLowerCase() : '', 'person')
 requireThat(member.active, 'This person is inactive')
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return c.json(await operatorAuth(runtimeBindings(c.env)).invite(c.req.raw, { email: member.email, displayName: member.name, role: member.role === 'finance' ? 'admin' : 'member', returnTo: '/app' }))
})
