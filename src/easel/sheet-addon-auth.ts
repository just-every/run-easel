// A one-purpose, person-and-spreadsheet-bound credential. No general API token
// or browser session is copied into a Google document.
import type { Bindings } from '../auth.server'
import { openConnection } from './connection-seal'
import { requireThat, type Actor } from './types'

export const ADDON_PURPOSE = 'easel:google-sheets-addon:person-key:v1'
export const addonSecretId = (id: string) => `sheets-addon:${id}`
export async function sheetAddonActor(request: Request, env: Bindings): Promise<Actor> {
 const path = new URL(request.url).pathname
 requireThat(/^\/api\/easel\/google-sheets\/(refresh|write|session|health)$/.test(path), 'This credential is only for the Google Sheets add-on', 403)
 requireThat(!request.headers.has('authorization'), 'Choose one sign-in method', 403)
 const key = request.headers.get('x-easel-sheets-key') ?? ''
 const match = /^easgs_([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(key)
 requireThat(match, 'Invalid Google Sheets connection', 401)
 const row = await env.DB.prepare(`SELECT r.revision,r.value,s.sealed,o.id AS operator_id,o.email,o.display_name,o.role,o.version,o.status
  FROM e_records r JOIN e_connection_secrets s ON s.id='sheets-addon:'||r.id
  JOIN oa_operators o ON o.id=json_extract(r.value,'$.operator') WHERE r.kind='sheet-addon' AND r.id=?`).bind(match[1]).first<any>()
 requireThat(row, 'Reconnect the Google Sheets add-on in Easel Connections', 401)
 const grant = JSON.parse(row.value)
 requireThat(grant.connected && grant.expiresAt > Date.now() && row.status === 'active' && row.version === grant.operatorVersion, 'This Google Sheets connection expired or its person changed; reconnect in Easel', 401)
 requireThat(request.headers.get('x-easel-spreadsheet') === grant.spreadsheet, 'This connection belongs to another spreadsheet', 403)
 let stored = ''
 try { stored = await openConnection(env.SESSION_SECRET, row.sealed, ADDON_PURPOSE, 'Google Sheets add-on') }
 catch { requireThat(false, 'Reconnect the Google Sheets add-on after restoring this installation', 401) }
 let difference = stored.length ^ key.length
 for (let i = 0; i < Math.max(stored.length, key.length); i++) difference |= (stored.charCodeAt(i) || 0) ^ (key.charCodeAt(i) || 0)
 requireThat(difference === 0, 'Invalid Google Sheets connection', 401)
 return { id: row.operator_id, email: row.email, name: row.display_name, session: '', version: row.version, baseRole: row.role,
  sheetAddon: { id: match[1], recordRevision: row.revision, spreadsheet: grant.spreadsheet, role: grant.role, departments: grant.departments, payDetail: grant.payDetail, grants: grant.grants } }
}

// The same fence runs before and after each D1 batch/read. Disconnect, expiry,
// replacement, restore and native account revocation all invalidate it.
export function sheetAddonAuthority(a: Actor, finance = false) {
 const key = a.sheetAddon!
 return { sql: `EXISTS(SELECT 1 FROM e_records r JOIN e_connection_secrets s ON s.id='sheets-addon:'||r.id
  JOIN oa_operators o ON o.id=json_extract(r.value,'$.operator') WHERE r.kind='sheet-addon' AND r.id=? AND r.revision=?
  AND o.id=? AND o.version=? AND o.role=? AND o.status='active' AND json_extract(r.value,'$.connected')=1
  AND json_extract(r.value,'$.expiresAt')>unixepoch()*1000${finance ? " AND o.role IN ('owner','admin')" : ''})`,
  params: [key.id, key.recordRevision, a.id, a.version, a.baseRole] }
}
