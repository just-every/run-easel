import { runGaugeSchedule } from '../src/easel/gauge-schedule'
import { runMissions } from '../src/easel/agents/missions'
import { runOwnerQuestionSchedule } from '../src/easel/agents/owner-question-schedule'
import { runSheetSchedules } from '../src/easel/sheet-schedule'
import { runBiDrops } from '../src/easel/bi-drops'
import { runSavedReportSchedules } from '../src/easel/saved-report-dispatch'
// The deployed request path (auth, then Easel's Hono API) for the flow tests.
import { authResponse } from '../src/auth.server'
import { api } from '../src/easel/api'
import { runCalendarSchedule } from '../src/easel/calendar-dispatch'
import { runActionChases } from '../src/easel/decision-followup'
import { runCashAlertSchedule } from '../src/easel/cash-alert-schedule'

export default { async fetch(request: Request, env: any, ctx: ExecutionContext) { return await authResponse(request, env) ?? api.fetch(request, env, ctx) }, async scheduled(_controller: ScheduledController, env: any) { await runGaugeSchedule(env); await runCalendarSchedule(env); await runActionChases(env); await runOwnerQuestionSchedule(env); await runSavedReportSchedules(env); await runCashAlertSchedule(env); await runSheetSchedules(env); await runBiDrops(env); await runMissions(env) } }
