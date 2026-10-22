import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const grant = { environment: 'sandbox', clientId: 'synthetic-easel-1', secret: 'synthetic-easel-2', accessToken: 'synthetic-easel-3', consent: true }
function provider() {
 const state = { balance: 440000, status: 200, malformed: '', remove: 200, reads: [], revoked: false, paused: null }
 const account = (id, current, extra = {}) => ({ account_id: id, type: 'depository', name: 'Private bank account sentinel', balances: { current, iso_currency_code: 'USD' }, ...extra })
 state.outbound = async request => {
  const url = new URL(request.url), body = await request.json()
  assert.equal(url.origin, 'https://sandbox.plaid.com')
  assert.equal(request.method, 'POST')
  assert.deepEqual([body.client_id, body.secret, body.access_token], [grant.clientId, grant.secret, grant.accessToken])
  state.reads.push(url.pathname)
  if (state.paused && url.pathname === '/accounts/balance/get') await state.paused()
  if (url.pathname === '/item/remove') { state.revoked = state.remove === 200; return Response.json({ request_id: 'synthetic-easel-4', private: grant.secret }, { status: state.remove, ...(state.remove === 302 ? { headers: { location: 'https://unrelated.example/' } } : {}) }) }
  if (state.status !== 200) return Response.json({ private: grant.accessToken }, { status: state.status, ...(state.status === 302 ? { headers: { location: 'https://unrelated.example/' } } : {}) })
  if (url.pathname === '/accounts/balance/get') {
   if (state.malformed === 'json') return new Response('invalid JSON')
   const rows = [account('synthetic-easel-5', state.balance - 100000), account('synthetic-easel-6', 100000), account('synthetic-easel-7', 999999, { type: 'credit' })]
   if (state.malformed === 'currency') rows[1].balances.iso_currency_code = 'CAD'
   if (state.malformed === 'null') rows[1].balances.current = null
   if (state.malformed === 'duplicate-account') rows[1].account_id = rows[0].account_id
   return Response.json({ accounts: rows })
  }
  assert.equal(url.pathname, '/transactions/get')
  assert.deepEqual(body.options.account_ids, ['synthetic-easel-5', 'synthetic-easel-6'])
  const rows = [
   { transaction_id: 'synthetic-easel-8', account_id: 'synthetic-easel-5', date: body.end_date, amount: 12.01, pending: false, iso_currency_code: 'USD', name: 'Private merchant sentinel' },
   { transaction_id: 'synthetic-easel-9', account_id: 'synthetic-easel-6', date: body.end_date, amount: -25.02, pending: false, iso_currency_code: 'USD' },
   { transaction_id: 'synthetic-easel-10', account_id: 'synthetic-easel-6', date: body.end_date, amount: 999.99, pending: true, iso_currency_code: 'USD' },
  ]
  if (state.malformed === 'duplicate-transaction') rows[1].transaction_id = rows[0].transaction_id
  if (state.malformed === 'date') rows[0].date = '2026-02-30'
  if (state.malformed === 'precision') rows[0].amount = 0.001
  if (state.malformed === 'foreign-account') rows[0].account_id = 'synthetic-easel-11'
  if (state.malformed === 'empty-page') return Response.json({ transactions: [], total_transactions: 1 })
  return Response.json({ transactions: rows, total_transactions: rows.length })
 }
 return state
}
const setup = async h => {
 await h.command('workspace', { name: 'Bank cash studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Operations' })
 const line = await h.command('line', { name: 'Planned spend', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '500000', collectionLag: 0, paymentLag: 0 })
 await h.command('expense', { scenario: budget.id, name: 'February invoice', department: department.id, line: line.id, kind: 'one-off', start: '2026-02', amount: '1000', paymentMethod: 'date', paymentDate: '2026-02-15' })
 const approval = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 return { budget, forecast: approval.forecast, department }
}

