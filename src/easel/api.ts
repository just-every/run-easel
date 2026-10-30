import { sheetAddonConnection, sheetAddonStatus, addonSession, addonRefresh, addonWrite, addonPairing, addonHealth } from './sheet-addon'
import { automationAccess, automationEvents, webhookAdmin, runWebhooks } from './webhooks'
import { intacctConnection,intacctStatus } from './intacct-connection'
import { intacctImport } from './intacct-import'
import { netsuiteConnection,netsuiteStatus } from './netsuite-connection'
import { netsuiteImport } from './netsuite-import'
import { spendConnection, spendStatus, spendReview, spendReviews, spendSources, spendReadFailed } from './spend'
import { pipelineConnection, pipelineStatus } from './pipeline-connection'
import { pipelineJournal } from './pipeline-journal'
import { pipelineFailed, pipelinePull, pipelineView } from './pipeline'
import { xeroConnection, xeroStatus } from './xero-connection'
import { xeroImport } from './xero-import'
import { billingConnection, billingStatus } from './billing-connection'
import { billingImport, billingReviews } from './billing-import'
import { qboConnection, qboStatus } from './qbo-connection'
import { qboImport } from './qbo-import'
import { greenhouseStatus, greenhouseConnection, greenhousePreview, greenhousePropose } from './greenhouse'
import { pantryCash, pantryCashForecast } from './pantry-cash'
import { pantryImport } from './pantry-import'
import { pantryStatus, pantryConnection, pantryKey } from './pantry-connection'
import { readPantryLedger } from './pantry-provider'
import { missionList, missionCommand } from './agents/missions'
import { analystPreview, beginAnalyst, authorizeAnalyst, finishAnalyst, analystWhatIf } from './agents/analyst'
import { governanceStatus, governanceSettings, requireAgent } from './agents/governance'
import { gustoStatus, gustoConnection } from './gusto-connection'
import { gustoImport } from './gusto-import'
import { hrisStatus, hrisConnection } from './hris-connection'
import { hrisImport } from './hris-import'
import { hrisId, HRIS } from './hris-provider'
import { privateSlackStatus, privateSlackConnection, privateSlackBinding } from './agents/private-slack'
import { modelerStatus, modelerSettings } from './agents/modeler-settings'
import { modelerPreview } from './agents/modeler-request'
import { beginModeler, authorizeModeler, finishModeler, modelerProposal } from './agents/modeler-run'
import { performModeler } from './agents/modeler-provider'
import { commentaryStatus, commentarySettings, commentaryConnection } from './agents/commentary-settings'
import { commentaryPreview } from './agents/commentary-request'
import { beginCommentary, authorizeCommentary, finishCommentary } from './agents/commentary-run'
import { performCommentary } from './agents/commentary-provider'
import { sourceGuardCommands, sourceGuardView } from './agents/source-guard'
import { ownerQuestions, ownerQuestionView } from './agents/owner-questions'
import { approvalChains, approvalChainView } from './approval-chains'
import { sheetConnection, sheetStatus } from './sheet-connection'
import { sheetLinkCommands, sheetLinks } from './sheet-links'
import { CalculationPending } from './calculation-status'
import { canSeeScenario } from './scenario-access'
import { backgroundScenario, INLINE_INPUT_ROWS } from './calculation-dispatch'
import { activeCalculationJob, readCalculationJob, startCalculationJob } from './calculation-jobs'
import { entityCommands, entitiesView } from './entity'
import { consolidationView } from './entity-consolidation'
import { entityWorkbook } from './entity-workbook'
import { savedReportCommands, savedReportList } from './saved-report-commands'
import { savedReportScheduleCommands, reportScheduleList } from './saved-report-schedules'
import { dispatchSavedReports } from './saved-report-dispatch'
import { groups, accessReport } from './groups'
import { scopedReader } from './group-projections'
import { dimensionCommands } from './dimensions'
import { dimensionMapping } from './dimension-mapping'
import { dimensionView, dimensionWorkbook } from './dimension-view'
import { savedReport, savedReportWorkbook } from './saved-reports'
import { officeReport, officeWorkbook } from './office-report'
import { officeManifest } from './office-manifest'
import { plaidConnection, plaidStatus } from './plaid-connection'
import { weeklyCashWorkbook } from './weekly-cash-workbook'
import { weeklyCash, weeklyCashCommand } from './weekly-cash'
import { publicLedger } from './ledger-public'
import { ledgerAllocation } from './ledger-allocation'
import { workbookDrivers } from './workbook-model'
import { headcountView } from './headcount'
import { forecastLearning } from './agents/forecast-learning'
import { dealHistory } from './agents/deal-outcomes'
import { learningCommands } from './agents/learning-commands'
import { payrollImport } from './payroll-import'
import { payrollView } from './payroll-reconciliation'
import { erasure, erasedView } from './erasure'
import { currentTime } from './time'
import { gaugeSchedule } from './gauge-schedule'
import { gaugeCheck } from './gauge-check'
import { gaugeStatus, gaugeConnection } from './gauge-connection'
import { gaugeUtilization } from './gauge-utilization'
import { starterModels } from './starter-models'
import { grid } from './grid'
import { excelValues, excelReport, excelWrite } from './excel'
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
import { access, requireFinance, requireMember, requirePayDetail } from './access'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { cycle } from './cycle'
import { calendar, calendarView } from './calendar'
import { channelStatus, nookConnection } from './calendar-channels'
import { deliverCalendar } from './calendar-dispatch'
import { deliverNotifications } from './notify-dispatch'
import { decisionFollowups, followup } from './decision-followup'
import { notificationView, savePreference } from './notify'
import { mobileDevices, mobileDeviceCommand } from './mobile-push-devices'
import { departmentStatements, departmentStatementList, departmentStatementView, queueDepartmentStatements } from './department-statements'
import { dispatchDepartmentStatement } from './department-statement-mail'
import { departmentStatementWorkbook } from './department-statement-documents'
import { metricRules, metricTaskList } from './metric-rules'
import { cashAlerts, cashAlertList } from './cash-alert-rules'
import { evaluateCashAlerts, needsCashAlertCheck } from './cash-alert-check'
import { evaluateMetricTasks, needsMetricRefresh } from './metric-tasks'
import { longRange, longRangeList, longRangeView } from './long-range'
import { longRangeWorkbook } from './long-range-workbook'
import { PACK_TYPES, packFileName, renderPack, type PackFormat } from './pack-formats'
import { packPreview } from './pack-preview'
import { biDropCommands, biDropList } from './bi-drops'
import { leverCommands, levers } from './agents/levers'
import { constraintCommands } from './agents/constraint-responses'
import { decisionItems, needsConstraintCheck, watchConstraints } from './agents/constraint-watch'
import { dataset, datasetCsv, datasetJson, datasetParquet } from './dataset'
import { warehouseCommand, warehouseConnection, warehouseStatus } from './warehouse'
import { packSave, packStoreConnection, packStoreStatus } from './pack-store'
import { packTemplateCommands, packTemplates, SECTION_LABELS } from './pack-template'
import { plan } from './plan'
import { parallelMonth, parallelList, parallelView, parallelTemplate } from './parallel-month'
import { scenarioWorkbook, scenarioCsv, comparisonWorkbook, varianceWorkbook } from './report-workbooks'
import { actualsWorkbook, activityWorkbook } from './operational-workbooks'
import { review, variance } from './review'
import { reforecasts } from './reforecasts'
import { driversView } from './drivers-view'
import { setup } from './setup'
import { currencyRates } from './currency-rates'
import { translationView, constantCurrencyVariance } from './translation'
import { actor, load, readFence, save, snapshot } from './store'
import { openExport } from './open-export'
import { tokenAdmin } from './token-admin'
import { tokenRate, tokenUse } from './token-auth'
import { all, choice, Fault, get, requireThat, type Actor, type Data } from './types'
import { actualsView, compareView, scenarioView, snapshotView, stateView, paySafePack } from './views'
import { workbookCommand } from './workbook'
import { moveImport } from './move-import'

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
api.use('/api/easel/*', async (c, next) => {
 await next()
 if (c.req.method === 'POST' && c.res.status < 400) {
  try { await runWebhooks(c.env) } catch { console.error('Webhook delivery deferred to scheduler') }
 }
})
api.post('/api/easel/automation/proposals', async c => {
 const ctx = await open(c), b = await body(c)
 requireThat(Number.isSafeInteger(b.revision) && b.revision > 0, 'An exact reviewed source revision is required')
 return executeCommand(c, ctx, 'proposal-create', b)
})
api.post('/api/easel/automation/dispatch', c => read(c, async ctx => { automationAccess(ctx); return { scheduled: true } }))
api.get('/api/easel/automation/events', c => read(c, ctx => automationEvents(ctx, c.req.query())))
api.get('/api/easel/webhooks', async c => c.json(await webhookAdmin(await open(c), c.env, 'list', {})))
api.post('/api/easel/webhooks/:op', async c => c.json(await webhookAdmin(await open(c), c.env, c.req.param('op'), await body(c))))

