import { currentTime } from './time'
import { gaugeCheck } from './gauge-check'
import { gaugeStatus, gaugeConnection } from './gauge-connection'
import { gaugeUtilization } from './gauge-utilization'
import { starterModels } from './starter-models'
import { grid } from './grid'
import { historyBudget } from './history-budget'
import { dashboards, dashboardList, dashboardView } from './dashboards'
import { dashboardWorkbook } from './dashboard-workbook'
import { sandboxes } from './sandboxes'
import { versionStructure } from './structure-versions'
// Easel's HTTP surface. Every private route resolves the native session,
// loads one model revision, checks the person's role inside the command, and
// saves atomically behind the revision and session fence.
import { Hono, type Context as HonoContext } from 'hono'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import { deploymentHealth } from '../base/deployment-health'
import { activityCsv, activityView as filteredActivity } from './audit'
import { access, requireFinance, requireMember } from './access'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { cycle } from './cycle'
import { departmentStatements, departmentStatementList, departmentStatementView, queueDepartmentStatements } from './department-statements'
import { dispatchDepartmentStatement } from './department-statement-mail'
import { departmentStatementWorkbook } from './department-statement-documents'
import { metricRules, metricTaskList } from './metric-rules'
import { evaluateMetricTasks, needsMetricRefresh } from './metric-tasks'
import { longRange, longRangeList, longRangeView } from './long-range'
import { longRangeWorkbook } from './long-range-workbook'
import { handleMcp } from './mcp'
import { packCsv, packHtml } from './pack-documents'
import { plan } from './plan'
import { parallelMonth, parallelList, parallelView, parallelTemplate } from './parallel-month'
import { scenarioWorkbook, scenarioCsv, comparisonWorkbook, varianceWorkbook } from './report-workbooks'
import { packWorkbook } from './pack-workbook'
import { actualsWorkbook, activityWorkbook } from './operational-workbooks'
import { review, variance } from './review'
import { reforecasts } from './reforecasts'
import { setup } from './setup'
import { actor, load, readFence, save, snapshot } from './store'
import { openExport } from './open-export'
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
 return { s: state, before: new Map(state), revision, x: access(state, a), db: c.env.DB, activity: [], snapshots: [], now: await currentTime(c.env) }
}

