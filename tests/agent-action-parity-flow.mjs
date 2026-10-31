// Paired public-door expense journey shared by workerd and the emitted app.
import assert from 'node:assert/strict'

const cases = [
 { kind: 'recurring', create: { amount: '100.01', start: '2026-02', end: '2026-04', paymentMethod: 'dpo', dpoDays: '17' }, edit: { amount: '101.03', start: '2026-03', end: '2026-05', paymentMethod: 'terms', paymentTermDays: '45' }, cents: [[10001,10001,10001,0],[0,10103,10103,10103]] },
 { kind: 'one-off', create: { amount: '23.47', start: '2026-02', paymentMethod: 'date', paymentDate: '2026-02-15' }, edit: { amount: '34.59', start: '2026-03', paymentMethod: 'date', paymentDate: '2026-03-11' }, cents: [[2347,0,0,0],[0,3459,0,0]] },
 { kind: 'prepaid', create: { amount: '100.01', start: '2026-02', amortizationMonths: '3', paymentMonth: '2026-01' }, edit: { amount: '101.03', start: '2026-03', amortizationMonths: '3', paymentMonth: '2026-02' }, cents: [[3333,3333,3335,0],[0,3367,3367,3369]] },
 { kind: 'bonus', create: { amount: '100.01', start: '2026-02', payMonth: '2026-04' }, edit: { amount: '101.03', start: '2026-03', payMonth: '2026-05' }, cents: [[3333,3333,3335,3333],[0,3367,3367,3369]] },
]
const months = ['2026-02','2026-03','2026-04','2026-05']

// Only known generated identifiers and generated timestamps are normalized.
// Business dates, every other record field and person identities stay intact.
function normalized(value, ids, field = '') {
 if (['createdAt', 'at'].includes(field)) return '<generated-time>'
 if (typeof value === 'string') return ids.get(value) ?? value
 if (Array.isArray(value)) return value.map(row => normalized(row, ids))
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [ids.get(key) ?? key, normalized(item, ids, key)]))
 return value
}

