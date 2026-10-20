// The deployed request path (auth, then Easel's Hono API) for the flow tests.
import { authResponse } from '../src/auth.server'
import { api } from '../src/easel/api'
import { runCalendarSchedule } from '../src/easel/calendar-dispatch'

export default { async fetch(request: Request, env: any, ctx: ExecutionContext) { return await authResponse(request, env) ?? api.fetch(request, env, ctx) }, async scheduled(_controller: ScheduledController, env: any) { await runCalendarSchedule(env) } }
