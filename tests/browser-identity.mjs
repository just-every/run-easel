// Native names enrich already-visible attribution; they are not portable identities.
import assert from 'node:assert/strict'
import { api, session } from './browser-journey.mjs'

export async function operators(context, origin) {
 const response = await context.request.get(`${origin}/auth/operators`)
 assert.equal(response.status(), 200)
 return response.json()
}

export function assertActorNames(view, directory) {
 const { me: _me, actorNames, ...visible } = view
 const values = new Set()
 const visit = value => {
  if (typeof value === 'string') values.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach(visit)
 }
 visit(visible)
 const expected = Object.fromEntries(directory.filter(person => values.has(person.email) && person.displayName.trim()).map(person => [person.email, person.displayName]))
 assert.deepEqual(actorNames, expected, 'Names resolve exactly the native identities whose emails are already in the role-filtered response')
}

export async function roleNames(browser, root, origin, directory) {
 // The board member exists in the directory but is absent from contributor
 // attribution: checking a restricted reader catches directory-wide leakage.
 const sales = await session(browser, root, origin, 'sales', 1440)
 try {
  const state = await api(sales.context, origin, 'state')
  assert.equal(state.me.role, 'contributor')
  assert.equal(state.members.length, 0)
  assertActorNames(state, directory)
  assert.equal(Object.hasOwn(state.actorNames, 'board@dev.localhost'), false)
  const forecast = state.scenarios.find(sc => sc.kind === 'forecast')
  assertActorNames(await api(sales.context, origin, `variance/${forecast.actualsThrough}`), directory)
 } finally { await sales.context.close() }
}

export async function rejectSourceSession(origin, cookies) {
 // Keep credentials in memory only, and assert status without printing them.
 for (const path of ['/auth/session', '/api/easel/state']) {
  const response = await fetch(origin + path, { headers: { cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') }, redirect: 'manual' })
  await response.body?.cancel()
  assert.equal(response.status, 401, 'A source session cannot authenticate in the restored installation')
 }
}