api.onError((e, c) => {
 if (e instanceof CalculationPending) return e.job ? c.json({ calculationJob: e.job }, 202) : c.json({ error: e.message, calculation: { scenarios: e.scenarios, status: 'awaiting-continuation' } }, 425)
 if (e instanceof Fault) return c.json({ error: e.message }, e.status as 400)
 const message = String((e as Error).message ?? e)
 if (/IMPORT_|PlanTooLarge/.test(message)) return c.json({ error: message }, 409)
 console.error(e)
 return c.json({ error: 'Easel could not complete this request' }, 500)
})

async function open(c: HonoContext<Env>): Promise<Context & { revision: number; before: Map<string, any> }> {
 const a = c.get('apiActor') ?? await actor(c.req.raw, c.env)
 const { state, revision } = await load(c.env.DB)
 const current = access(state, a)
 if (a.token || a.sheetAddon) requireMember(current)
 if (a.agent) requireAgent({ s: state }, 'mcp')
 if (scopedReader(current) && !a.sheetAddon && ['GET', 'HEAD'].includes(c.req.method)) requireThat(/^\/api\/easel\/(sheets-addon-confirm\/|approval-chains\/|notifications$|mobile\/devices$|calculation-jobs\/|entities$|variance\/|consolidation\/|state$|scenario\/|snapshot\/|compare(?:\.xlsx)?$|dimension-report\/|dashboards(?:\/|$)|dataset\/|reports$|department-statements(?:\/|$))/.test(c.req.path), 'This view is unavailable for dimension-scoped access', 403)
 return { s: state, before: new Map(state), revision, x: access(state, a), db: c.env.DB, activity: [], snapshots: [], now: await currentTime(c.env) }
}

async function commit(ctx: Awaited<ReturnType<typeof open>>, structureBefore = ctx.before, structureRevision = ctx.revision) {
 const changed = ctx.activity.length > 0 || ctx.snapshots.length > 0 || [...ctx.s].some(([k, r]) => ctx.before.get(k)?.revision !== r.revision) || [...ctx.before.keys()].some(k => !ctx.s.has(k))
 if (changed) await versionStructure(ctx, structureBefore, structureRevision)
 if (changed) await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, ctx.snapshots, ctx.x.role === 'finance', ctx.extra ?? [], ctx.now)
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
 return c.json(publicLedger(await erasedView(ctx.db, result)) as any)
}

