// REPORT-003 file stores. Google Drive and SharePoint (Microsoft Graph) use
// fixed provider origins; Chest uses an owner-entered address under the
// EGRESS RULE (egress.ts: literal host and name checks only, resolved-address
// pinning is the open Gap). Credentials never enter URLs, errors or logs, and
// the provider's body is never echoed.
import { egressFetch, ownerDestination } from './egress'
import { Fault, requireThat, text, type Data } from './types'

export const STORES = ['chest', 'drive', 'sharepoint'] as const
export type Store = typeof STORES[number]
export const STORE_LABEL: Record<Store, string> = { chest: 'Chest', drive: 'Google Drive', sharepoint: 'SharePoint' }
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const storePurpose = (store: Store) => `easel:pack-store:${store}:write:v1`
export type StoreResult = { remoteId: string; name: string; bytes: number }

const token = (v: unknown, label: string) => { const t = text(v, label, 4096); requireThat(/^[\x21-\x7e]+$/.test(t), `${label} cannot contain spaces or control characters`); return t }
const id = (v: unknown, label: string) => { const t = text(v, label, 200); requireThat(/^[A-Za-z0-9._!,-]+$/.test(t), `${label} uses letters, digits and . _ ! , -`); return t }
export function storeCredentials(store: Store, b: Data): { secret: Data; destination: Data; label: string } {
 if (store === 'drive') return { secret: { clientId: token(b.clientId, 'Google OAuth client ID'), clientSecret: token(b.clientSecret, 'Google OAuth client secret'), refreshToken: token(b.refreshToken, 'Google refresh token') }, destination: { folderId: id(b.folderId, 'Drive folder ID') }, label: `Drive folder ${b.folderId}` }
 if (store === 'sharepoint') {
  const folderPath = text(b.folderPath, 'Library folder', 300).replace(/^\/+|\/+$/g, '')
  requireThat(folderPath.length > 0 && folderPath.split('/').every(p => p && p !== '.' && p !== '..' && !/[\\:*?"<>|#%]/.test(p)), 'Use a library folder path such as Board packs/2026')
  return { secret: { tenant: id(b.tenant, 'Microsoft tenant ID'), clientId: token(b.clientId, 'Microsoft application ID'), clientSecret: token(b.clientSecret, 'Microsoft client secret') }, destination: { driveId: id(b.driveId, 'SharePoint library (drive) ID'), folderPath }, label: `SharePoint library ${b.driveId}/${folderPath}` }
 }
 const origin = ownerDestination(b.origin, 'Chest address')
 return { secret: { accessToken: token(b.accessToken, 'Chest integration token') }, destination: { origin: origin.origin, folderId: id(b.folderId, 'Chest folder ID') }, label: `Chest ${origin.host} folder ${b.folderId}` }
}

async function boundedJSON(response: Response, what: string): Promise<Data> {
 const length = response.headers.get('content-length')
 requireThat(length === null || (/^\d+$/.test(length) && Number(length) <= 262144), `${what} response is too large`, 502)
 let value: unknown
 try { value = JSON.parse((await response.text()).slice(0, 262144)) } catch { throw new Fault(502, `${what} returned invalid JSON; nothing was confirmed as saved`) }
 requireThat(value && typeof value === 'object' && !Array.isArray(value), `${what} returned invalid data`, 502)
 return value as Data
}
async function send(url: URL | string, init: RequestInit, what: string, fetcher: typeof fetch = (u, i) => fetch(u, { ...i, redirect: 'manual', signal: AbortSignal.timeout(20000) })): Promise<Data> {
 let response: Response
 try { response = await fetcher(url as any, init) } catch { throw new Fault(502, `${what} could not be reached; nothing was saved`) }
 if (!response.ok) { await response.body?.cancel(); throw new Fault(502, `${what} refused the request (HTTP ${response.status}); nothing was saved`) }
 return boundedJSON(response, what)
}
const base64 = (bytes: Uint8Array) => { let out = ''; for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(out) }
const accessToken = async (data: Data, what: string) => { requireThat(typeof data.access_token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(data.access_token) && /^Bearer$/i.test(String(data.token_type)), `${what} returned an invalid access token; reconnect`, 502); return data.access_token as string }

export async function driveAccess(secret: Data) {
 const data = await send('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }) }, 'Google')
 requireThat(data.scope === undefined || data.scope === DRIVE_SCOPE, 'Use a Google grant with only the drive.file scope; reconnect Google Drive', 409)
 return accessToken(data, 'Google')
}
export async function sharepointAccess(secret: Data) {
 const data = await send(`https://login.microsoftonline.com/${encodeURIComponent(secret.tenant)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }) }, 'Microsoft')
 return accessToken(data, 'Microsoft')
}

export async function uploadFile(store: Store, secret: Data, destination: Data, name: string, mime: string, bytes: Uint8Array, digest: string, idempotency: string): Promise<StoreResult> {
 const confirm = (result: Data, remoteId: unknown, size: unknown, remoteDigest?: unknown): StoreResult => {
  requireThat(typeof remoteId === 'string' && remoteId.length > 0 && remoteId.length < 400, `${STORE_LABEL[store]} did not return the saved file`, 502)
  requireThat(size === bytes.length, `${STORE_LABEL[store]} stored a different size than the file sent; the save is not confirmed`, 502)
  requireThat(remoteDigest === undefined || remoteDigest === digest, `${STORE_LABEL[store]} stored different bytes than the file sent; the save is not confirmed`, 502)
  return { remoteId: remoteId as string, name, bytes: bytes.length }
 }
 if (store === 'drive') {
  const access = await driveAccess(secret), boundary = `easel-${digest.slice(0, 24)}`
  const head = new TextEncoder().encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [destination.folderId], mimeType: mime })}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`)
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length); body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length)
  const result = await send('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,sha256Checksum', { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': `multipart/related; boundary=${boundary}` }, body: body as unknown as BodyInit }, 'Google Drive')
  return confirm(result, result.id, Number(result.size), result.sha256Checksum)
 }
 if (store === 'sharepoint') {
  const access = await sharepointAccess(secret)
  const path = (destination.folderPath as string).split('/').concat(name).map(encodeURIComponent).join('/')
  const result = await send(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(destination.driveId)}/root:/${path}:/content?@microsoft.graph.conflictBehavior=fail`, { method: 'PUT', headers: { authorization: `Bearer ${access}`, 'content-type': mime }, body: bytes as unknown as BodyInit }, 'SharePoint')
  return confirm(result, result.id, result.size)
 }
 const url = new URL('/api/chest/integrations/v1/items', ownerDestination(destination.origin, 'Chest address'))
 const result = await send(url, { method: 'POST', headers: { authorization: `Bearer ${secret.accessToken}`, 'content-type': 'application/json', 'idempotency-key': idempotency }, body: JSON.stringify({ parent: destination.folderId, name, base64: base64(bytes) }) }, 'Chest', (u, i) => egressFetch(new URL(u as any), i!))
 return confirm(result, result.id, result.size, result.sha256)
}
