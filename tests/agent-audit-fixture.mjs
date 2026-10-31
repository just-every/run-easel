import assert from 'node:assert/strict'

// Real planning and MCP doors; callers supply independent native person sessions.
export async function seedAgentAudit({ command, get, person, policy, rpc, approve, owner }) {
 await command('workspace', { name: 'Synthetic audit studio', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Sales' })
 const salary = await command('line', { name: 'Salary', type: 'operating-expense', payroll: true })
 const budget = (await get('/api/easel/state')).scenarios[0]
 await command('position', { scenario: budget.id, department: department.id, line: salary.id, title: 'Synthetic analyst', annualSalary: '120000', start: '2026-01' })
 const forecast = (await command('approve-budget', { scenario: budget.id, revision: (await get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 const planner = await person(['synthetic-easel-planner', 'example.test'].join('@'), 'contributor', [department.id])
 await policy('autonomous')
 // The first filtered page is empty, although its cursor precedes matching rows.
 for (let i = 0; i < 204; i++) {
  const result = await rpc('easel.scenarios.list', {}, i % 2 ? planner : owner)
  assert.equal(result.isError, false, JSON.stringify(result))
 }
 for (let i = 0; i < 8; i++) for (const who of [planner, owner]) {
  const result = await rpc(i % 2 ? 'easel.scenarios.list' : 'easel.scenarios.read', i % 2 ? {} : { scenario: forecast.id }, who)
  assert.equal(result.isError, false, JSON.stringify(result))
 }
 const auto = await rpc('easel.proposals.create', { from: forecast.id, name: 'Synthetic autonomous alternative', request: 'Prepare a planning alternative', idempotency_key: 'synthetic-easel-auto-1' }, planner)
 assert.equal(auto.isError, false, JSON.stringify(auto))
 await policy('approval')
 const args = { from: forecast.id, name: 'Synthetic held alternative', request: 'Prepare a reviewed alternative', idempotency_key: 'synthetic-easel-held-1' }
 const held = () => rpc('easel.proposals.create', args, planner)
 const pending = await held(), handle = pending._meta['com.runeditrun/error'].approval
 assert.ok(handle.id)
 const path = `/agents/api/approvals/${handle.id}`, approval = (await get(path)).approval
 const evidence = { revision: approval.revision, summary_sha256: approval.summary_sha256 }
 const before = (await get('/api/easel/state')).scenarios
 await approve(path, evidence, planner, 403)
 assert.deepEqual((await get('/api/easel/state')).scenarios, before)
 await approve(path, evidence, owner, 200)
 assert.equal((await get(path)).approval.state, 'executed')
 const result = await held(); assert.ok(result.structuredContent.id)
 const rows = await allAgentAudit(get)
 assert.ok(rows.length > 220)
 const prepared = rows.find(row => row.idempotency_key === args.idempotency_key && row.outcome === 'done')
 assert.ok(prepared)
 assert.ok(prepared.classes.some(item => item.class === 'sensitive'))
 assert.equal(prepared.label, 'MCP client for synthetic-easel-planner')
 assert.ok(prepared.approval.by.length > 0)
 assert.ok(!prepared.approval.by.includes(prepared.sponsor.id))
 return { planner, agent: prepared.agent.id, approval: handle.id, rows, forecast }
}

export async function allAgentAudit(get, selected = {}) {
 const rows = []; let after = null
 while (true) {
  const query = new URLSearchParams(selected); if (after !== null) query.set('after', after)
  const page = await get('/agents/api/audit?' + query); rows.push(...page.rows)
  assert.equal(page.differs_from_policy, 0)
  if (page.cursor === null || page.cursor === after) return rows
  after = page.cursor
 }
}
