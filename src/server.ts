import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import start from '@tanstack/react-start/server-entry'
import { dispatch } from './base/dispatch'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { api } from './easel/api'
import { staticAssetResponse } from './base/static-assets'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { identity } from './identity'
import { runCalendarSchedule } from './easel/calendar-dispatch'
import { runActionChases } from './easel/decision-followup'

export default withDemo({
  async fetch(request, env, execution) {
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const auth = await authResponse(request, env)
    if (auth) return auth
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return state
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return lobby
    return dispatch(request, () => api.fetch(request, env, execution), async () => {
      const response = await start.fetch(request), headers = new Headers(response.headers)
      const policy = headers.get('cache-control')
      headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    })
  },
  async scheduled(_controller, env) {
    await runCalendarSchedule(env)
    await runActionChases(env)
  },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
