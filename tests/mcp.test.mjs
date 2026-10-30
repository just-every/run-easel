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
 const own = ok(await call('proposal-create', { from: forecast.id, name: 'Synthetic engineering proposal', request: 'Prepare an independent department alternative' }, other))
 const ownExpense = ok(await call('expense', { scenario: own.id, department: engineering.id, line: salary.id, name: 'Synthetic engineering cost', kind: 'recurring', amount: '25', start: '2026-02' }, other))
 assert.equal(ok(await call('scenario', { scenario: own.id }, other)).inputs.expense.find(row => row.id === ownExpense.id).amountCents, 2500)
 assert.notEqual(own.createdBy, proposal.createdBy)
 await h.stepUp(other)
 const credential = await h.send('/api/easel/tokens/issue', { kind: 'service', scope: 'write', label: 'Synthetic engineering agent' }, other)
 assert.equal(credential.status, 200)
 const tokenCall = async (name, args) => {
  const answer = await rpc('tools/call', { name, arguments: args }, '', { authorization: `Bearer ${credential.value.token}` })
  assert.equal(answer.status, 200)
  return answer.body.result
 }
 assert.equal(ok(await tokenCall('scenario', { scenario: own.id })).scenario.id, own.id)
 const privateBefore = await h.get(`/api/easel/scenario/${proposal.id}`)
 for (const invoke of [(name, args) => call(name, args, other), tokenCall]) {
  const deniedRead = await invoke('scenario', { scenario: proposal.id })
  assert.equal(deniedRead.isError, true)
  assert.equal(deniedRead.structuredContent, undefined)
  const deniedChange = await invoke('proposal-submit', { id: proposal.id, summary: 'Synthetic cross-sponsor attempt' })
  assert.equal(deniedChange.isError, true)
  assert.equal(deniedChange.structuredContent, undefined)
 }
 const nativePrivate = await h.send(`/api/easel/scenario/${proposal.id}`, undefined, other)
 assert.ok([403, 404].includes(nativePrivate.status))
 assert.deepEqual(await h.get(`/api/easel/scenario/${proposal.id}`), privateBefore)
 const heldPolicy = { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: 'all', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }], spend: { none: true } }
 assert.equal((await h.send('/agents/api/policy', { document: heldPolicy }, h.owner, 'PUT')).status, 200)
 const held = await call('proposal-submit', { id: proposal.id, summary: 'Synthetic private decision' })
 assert.equal(held._meta['com.runeditrun/error'].code, 'approval_required')
 const approvalPath = `/agents/api/approvals/${held._meta['com.runeditrun/error'].approval.id}`
 const pending = (await h.get(approvalPath, contributor)).approval
 const decision = { revision: pending.revision, summary_sha256: pending.summary_sha256 }
 for (const [path, body] of [[approvalPath], [`${approvalPath}/approve`, decision]]) {
  const personAttempt = await h.send(path, body, other)
  assert.ok([403, 404].includes(personAttempt.status))
  const agentAttempt = await h.mf.dispatchFetch(h.origin + path, { method: body ? 'POST' : 'GET', headers: { origin: h.origin, authorization: `Bearer ${credential.value.token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal(agentAttempt.status, 403)
  await agentAttempt.body?.cancel()
 }
 const stillPending = (await h.get(approvalPath, contributor)).approval
 assert.equal(stillPending.state, 'pending')
 assert.deepEqual(stillPending.approvals, [])
 assert.deepEqual(await h.get(`/api/easel/scenario/${proposal.id}`), privateBefore)
 assert.equal((await h.send(`${approvalPath}/reject`, decision, contributor)).status, 200)
 assert.equal((await h.send('/agents/api/policy', { document: { ...heldPolicy, rules: [{ id: 'all', class: '*', do: 'autonomous' }] } }, h.owner, 'PUT')).status, 200)
 ok(await call('proposal-submit', { id: own.id, summary: 'Synthetic engineering review' }, other))
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
 const attributed = await h.get('/api/easel/activity')
 const ownAudit = attributed.find(row => row.action === 'proposal-create' && row.record === own.id)
 const firstAudit = attributed.find(row => row.action === 'proposal-create' && row.record === proposal.id)
 assert.equal(ownAudit.actor, own.createdBy)
 assert.notEqual(ownAudit.detail.authority.for.id, firstAudit.detail.authority.for.id)
 assert.notEqual(ownAudit.detail.authority.id, firstAudit.detail.authority.id)
 await cmd('member', { email: 'planner@example.test', name: 'planner', role: 'contributor', departments: [sales.id], active: false })
 assert.equal((await rpc('tools/list')).status, 401)
})
