import assert from 'node:assert/strict'

// Disposable verification state only. No identity or session is manufactured:
// both hooks receive the same response from the native confirmation handler.
const confirmed = new Map()
const lifecycles = new Map()

// The owner supplies the released scoped-mail hook; the sponsor runs it only
// after Business has provisioned the invitation and its durable native binding.
export function prepareSponsor(origin, initialize) {
 lifecycles.set(origin, initialize)
}

export default async function ({ request, origin, email, owner, mail, sub }) {
 if (sub) {
  const initialize = lifecycles.get(origin)
  lifecycles.delete(origin)
  assert.equal(typeof initialize, 'function', 'The owner prepared the scoped native lifecycle')
  await initialize()
  const native = confirmed.get(origin)
  confirmed.delete(origin)
  assert.equal(native?.email, email, 'The sponsor uses its independently confirmed mailbox')
  return native.response
 }
 const json = async (path, body) => {
  const response = await request(new URL(path, origin).href, {
   method: body ? 'POST' : 'GET', redirect: 'manual',
   headers: { origin, cookie: owner.cookie, 'content-type': 'application/json' },
   ...(body ? { body: JSON.stringify(body) } : {}),
  })
  assert.equal(response.status, 200, `Native contributor lifecycle: ${path}`)
  return response.json()
 }
 const state = await json('/api/easel/state')
 const sales = state.departments.find(department => department.name === 'Sales')
 assert.ok(sales, 'The contributor receives an existing native department')
 await json('/api/easel/command/member', { email, name: 'Synthetic contributor', role: 'contributor', departments: [sales.id] })
 const after = Date.now()
 await json('/api/easel/invite', { email })
 const message = mail.read({ after }).at(-1)
 assert.ok(message, 'The contributor invitation reached its isolated mail edge')
 const href = message.text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)?.[0]
 assert.ok(href, 'The native invitation contains its confirmation link')
 const confirmation = new URL(href)
 assert.equal(confirmation.origin, origin)
 const response = await request(new URL('/auth/confirm', origin).href, {
  method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ token: confirmation.searchParams.get('token') }),
 })
 assert.equal(response.status, 303, 'The contributor confirms without the owner session')
 const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
 assert.ok(cookie && cookie !== owner.cookie, 'The contributor has an independent native session')
 confirmed.set(origin, { email, response })
 return response
}
