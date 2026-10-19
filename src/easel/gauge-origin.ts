import type { Bindings } from '../auth.server'
import { requireThat } from './types'

export function gaugeOrigin(env: Bindings) {
 requireThat(env.GAUGE_ORIGIN, 'Configure GAUGE_ORIGIN on this installation before connecting Gauge', 503)
 let url: URL
 try { url = new URL(env.GAUGE_ORIGIN) } catch { throw new Error('Invalid installation GAUGE_ORIGIN') }
 requireThat(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (url.protocol === 'https:' || (env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))), 'GAUGE_ORIGIN must be an HTTPS origin (HTTP loopback is allowed only locally)', 503)
 return url.origin
}