export async function expenseParityJourney({ origin, cookie, mutateNative, approve, inspect = async () => {}, proof = () => {} }) {
 let rpcId = 0, serial = 0
 const request = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(origin + path, { method, redirect: 'manual', headers: { origin, cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`)
  return response.json()
 }
 const command = (op, body) => request(`/api/easel/command/${op}`, body)
 const view = id => request(`/api/easel/scenario/${id}`)
 await command('workspace', { name: 'Synthetic parity company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Operations' })
 const line = await command('line', { name: 'Vendor costs', type: 'operating-expense' })
 const budget = (await request('/api/easel/state')).scenarios.find(row => row.kind === 'budget')
 const { forecast } = await command('approve-budget', { scenario: budget.id, revision: (await view(budget.id)).scenario.revision })
 await command('account-map', { account: '6100', target: line.id })
 await command('department-map', { source: 'Operations', department: department.id })
 const source = { filename: 'synthetic-easel-1.csv', csv: 'Date,Account,Department,Amount\n2026-01-15,6100,Operations,12.34\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await request('/api/easel/import/actuals/preview', source)
 await request('/api/easel/import/actuals/commit', { ...source, fingerprint: preview.fingerprint })
 await command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await command('pack-create', { month: '2026-01' })
 await command('pack-publish', { pack: pack.id })
 const state = await request('/api/easel/state'), sponsor = state.me
 const captures = async () => Promise.all((await request('/api/easel/state')).snapshots.map(row => request(`/api/easel/snapshot/${row.id}`)))
 const frozen = await captures()
 assert.deepEqual(new Set(state.snapshots.map(row => row.kind)), new Set(['approval', 'forecast', 'pack']), 'Approved, kept and published captures all exist')
 const official = await view(forecast.id)
 const defaultNative = ({ op, body }) => command(op, body)
 mutateNative ??= defaultNative
 approve ??= async ({ handle }) => {
  const { approval } = await request(`/agents/api/approvals/${handle.id}`)
  await request(`/agents/api/approvals/${handle.id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
 }
 for (const policy of ['autonomous', 'held']) {
  await request('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: policy, class: '*', do: policy === 'held' ? 'approval' : 'autonomous', ...(policy === 'held' ? { approver: ['role:owner'], wait: 'P1D' } : {}) }], spend: { none: true } } }, 'PUT')
  for (const path of ['/mcp', '/api/easel/mcp']) {
   const rpc = async (name, args) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }) })
    assert.equal(response.status, 200, await response.clone().text())
    const envelope = await response.json()
    assert.ok(!envelope.error, JSON.stringify(envelope))
    return envelope.result
   }
   const call = async (name, args) => {
    const keyed = { ...args, idempotency_key: `synthetic-easel-${++serial}` }
    const before = { state: await request('/api/easel/state'), activity: await request('/api/easel/activity') }
    let answer = await rpc(name, keyed)
    if (policy === 'held') {
     assert.equal(answer.isError, true, JSON.stringify(answer))
     assert.equal(answer._meta['com.runeditrun/error'].code, 'approval_required', JSON.stringify(answer))
     assert.deepEqual({ state: await request('/api/easel/state'), activity: await request('/api/easel/activity') }, before, 'Held work changes no native records, revisions, captures or Activity')
     const handle = answer._meta['com.runeditrun/error'].approval
     await approve({ handle, request, policy, path })
     assert.equal((await request(`/agents/api/approvals/${handle.id}`)).approval.state, 'executed')
     answer = await rpc(name, keyed)
    }
    assert.equal(answer.isError, false, JSON.stringify(answer))
    const after = { state: await request('/api/easel/state'), activity: await request('/api/easel/activity') }
    const replay = await rpc(name, keyed)
    assert.equal(replay.isError, false, JSON.stringify(replay))
    assert.deepEqual(replay.structuredContent, answer.structuredContent)
    assert.deepEqual({ state: await request('/api/easel/state'), activity: await request('/api/easel/activity') }, after, 'Completed-key retry has exactly one native effect')
    return answer.structuredContent
   }
   const proposal = { from: forecast.id, name: 'Synthetic paired draft', request: 'Compare the same vendor expense inputs' }
   const personDraft = await command('proposal-create', proposal)
   const agentDraft = await call('easel.proposals.create', proposal)
   assert.equal(personDraft.createdBy, sponsor.email)
   assert.equal(agentDraft.createdBy, sponsor.email)
   const ids = new Map([[personDraft.id, '<proposal>'], [agentDraft.id, '<proposal>']])
   const compare = async (stage, cents, personInput, agentInput) => {
    if (personInput) {
     ids.set(personInput.id, `${personInput.kind}-expense`); ids.set(agentInput.id, `${agentInput.kind}-expense`)
     ids.set(personInput.originId, `${personInput.kind}-origin`); ids.set(agentInput.originId, `${agentInput.kind}-origin`)
    }
    const native = await view(personDraft.id), agent = await view(agentDraft.id)
    if (personInput) assert.deepEqual(normalized(agentInput, ids), normalized(personInput, ids), `${stage}: returned business fields match`)
    for (const field of ['scenario', 'inputs', 'calculation']) assert.deepEqual(normalized(agent[field], ids), normalized(native[field], ids), `${stage}: all ${field} business fields match`)
    assert.deepEqual(months.map(month => (native.calculation.lineTotals[line.id]?.[month] ?? 0)), cents, `${stage}: independently expected expense cents`)
    assert.deepEqual(months.map(month => native.calculation.profit.find(row => row.month === month).operatingExpenses), cents)
    assert.deepEqual(await captures(), frozen, 'Approved, kept and published bytes remain unchanged')
    assert.deepEqual(await view(forecast.id), official, 'Proposal work leaves the official working forecast unchanged')
    return { native, agent }
   }
   for (const fixture of cases) {
    let personInput, agentInput
    for (const [index, stage] of ['create', 'edit'].entries()) {
     const body = { name: `Synthetic ${fixture.kind} expense`, line: line.id, department: department.id, kind: fixture.kind, ...fixture[stage] }
     personInput = await mutateNative({ op: 'expense', body: { ...body, scenario: personDraft.id, ...(personInput ? { id: personInput.id } : {}) }, stage, fixture, draft: personDraft })
     agentInput = await call('easel.expenses.update', { ...body, scenario: agentDraft.id, ...(agentInput ? { id: agentInput.id } : {}) })

     const views = await compare(`${fixture.kind} ${stage}`, fixture.cents[index], personInput, agentInput)
     await activity(stage === 'create' ? 'expense-added' : 'expense-changed')
     await inspect({ stage, fixture, policy, path, personDraft, agentDraft, personInput, agentInput, views, sponsor })
    }
    const removed = await mutateNative({ op: 'input-delete', body: { kind: 'expense', id: personInput.id }, stage: 'remove', fixture, draft: personDraft })
    const toolRemoved = await call('easel.inputs.delete', { kind: 'expense', id: agentInput.id })
    assert.deepEqual(normalized(toolRemoved, ids), normalized(removed, ids))
    const views = await compare(`${fixture.kind} remove`, [0,0,0,0])
    assert.equal(views.native.inputs.expense.length, 0)
    assert.equal(views.agent.inputs.expense.length, 0)
    await activity('expense-removed')
    await inspect({ stage: 'remove', fixture, policy, path, personDraft, agentDraft, personInput, agentInput, views, sponsor })
    proof(`BASE-AGENT-002 ${fixture.kind}: native expense create, edit and remove paired with ${path} under ${policy} -> every stored field, full calculation, exact cents and Activity event types match; attribution retained; captures unchanged`)

    async function activity(action) {
     const rows = await request('/api/easel/activity')
     const person = rows.filter(row => row.record === personInput.id && row.action === action)
     const agent = rows.filter(row => row.record === agentInput.id && row.action === action)
     assert.equal(person.length, 1); assert.equal(agent.length, 1)
     assert.equal(person[0].actor, sponsor.email); assert.equal(agent[0].actor, sponsor.email)
     assert.equal(person[0].actorName, sponsor.name); assert.equal(agent[0].actorName, sponsor.name)
     const { authority: personAuthority, ...personDetail } = person[0].detail
     assert.deepEqual(personAuthority, { type: 'person', name: sponsor.name, via: 'session' }, 'Native person remains a person')
     const { authority, ...detail } = agent[0].detail
     assert.equal(authority.type, 'agent')
     assert.equal(authority.label, `MCP client for ${sponsor.name}`)
     assert.equal(authority.for.name, sponsor.name)
     assert.notEqual(authority.id, authority.for.id)
     assert.deepEqual(authority.approvers.map(row => row.name), policy === 'held' ? [sponsor.name] : [])
     // Attribution is asserted separately, never normalized into the person.
     assert.deepEqual(normalized({ ...agent[0], seq: '<generated-sequence>', detail }, ids), normalized({ ...person[0], seq: '<generated-sequence>', detail: personDetail }, ids))
    }
   }
  }
 }
 return { request, sponsor }
}
