import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'

/** Generated test keys sign real assertions; only provider network edges are replaced. */
export function mobilePushProvider() {
 const apple = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
 const firebase = generateKeyPairSync('rsa', { modulusLength: 2048 })
 const publicId = seed => createHash('sha256').update(seed).digest('hex').slice(0, 10).toUpperCase()
 const appleKey = publicId('synthetic-easel-803'), appleTeam = publicId('synthetic-easel-804')
 const pem = key => key.export({ type: 'pkcs8', format: 'pem' })
 const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString())
 const provider = {
  bindings: { EASEL_APNS_PRIVATE_KEY: pem(apple.privateKey), EASEL_APNS_KEY_ID: appleKey, EASEL_APNS_TEAM_ID: appleTeam, EASEL_APNS_TOPIC: 'com.example.easel', EASEL_FCM_SERVICE_ACCOUNT: JSON.stringify({ private_key: pem(firebase.privateKey), client_email: 'synthetic-easel-1@example.test', project_id: 'synthetic-easel-1' }) },
  requests: [], authorizations: [], mode: 'accepted', afterSend: null, afterAuthorize: null,
  async fetch(request) {
   const url = new URL(request.url)
   if (url.origin === 'https://oauth2.googleapis.com') {
    assert.equal(url.pathname, '/token')
    const form = new URLSearchParams(await request.text())
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [head, payload, signature] = form.get('assertion').split('.')
    const header = decode(head), claims = decode(payload)
    assert.equal(header.alg, 'RS256'); assert.ok(verify('RSA-SHA256', Buffer.from(`${head}.${payload}`), firebase.publicKey, Buffer.from(signature, 'base64url')), 'Google assertion signature verifies')
    assert.equal(claims.iss, 'synthetic-easel-1@example.test'); assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging'); assert.equal(claims.aud, 'https://oauth2.googleapis.com/token')
    assert.ok(claims.iat <= Math.floor(Date.now() / 1000) + 5 && claims.exp > claims.iat && claims.exp - claims.iat <= 3600)
    provider.authorizations.push({ platform: 'android', claims })
    const action = provider.afterAuthorize; provider.afterAuthorize = null
    if (action) await action()
    return Response.json({ access_token: 'synthetic-easel-802', token_type: 'Bearer', expires_in: 3600 })
   }
   const platform = url.hostname === 'api.push.apple.com' || url.hostname === 'api.sandbox.push.apple.com' ? 'ios' : url.hostname === 'fcm.googleapis.com' ? 'android' : null
   if (!platform) throw new Error('Unexpected provider destination')
   if (platform === 'ios') {
    const [head, payload, signature] = request.headers.get('authorization').replace(/^bearer /i, '').split('.')
    const header = decode(head), claims = decode(payload)
    assert.equal(header.alg, 'ES256'); assert.equal(header.kid, appleKey); assert.equal(claims.iss, appleTeam)
    assert.ok(claims.iat <= Math.floor(Date.now() / 1000) + 5 && Math.floor(Date.now() / 1000) - claims.iat < 3600)
    assert.ok(verify('sha256', Buffer.from(`${head}.${payload}`), { key: apple.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), 'Apple assertion signature verifies')
    provider.authorizations.push({ platform: 'ios', claims })
   } else assert.equal(request.headers.get('authorization'), 'Bearer synthetic-easel-802')
   provider.requests.push({ platform, url: request.url, body: await request.json(), id: request.headers.get('apns-id') })
   const action = provider.afterSend; provider.afterSend = null
   if (action) await action()
   if (provider.mode === 'unknown') throw new Error('Synthetic network outcome is unknown')
   if (provider.mode === 'refused') return Response.json({ error: { status: 'UNAUTHENTICATED' } }, { status: 401 })
   return platform === 'ios' ? new Response(null, { headers: { 'apns-id': request.headers.get('apns-id') } }) : Response.json({ name: ['projects', 'synthetic-easel-1', 'messages', 'synthetic-easel-2'].join('/') })
  },
 }
 return provider
}
