// REPORT-003: saving a published pack's PDF to Chest, Google Drive or
// SharePoint. Finance connects each store with credentials that are sealed,
// never archived and never returned; a save is an explicit finance action
// from a signed-in session, uploads the same PDF bytes the download door
// serves, and records the digest and the store's receipt.
import { runtimeBindings, type Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { scopedReader } from './group-projections'
import { packFileName, renderPack } from './pack-formats'
import { driveAccess, sharepointAccess, STORE_LABEL, STORES, storeCredentials, storePurpose, uploadFile, type Store } from './pack-store-provider'
import { sha256Bytes, snapshot } from './store'
import { Fault, choice, find, get, put, requireThat, type Data } from './types'
import { paySafePack } from './views'
import { egressFetch, ownerDestination } from './egress'

const secretId = (store: Store) => `pack-store:${store}`
function authority(c: Context) {
 requireCapability(c.x, 'publishing', c.s)
 requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x), 'Use a native finance session with company-wide access for pack storage', 403)
}

export async function packStoreStatus(c: Context) {
 authority(c)
 return Promise.all(STORES.map(async store => {
  const row = find(c.s, 'connection', secretId(store)), stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(secretId(store)).first()
  return { store, label: STORE_LABEL[store], connected: Boolean(stored && row?.connected), destination: row?.connected ? row.destination : null, owner: row?.owner ?? null, connectedAt: row?.connectedAt ?? null, error: row?.connected && !stored ? `Reconnect ${STORE_LABEL[store]} after restore; credentials are excluded from archives` : null }
 }))
}

export async function packStoreConnection(c: Context, env: Bindings, store: string, op: string, b: Data): Promise<D1PreparedStatement[]> {
 authority(c)
 const name = choice(store, STORES, 'a file store')
 requireThat(op === 'connect' || op === 'disconnect', 'Unknown file store action', 404)
 const id = secretId(name)
 if (op === 'disconnect') {
  put(c.s, 'connection', id, { ...find(c.s, 'connection', id), connected: false, disconnectedAt: c.now })
  c.activity.push({ action: 'pack-store-disconnected', record: id, detail: { store: name } })
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind(id)]
 }
 const { secret, destination, label } = storeCredentials(name, b)
 // Validate the grant before sealing it; nothing is written to the store.
 if (name === 'drive') await driveAccess(secret)
 else if (name === 'sharepoint') await sharepointAccess(secret)
 else {
  const url = new URL(`/api/chest/integrations/v1/items/${encodeURIComponent(destination.folderId)}`, ownerDestination(destination.origin, 'Chest address'))
  let response: Response
  try { response = await egressFetch(url, { headers: { authorization: `Bearer ${secret.accessToken}` } }) } catch { throw new Fault(502, 'Chest could not be reached; nothing was connected') }
  await response.body?.cancel()
  requireThat(response.ok, `Chest refused the folder (HTTP ${response.status}); check the token and folder`, 409)
 }
 const sealed = await sealConnection(env.SESSION_SECRET, JSON.stringify({ secret, destination }), storePurpose(name))
 put(c.s, 'connection', id, { connected: true, store: name, destination: label, owner: c.x.actor.email, connectedAt: c.now })
 c.activity.push({ action: 'pack-store-connected', record: id, detail: { store: name, destination: label } })
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind(id, sealed)]
}

/** The connected store's destination and its unsealed credentials. */
export async function storeCustody(c: Context, env: Bindings, name: Store) {
 const row = find(c.s, 'connection', secretId(name)), stored = await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(secretId(name)).first<{ sealed: string }>()
 requireThat(row?.connected && stored, `Connect ${STORE_LABEL[name]} before saving to it`, 409)
 try { return { row, custody: JSON.parse(await openConnection(runtimeBindings(env).SESSION_SECRET, stored.sealed, storePurpose(name), STORE_LABEL[name])) as Data } } catch { throw new Fault(409, `${STORE_LABEL[name]} credentials could not be opened; reconnect`) }
}

/** Uploads the published pack's PDF once per pack and store; a repeat returns the recorded receipt. */
export async function packSave(c: Context, env: Bindings, packId: string, store: unknown) {
 authority(c)
 const name = choice(store, STORES, 'a file store')
 const pack = get(c.s, 'pack', packId, 'pack')
 requireThat(pack.status === 'published', 'Publish the pack before saving it to a file store', 409)
 const prior = find(c.s, 'pack-save', `${pack.id}|${name}`)
 if (prior) return { ...prior, repeated: true }
 const { row, custody } = await storeCustody(c, env, name)
 const sn = paySafePack(await snapshot(c.db, pack.snapshot))
 const bytes = renderPack(sn, 'pdf') as Uint8Array, digest = await sha256Bytes(bytes)
 const result = await uploadFile(name, custody.secret, custody.destination, packFileName(sn, 'pdf'), 'application/pdf', bytes, digest, `easel-pack-${pack.id}`)
 put(c.s, 'pack-save', `${pack.id}|${name}`, { pack: pack.id, store: name, destination: row.destination, digest, bytes: result.bytes, remoteId: result.remoteId, file: result.name, savedBy: c.x.actor.email, savedAt: c.now })
 c.activity.push({ action: 'pack-saved', record: pack.id, detail: { store: name, digest, remoteId: result.remoteId } })
 return get(c.s, 'pack-save', `${pack.id}|${name}`)
}
