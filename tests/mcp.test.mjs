import test from 'node:test'
import assert from 'node:assert/strict'
import { harness, agentMessage, agentName } from './harness.mjs'

test('API-003 a contributor uses MCP for filtered reads and proposals, never financial approvals', async t => {
 const h = await harness()
 t.after(() => h.close())
 const cmd = h.command
 await cmd('workspace', { name: 'MCP fixture', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await cmd('department', { name: 'Sales' })
 const engineering = await cmd('department', { name: 'Engineering' })
 const revenue = await cmd('line', { name: 'Revenue', type: 'revenue' })
 const salary = await cmd('line', { name: 'Salary', type: 'operating-expense', payroll: true })
 const contributor = await h.person('planner@example.test', 'contributor', [sales.id])
 const other = await h.person('other@example.test', 'contributor', [engineering.id])
 const viewer = await h.person('viewer@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios.find(s => s.kind === 'budget')
 await cmd('expense', { scenario: budget.id, department: sales.id, line: salary.id, name: 'Sales cost', kind: 'recurring', amount: '100', start: '2026-01' })
 await cmd('position', { scenario: budget.id, department: engineering.id, line: salary.id, title: 'Engineer', holder: 'Private Employee', annualSalary: '120000', start: '2026-01' })
 const approved = await cmd('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast
 await cmd('account-map', { account: '4000', target: revenue.id })
 await cmd('department-map', { source: 'Sales', department: sales.id })
 const source = { csv: 'Date,Account,Department,Amount\n2026-01-01,4000,Sales,-1000.00\n', filename: 'mcp-actuals.csv', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD' }
 const preview = await h.kit('actuals', 'preview', source)
 await h.kit('actuals', 'commit', { ...source, fingerprint: preview.fingerprint })
 await cmd('close-month', { scenario: forecast.id, month: '2026-01' })

 await h.agentPolicy()
 let nextId = 1
 const rpc = async (method, params, cookie = contributor, headers = {}, notification = false) => {
  const r = await h.mf.dispatchFetch(`${h.origin}/api/easel/mcp`, { method: 'POST', headers: { origin: h.origin, cookie, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(agentMessage({ jsonrpc: '2.0', ...(notification ? {} : { id: nextId++ }), method, params })) })
  return { status: r.status, headers: r.headers, body: r.status === 202 ? null : await r.json() }
 }
 const call = async (name, args = {}, cookie = contributor) => {
  const r = await rpc('tools/call', { name, arguments: args }, cookie)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.result
 }
 const ok = result => { assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent }
 const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'public-door-client', version: '1' } })
 assert.equal(init.status, 200)
 assert.equal(init.body.result.protocolVersion, '2025-11-25')
 assert.equal((await rpc('notifications/initialized', {}, contributor, {}, true)).status, 202)
 assert.equal((await rpc('server/discover')).body.result._meta['io.modelcontextprotocol/serverInfo'].name, 'Easel')
 assert.equal((await rpc('tools/list', {}, contributor, { 'MCP-Protocol-Version': 'unsupported' })).status, 400)
 assert.equal((await rpc('tools/list', {}, '')).status, 401)
 assert.equal((await rpc('tools/list', {}, contributor, { origin: 'https://other.example' })).status, 403)
 assert.equal((await rpc('tools/call', { name: 'scenario', arguments: { scenario: 123 } })).body.result._meta['com.runeditrun/error'].code, 'invalid_arguments')
 const listed = (await rpc('tools/list')).body.result.tools
 assert.ok(listed.some(tool => tool.name === agentName('variance')))
 assert.ok(listed.some(tool => tool.name === agentName('proposal-create')))
 const variance = ok(await call('variance', { month: '2026-01' }))
 assert.equal(variance.month, '2026-01')
 assert.ok(variance.rows.some(row => row.line === revenue.id && row.actual === 100000))
 const sc = ok(await call('scenario', { scenario: forecast.id }))
 assert.equal(sc.inputs.position.length, 0)
 assert.ok(!JSON.stringify(sc).includes('Private Employee'))
 const metrics = ok(await call('metrics', { scenario: forecast.id }))
 assert.deepEqual(metrics.profit, sc.calculation.profit)
 const scenarios = ok(await call('scenarios'))
 assert.ok(scenarios.scenarios.some(s => s.id === forecast.id))
 const proposal = ok(await call('proposal-create', { from: forecast.id, name: 'Lower sales costs', request: 'Reduce sales cost to fifty dollars' }))
 const expense = ok(await call('expense', { scenario: proposal.id, department: sales.id, line: salary.id, name: 'New sales cost', kind: 'recurring', amount: '50', start: '2026-02' }))
 assert.equal((await call('expense', { scenario: proposal.id, department: engineering.id, line: salary.id, name: 'Other department', kind: 'recurring', amount: '1', start: '2026-02' })).isError, true)
 assert.equal((await call('scenario', { scenario: proposal.id }, other)).isError, true)
 assert.equal((await call('scenario', { scenario: proposal.id }, viewer)).isError, true)
 const comparison = ok(await call('compare', { a: forecast.id, b: proposal.id }))
 assert.ok(comparison.changedCells.some(cell => cell.department === sales.id && cell.difference === 5000))
 ok(await call('input-delete', { kind: 'expense', id: expense.id }))
 const comment = ok(await call('comment', { scenario: forecast.id, department: sales.id, text: 'Please review the timing.' }))
 assert.equal(comment.author, 'planner@example.test')
 const explanation = ok(await call('explanation', { month: '2026-01', line: revenue.id, department: sales.id, text: 'Accepted actuals show January revenue.' }))
 assert.equal(explanation.status, 'draft')
 ok(await call('proposal-submit', { id: proposal.id, summary: 'Ready for finance review' }))
 assert.equal((await call('expense', { scenario: proposal.id, department: sales.id, line: salary.id, name: 'Late edit', kind: 'recurring', amount: '1', start: '2026-02' })).isError, true)
 assert.equal((await call('proposal-create', { from: forecast.id, name: 'Viewer proposal', request: 'Change costs' }, viewer)).isError, true)

 const before = await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first()
 for (const cookie of [contributor, h.owner]) {
  for (const name of ['approve-budget', 'proposal-promote', 'close-month', 'pack-publish', 'explanation-confirm']) {
   assert.ok(!listed.some(tool => tool.name === name))
   assert.equal((await rpc('tools/call', { name, arguments: { scenario: forecast.id, id: proposal.id } }, cookie)).body.error.code, -32602)
  }
  assert.equal((await call('expense', { scenario: forecast.id, department: sales.id, line: salary.id, name: 'Direct edit', kind: 'recurring', amount: '1', start: '2026-02' }, cookie)).isError, true)
 }
 assert.deepEqual(await h.db.prepare('SELECT revision FROM e_meta WHERE id=1').first(), before)
 assert.equal((await h.get(`/api/easel/scenario/${proposal.id}`)).scenario.proposalStatus, 'submitted')
 const audit = await h.db.prepare("SELECT actor FROM e_activity WHERE action='proposal-create' AND record=?").bind(proposal.id).first()
 assert.equal(audit.actor, 'planner@example.test')
 await cmd('member', { email: 'planner@example.test', name: 'planner', role: 'contributor', departments: [sales.id], active: false })
 assert.equal((await rpc('tools/list')).status, 401)
})
