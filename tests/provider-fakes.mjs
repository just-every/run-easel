import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const DRIVE = 'https://www.googleapis.com/auth/drive.file', BIGQUERY = 'https://www.googleapis.com/auth/bigquery.readonly'

/** One provider fake for every outbound call a flow test makes: Google (token, Drive upload, BigQuery), Microsoft (token, Graph upload), Snowflake, Databricks and a Chest at an owner-entered address. */
export function providerFakes() {
 const saved = { drive: [], sharepoint: [], chest: [] }, calls = [], queries = [], warehouse = { snowflake: [], bigquery: [], databricks: [] }
 const multipartFile = (request, bytes) => {
  const boundary = request.headers.get('content-type').match(/boundary=(.+)$/)[1], text = Buffer.from(bytes).toString('latin1')
  const parts = text.split(`--${boundary}`).filter(p => p.includes('\r\n\r\n'))
  const [meta, file] = parts.map(p => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''))
  return { meta: JSON.parse(meta), bytes: Buffer.from(file, 'latin1') }
 }
 const outbound = async request => {
  const url = new URL(request.url); calls.push(`${request.method} ${url.origin}${url.pathname}`)
  if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
   const form = new URLSearchParams(await request.text()), refresh = form.get('refresh_token')
   assert.ok(['synthetic-easel-1', 'synthetic-easel-bq'].includes(refresh))
   return Response.json({ access_token: refresh === 'synthetic-easel-bq' ? 'synthetic-easel-token-bq' : 'synthetic-easel-token-g', token_type: 'Bearer', expires_in: 3600, scope: refresh === 'synthetic-easel-bq' ? BIGQUERY : DRIVE })
  }
  if (url.origin === 'https://login.microsoftonline.com') return Response.json({ access_token: 'synthetic-easel-token-m', token_type: 'Bearer', expires_in: 3600 })
  if (url.origin === 'https://www.googleapis.com') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-token-g')
   const { meta, bytes } = multipartFile(request, await request.arrayBuffer())
   assert.deepEqual(meta.parents, ['synthetic-easel-folder']); saved.drive.push({ name: meta.name, bytes })
   return Response.json({ id: `drive-file-${saved.drive.length}`, name: meta.name, size: String(bytes.length), sha256Checksum: sha(bytes) })
  }
  if (url.origin === 'https://graph.microsoft.com') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-token-m')
   const bytes = Buffer.from(await request.arrayBuffer()); saved.sharepoint.push({ path: decodeURIComponent(url.pathname), bytes })
   return Response.json({ id: `sharepoint-item-${saved.sharepoint.length}`, name: url.pathname.split('/').at(-1).replace(':', ''), size: bytes.length })
  }
  if (url.origin === 'https://chest.synthetic-easel.example') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-chest')
   if (request.method === 'GET') return Response.json({ id: 'synthetic-easel-chest-folder' })
   const body = await request.json(), bytes = Buffer.from(body.base64, 'base64')
   assert.match(request.headers.get('idempotency-key'), /^easel-/)
   saved.chest.push({ parent: body.parent, name: body.name, bytes })
   return Response.json({ id: `chest-item-${saved.chest.length}`, name: body.name, size: bytes.length, sha256: sha(bytes) })
  }
  if (url.origin === 'https://acme-prod.us-east-1.snowflakecomputing.com') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-sf'); const body = await request.json(); queries.push(body.statement)
   return Response.json({ resultSetMetaData: { rowType: [{ name: 'PERIOD' }, { name: 'VALUE' }], partitionInfo: [{}] }, data: warehouse.snowflake.map(r => [r.period, String(r.value)]) })
  }
  if (url.origin === 'https://bigquery.googleapis.com') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-token-bq'); assert.equal(url.pathname, '/bigquery/v2/projects/synthetic-easel-proj/queries'); queries.push((await request.json()).query)
   return Response.json({ jobComplete: true, schema: { fields: [{ name: 'period' }, { name: 'value' }] }, rows: warehouse.bigquery.map(r => ({ f: [{ v: r.period }, { v: String(r.value) }] })) })
  }
  if (url.origin === 'https://dbc-1234.cloud.databricks.com') {
   assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-dbx'); const body = await request.json(); assert.equal(body.warehouse_id, 'synthetic-easel-wh'); queries.push(body.statement)
   return Response.json({ status: { state: 'SUCCEEDED' }, manifest: { schema: { columns: [{ name: 'period' }, { name: 'value' }] } }, result: { data_array: warehouse.databricks.map(r => [r.period, String(r.value)]) } })
  }
  return new Response('unexpected', { status: 599 })
 }
 return { saved, calls, queries, warehouse, outbound }
}