api.get('/api/easel/connections/spend/:provider', c => read(c, ctx => spendStatus(ctx, c.env, c.req.param('provider'))))
api.post('/api/easel/connections/spend/:provider/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 ctx.extra = await spendConnection(ctx, c.env, c.req.param('provider'), c.req.param('op'), await body(c))
 await commit(ctx)
 return read(c, current => spendStatus(current, c.env, c.req.param('provider')))
})
api.get('/api/easel/spend', c => read(c, spendReviews))
api.post('/api/easel/spend/:op', async c => {
 const ctx = await open(c), op = c.req.param('op'), input = await body(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 let result
 try { result = op === 'sources' ? await spendSources(ctx, c.env, input) : await spendReview(ctx, c.env, op, input) }
 catch (error) { if (spendReadFailed(ctx, error, input.providers)) await commit(ctx); throw error }
 if (op === 'accept') await commit(ctx)
 else await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return c.json(result)
})
api.get('/api/easel/connections/pantry', c => read(c, ctx => pantryStatus(ctx,c.env)))
api.get('/api/easel/connections/stripe', c => read(c, billingStatus))
api.get('/api/easel/connections/pipeline/:provider',c=>read(c,ctx=>pipelineStatus(ctx,c.req.param('provider'))))
api.get('/api/easel/connections/pipeline/:provider/callback',async c=>{
 const ctx=await open(c),result=await pipelineConnection(ctx,runtimeBindings(c.env),c.req.param('provider'),'complete',c.req.query())
 ctx.extra=result.extra;await commit(ctx);return c.redirect(`/app?tab=pipeline&crm=${c.req.param('provider')}`,303)
})
api.post('/api/easel/connections/pipeline/:provider/:op',async c=>{
 const ctx=await open(c),result=await pipelineConnection(ctx,runtimeBindings(c.env),c.req.param('provider'),c.req.param('op'),await body(c))
 ctx.extra=result.extra;await commit(ctx);return c.json({...await pipelineStatus(ctx,c.req.param('provider')),...(result.authorizationUrl?{authorizationUrl:result.authorizationUrl}:{})})
})
api.get('/api/easel/pipeline/:scenario',c=>read(c,async ctx=>pipelineView(ctx,c.req.param('scenario'))))
api.post('/api/easel/pipeline/:op',async c=>{
 const ctx=await open(c),input=await body(c)
 if(['undo','resume','status'].includes(c.req.param('op')))return executeImport(c,ctx,await pipelineJournal(ctx,c.req.param('op'),input))
 let result:Data
 try{result=await pipelinePull(ctx,c.env,c.req.param('op'),input)}
 catch(error){if(pipelineFailed(ctx,error,input.provider)){await evaluateMetricTasks(ctx);await commit(ctx)}throw error}
 if(result.pipelineStep)return executeImport(c,ctx,result.pipelineStep)
 if(c.req.param('op')!=='sources'&&c.req.param('op')!=='preview'){await evaluateMetricTasks(ctx);if(needsConstraintCheck(ctx))await watchConstraints(ctx);await commit(ctx);await deliverNotifications(newNotifications(ctx),c.env,()=>open(c),commit)}
 else await readFence(ctx.db,ctx.x.actor,ctx.revision)
 return c.json(result)
})
api.get('/api/easel/connections/intacct',c=>read(c,intacctStatus))
api.post('/api/easel/connections/intacct/:op',async c=>{
 const ctx=await open(c),result=await intacctConnection(ctx,runtimeBindings(c.env),c.req.param('op'),await body(c))
 ctx.extra=result.extra;await commit(ctx);return c.json(await intacctStatus(ctx))
})
api.get('/api/easel/connections/netsuite', c => read(c,netsuiteStatus))
api.post('/api/easel/connections/netsuite/:op',async c=>{
 const ctx=await open(c),result=await netsuiteConnection(ctx,runtimeBindings(c.env),c.req.param('op'),await body(c))
 ctx.extra=result.extra;await commit(ctx);return c.json(await netsuiteStatus(ctx))
})
api.get('/api/easel/connections/qbo', c => read(c, qboStatus))
api.get('/api/easel/connections/qbo/callback', async c => {
 const ctx=await open(c),result=await qboConnection(ctx,runtimeBindings(c.env),'complete',c.req.query())
 ctx.extra=result.extra;await commit(ctx)
 return c.redirect('/app',303)
})
api.post('/api/easel/connections/qbo/:op', async c => {
 const ctx=await open(c),result=await qboConnection(ctx,runtimeBindings(c.env),c.req.param('op'),await body(c))
 ctx.extra=result.extra;await commit(ctx)
 return c.json({...await qboStatus(ctx),...(result.authorizationUrl?{authorizationUrl:result.authorizationUrl}:{})})
})
api.get('/api/easel/connections/xero', c => read(c, xeroStatus))
api.get('/api/easel/connections/xero/callback', async c => {
 const ctx=await open(c),result=await xeroConnection(ctx,runtimeBindings(c.env),'complete',c.req.query())
 ctx.extra=result.extra;await commit(ctx)
 return c.redirect('/app',303)
})
api.post('/api/easel/connections/xero/:op', async c => {
 const ctx=await open(c),result=await xeroConnection(ctx,runtimeBindings(c.env),c.req.param('op'),await body(c))
 ctx.extra=result.extra;await commit(ctx)
 return c.json({...await xeroStatus(ctx),...(result.authorizationUrl?{authorizationUrl:result.authorizationUrl}:{})})
})
api.post('/api/easel/connections/stripe/:op', async c => {
 const ctx = await open(c)
 ctx.extra = await billingConnection(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return read(c, billingStatus)
})
api.get('/api/easel/billing/:scenario', c => read(c, async ctx => billingReviews(ctx, c.req.param('scenario'))))
api.post('/api/easel/billing/:op', async c => {
 const ctx = await open(c), result = await billingImport(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(result)
})
api.post('/api/easel/connections/pantry/:op', async c => {
 const ctx=await open(c)
 ctx.extra=await pantryConnection(ctx,c.env,c.req.param('op'),await body(c))
 await commit(ctx)
 return read(c,current=>pantryStatus(current,c.env))
})
api.post('/api/easel/pantry/cash',async c=>{
 const ctx=await open(c),value=await pantryCash(ctx,c.env,await body(c))
 await readFence(ctx.db,ctx.x.actor,ctx.revision)
 return c.json(value)
})
api.post('/api/easel/pantry/cash-forecast',async c=>{
 const ctx=await open(c),input=await body(c),value=await pantryCashForecast(ctx,c.env,input)
 await readFence(ctx.db,ctx.x.actor,ctx.revision)
 return input.format==='xlsx'?spreadsheet(weeklyCashWorkbook(value),'easel-pantry-weekly-cash'):c.json(value)
})
api.post('/api/easel/pantry/ledger', async c => {
 const ctx=await open(c),input=await body(c),key=await pantryKey(ctx,c.env)
 const value=await readPantryLedger(key,input.from,input.to)
 await readFence(ctx.db,ctx.x.actor,ctx.revision)
 return c.json(value)
})

api.get('/api/easel/connections/greenhouse', c => read(c, ctx => greenhouseStatus(ctx)))
api.post('/api/easel/connections/greenhouse/:op', async c => {
 const ctx=await open(c)
 ctx.extra=await greenhouseConnection(ctx,c.env,c.req.param('op'),await body(c))
 await commit(ctx)
 return read(c,current=>greenhouseStatus(current))
})
api.post('/api/easel/greenhouse/:op', async c => {
 const ctx=await open(c),b=await body(c),op=c.req.param('op')
 requireThat(op==='preview'||op==='propose','Unknown Greenhouse action',404)
 const value=op==='preview'?await greenhousePreview(ctx,c.env,b):await greenhousePropose(ctx,c.env,b)
 if(op==='preview')await readFence(ctx.db,ctx.x.actor,ctx.revision)
 else await commit(ctx)
 return c.json(value)
})

api.get('/api/easel/connections/hris/:provider', c => read(c, ctx => hrisStatus(ctx,hrisId(c.req.param('provider')))))
api.post('/api/easel/connections/hris/:provider/:op', async c => {
 const ctx=await open(c),id=hrisId(c.req.param('provider'))
 ctx.extra=await hrisConnection(ctx,c.env,id,c.req.param('op'),await body(c))
 await commit(ctx)
 return read(c,current=>hrisStatus(current,id))
})

api.get('/api/easel/connections/gusto', c => read(c, ctx => gustoStatus(ctx)))
api.post('/api/easel/connections/gusto/:op', async c => {
 const ctx = await open(c)
 ctx.extra = await gustoConnection(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return read(c, current => gustoStatus(current))
})

api.get('/api/easel/headcount/:scenario', c => read(c, ctx => headcountView(ctx, c.req.param('scenario'))))
api.get('/api/easel/forecast-learning/:scenario', c => read(c, ctx => forecastLearning(ctx, c.req.param('scenario'))))
api.get('/api/easel/source-guard', c => read(c, async ctx => sourceGuardView(ctx)))
api.get('/api/easel/slack-private', c => read(c, ctx => privateSlackStatus(ctx, c.env)))
api.post('/api/easel/slack-private/connection/:op', async c => {
 const ctx = await open(c)
 ctx.extra = await privateSlackConnection(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return read(c, current => privateSlackStatus(current, c.env))
})
api.post('/api/easel/slack-private/:op', async c => {
 const ctx = await open(c), result = await privateSlackBinding(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.post('/api/easel/analyst/preview', async c => { const input = await body(c); return read(c, ctx => analystPreview(ctx, input)) })
api.post('/api/easel/analyst/generate', async c => {
 const ctx = await open(c), intent = await beginAnalyst(ctx, await body(c))
 await commit(ctx)
 let outcome
 try {
  const current = await open(c), authorized = await authorizeAnalyst(current, intent.id)
  await readFence(current.db, current.x.actor, current.revision)
  outcome = await performCommentary(c.env, authorized)
 } catch (error) { if (!(error instanceof Fault)) throw error; outcome = { status: 'refused' as const, reason: error.message } }
 const current = await open(c), result = await finishAnalyst(current, intent.id, outcome)
 await commit(current)
 return c.json(publicLedger(await erasedView(current.db, result)))
})
api.post('/api/easel/analyst/what-if', async c => {
 const ctx = await open(c), result = await analystWhatIf(ctx, await body(c))
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/missions', c => read(c, missionList))
api.post('/api/easel/missions/:op', async c => {
 const ctx = await open(c), result = await missionCommand(ctx, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.get('/api/easel/agents/status', c => read(c, governanceStatus))
api.post('/api/easel/agents/settings/:op', async c => {
 const ctx = await open(c), result = await governanceSettings(ctx, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.get('/api/easel/commentary/status', c => read(c, ctx => commentaryStatus(ctx, c.env)))
api.get('/api/easel/modeler/status', c => read(c, modelerStatus))
api.get('/api/easel/modeler/proposal/:id', c => read(c, ctx => modelerProposal(ctx, c.req.param('id'))))
api.post('/api/easel/modeler/settings/:op', async c => {
 const ctx = await open(c), result = await modelerSettings(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.post('/api/easel/modeler/preview', async c => {
 const input = await body(c)
 return read(c, ctx => modelerPreview(ctx, input))
})
api.post('/api/easel/modeler/generate', async c => {
 const ctx = await open(c), intent = await beginModeler(ctx, c.env, await body(c))
 await commit(ctx)
 let outcome
 try {
  const current = await open(c), authorized = await authorizeModeler(current, intent.id)
  await readFence(current.db, current.x.actor, current.revision)
  outcome = await performModeler(c.env, authorized)
 } catch (error) {
  if (!(error instanceof Fault)) throw error
  outcome = { status: 'refused' as const, reason: error.message }
 }
 const current = await open(c), result = await finishModeler(current, intent.id, outcome)
 await commit(current)
 return c.json(publicLedger(await erasedView(current.db, result)))
})
api.post('/api/easel/commentary/settings/:op', async c => {
 const ctx = await open(c), result = await commentarySettings(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.post('/api/easel/commentary/connection/:op', async c => {
 const ctx = await open(c)
 ctx.extra = await commentaryConnection(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return read(c, current => commentaryStatus(current, c.env))
})
api.post('/api/easel/commentary/preview', async c => {
 const input = await body(c)
 return read(c, ctx => commentaryPreview(ctx, input))
})
api.post('/api/easel/commentary/generate', async c => {
 const ctx = await open(c), intent = await beginCommentary(ctx, c.env, await body(c))
 await commit(ctx)
 let outcome
 try {
  const current = await open(c)
  const authorized = await authorizeCommentary(current, intent.id)
  await readFence(current.db, current.x.actor, current.revision)
  outcome = await performCommentary(c.env, authorized)
 } catch (error) {
  if (!(error instanceof Fault)) throw error
  outcome = { status: 'refused' as const, reason: error.message }
 }
 const current = await open(c), result = await finishCommentary(current, intent.id, outcome)
 await commit(current)
 return c.json(publicLedger(await erasedView(current.db, result)))
})
api.get('/api/easel/owner-questions', c => read(c, ownerQuestionView))
api.get('/api/easel/deal-history', c => read(c, async ctx => { requireFinance(ctx.x); return { deals: dealHistory(ctx) } }))
api.get('/api/easel/payroll/:scenario', c => read(c, ctx => payrollView(ctx, c.req.param('scenario'))))

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

api.get('/api/easel/connections/plaid', c => read(c, plaidStatus))
api.post('/api/easel/connections/plaid/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 ctx.extra = await plaidConnection(ctx, c.env, c.req.param('op'), await body(c))
 if (needsCashAlertCheck(ctx)) await evaluateCashAlerts(ctx)
 await commit(ctx)
 await deliverNotifications(newNotifications(ctx), c.env, () => open(c), commit)
 return c.json(await plaidStatus(ctx))
})
api.get('/api/easel/connections/gauge', c => read(c, ctx => gaugeStatus(ctx, c.env)))
api.post('/api/easel/connections/gauge/:op', async c => {
 const ctx = await open(c), op = c.req.param('op'), input = await body(c)
 if (op === 'check' || op === 'schedule') {
  if (op === 'schedule') gaugeSchedule(ctx, input)
  else await gaugeCheck(ctx, c.env, input)
  await commit(ctx)
  await deliverNotifications(newNotifications(ctx), c.env, () => open(c), commit)
 } else {
  await readFence(ctx.db, ctx.x.actor, ctx.revision)
  const extra = await gaugeConnection(ctx, c.env, op, input)
  await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 }
 return c.json(await gaugeStatus(ctx, c.env))
})
api.get('/api/easel/sheets-addon-confirm/:id', c => read(c, async ctx => addonPairing(ctx, c.req.param('id'))))
api.get('/api/easel/connections/sheets-addon', c => read(c, sheetAddonStatus))
api.post('/api/easel/connections/sheets-addon/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const result = await sheetAddonConnection(ctx, runtimeBindings(c.env), c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/google-sheets/session', c => read(c, async ctx => addonSession(ctx)))
api.post('/api/easel/google-sheets/:op', async c => {
 const ctx = await open(c), input = await body(c, 200000), op = c.req.param('op')
 requireThat(op === 'refresh' || op === 'write' || op === 'health', 'Unknown Google Sheets add-on action', 404)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const result = op === 'refresh' ? await addonRefresh(ctx, input) : op === 'health' ? addonHealth(ctx, input) : await addonWrite(ctx, input)
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/connections/sheets', c => read(c, ctx => sheetStatus(ctx, runtimeBindings(c.env))))
api.post('/api/easel/connections/sheets/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const extra = await sheetConnection(ctx, runtimeBindings(c.env), c.req.param('op'), await body(c))
 await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 return c.json(await sheetStatus(ctx))
})
api.get('/api/easel/sheet-links', c => read(c, async ctx => sheetLinks(ctx)))
api.post('/api/easel/sheet-links/:op', async c => {
 const ctx = await open(c), op = c.req.param('op')
 requireThat(['preview', 'save', 'pull', 'disable'].includes(op), 'Unknown sheet link action', 404)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const result = await sheetLinkCommands(ctx, runtimeBindings(c.env), `sheet-link-${op}`, await body(c))
 if (op === 'preview') await readFence(ctx.db, ctx.x.actor, ctx.revision)
 else await commit(ctx)
 return c.json(result)
})
const newNotifications = (ctx: Awaited<ReturnType<typeof open>>) => [...ctx.s.values()].filter(r => r.kind === 'notification' && !ctx.before.has(`notification:${r.id}`)).map(r => r.id)
api.get('/api/easel/approval-chains/:scenario', c => read(c, ctx => approvalChainView(ctx, c.req.param('scenario'))))
api.get('/api/easel/mobile/devices', c => read(c, ctx => mobileDevices(ctx, c.env)))
api.post('/api/easel/mobile/devices/:op', async c => {
 const ctx = await open(c), result = await mobileDeviceCommand(ctx, c.env, c.req.param('op'), await body(c, 10_000))
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/notifications', c => read(c, ctx => notificationView(ctx, c.env)))
api.post('/api/easel/notifications/preference', async c => {
 const ctx = await open(c), result = await savePreference(ctx, c.env, await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})
api.post('/api/easel/notifications/:id/retry', async c => {
 const ctx = await open(c)
 requireFinance(ctx.x)
 const n = get(ctx.s, 'notification', c.req.param('id'), 'notification')
 requireThat(n.status === 'pending' && n.attempts > 0, n.status === 'uncertain' ? 'The outcome of this send is unknown; it is never retried automatically or blindly' : 'Only a refused or unconfigured send can be retried', 409)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 await deliverNotifications([n.id], c.env, () => open(c), commit)
 return c.json(get((await open(c)).s, 'notification', n.id))
})
api.get('/api/easel/calendar', c => read(c, ctx => calendarView(ctx, c.env)))
api.post('/api/easel/connections/nook/:op', async c => {
 const ctx = await open(c), input = await body(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const extra = await nookConnection(ctx, c.env, c.req.param('op'), input)
 await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 return c.json((await channelStatus(ctx, c.env)).nook)
})
api.post('/api/easel/gauge/:op', async c => {
 const ctx = await open(c), result = await gaugeUtilization(ctx, c.env, c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
})


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
api.get('/api/easel/parallel-month/:id', c => read(c, ctx => { requirePayDetail(ctx.x); return parallelView(ctx, c.req.param('id')) }))

api.get('/api/easel/metric-tasks', c => read(c, metricTaskList))
api.get('/api/easel/cash-alerts', c => read(c, cashAlertList))
api.get('/api/easel/decisions', c => read(c, decisionFollowups))

api.get('/api/easel/department-statements', c => read(c, ctx => departmentStatementList(ctx, c.req.query('month'))))
api.get('/api/easel/department-statements/:id', c => read(c, ctx => departmentStatementView(ctx, c.req.param('id'))))
api.get('/api/easel/department-statements/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await departmentStatementView(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(departmentStatementWorkbook(view), 'easel-department-statement')
})

api.get('/api/office/manifest/:host', c => {
 const host = choice(c.req.param('host'), ['PowerPoint', 'Word', 'Excel'] as const, 'Office host')
 return c.body(officeManifest(runtimeBindings(c.env).AUTH_ORIGIN, host), 200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename=easel-${host.toLowerCase()}.xml` })
})
api.get('/api/easel/excel/report/:id', c => read(c, ctx => excelReport(ctx, c.req.param('id'), c.req.query())))
api.get('/api/easel/excel/:id/value', c => read(c, ctx => excelValues(ctx, c.req.param('id'), c.req.query())))
api.get('/api/easel/dashboards/:id/office', c => read(c, ctx => officeReport(ctx, c.req.param('id'), c.req.query())))
api.get('/api/easel/dashboards/:id/office.xlsx', async c => {
 const ctx = await open(c), bytes = await officeWorkbook(ctx, c.req.param('id'), c.req.query())
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-office-report')
})

api.get('/api/easel/reports', c => read(c, async ctx => savedReportList(ctx)))
api.get('/api/easel/report-schedules', c => read(c, async ctx => reportScheduleList(ctx)))
api.get('/api/easel/dashboards', c => read(c, async ctx => dashboardList(ctx)))
api.get('/api/easel/dashboards/:id/report', c => read(c, ctx => savedReport(ctx, c.req.param('id'))))
api.get('/api/easel/dashboards/:id/report.xlsx', async c => {
 const ctx = await open(c), view = await savedReport(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(savedReportWorkbook(view), 'easel-saved-report')
})
api.get('/api/easel/dashboards/:id', c => read(c, ctx => dashboardView(ctx, c.req.param('id'))))
api.get('/api/easel/dashboards/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await dashboardView(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(dashboardWorkbook(view), 'easel-dashboard')
})

api.get('/api/easel/dimension-report/:scenario/document.xlsx', async c => {
 const ctx = await open(c), view = await dimensionView(ctx, c.req.param('scenario'), c.req.query('dimension'), c.req.query('member'),c.req.query('entity'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(dimensionWorkbook(view), 'easel-dimensions')
})
api.get('/api/easel/dimension-report/:scenario', c => read(c, ctx => dimensionView(ctx, c.req.param('scenario'), c.req.query('dimension'), c.req.query('member'),c.req.query('entity'))))

api.get('/api/easel/entities', c => read(c, async ctx => entitiesView(ctx)))
api.get('/api/easel/consolidation/:id', c => read(c, ctx => consolidationView(ctx, c.req.param('id'))))
api.get('/api/easel/consolidation/:id/workbook', async c => { const ctx = await open(c); const view = await consolidationView(ctx, c.req.param('id')); await readFence(ctx.db, ctx.x.actor, ctx.revision); return spreadsheet(entityWorkbook(view), 'easel-consolidation') })
api.get('/api/easel/access-report', c => read(c, accessReport))
api.get('/api/easel/state', c => read(c, stateView))
api.get('/api/easel/calculation-jobs/:id', c => read(c, ctx => readCalculationJob(ctx, c.req.param('id'))))
api.get('/api/easel/scenario/:id', async c => {
 const ctx = await open(c), id = c.req.param('id')
 requireMember(ctx.x)
 requireThat(canSeeScenario(ctx.x, get(ctx.s, 'scenario', id)), 'Scenario not found', 404)
 const job = await activeCalculationJob(ctx, id)
 if (job) { await readFence(ctx.db, ctx.x.actor, ctx.revision); return c.json({ calculationJob: job }, 202) }
 const value = await scenarioView(ctx, id); await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return c.json(publicLedger(await erasedView(ctx.db, value)))
})
api.get('/api/easel/weekly-cash/:id/document.xlsx', async c => {
 const ctx = await open(c), view = await weeklyCash(ctx, c.req.param('id'), c.req.query('start'), c.req.query('basis'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(weeklyCashWorkbook(view), 'easel-weekly-cash')
})
api.get('/api/easel/weekly-cash/:id', c => read(c, ctx => weeklyCash(ctx, c.req.param('id'), c.req.query('start'), c.req.query('basis'))))
api.get('/api/easel/drivers/:id', c => read(c, ctx => driversView(ctx, c.req.param('id'))))
api.get('/api/easel/translation/:scenario', c => read(c, ctx => translationView(ctx, c.req.param('scenario'))))
api.get('/api/easel/translation-variance/:month', c => read(c, ctx => constantCurrencyVariance(ctx, c.req.param('month'))))
api.get('/api/easel/compare', c => read(c, ctx => compareView(ctx, c.req.query('a') ?? '', c.req.query('b') ?? '')))
api.get('/api/easel/snapshot/:id', c => read(c, ctx => snapshotView(ctx, c.req.param('id'))))
api.get('/api/easel/actuals',c=>read(c,ctx=>actualsView(ctx,c.req.query('entity'))))
api.get('/api/easel/variance/:month', c => read(c, ctx => variance(ctx,c.req.param('month'),c.req.query('scenario')??c.req.query('forecast'))))
api.get('/api/easel/activity', c => read(c, ctx => filteredActivity(ctx, c.req.query())))
api.get('/api/easel/activity.csv', async c => {
 const ctx = await open(c)
 const csv = await activityCsv(ctx, c.req.query())
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="easel-activity.csv"' } })
})

const spreadsheet = (bytes: Uint8Array, name: string) => new Response(bytes as BodyInit, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}.xlsx"` } })
api.get('/api/easel/actuals.xlsx', async c => {
 const ctx=await open(c),view=await actualsView(ctx,c.req.query('entity')),bytes=actualsWorkbook(view,view.currency)
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
 const ctx = await open(c), bytes = varianceWorkbook(await variance(ctx,c.req.param('month'),c.req.query('scenario')??c.req.query('forecast')))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 return spreadsheet(bytes, 'easel-variance')
})

api.get('/api/easel/pack/:id/:format{document\\.(html|csv|xlsx|pdf|pptx)}', async c => {
 const ctx = await open(c)
 requireThat(ctx.x.role, 'Finance has not added you to this plan yet', 403)
 const pack = get(ctx.s, 'pack', c.req.param('id'), 'pack')
 requireThat(!scopedReader(ctx.x), 'This aggregate pack is unavailable for dimension-scoped access', 403)
 requireThat(pack.status === 'published', 'This pack is not published yet', 409)
 const sn = paySafePack(await snapshot(ctx.db, pack.snapshot))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const format = c.req.param('format').slice('document.'.length) as PackFormat, bytes = renderPack(sn, format)
 return new Response(bytes as any, { headers: { 'content-type': PACK_TYPES[format], 'content-disposition': `attachment; filename="${packFileName(sn, format)}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
})
api.get('/api/easel/pack/:id/preview', c => read(c, ctx => packPreview(ctx, c.req.param('id'))))
api.post('/api/easel/pack/:id/save', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const result = await packSave(ctx, runtimeBindings(c.env), c.req.param('id'), (await body(c)).store)
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/dataset/:id', async c => {
 const ctx = await open(c), format = choice(c.req.query('format') ?? 'json', ['json', 'csv', 'parquet', 'xlsx'] as const, 'a dataset format')
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
 if (format === 'xlsx') {
  const bytes = savedReportWorkbook(await savedReport(ctx, c.req.param('id')))
  await readFence(ctx.db, ctx.x.actor, ctx.revision)
  return spreadsheet(bytes, 'easel-dataset')
 }
 const d = await dataset(ctx, c.req.param('id'))
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 if (format === 'csv') return new Response(datasetCsv(d), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8' } })
 if (format === 'parquet') return new Response(datasetParquet(d) as any, { headers: { ...headers, 'content-type': 'application/vnd.apache.parquet' } })
 return c.json(datasetJson(d))
})
api.get('/api/easel/constraints', c => read(c, async ctx => { requireFinance(ctx.x); return { items: decisionItems(ctx), levers: levers(ctx), departmentLimits: all(ctx.s, 'department-limit') } }))
api.get('/api/easel/bi-drops', c => read(c, async ctx => biDropList(ctx)))
api.get('/api/easel/warehouse', c => read(c, warehouseStatus))
api.post('/api/easel/warehouse/:warehouse/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const extra = await warehouseConnection(ctx, runtimeBindings(c.env), c.req.param('warehouse'), c.req.param('op'), await body(c))
 await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 return c.json(await warehouseStatus(ctx))
})
api.post('/api/easel/warehouse-command/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const result = await warehouseCommand(ctx, runtimeBindings(c.env), c.req.param('op'), await body(c))
 await commit(ctx)
 return c.json(result)
})
api.get('/api/easel/pack-templates', c => read(c, async ctx => { requireMember(ctx.x); return { templates: packTemplates(ctx), sections: SECTION_LABELS } }))
api.get('/api/easel/connections/pack-stores', c => read(c, packStoreStatus))
api.post('/api/easel/connections/pack-stores/:store/:op', async c => {
 const ctx = await open(c)
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const extra = await packStoreConnection(ctx, runtimeBindings(c.env), c.req.param('store'), c.req.param('op'), await body(c))
 await save(ctx.db, ctx.x.actor, ctx.before, ctx.s, ctx.revision, ctx.activity, [], true, extra)
 return c.json(await packStoreStatus(ctx))
})

const commands = [sourceGuardCommands, ownerQuestions, leverCommands, constraintCommands, biDropCommands, packTemplateCommands, learningCommands, approvalChains, entityCommands, savedReportCommands, savedReportScheduleCommands, groups, dimensionCommands, dimensionMapping, weeklyCashCommand, currencyRates, ledgerAllocation, workbookDrivers, erasure, starterModels, excelWrite, grid, setup, historyBudget, dashboards, sandboxes, plan, cycle, calendar, review, followup, reforecasts, longRange, parallelMonth, metricRules, cashAlerts, departmentStatements]

api.post('/api/easel/command/:op', async c => {
 const ctx = await open(c)
 const b = await body(c)
 const op = c.req.param('op')
 if (op.startsWith('parallel-')) requirePayDetail(ctx.x)
 const scenarioId = backgroundScenario(ctx.s, op, b)
 if (scenarioId) return c.json(await startCalculationJob(ctx, [scenarioId], async id => { ctx.calculationJob = id; return executeCommand(c, ctx, op, b) }, promise => c.executionCtx.waitUntil(promise)), 202)
 return executeCommand(c, ctx, op, b)
})

async function executeCommand(c: HonoContext<Env>, ctx: Awaited<ReturnType<typeof open>>, op: string, b: Data): Promise<Response> {
 let result: Data | undefined
 for (const command of commands) { result = await command(ctx, op, b); if (result !== undefined) break }
 requireThat(result !== undefined, 'Unknown action', 404)
 if (needsMetricRefresh(ctx)) {
  const evaluation = await evaluateMetricTasks(ctx)
  if (op === 'metric-refresh') result = evaluation
 }
 if (needsConstraintCheck(ctx)) await watchConstraints(ctx)
 if (needsCashAlertCheck(ctx)) {
  const evaluation = await evaluateCashAlerts(ctx)
  if (op === 'cash-alert-check') result = { sent: evaluation.sent, blocked: evaluation.blocked }
 }
 const statementIds = op === 'close-month' && !result.alternativeBudget ? queueDepartmentStatements(ctx, b.month,result.id) : op === 'department-statement-retry' ? [result.id] : []
 await commit(ctx)
 for (const id of statementIds) await dispatchDepartmentStatement(id, c.env, () => open(c), commit)
 if (op === 'report-schedule-retry') await dispatchSavedReports(result.deliveryIds, c.env, () => open(c), commit)
 if (op === 'calendar-delivery-retry') await deliverCalendar([result.id], c.env, () => open(c), commit)
 await deliverNotifications(newNotifications(ctx), c.env, () => open(c), commit)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
}

api.post('/api/easel/import/:kit/:op', async c => {
 const kit = c.req.param('kit')
 requireThat(kit === 'actuals' || kit === 'workbook' || kit === 'payroll' || kit === 'incumbent' || kit === 'gusto' || kit === 'pantry' || kit === 'qbo' || kit === 'xero' || kit === 'intacct' || kit === 'netsuite' || (HRIS as readonly string[]).includes(kit), 'Unknown move-in kit', 404)
 const ctx = await open(c)
 if (kit !== 'incumbent' || c.req.param('op') !== 'preview') requirePayDetail(ctx.x)
 const b = await body(c, kit !== 'actuals' ? 8_000_000 : 3_000_000)
 const step: KitStep | undefined = (HRIS as readonly string[]).includes(kit) ? await hrisImport(ctx,c.env,hrisId(kit),c.req.param('op'),b) : kit === 'netsuite' ? await netsuiteImport(ctx,c.env,c.req.param('op'),b) : kit === 'intacct' ? await intacctImport(ctx,c.env,c.req.param('op'),b) : kit === 'xero' ? await xeroImport(ctx,c.env,c.req.param('op'),b) : kit === 'qbo' ? await qboImport(ctx,c.env,c.req.param('op'),b) : kit === 'pantry' ? await pantryImport(ctx,c.env,c.req.param('op'),b) : kit === 'gusto' ? await gustoImport(ctx, c.env, c.req.param('op'), b) : await (kit === 'actuals' ? actualsCommand : kit === 'payroll' ? payrollImport : kit === 'incumbent' ? moveImport : workbookCommand)(ctx, c.req.param('op'), b)
 requireThat(step, 'Unknown import action', 404)
 const importKind = kit === 'incumbent' ? 'move-import' : 'workbook-import'
 const imported = [...ctx.s.values()].find(row => row.kind === importKind && (row.id === b.id || ctx.before.get(`${importKind}:${row.id}`)?.revision !== row.revision))?.value
 if (['workbook','incumbent'].includes(kit) && step.kit && imported && imported.rows > INLINE_INPUT_ROWS) return c.json(await startCalculationJob(ctx, kit === 'incumbent' ? imported.scenarios : [imported.scenario], async id => { ctx.calculationJob = id; return executeImport(c, ctx, step) }, promise => c.executionCtx.waitUntil(promise)), 202)
 return executeImport(c, ctx, step)
})

async function executeImport(c: HonoContext<Env>, ctx: Awaited<ReturnType<typeof open>>, step: KitStep): Promise<Response> {
 await commit(ctx)
 if (!step.kit) return c.json(await erasedView(ctx.db, step.result))
 const structureBefore = await load(ctx.db)
 let outcome: unknown
 try { outcome = await step.kit() } catch (e) {
  if (step.failed) { const after = await open(c); requireFinance(after.x); await step.failed(after, e as Error); await commit(after) }
  throw e
 }
 const after = await open(c); after.calculationJob = ctx.calculationJob
 requireFinance(after.x)
 const result = step.record!(after, outcome)
 if (needsMetricRefresh(after)) await evaluateMetricTasks(after)
 if (needsConstraintCheck(after)) await watchConstraints(after)
 if (needsCashAlertCheck(after)) await evaluateCashAlerts(after)
 await commit(after, structureBefore.state, structureBefore.revision)
 await deliverNotifications(newNotifications(after), c.env, () => open(c), commit)
 return c.json(publicLedger(await erasedView(ctx.db, result)))
}

api.post('/api/easel/invite', async c => {
 const ctx = await open(c)
 requireThat(ctx.x.role === 'finance', 'Only finance invites people', 403)
 const b = await body(c)
 const member = get(ctx.s, 'member', typeof b.email === 'string' ? b.email.toLowerCase() : '', 'person')
 requireThat(member.active, 'This person is inactive')
 await readFence(ctx.db, ctx.x.actor, ctx.revision)
 const bindings = runtimeBindings(c.env)
 const invitation = await operatorAuth(bindings).invite(c.req.raw, { email: member.email, displayName: member.name, role: member.role === 'finance' ? 'admin' : 'member', returnTo: '/app' })
 return c.json({ ...invitation, delivery: bindings.AUTH_LOCAL === 'true' || bindings.RER_DEMO === '1' ? 'local' : 'requested' })
})
