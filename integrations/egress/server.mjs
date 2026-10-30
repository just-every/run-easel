// Deployment-owned egress gateway. Run behind verified HTTPS termination;
// bind only to loopback by default. Receiver DNS/TLS stays in Base's enforcing
// transport, never ordinary fetch. No receiver response body is returned/logged.
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { NodePinnedTransport } from '@runeditrun/rer/internal/modules/integrations/core/node-transport.ts'
import { webhookDestination } from '../../src/easel/webhook-destination.ts'

export function createEgressGateway({ token, hosts, transport = new NodePinnedTransport({ timeoutMs: 10000, maxResponseBytes: 65536 }) }) {
 if (typeof token !== 'string' || token.length < 32 || !Array.isArray(hosts) || !hosts.length) throw new Error('Configure gateway authentication and exact public receiver hosts')
 const authorized = value => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength('Bearer ' + token) && timingSafeEqual(Buffer.from(value), Buffer.from('Bearer ' + token))
 return createServer(async (request, response) => {
  const reply = (status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)) }
  if (request.method !== 'POST' || request.url !== '/send') { reply(404, { error: 'not_found' }); return }
  if (!authorized(request.headers.authorization)) { reply(401, { error: 'unauthorized' }); return }
  let wire
  try {
   const chunks = []; let bytes = 0
   for await (const chunk of request) { bytes += chunk.length; if (bytes > 32768) throw new Error(); chunks.push(chunk) }
   wire = JSON.parse(Buffer.concat(chunks).toString('utf8'))
   const url = webhookDestination(wire.url)
   if (!hosts.includes(url.hostname) || url.search || typeof wire.body !== 'string' || Buffer.byteLength(wire.body) > 16384) throw new Error()
   const allowed = ['content-type','x-easel-event-id','x-easel-timestamp','x-easel-signature']
   if (!wire.headers || Object.keys(wire.headers).length !== allowed.length || !allowed.every(name => typeof wire.headers[name] === 'string' && wire.headers[name].length <= 200 && !/[\r\n]/.test(wire.headers[name]))) throw new Error()
  } catch { reply(400, { error: 'destination_or_request_refused' }); return }
  try {
   // The default transport resolves every address, refuses all private/reserved
   // answers, pins the chosen address to TLS lookup, verifies the original SNI
   // and certificate, bounds body/time, and never follows redirects.
   const result = await transport.send(wire)
   const retry = result.headers['retry-after'] ?? ''
   reply(200, { outcome: 'response', status: result.status, retryAfter: retry.length <= 100 && (/^\d+$/.test(retry) || Number.isFinite(Date.parse(retry))) ? retry : '' })
  } catch { reply(200, { outcome: 'uncertain' }) }
 })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const server = createEgressGateway({ token: process.env.EASEL_WEBHOOK_EGRESS_TOKEN, hosts: (process.env.EASEL_WEBHOOK_HOSTS ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean) })
 const port = Number(process.env.EASEL_EGRESS_PORT ?? 8080)
 if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid gateway port')
 server.listen(port, '127.0.0.1')
}
