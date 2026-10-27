import assert from 'node:assert/strict'
export const spendKeys = { ramp: 'synthetic-easel-1001', purse: 'synthetic-easel-1002' }
export function spendProvider() {
 const state = { card: 12025, po: 50000, currency: 'USD', status: 200, next: null, calls: [] }
 return { state, async outbound(request) {
  const url = new URL(request.url), provider = url.hostname === 'api.ramp.com' ? 'ramp' : 'purse'
  assert.ok(['api.ramp.com','purse.example.test'].includes(url.hostname), 'Only configured provider origins are used')
  assert.equal(request.method, 'GET'); assert.equal(request.headers.get('authorization'), `Bearer ${spendKeys[provider]}`)
  state.calls.push(url.href)
  if (state.status !== 200) return new Response('private provider error', { status: state.status, headers: { location: 'https://untrusted.example.test/' } })
  if (provider === 'ramp') {
   assert.equal(url.pathname, '/developer/v1/transactions')
   return Response.json({ data: [{ id: 'synthetic-easel-101', state: 'CLEARED', amount: 999999, entity_amount: { value: state.card, currency: state.currency }, currency_code: 'USD', user_transaction_time: '2026-01-15T12:00:00Z' }], page: { next: state.next } })
  }
  assert.equal(url.pathname, '/api/purse/integration/orders/synthetic-easel-102')
  return Response.json({ order: { id: 'synthetic-easel-102', number: 'PO-102', revision: 1, supplier: 'synthetic-easel-103', currency: state.currency, status: 'issued', needDate: '2026-01-31', issuedAt: '2026-01-01T12:00:00Z', totalMinor: state.po, freightMinor: 0, taxMinor: 0, otherMinor: 0, lines: [{ id: 'synthetic-easel-104', amountMinor: state.po }], bills: [] } })
 } }
}
export async function spendFixture(h) {
 await h.command('workspace', { name: 'Synthetic spend company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Operations' }), line = await h.command('line', { name: 'Software', type: 'operating-expense' })
 let budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('expense', { scenario: budget.id, name: 'Supplier assumption', kind: 'one-off', line: line.id, department: department.id, start: '2026-01', amount: '1000' })
 budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('approve-budget', { scenario: budget.id, revision: budget.revision })
 const forecast = (await h.get('/api/easel/state')).scenarios.find(s => s.kind === 'forecast')
 const view = await h.get('/api/easel/scenario/' + forecast.id), driver = view.inputs.expense[0]
 const mapping = ['ramp:synthetic-easel-101','purse:synthetic-easel-102'].map(source => ({ source, line: line.id, department: department.id, month: '2026-01', ...(source.startsWith('ramp:') ? { order: 'synthetic-easel-102' } : {}) }))
 return { department, line, budget, forecast, driver, input: { scenario: forecast.id, revision: forecast.revision, driver: driver.id, month: '2026-01', orders: ['synthetic-easel-102'], mapping } }
}
