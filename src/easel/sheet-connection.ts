import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance, requirePayDetail } from './access'
import { openConnection, sealConnection } from './connection-seal'
import type { Context } from './context'
import { refreshSheetToken, sheetCredentials, SHEET_SCOPE, type SheetCredentials } from './sheet-provider'
import { all, find, put, requireThat, type Data } from './types'

const PURPOSE = 'easel:google-sheets:spreadsheets.readonly:v1'
export const SHEET_REVOCATION_WARNING = 'Google did not confirm revocation; remove this app in your Google Account → Security → Third-party connections'
export function sheetAuthority(c: Context) {
 requireCapability(c.x, 'connections')
 requireFinance(c.x)
 requirePayDetail(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent, 'Use a signed-in finance session for Google Sheets connections and imports', 403)
}

export async function sheetStatus(c: Context, _env?: Bindings) {
 sheetAuthority(c)
 requireThat(!c.x.actor.scheduler, 'Use a signed-in finance session to inspect Google Sheets credentials', 403)
 const row = find(c.s, 'connection', 'sheets')
 const stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('sheets').first()
 return { id: 'sheets', provider: 'Google Sheets', connected: Boolean(stored && row?.connected), credential: stored ? '••••' : null,
  scope: SHEET_SCOPE, scopeDescription: 'Read-only access to spreadsheets accessible to the connected Google account; not limited to a linked range',
  owner: row?.owner ?? null, connectedAt: row?.connectedAt ?? null, disconnectedAt: row?.disconnectedAt ?? null,
  schedule: row?.schedule ?? 'Per linked range', lastRefresh: row?.lastRefresh ?? null, rowCount: row?.rowCount ?? 0,
  error: row?.connected && !stored ? 'Reconnect Google Sheets after restore; OAuth credentials are excluded from archives' : row?.error ?? null,
  rateLimit: row?.rateLimit ?? null, providerRevocation: row?.providerRevocation ?? null }
}

async function storedSheetCredentials(c: Context, env: Bindings): Promise<SheetCredentials> {
 const row = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('sheets').first<{ sealed: string }>()
 requireThat(row, 'Reconnect Google Sheets; no offline OAuth grant is stored', 409)
 try { return sheetCredentials(JSON.parse(await openConnection(env.SESSION_SECRET, row.sealed, PURPOSE, 'Google Sheets'))) }
 catch { throw new Error('Google Sheets credential could not be opened; reconnect in Connections') }
}

export async function sheetAccessToken(c: Context, env: Bindings) {
 sheetAuthority(c)
 requireThat(find(c.s, 'connection', 'sheets')?.connected, 'Connect Google Sheets in Settings → Connections before linking a range', 409)
 return refreshSheetToken(await storedSheetCredentials(c, env))
}

async function revokeSheet(c: Context, env: Bindings) {
 const outcome = { status: 'not-confirmed', result: 'unreachable', at: c.now, origin: 'https://oauth2.googleapis.com', httpStatus: null as number | null }
 const row = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('sheets').first()
 if (!row) return { ...outcome, result: 'no-local-credential' }
 let credentials: SheetCredentials
 try { credentials = await storedSheetCredentials(c, env) }
 catch { return { ...outcome, result: 'credential-unavailable' } }
 try {
  const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: credentials.refreshToken }), redirect: 'manual', signal: AbortSignal.timeout(15000) })
  outcome.httpStatus = response.status
  outcome.result = response.status === 200 ? 'confirmed' : 'refused'
  if (response.status === 200) outcome.status = 'confirmed'
  await response.body?.cancel()
 } catch { /* Local deletion proceeds without retaining provider bodies or secrets. */ }
 return outcome
}

/** Caller saves returned secret statements with the model/session revision fence. */
export async function sheetConnection(c: Context, env: Bindings, op: string, b: Data): Promise<D1PreparedStatement[]> {
 sheetAuthority(c)
 requireThat(!c.x.actor.scheduler, 'Use a signed-in finance session to administer Google Sheets credentials', 403)
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown Google Sheets connection action', 404)
 const prior = find(c.s, 'connection', 'sheets')
 if (op === 'disconnect') {
  const providerRevocation = await revokeSheet(c, env)
  for (const link of all(c.s, 'sheet-link').filter(link => link.enabled)) {
   put(c.s, 'sheet-link', link.id, { ...link, enabled: false, revision: link.revision + 1, updatedAt: c.now, updatedBy: c.x.actor.email })
   c.activity.push({ action: 'sheet-link-disabled-on-disconnect', record: link.id, scenario: link.scenario, detail: {} })
  }
  put(c.s, 'connection', 'sheets', { ...prior, connected: false, disconnectedAt: c.now, providerRevocation, error: providerRevocation.status === 'confirmed' ? null : SHEET_REVOCATION_WARNING, rateLimit: null })
  c.activity.push({ action: 'sheets-disconnected', record: 'sheets', detail: { providerRevocation } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('sheets')]
 }
 const credentials = sheetCredentials(b)
 await refreshSheetToken(credentials)
 const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify(credentials), PURPOSE)
 put(c.s, 'connection', 'sheets', { connected: true, owner: c.x.actor.email, connectedAt: c.now, scope: SHEET_SCOPE, schedule: 'Per linked range', lastRefresh: null, rowCount: 0, error: null, rateLimit: null })
 c.activity.push({ action: 'sheets-connected', record: 'sheets', detail: { scope: SHEET_SCOPE } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('sheets', sealed)]
}
