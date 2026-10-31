import { runWebhooks } from '../src/easel/webhooks'
import { runGaugeSchedule } from '../src/easel/gauge-schedule'
import { runMissions } from '../src/easel/agents/missions'
import { runOwnerQuestionSchedule } from '../src/easel/agents/owner-question-schedule'
import { runSheetSchedules } from '../src/easel/sheet-schedule'
import { runBiDrops } from '../src/easel/bi-drops'
import { runSavedReportSchedules } from '../src/easel/saved-report-dispatch'
// The deployed request path (auth, then Easel's Hono API) for the flow tests.
import { authResponse } from '../src/auth.server'
import { agentResponse } from '../src/agent-door/index.ts'
import { api } from '../src/easel/api'
import { runCalendarSchedule } from '../src/easel/calendar-dispatch'
import { runActionChases } from '../src/easel/decision-followup'
import { runCashAlertSchedule } from '../src/easel/cash-alert-schedule'

// Optional database boundary used to interleave a real native command after a
// completed read fence. Production code and its public door remain unchanged.
function readBoundary(db: D1Database, barrier: Fetcher): D1Database {
 return new Proxy(db, { get(target, key) {
  if (key === 'prepare') return (sql: string) => {
   const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(stmt, name) {
    if (name === 'bind') return (...args: unknown[]) => wrap(stmt.bind(...args))
    if (name === 'first' && sql.startsWith('SELECT CASE WHEN')) return async (...args: Parameters<D1PreparedStatement['first']>) => {
     const value = await stmt.first(...args)
     await barrier.fetch('https://database-boundary.invalid/')
     return value
    }
    const value = Reflect.get(stmt, name)
    return typeof value === 'function' ? value.bind(stmt) : value
   } })
   return wrap(target.prepare(sql))
  }
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? value.bind(target) : value
 } })
}

export default { async fetch(request: Request, env: any, ctx: ExecutionContext) {
 if (env.TEST_READ_FENCE && new URL(request.url).pathname === '/mcp') env = { ...env, DB: readBoundary(env.DB, env.TEST_READ_FENCE) }
 return await agentResponse(request, env) ?? await authResponse(request, env) ?? api.fetch(request, env, ctx) }, async scheduled(_controller: ScheduledController, env: any) { await runGaugeSchedule(env); await runCalendarSchedule(env); await runActionChases(env); await runOwnerQuestionSchedule(env); await runSavedReportSchedules(env); await runCashAlertSchedule(env); await runSheetSchedules(env); await runBiDrops(env); await runMissions(env); await runWebhooks(env) } }