test('FIN-007 CONNECT-009 native finance reads sealed Plaid cash once into weekly estimates and source-labeled cash alerts without changing the plan', async t => {
 let now = '2026-02-01T12:00:00.000Z'
 const remote = provider(), h = await harness({ now: () => now, outbound: remote.outbound }); t.after(() => h.close())
 const { budget, forecast, department } = await setup(h)
 const post = async (op, input = {}, expected = 200, cookie = h.owner) => { const r = await h.send(`/api/easel/connections/plaid/${op}`, input, cookie); assert.equal(r.status, expected, r.text); return r.value }
 const weekly = (id = forecast.id, basis = 'bank') => `/api/easel/weekly-cash/${id}?basis=${basis}`
 const original = await h.get(`/api/easel/scenario/${forecast.id}`)
 await h.get(weekly(), h.owner, 409)
 await post('connect', { ...grant, consent: false }, 400)
 const connected = await post('connect', grant)
 assert.equal(connected.connected, true); assert.equal(connected.suffix, 'el-3'); assert.equal(connected.owner, 'owner@example.test')
 assert.equal(connected.lastRefresh, null); assert.equal(connected.rowCount, 0)
 await post('connect', grant, 409)
 const sealed = (await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('plaid').first()).sealed
 for (const value of [grant.clientId, grant.secret, grant.accessToken]) assert.ok(!sealed.includes(value))
 const amount = await h.command('cash-alert-rule-save', { name: 'Bank $50k under plan', kind: 'bank-below-plan', basis: 'amount', amount: '50000' })
 const percent = await h.command('cash-alert-rule-save', { name: 'Bank 10% under plan', kind: 'bank-below-plan', basis: 'percent', percent: '10' })
 const refreshed = await post('refresh')
 assert.equal(refreshed.snapshot.balanceCents, 44000000); assert.equal(refreshed.snapshot.accountCount, 2); assert.equal(refreshed.snapshot.excludedAccountCount, 1)
 assert.equal(refreshed.rowCount, 3); assert.equal(refreshed.error, null)
 assert.deepEqual(refreshed.snapshot.movements, [{ date: '2026-02-01', collections: 2502, payments: 1201, count: 2 }])
 const view = await h.get(weekly())
 assert.equal(view.bankBasis, true); assert.equal(view.start, '2026-02-02'); assert.equal(view.weeks.length, 13)
 assert.equal(view.weeks[0].opening, 44000000, 'posted transactions are already in the current bank balance, never counted again')
 assert.equal(view.weeks[1].payments, 100000); assert.equal(view.reconciliation[0].difference, -6000000)
 assert.match(view.basis, /not ledger actuals/)
 const download = await h.mf.dispatchFetch(h.origin + `/api/easel/weekly-cash/${forecast.id}/document.xlsx?basis=bank`, { headers: { cookie: h.owner } })
 assert.equal(download.status, 200)
 const book = await readWorkbook(await download.arrayBuffer()); proveFormulas(book)
 assert.equal(book.getWorksheet('Weekly cash').getCell('C4').value, 44000000)
 assert.equal(book.getWorksheet('Reconciliation').getCell('F3').result, -6000000)
 await h.get(weekly(budget.id), h.owner, 409)
 let alerts = await h.get('/api/easel/cash-alerts')
 for (const rule of [amount, percent]) {
  const alert = alerts.alerts.find(a => a.rule === rule.id)
  assert.deepEqual([alert.current.bankCents, alert.current.planCents, alert.current.shortfallCents, alert.current.shortfallBps], [44000000, 50000000, 6000000, 1200])
  assert.match(alert.sends[0].detail.join(' '), /not ledger actuals/)
 }
 assert.equal(h.messages.filter(m => m.subject.startsWith('Cash alert:')).length, 2)
 await post('refresh')
 assert.equal(h.messages.filter(m => m.subject.startsWith('Cash alert:')).length, 2, 'unchanged bank refreshes do not duplicate alerts')
 remote.balance = 430000; await post('refresh')
 assert.equal(h.messages.filter(m => m.subject.startsWith('Cash alert:')).length, 4, 'a worse bank balance re-alerts once per rule')
 now = '2026-02-08T12:00:00.000Z'; await post('refresh')
 assert.equal(h.messages.filter(m => m.subject.startsWith('Cash alert:')).length, 6, 'an unchanged breach re-alerts after the configured company-zone interval')
 alerts = await h.get('/api/easel/cash-alerts')
 const alert = alerts.alerts.find(a => a.rule === amount.id)
 await h.command('cash-alert-acknowledge', { id: alert.id, revision: alert.revision })
 assert.equal((await h.get('/api/easel/cash-alerts')).alerts.find(a => a.id === alert.id).acknowledgments.length, 1)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), original, 'bank observation never changes model revisions, source inputs or frozen calculations')
 const board = await h.person('board@example.test', 'viewer'), planner = await h.person('planner@example.test', 'contributor', [department.id])
 for (const cookie of [board, planner]) {
  await h.get('/api/easel/connections/plaid', cookie, 403); await h.get(weekly(), cookie, 403)
  await post('connect', grant, 403, cookie); await post('refresh', {}, 403, cookie); await post('disconnect', {}, 403, cookie)
  assert.equal((await h.get(weekly(forecast.id, 'plan'), cookie)).bankBasis, undefined)
 }
 now = new Date().toISOString()
 await h.stepUp()
 const issued = await h.send('/api/easel/tokens/issue', { label: 'Bank token refusal', kind: 'personal', scope: 'write' }, h.owner)
 assert.equal(issued.status, 200)
 for (const [path, body] of [['/api/easel/connections/plaid', undefined], ['/api/easel/connections/plaid/refresh', {}]]) {
  const r = await h.mf.dispatchFetch(h.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${issued.value.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal(r.status, 403)
 }
 await post('refresh')
 const tokenBank = await h.mf.dispatchFetch(h.origin + weekly(), { headers: { authorization: `Bearer ${issued.value.token}` } })
 assert.equal(tokenBank.status, 200, 'current company-wide finance read tokens keep API-001 aggregate cash parity')
 assert.equal((await tokenBank.json()).bank.balanceCents, 43000000)
 const records = JSON.stringify((await h.db.prepare('SELECT value FROM e_records').all()).results)
 assert.doesNotMatch(records, /Private bank account sentinel|Private merchant sentinel|clientId|accessToken/)
 const archive = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } })
 assert.equal(archive.status, 200)
 const zip = await JSZip.loadAsync(await archive.arrayBuffer())
 for (const entry of Object.values(zip.files).filter(f => !f.dir)) {
  const value = await entry.async('string')
  for (const credential of [grant.clientId, grant.secret, grant.accessToken, sealed]) assert.ok(!value.includes(credential), 'open archive excludes all Plaid credentials and ciphertext')
 }
 const disconnected = await post('disconnect')
 assert.equal(disconnected.connected, false); assert.equal(disconnected.providerRevocation.status, 'confirmed'); assert.equal(remote.revoked, true)
 assert.equal(await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('plaid').first(), null)
 await h.get(weekly(), h.owner, 409)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), original)
 assert.ok(remote.reads.every(path => ['/accounts/balance/get', '/transactions/get', '/item/remove'].includes(path)), 'the provider boundary has no payment or transfer operation')
})

