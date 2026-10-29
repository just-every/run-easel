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
   const response = await fetch(origin + '/send', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://127.0.0.1/', headers: {}, body: '' }) })
   assert.equal(response.status, 400, 'The real gateway refuses a private destination before transport')
   const unsigned = await fetch(origin + '/send', { method: 'POST', body: '{}' })
   assert.equal(unsigned.status, 401, 'The gateway authenticates its Worker caller')
  }, async close() { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)) },
 }
}
