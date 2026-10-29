// The paid/network edge only: real gateway HTTP parsing and real Easel/Crank
// HTTP semantics; the gateway's final DNS/TLS receiver transport is recorded.
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const bundled = await build({ entryPoints: [fileURLToPath(new URL('../integrations/egress/server.mjs', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { createEgressGateway } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
export async function automationEdge(send) {
 const token = randomBytes(32).toString('hex')
 const gateway = createEgressGateway({ token, hosts: ['receiver.example.com','crank.example.com'], transport: { send } })
 await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve))
 const origin = `http://127.0.0.1:${gateway.address().port}`
 return { bindings: { EASEL_WEBHOOK_EGRESS_URL: 'https://egress.example.com/send', EASEL_WEBHOOK_EGRESS_TOKEN: token },
  async outbound(request) {
   if (new URL(request.url).hostname !== 'egress.example.com') return new Response('provider unavailable', { status: 503 })
   return fetch(origin + '/send', { method: 'POST', headers: { authorization: request.headers.get('authorization'), 'content-type': 'application/json' }, body: await request.text(), redirect: 'manual' })
  }, async assertRefused(assert) {
   // Use a complete wire request and explicitly allowlist the destinations:
   // refusal must come from destination policy, not missing headers/allowlist.
   const refused = ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/', 'https://192.0.2.1/', 'https://[fc00::1]/', 'https://[fe80::1]/', 'https://router.home.arpa/', 'https://HOME.ARPA/', 'https://printer.local/', 'https://router.lan/', 'https://router.home/', 'https://router.internal/', 'https://receiver.test/', 'https://receiver.invalid/', 'https://receiver.onion/', 'https://receiver.alt/', 'https://receiver.example/', 'http://receiver.example.com/', 'https://user:password@receiver.example.com/', 'https://receiver.example.com/#fragment']
   const enforcing = createEgressGateway({ token, hosts: refused.map(value => new URL(value).hostname) })
   await new Promise(resolve => enforcing.listen(0, '127.0.0.1', resolve))
   try {
    for (const url of refused) {
     const response = await fetch(`http://127.0.0.1:${enforcing.address().port}/send`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ url, headers: { 'content-type': 'application/json', 'x-easel-event-id': 'recorded-event', 'x-easel-timestamp': '1', 'x-easel-signature': 'v1=recorded' }, body: '{}' }) })
     assert.equal(response.status, 400, `The production gateway refuses ${url} before DNS/TLS transport`)
    }
   } finally { enforcing.closeAllConnections(); await new Promise(resolve => enforcing.close(resolve)) }
   const unsigned = await fetch(origin + '/send', { method: 'POST', body: '{}' })
   assert.equal(unsigned.status, 401, 'The gateway authenticates its Worker caller')
  }, async close() { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)) },
 }
}