async function commit(ctx: Awaited<ReturnType<typeof open>>, structureBefore = ctx.before, structureRevision = ctx.revision) {
 const changed = ctx.activity.length > 0 || ctx.snapshots.length > 0 || [...ctx.s].some(([k, r]) => ctx.before.get(k)?.revision !== r.revision) || [...ctx.before.keys()].some(k => !ctx.s.has(k))
 if (changed) await versionStructure(ctx, structureBefore, structureRevision)
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

api.get('/api/easel/export', async c => {
 const ctx = await open(c), bytes = await openExport(ctx)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return new Response(bytes as BodyInit, { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="easel-open-export.zip"' } })
})

api.get('/api/easel/tokens', async c => c.json(await tokenAdmin(await open(c), c.req.raw, c.env, 'list', {})))
api.post('/api/easel/tokens/:op', async c => {
 const op = c.req.param('op')
 requireThat(op === 'issue' || op === 'revoke', 'Unknown token action', 404)
 return c.json(await tokenAdmin(await open(c), c.req.raw, c.env, op, await body(c)))
})

api.get('/api/easel/connections/gauge', c => read(c, ctx => gaugeStatus(ctx, c.env)))
api.post('/api/easel/connections/gauge/:op', async c => {
 const ctx = await open(c), op = c.req.param('op'), input = await body(c)
 if (op === 'check') {
  await gaugeCheck(ctx, c.env, input)
  await commit(ctx)
 } else {
  await readFence(ctx.db, ctx.x.actor, ctx.revision)
  const extra = await gaugeConnection(ctx, c.env, op, input)
  await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 }
 return c.json(await gaugeStatus(ctx, c.env))
})
api.post('/api/easel/gauge/:op', async c => {
 const ctx = await open(c), result = await gaugeUtilization(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(result)
})

api.all('/api/easel/mcp', c => handleMcp(c.req.raw, c.env))

api.get('/api/easel/long-range', c => read(c, longRangeList))
api.get('/api/easel/long-range/:id', c => read(c, ctx => longRangeView(ctx, c.req.param('id'))))
api.get('/api/easel/long-range/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await longRangeView(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(longRangeWorkbook(view), 'easel-long-range')
})

api.get('/api/easel/parallel-month', c => read(c, ctx => parallelList(ctx, c.req.query('month'))))
api.get('/api/easel/parallel-month/template/:file', async c => {
 const ctx = await open(c), csv = await parallelTemplate(ctx, c.req.param('file').replace(/\.csv$/, ''))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="parallel-month.csv"' } })
})
api.get('/api/easel/parallel-month/:id', c => read(c, ctx => parallelView(ctx, c.req.param('id'))))

api.get('/api/easel/metric-tasks', c => read(c, metricTaskList))

api.get('/api/easel/department-statements', c => read(c, ctx => departmentStatementList(ctx, c.req.query('month'))))
api.get('/api/easel/department-statements/:id', c => read(c, ctx => departmentStatementView(ctx, c.req.param('id'))))
api.get('/api/easel/department-statements/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await departmentStatementView(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(departmentStatementWorkbook(view), 'easel-department-statement')
})

api.get('/api/easel/dashboards', c => read(c, async ctx => dashboardList(ctx)))
api.get('/api/easel/dashboards/:id', c => read(c, ctx => dashboardView(ctx, c.req.param('id'))))
api.get('/api/easel/dashboards/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await dashboardView(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(dashboardWorkbook(view), 'easel-dashboard')
})

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

const spreadsheet = (bytes: Uint8Array, name: string) => new Response(bytes as BodyInit, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}.xlsx"` } })
api.get('/api/easel/actuals.xlsx', async c => {
 const ctx = await open(c), bytes = actualsWorkbook(await actualsView(ctx), get(ctx.s, 'workspace', 'main').currency)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-reconciliation')
})
api.get('/api/easel/activity.xlsx', async c => {
 const ctx = await open(c), events: Data[] = [], filters = c.req.query()
 let before = filters.before
 do {
  const rows = await filteredActivity(ctx, { ...filters, before })
  events.push(...rows)
  if (rows.length < 300) break
  before = String(rows.at(-1)!.seq)
 } while (true)
 const bytes = activityWorkbook(events)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-activity')
})
api.get('/api/easel/scenario/:id/:format{document\\.(xlsx|csv)}', async c => {
 const ctx = await open(c), view = await scenarioView(ctx, c.req.param('id'))
 const department = c.req.query('department') ?? ''
 requireThat(!department || view.departments.some(d => d.id === department), 'Unknown department')
 const bytes = c.req.param('format') === 'document.csv' ? scenarioCsv(view) : scenarioWorkbook(view, department)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return typeof bytes === 'string' ? new Response(bytes, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="easel-plan.csv"' } }) : spreadsheet(bytes, 'easel-plan')
})
api.get('/api/easel/compare.xlsx', async c => {
 const ctx = await open(c)
 const left = await scenarioView(ctx, c.req.query('a') ?? ''), right = await scenarioView(ctx, c.req.query('b') ?? '')
 const bytes = comparisonWorkbook(left, right)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-comparison')
})
api.get('/api/easel/variance/:month/document.xlsx', async c => {
 const ctx = await open(c), bytes = varianceWorkbook(await variance(ctx, c.req.param('month')))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-variance')
})

api.get('/api/easel/pack/:id/:format{document\\.(html|csv|xlsx)}', async c => {
 const ctx = await open(c)
 requireThat(ctx.x.role, 'Finance has not added you to this plan yet', 403)
 const pack = get(ctx.s, 'pack', c.req.param('id'), 'pack')
 requireThat(pack.status === 'published', 'This pack is not published yet', 409)
 const sn = await snapshot(ctx.db, pack.snapshot)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 if (c.req.param('format') === 'document.xlsx') return spreadsheet(packWorkbook(sn), `easel-review-${pack.month}`)
 const csv = c.req.param('format') === 'document.csv'
 const name = `easel-review-${pack.month}.${csv ? 'csv' : 'html'}`
 return new Response(csv ? packCsv(sn) : packHtml(sn), { headers: { 'content-type': csv ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
})

const commands = [starterModels, grid, setup, historyBudget, dashboards, sandboxes, plan, cycle, review, reforecasts, longRange, parallelMonth, metricRules, departmentStatements]

api.post('/api/easel/command/:op', async c => {
 const ctx = await open(c)
 const b = await body(c)
 const op = c.req.param('op')
 let result: Data | undefined
 for (const command of commands) { result = await command(ctx, op, b); if (result !== undefined) break }
 requireThat(result !== undefined, 'Unknown action', 404)
 if (needsMetricRefresh(ctx)) {
  const evaluation = await evaluateMetricTasks(ctx)
  if (op === 'metric-refresh') result = evaluation
 }
 const statementIds = op === 'close-month' && !result.alternativeBudget ? queueDepartmentStatements(ctx, b.month) : op === 'department-statement-retry' ? [result.id] : []
 await commit(ctx)
 for (const id of statementIds) await dispatchDepartmentStatement(id, c.env, () => open(c), commit)
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
 const structureBefore = await load(ctx.db)
 let outcome: unknown
 try { outcome = await step.kit() } catch (e) {
  if (step.failed) { const after = await open(c); requireFinance(after.x); await step.failed(after, e as Error); await commit(after) }
  throw e
 }
 const after = await open(c)
 requireFinance(after.x)
 const result = step.record!(after, outcome)
 if (needsMetricRefresh(after)) await evaluateMetricTasks(after)
 await commit(after, structureBefore.state, structureBefore.revision)
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
