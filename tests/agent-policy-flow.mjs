// Synthetic Business signatures enter only through the production HTTP doors.
// Native people, planning records, policy time and approvals remain real.
import assert from 'node:assert/strict'
import { createHash, randomUUID, webcrypto } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'

const decisionOf = answer => answer.result?._meta?.['com.runeditrun/decision']
const codeOf = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.error?.data?.code
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}` : JSON.stringify(value)
const policy = disposition => ({ schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: 'planning', class: '*', do: disposition, ...(disposition === 'approval' ? { approver: ['person:synthetic-easel-owner'], wait: 'PT1H' } : {}) }], spend: { none: true } })

export async function policyFixture(start) {
 const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 const publicKeys = { 'synthetic-easel-1': await webcrypto.subtle.exportKey('jwk', keys.publicKey) }
 const issuer = 'https://business.example.test', installation = 'synthetic-easel-installation', business = 'synthetic-easel-business'
 const ownerEmail = ['owner', 'example.test'].join('@')
 const sign = async (typ, payload) => {
  const input = [Buffer.from(JSON.stringify({ alg: 'ES256', typ, kid: 'synthetic-easel-1' })).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url')].join('.')
  return `${input}.${Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(input))).toString('base64url')}`
 }
 const h = await start({ bindings: origin => ({ RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installation, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys), RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: origin, subject: installation, keys: publicKeys }) }) })
 let owner = h.owner, revision = 0, rpcId = 0
 const request = async (path, body, cookie = owner, method) => {
  const r = await h.mf.dispatchFetch(h.origin + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), redirect: 'manual', headers: { origin: h.origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await r.text()
  let value; try { value = JSON.parse(text) } catch { value = text }
  return { status: r.status, value, text, headers: r.headers }
 }
 const person = async (path, body) => { const r = await request(path, body); assert.equal(r.status, 200, `${path}: ${r.text}`); return r.value }
 const command = (name, body) => person(`/api/easel/command/${name}`, body)
 try {
  if (!owner) {
   const boot = await request('/auth/bootstrap', { token: h.bootstrap, displayName: 'Fran Finance' })
   assert.equal(boot.status, 303)
   owner = boot.headers.get('set-cookie').split(';')[0]
  }
  const now = Math.floor(Date.now() / 1000)
  const settings = await sign('rer-business-settings+jwt', { v: 1, iss: issuer, aud: h.origin, sub: installation, business, owner_id: 'synthetic-easel-owner', email: ownerEmail, jti: randomUUID(), iat: now, exp: now + 300, rev: 1, values: { display_name: 'Synthetic planning company' }, logo: null, team: null })
  await person('/api/rer/business-settings', { settings })
  await command('workspace', { name: 'Synthetic planning company', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
  const department = await command('department', { name: 'Sales' }), line = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
  const budget = (await person('/api/easel/state')).scenarios.find(s => s.kind === 'budget')
  await command('position', { scenario: budget.id, department: department.id, line: line.id, title: 'Planner', holder: 'Synthetic restricted employee', annualSalary: '60000', start: '2026-01' })
  const approved = await command('approve-budget', { scenario: budget.id, revision: (await person(`/api/easel/scenario/${budget.id}`)).scenario.revision })
  const tokenExpires = (now + 300) * 1000
  const token = await sign('at+jwt', { iss: issuer, aud: `${h.origin}/mcp`, sub: 'synthetic-easel-owner', email: ownerEmail, business, act: { sub: 'synthetic-easel-agent', name: 'Synthetic planning agent', specialist: 'finance planner' }, client_id: 'synthetic-easel-client', scope: 'planning:read planning:write', consent: 'synthetic-easel-consent', jti: randomUUID(), iat: now, exp: now + 300 })
  const rpc = async (method, params = {}) => {
   const response = await h.mf.dispatchFetch(h.origin + '/mcp', { method: 'POST', headers: { origin: h.origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(params.name ? { 'mcp-name': params.name } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: { url: {} } } } } }) })
   const answer = await response.json()
   assert.equal(response.status, 200, JSON.stringify(answer))
   return answer
  }
  const call = (name, args, extra = {}) => rpc('tools/call', { name, arguments: args, ...extra })
  const adopt = async (disposition, lifetime = 300) => {
   const document = policy(disposition), next = revision + 1, iat = Math.floor(Date.now() / 1000)
   const revision_signature = await sign('rer-agent-policy-revision+jwt', { business, revision: next, document_sha256: createHash('sha256').update(canonical(document)).digest('hex') })
   const exp = iat + lifetime
   const envelope = await sign('rer-agent-policy+jwt', { v: 1, iss: issuer, aud: h.origin, sub: installation, business, seq: next, revision: next, paused: false, catalogue: document.catalogue, document, revision_signature, iat, exp })
   const started = performance.now()
   const ack = await person('/api/rer/agent-policy', { policy: envelope })
   assert.deepEqual(ack.adopted, { seq: next, revision: next })
   revision = next
   return { revision, expires: exp * 1000, started }
  }
  const audit = async (answer, disposition, expectedRevision = revision) => {
   const decision = decisionOf(answer)
   assert.equal(decision?.disposition, disposition, JSON.stringify(answer))
   assert.equal(decision.revision, expectedRevision)
   const feed = await person('/agents/api/audit?agent=synthetic-easel-agent')
   const row = feed.rows.find(row => row.id === decision.id)
   assert.ok(row, 'The public audit contains this call')
   assert.equal(row.revision, expectedRevision)
   assert.equal(row.decision, disposition)
   assert.equal(row.agent.id, 'synthetic-easel-agent')
   assert.equal(row.sponsor.name, 'Fran Finance')
   assert.equal(feed.differs_from_policy, 0)
   return row
  }
  const witness = async () => ({ state: await person('/api/easel/state'), activity: await person('/api/easel/activity'), frozen: await person(`/api/easel/scenario/${budget.id}`) })
  const proposal = label => ({ from: approved.forecast.id, name: `Private ${label}`, request: 'Review the private staffing plan', idempotency_key: `synthetic-easel-${randomUUID()}` })
  return { ...h, owner, person, request, command, rpc, call, adopt, audit, witness, proposal, tokenExpires, forecast: approved.forecast.id, revision: () => revision }
 } catch (error) { await h.close(); throw error }
}

export async function policyLifecycle(f, hooks = {}) {
 const create = 'easel.proposals.create', read = 'easel.scenarios.read'
 const ok = answer => { assert.equal(answer.result?.isError, false, JSON.stringify(answer)); assert.ok(answer.result.structuredContent); return answer.result.structuredContent }
 const propagated = async (update, answer, disposition) => {
  const elapsed = performance.now() - update.started
  assert.ok(elapsed < 60000, `Policy propagation took ${elapsed}ms`)
  await f.audit(answer, disposition, update.revision)
  console.log(`PROBE BASE-AGENT-007 propagation: signed revision ${update.revision} -> next MCP call ${disposition} in ${Math.ceil(elapsed)}ms; public audit matches`)
 }
 const autonomous = await f.adopt('autonomous'), autoArgs = f.proposal('autonomous preparation')
 const autoAnswer = await f.call(create, autoArgs), autoProposal = ok(autoAnswer)
 await propagated(autonomous, autoAnswer, 'autonomous')
 const privateRead = ok(await f.call(read, { scenario: autoProposal.id }))
 assert.ok(JSON.stringify(privateRead).includes('Synthetic restricted employee'), 'The expiry probe starts with a genuinely private nonempty read')
 const beforeHold = await f.witness(), held = await f.adopt('approval'), heldArgs = f.proposal('held preparation')
 const pending = await f.call(create, heldArgs)
 await propagated(held, pending, 'approval')
 assert.equal(pending.result.resultType, 'input_required')
 assert.equal(pending.result.structuredContent, undefined)
 const handle = pending.result._meta['com.runeditrun/approval']
 assert.equal(pending.result.inputRequests.approval.params.mode, 'url')
 assert.equal(pending.result.inputRequests.approval.params.url, handle.url)
 assert.deepEqual(await f.witness(), beforeHold, 'Holding changes no native record or capture')
 const pendingPath = `/agents/api/approvals/${handle.id}`
 const { approval } = await f.person(pendingPath)
 assert.equal(approval.revision, held.revision)
 assert.deepEqual(approval.approvers, ['person:synthetic-easel-owner'])
 assert.ok(JSON.stringify(approval.summary).includes(heldArgs.name))
 assert.ok(Date.parse(approval.expires_at) > Date.now())
 if (hooks.pending) await hooks.pending({ f, handle, approval })
 if (hooks.approve) await hooks.approve({ f, handle, approval })
 else await f.person(`${pendingPath}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
 const heldAnswer = await f.call(create, heldArgs), heldProposal = ok(heldAnswer)
 assert.ok(heldAnswer.result._meta['com.runeditrun/receipt'].approved_by.length)
 assert.equal((await f.person(pendingPath)).approval.state, 'executed')
 const afterApproval = await f.witness()
 assert.deepEqual(ok(await f.call(create, heldArgs)), heldProposal)
 assert.deepEqual(await f.witness(), afterApproval, 'A completed held key has only one native effect')
 if (hooks.approved) await hooks.approved({ f, handle })

 const blocked = await f.adopt('blocked'), beforeBlock = await f.witness()
 for (const args of [f.proposal('blocked preparation'), autoArgs, heldArgs]) {
  const answer = await f.call(create, args)
  assert.equal(codeOf(answer), 'policy_blocked')
  assert.equal(answer.result.structuredContent, undefined)
  await propagated(blocked, answer, 'blocked')
 }
 assert.deepEqual(await f.witness(), beforeBlock)
 console.log('PROBE BASE-AGENT-007 replay: blocked policy refuses fresh and completed keys with no cached private content or native effects')

 // Each envelope really elapses; neither the token nor the runtime clock is shortened.
 for (const disposition of ['autonomous', 'approval']) {
  const update = await f.adopt(disposition, 5), args = f.proposal(`short ${disposition}`)
  let answer = await f.call(create, args)
  if (disposition === 'approval') {
   const current = answer.result._meta['com.runeditrun/approval']
   const saved = (await f.person(`/agents/api/approvals/${current.id}`)).approval
   await f.person(`/agents/api/approvals/${current.id}/approve`, { revision: saved.revision, summary_sha256: saved.summary_sha256 })
   answer = await f.call(create, args)
  }
  const completed = ok(answer)
  let expiredPending
  if (disposition === 'approval') {
   const next = await f.call(create, f.proposal('waiting beyond envelope'))
   const current = next.result._meta['com.runeditrun/approval']
   expiredPending = (await f.person(`/agents/api/approvals/${current.id}`)).approval
  }
  const beforeExpiry = await f.witness()
  const waitMs = Math.max(0, update.expires - Date.now() + 100)
  await wait(waitMs)
  assert.ok(Date.now() >= update.expires)
  assert.ok(f.tokenExpires > Date.now() + 60000, 'The same access token remains independently valid')
  const calls = [[create, f.proposal('expired preparation')], [create, args], [create, autoArgs], [create, heldArgs], [read, { scenario: completed.id }]]
  for (const [name, input] of calls) {
   const refused = await f.call(name, input)
   assert.equal(codeOf(refused), 'policy_unavailable', JSON.stringify(refused))
   assert.equal(refused.result.structuredContent, undefined)
   assert.ok(!JSON.stringify(refused).includes('Synthetic restricted employee'))
   assert.ok(!JSON.stringify(refused).includes(args.name))
   const row = await f.audit(refused, 'unavailable', update.revision)
   assert.equal(row.outcome, 'refused')
   assert.equal(row.code, 'policy_unavailable')
  }
  assert.deepEqual((await f.rpc('tools/list')).result.tools, [])
  if (expiredPending) {
   const refused = await f.person(`/agents/api/approvals/${expiredPending.id}/approve`, { revision: expiredPending.revision, summary_sha256: expiredPending.summary_sha256 })
   assert.equal(refused.approval.state, 'refused')
   assert.equal(refused.approval.code, 'policy_unavailable')
   if (hooks.expired) await hooks.expired({ f, approval: expiredPending })
  }
  assert.deepEqual(await f.witness(), beforeExpiry, 'Expiry and refusal cannot change native records, activity or frozen captures')
  console.log(`PROBE BASE-AGENT-007 expiry ${disposition}: real elapsed envelope -> policy_unavailable for fresh calls, completed keys and private reads; token valid; native state and frozen capture unchanged`)
 }
 const resumed = await f.adopt('autonomous')
 const restored = await f.call(read, { scenario: heldProposal.id })
 assert.ok(JSON.stringify(ok(restored)).includes('Synthetic restricted employee'))
 await propagated(resumed, restored, 'autonomous')
 console.log('PROBE BASE-AGENT-007 token independence: renewed signed envelope + original token -> private read succeeds')
}