test('CONNECT-009 failed, stale and changed Plaid sources block bank conclusions and retain the previous complete aggregate without leaking provider bodies', async t => {
 let now = '2026-02-01T12:00:00.000Z'
 const remote = provider(), h = await harness({ now: () => now, outbound: remote.outbound }); t.after(() => h.close())
 const { forecast } = await setup(h)
 const post = async (op, input = {}) => { const r = await h.send(`/api/easel/connections/plaid/${op}`, input, h.owner); assert.equal(r.status, 200, r.text); return r.value }
 await post('connect', grant); const good = await post('refresh')
 const plan = await h.get(`/api/easel/scenario/${forecast.id}`)
 for (const status of [401, 429, 302, 500]) {
  remote.status = status
  const calls = remote.reads.length, result = await post('refresh')
  assert.equal(remote.reads.length, calls + 1, 'no retry or redirect follows a failed read')
  assert.match(result.error, new RegExp(`HTTP ${status}`)); assert.deepEqual(result.snapshot, good.snapshot)
  if (status === 429) assert.match(result.rateLimit, /rate limited/)
  await h.get(`/api/easel/weekly-cash/${forecast.id}?basis=bank`, h.owner, 409)
 }
 remote.status = 200
 for (const malformed of ['json', 'currency', 'null', 'duplicate-account', 'duplicate-transaction', 'date', 'precision', 'foreign-account', 'empty-page']) {
  remote.malformed = malformed
  const result = await post('refresh')
  assert.ok(result.error, `${malformed} must block, never become zero`); assert.deepEqual(result.snapshot, good.snapshot)
  assert.ok(!JSON.stringify(result).includes(grant.accessToken))
 }
 remote.malformed = ''; await post('refresh')
 now = '2026-02-02T12:00:00.001Z'
 await h.get(`/api/easel/weekly-cash/${forecast.id}?basis=bank`, h.owner, 409)
 assert.equal((await h.get(`/api/easel/weekly-cash/${forecast.id}`)).available, true, 'planned cash remains usable when the bank source expires')
 await post('refresh')
 assert.equal((await h.get(`/api/easel/weekly-cash/${forecast.id}?basis=bank`)).start, '2026-02-03')
 const crossOrigin = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/plaid/disconnect', { method: 'POST', headers: { cookie: h.owner, origin: 'https://unrelated.example', 'content-type': 'application/json' }, body: '{}' })
 assert.equal(crossOrigin.status, 403)
 remote.remove = 302
 const disconnected = await post('disconnect')
 assert.equal(disconnected.providerRevocation.status, 'not-confirmed'); assert.match(disconnected.error, /Plaid did not confirm removal/)
 assert.equal(await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('plaid').first(), null)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), plan)
})
