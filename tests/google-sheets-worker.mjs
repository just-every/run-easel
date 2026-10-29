// Separate event loop so the synchronous Apps Script UrlFetch boundary can call
// a genuinely running Worker over HTTP while the harness itself is synchronous.
import { parentPort } from 'node:worker_threads'
import { harness } from './harness.mjs'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
const h = await harness({ now: () => '2026-01-15T12:00:00.000Z' })
await h.mf.ready
parentPort.postMessage({ origin: h.origin, owner: h.owner })
parentPort.on('message', async ({ id, method, args }) => {
 try {
  if (method === 'close') { await h.close(); parentPort.postMessage({ id, value: true }); parentPort.close(); return }
  if (method === 'portableArchive') {
   const service = await createPortability({ db: h.db, policy: easelPolicy }), archive = await service.exports.create()
   try { while ((await service.exports.advance(archive, { maxParts: 16 })).phase === 'building') {}
    parentPort.postMessage({ id, value: await new Response(await service.exports.download(archive)).text() })
   } finally { await service.exports.abort(archive) }
   return
  }
  const value = method === 'secretRows' ? await h.db.prepare('SELECT id,sealed FROM e_connection_secrets').all()

   : await h[method](...args)
  parentPort.postMessage({ id, value })
 } catch (error) { parentPort.postMessage({ id, error: error.stack }) }
})
