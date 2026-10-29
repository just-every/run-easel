import type { Bindings } from '../auth.server'
import { access, grantCeiling, requireCapability, requireFinance, requireMember } from './access'
import { sealConnection } from './connection-seal'
import type { Context } from './context'
import { spreadsheetValues, spreadsheetWrite } from './excel'
import { officeReport } from './office-report'
import { ADDON_PURPOSE, addonSecretId } from './sheet-addon-auth'
import { all, choice, Fault, find, get, integer, put, requireThat, text, uid, type Actor, type Data } from './types'

export const ADDON_SCOPE = 'Aggregate plan cells and saved-report ranges; optional existing-input write-back with live person authority'
function nativeFinance(c: Context) {
 requireFinance(c.x); requireCapability(c.x, 'connections')
 requireThat(!c.x.actor.token && !c.x.actor.sheetAddon && !c.x.actor.agent && !c.x.actor.scheduler, 'Use a signed-in finance session to administer the Google Sheets add-on', 403)
}
export async function sheetAddonStatus(c: Context) {
 nativeFinance(c)
 const { results } = await c.db.prepare("SELECT id FROM e_connection_secrets WHERE id LIKE 'sheets-addon:%'").all<{id:string}>()
 const stored = new Set(results.map(r => r.id))
 return { scope: ADDON_SCOPE, connections: all(c.s, 'sheet-addon').map(row => ({
  id: row.id, label: row.label, person: row.person, owner: row.owner, spreadsheet: row.spreadsheet,
  configured: row.connected, awaitingConfirmation: row.connected && !row.confirmedAt, connected: row.connected && stored.has(addonSecretId(row.id)) && row.expiresAt > Date.now(), credential: stored.has(addonSecretId(row.id)) ? `••••${row.suffix}` : null,
  schedule: row.schedule, writeBack: row.writeBack, scope: ADDON_SCOPE, expiresAt: row.expiresAt,
  connectedAt: row.connectedAt, disconnectedAt: row.disconnectedAt ?? null,
  ...find(c.s, 'sheet-addon-health', row.id),
  error: row.connected && row.expiresAt <= Date.now() ? 'Connection expired; create a new key in Easel' : row.connected && row.confirmedAt && !stored.has(addonSecretId(row.id)) ? 'Reconnect after restore; add-on credentials are excluded from archives' : find(c.s, 'sheet-addon-health', row.id)?.error ?? null,
  providerRevocation: row.providerRevocation ?? null,
 })) }
}
export async function sheetAddonConnection(c: Context, env: Bindings, op: string, b: Data): Promise<Data> {
 if (op === 'claim') {
  const row = addonPairing(c, String(b.id))
  requireThat(!row.confirmedAt, 'This key was already claimed; ask finance for a new connection if it was lost', 409)
  const id = row.id, secret = `easgs_${id}.${[...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('')}`
  const sealed = await sealConnection(env.SESSION_SECRET, secret, ADDON_PURPOSE)
  put(c.s, 'sheet-addon', id, { ...get(c.s, 'sheet-addon', id), confirmedAt: c.now, suffix: secret.slice(-4) })
  c.extra = [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?)').bind(addonSecretId(id), sealed)]
  c.activity.push({ action: 'sheets-addon-claimed', record: id, detail: { person: c.x.actor.email, spreadsheet: row.spreadsheet } })
  return { id, key: secret }
 }
 nativeFinance(c)
 if (op === 'connect') {
  const label = text(b.label, 'Connection name', 100), person = text(b.person, 'Person email').toLowerCase()
  const spreadsheet = text(b.spreadsheet, 'Google spreadsheet ID', 150)
  requireThat(/^[A-Za-z0-9_-]{10,150}$/.test(spreadsheet), 'Use the spreadsheet ID from its Google Sheets URL')
  const operator = await c.db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active'").bind(person).first<any>()
  requireThat(operator, 'That person must sign in to Easel before finance connects their add-on', 409)
  const a: Actor = { id: operator.id, email: operator.email, name: operator.display_name, version: operator.version, baseRole: operator.role, session: '' }
  const x = access(c.s, a); requireMember(x)
  const schedule = choice(b.schedule, ['manual', 'hourly'] as const, 'refresh schedule')
  const expiresInDays = integer(b.expiresInDays ?? 30, 'Connection lifetime in days', 1, 365)
  const id = uid()
  put(c.s, 'sheet-addon', id, { label, person, owner: c.x.actor.email, operator: a.id, operatorVersion: a.version, spreadsheet, connected: true,
   role: x.role, departments: x.departments, payDetail: x.payDetail === true, grants: grantCeiling(x, c.s),
   writeBack: b.writeBack === true && x.role !== 'viewer', schedule, confirmedAt: null, expiresAt: Date.now() + expiresInDays * 86400000, connectedAt: c.now })
  c.activity.push({ action: 'sheets-addon-connected', record: id, detail: { person, spreadsheet, scope: ADDON_SCOPE, schedule } })
  return { id, confirmationPath: `/google-sheets/Connect.html?id=${encodeURIComponent(id)}` }
 }
 requireThat(op === 'disconnect' || op === 'schedule', 'Unknown add-on connection action', 404)
 const row = get(c.s, 'sheet-addon', b.id)
 if (op === 'schedule') {
  requireThat(row.connected, 'Reconnect this add-on before changing its schedule', 409)
  const schedule = choice(b.schedule, ['manual', 'hourly'] as const, 'refresh schedule')
  put(c.s, 'sheet-addon', row.id, { ...row, schedule })
  c.activity.push({ action: 'sheets-addon-schedule', record: row.id, detail: { schedule } })
 } else {
  // Easel issues this key and is its revocation authority. No Google OAuth
  // refresh token is held, and Google authorization is never claimed revoked.
  const providerRevocation = { status: 'confirmed', provider: 'Easel add-on key', at: c.now,
   ownerAction: 'Remove the add-on authorization in Google Account → Security → Third-party connections; remove its Apps Script triggers in Google' }
  put(c.s, 'sheet-addon', row.id, { ...row, connected: false, schedule: 'manual', disconnectedAt: c.now, providerRevocation })
  c.extra = [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(addonSecretId(row.id))]
  c.activity.push({ action: 'sheets-addon-disconnected', record: row.id, detail: { providerRevocation } })
 }
 return { id: row.id }
}
export function addonSession(c: Context) {
 requireMember(c.x)
 requireThat(c.x.actor.sheetAddon, 'Use the connected Apps Script add-on', 403)
 const connection = get(c.s, 'sheet-addon', c.x.actor.sheetAddon.id)
 return { person: c.x.actor.email, role: c.x.role, spreadsheet: connection.spreadsheet, schedule: connection.schedule, writeBack: connection.writeBack && c.x.role !== 'viewer' }
}
export async function addonRefresh(c: Context, b: Data) {
 const session = addonSession(c)
 const reason = choice(b.reason, ['menu', 'open', 'trigger'] as const, 'refresh reason')
 requireThat(reason !== 'trigger' || session.schedule === 'hourly', 'Finance has disabled scheduled refresh for this connection', 403)
 requireThat(Array.isArray(b.bindings) && b.bindings.length <= 100, 'Refresh at most 100 Easel bindings at a time')
 const values: Data[] = []
 for (const binding of b.bindings) {
  requireThat(binding && typeof binding === 'object' && !Array.isArray(binding), 'Choose a valid Easel binding')
  const key = text(binding.key, 'Binding key', 2000)
  try {
   if (binding.kind === 'value') values.push({ key, kind: 'value', ...await spreadsheetValues(c, text(binding.scenario, 'Scenario'), binding) })
   else {
    requireThat(binding.kind === 'report', 'Choose a value or report binding')
    const report = await officeReport(c, text(binding.report, 'Report'), { ...binding, kind: 'table' })
    values.push({ key, kind: 'report', table: report.table, currency: report.currency, revision: report.revision })
   }
  } catch (error) {
   if (!(error instanceof Fault)) throw error
   values.push({ key, unavailable: true, error: error.message, status: error.status })
  }
 }
 // A Google cache cell cannot contain more than 50,000 characters. Refuse an
 // oversized binding here so native health matches what the sheet can publish.
 for (let i = 0; i < values.length; i++) if (JSON.stringify(values[i]).length > 45000) {
  values[i] = { key: values[i].key, unavailable: true, error: 'Report is too large for a Google Sheets cache cell; choose a smaller report' }
 }
 const failed = values.filter(v => v.unavailable).length
 const prior = find(c.s, 'sheet-addon-health', c.x.actor.sheetAddon!.id)
 put(c.s, 'sheet-addon-health', sessionId(c), { lastAttempt: c.now, lastRefresh: failed ? prior?.lastRefresh ?? null : c.now, rowCount: values.length - failed,
  error: failed ? `${failed} Easel binding(s) unavailable; prior values cleared in the sheet` : null, rateLimit: null, reason })
 c.activity.push({ action: 'sheets-addon-refreshed', record: sessionId(c), detail: { reason, count: values.length, unavailable: failed } })
 return { ...session, values, refreshedAt: c.now }
}
const sessionId = (c: Context) => c.x.actor.sheetAddon!.id
// A client can report only its own connection's fixed failure categories, never
// response bodies, credentials or arbitrary provider text. The live save fence
// applies just as it does to refresh and write-back.
export function addonHealth(c: Context, b: Data) {
 addonSession(c)
 const reason = choice(b.reason, ['menu', 'open', 'trigger'] as const, 'refresh reason')
 const failure = choice(b.failure, ['http', 'transport', 'response', 'spreadsheet'] as const, 'refresh failure')
 const status = failure === 'http' ? integer(b.status, 'HTTP status', 100, 599) : null
 const retryAfter = status === 429 && b.retryAfter != null ? integer(b.retryAfter, 'Retry-After seconds', 0, 2147483647) : null
 const prior = find(c.s, 'sheet-addon-health', sessionId(c))
 const error = failure === 'http' ? `Add-on refresh refused (HTTP ${status}); cached values cleared`
  : failure === 'transport' ? 'Add-on could not reach Easel; cached values cleared'
  : failure === 'response' ? 'Add-on received an unreadable Easel response; cached values cleared'
  : 'Add-on could not refresh its spreadsheet bindings; cached Easel values unavailable'
 put(c.s, 'sheet-addon-health', sessionId(c), { lastAttempt: c.now, lastRefresh: prior?.lastRefresh ?? null, rowCount: 0,
  error, rateLimit: status === 429 ? `HTTP 429${retryAfter == null ? '; retry time not supplied' : `; retry after ${retryAfter} seconds`}` : null, reason,
  reportedBy: 'Apps Script' })
 c.activity.push({ action: 'sheets-addon-refresh-failed', record: sessionId(c), detail: { reason, failure, status, retryAfter } })
 return { recorded: true }
}
export async function addonWrite(c: Context, b: Data) {
 const session = addonSession(c)
 requireThat(session.writeBack, 'This connection does not allow write-back', 403)
 const result = await spreadsheetWrite(c, b, 'Google Sheets')
 return result.mode === 'proposal' ? { mode: 'proposal', proposal: { id: result.proposal.id, revision: result.proposal.revision }, targetRevision: result.targetRevision }
  : { mode: 'entry', scenario: { id: result.scenario.id, revision: result.scenario.revision } }
}

export function addonPairing(c: Context, id: string) {
 requireMember(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.sheetAddon && !c.x.actor.agent && !c.x.actor.scheduler, 'Sign in natively as the person named on this connection', 403)
 const row = get(c.s, 'sheet-addon', id)
 requireThat(row.operator === c.x.actor.id, 'Only the named person can confirm and claim this connection key', 403)
 requireThat(row.connected && row.expiresAt > Date.now() && row.operatorVersion === c.x.actor.version && row.role === c.x.role, 'This connection is no longer current; ask finance to create a new one', 409)
 return { id: row.id, label: row.label, person: row.person, owner: row.owner, spreadsheet: row.spreadsheet, schedule: row.schedule, writeBack: row.writeBack, scope: ADDON_SCOPE, confirmedAt: row.confirmedAt }
}
