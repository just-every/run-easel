import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness, agentMessage } from './harness.mjs'
import ExcelJS from 'exceljs'

test('AUDIT-001 three people and an agent leave immutable, filterable, exportable before/after history including imports', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'Sales' })
 const line = await h.command('line', { name: 'Services', type: 'revenue' })
 const planner = await h.person('planner@example.test', 'contributor', [department.id])
 const finance = await h.person('finance@example.test', 'finance')
 const viewer = await h.person('board@example.test', 'viewer')
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('request-submissions', { scenario: budget.id, departments: [department.id], due: '2026-12-01' })
 const input = await h.command('revenue', { scenario: budget.id, name: 'Consulting', kind: 'volume', department: department.id, line: line.id, start: '2026-01', startVolume: '10', rate: '100' }, planner)
 await h.command('revenue', { ...input, rate: '125', startVolume: '10', growthPercent: '0' }, planner)
 await h.command('comment', { scenario: budget.id, department: department.id, text: 'Revised the consulting rate.' }, finance)
 const today = new Date().toISOString().slice(0, 10)
 const filter = `actor=planner%40example.test&scenario=${budget.id}&from=${today}&to=${today}`
 const rows = await h.get(`/api/easel/activity?${filter}`)
 assert.ok(rows.length >= 2)
 assert.ok(rows.every(r => r.actor === 'planner@example.test' && r.scenario === budget.id && r.at.startsWith(today)))
 const changed = rows.find(r => r.action === 'record-changed' && r.record === input.id && r.detail.before)
 assert.equal(changed.detail.before.rateCents, 10000)
 assert.equal(changed.detail.after.rateCents, 12500)
 assert.notEqual(changed.detail.beforeRecordRevision, changed.detail.afterRecordRevision)
 assert.equal(changed.detail.authority.type, 'person')
 assert.ok((await h.get(`/api/easel/activity?record=${input.id}`)).every(r => r.record === input.id))
 assert.deepEqual(await h.get('/api/easel/activity?to=2020-01-01'), [])
 await h.get('/api/easel/activity?from=not-a-date', h.owner, 400)
 await h.get('/api/easel/activity', viewer, 403)
 await h.get('/api/easel/activity.csv', planner, 403)
 const csv = await h.send(`/api/easel/activity.csv?${filter}`, undefined, h.owner)
 assert.equal(csv.status, 200)
 assert.match(csv.headers.get('content-type'), /text\/csv/)
 assert.ok(csv.text.includes('planner@example.test'))
 assert.ok(!csv.text.includes('finance@example.test'))
 assert.ok(csv.text.includes('12500'))
 const audit = await h.get('/api/easel/activity')
 assert.ok(['owner@example.test', 'planner@example.test', 'finance@example.test'].every(actor => audit.some(r => r.actor === actor)))
 await assert.rejects(h.db.prepare("UPDATE e_activity SET actor='changed' WHERE seq=?").bind(rows[0].seq).run(), /append-only/)
 await assert.rejects(h.db.prepare('DELETE FROM e_activity WHERE seq=?').bind(rows[0].seq).run(), /append-only/)

 await h.command('account-map', { account: '4000', target: line.id })
 await h.command('department-map', { source: 'Sales', department: department.id })
 const source = { csv: 'Date,Account,Department,Amount\n2026-01-31,4000,Sales,-1000\n', filename: 'january.csv', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', source)
 const accepted = await h.kit('actuals', 'commit', { ...source, fingerprint: preview.fingerprint })
 const imported = (await h.get('/api/easel/activity')).find(r => r.detail.kind === 'actual')
 assert.equal(imported.actor, 'owner@example.test')
 assert.equal(imported.detail.before, null)
 assert.equal(imported.detail.after.amount, -100000)
 await h.kit('actuals', 'undo', { id: accepted.batch.id })
 const undone = (await h.get('/api/easel/activity')).find(r => r.detail.kind === 'actual')
 assert.equal(undone.detail.before.amount, -100000)
 assert.equal(undone.detail.after, null)
 await h.agentPolicy()
 const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/mcp`, { method: 'POST', headers: { origin: h.origin, cookie: planner, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify(agentMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'comment', arguments: { scenario: budget.id, department: department.id, text: 'Prepared by the planning agent.' } } })) })
 assert.equal(response.status, 200)
 const agent = (await h.get('/api/easel/activity')).find(r => r.detail.authority?.type === 'agent')
 assert.equal(agent.actor, 'planner@example.test')
 assert.equal(agent.detail.authority.via, 'mcp')
 assert.equal(agent.detail.authority.label, 'MCP client for planner')
 const agentFilter = `actor=${encodeURIComponent(agent.actor)}&record=${agent.record}`
 const agentCsv = await h.send(`/api/easel/activity.csv?${agentFilter}`, undefined, h.owner)
 assert.ok(agentCsv.text.includes('"Attribution"'))
 assert.ok(agentCsv.text.includes('"MCP client for planner"'))
 const workbook = async query => {
  const response = await h.mf.dispatchFetch(`${h.origin}/api/easel/activity.xlsx?${query}`, { headers: { cookie: h.owner } })
  assert.equal(response.status, 200)
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await response.arrayBuffer())
  return book.getWorksheet('Activity')
 }
 const sheet = await workbook(agentFilter)
 const exportedAgent = sheet.getRows(3, sheet.rowCount - 3).find(row => row.getCell(1).value === agent.seq)
 assert.equal(exportedAgent.getCell(3).value, agent.actor)
 assert.equal(exportedAgent.getCell(4).value, 'MCP client for planner')
 await h.get('/api/easel/activity.xlsx', viewer, 403)
 const noPay = await h.person(['synthetic-easel-2', 'example.test'].join('@'), 'finance', [], false)
 for (const suffix of ['', '.csv', '.xlsx']) await h.get(`/api/easel/activity${suffix}`, noPay, 403)

 // A prepared action keeps the agent as preparer after a different person approves.
 const policy = await h.send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: 'held', class: '*', do: 'approval', approver: ['role:owner'], wait: 'P1D' }], spend: { none: true } } }, h.owner, 'PUT')
 assert.equal(policy.status, 200, policy.text)
 const prepared = agentMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'proposal-create', arguments: { from: budget.id, name: 'Synthetic reviewed proposal', request: 'Prepare a cost alternative' } } })
 const prepare = () => h.send('/api/easel/mcp', prepared, planner)
 const pending = (await prepare()).value.result
 const handle = pending._meta['com.runeditrun/error'].approval
 const path = `/agents/api/approvals/${handle.id}`
 const approval = (await h.get(path)).approval
 const evidence = { revision: approval.revision, summary_sha256: approval.summary_sha256 }
 const beforeApproval = (await h.get('/api/easel/state')).scenarios
 assert.equal((await h.send(`${path}/approve`, evidence, planner)).status, 403)
 assert.deepEqual((await h.get('/api/easel/state')).scenarios, beforeApproval)
 const approved = await h.send(`${path}/approve`, evidence, h.owner)
 assert.equal(approved.status, 200, approved.text)
 assert.equal(approved.value.approval.state, 'executed')
 const proposal = (await prepare()).value.result.structuredContent
 const held = (await h.get(`/api/easel/activity?record=${proposal.id}`)).filter(row => row.detail.authority?.type === 'agent')
 assert.ok(held.length > 0)
 for (const row of held) {
  assert.equal(row.actor, agent.actor)
  assert.equal(row.detail.authority.label, 'MCP client for planner')
  assert.deepEqual(row.detail.authority.approvers.map(person => person.name), ['Fran Finance'])
  assert.notEqual(row.detail.authority.approvers[0].id, row.detail.authority.for.id)
 }
 assert.equal(held.filter(row => row.action === 'proposal-create').length, 1)
 const heldSheet = await workbook(`record=${proposal.id}`)
 const exportedHeld = heldSheet.getRows(3, heldSheet.rowCount - 3).find(row => row.getCell(5).value === 'proposal-create')
 assert.equal(exportedHeld.getCell(4).value, 'MCP client for planner')
 assert.equal(JSON.parse(exportedHeld.getCell(10).value).authority.approvers[0].name, 'Fran Finance')
 // A full export crosses the browse page limit without truncating history.
 for (let i = 0; i < 155; i++) await h.command('comment', { scenario: budget.id, department: department.id, text: `Review note ${i}` }, planner)
 assert.equal((await h.get('/api/easel/activity')).length, 300)
 const completeCsv = await h.send('/api/easel/activity.csv', undefined, h.owner)
 const activityCount = (await h.db.prepare('SELECT COUNT(*) AS n FROM e_activity').first()).n
 assert.equal(completeCsv.text.trim().split('\r\n').length, activityCount + 1)
 // The public portability service carries the complete append-only table.
 const service = await createPortability({ db: h.db, policy: easelPolicy }), exportId = await service.exports.create()
 try {
  while ((await service.exports.advance(exportId, { maxParts: 16 })).phase === 'building') {}
  const records = (await new Response(await service.exports.download(exportId)).text()).trim().split('\n').map(JSON.parse)
  const exported = records.filter(r => r.kind === 'part').flatMap(r => r.items).filter(r => r.kind === 'row' && r.table === 'e_activity').map(r => r.row)
  assert.deepEqual(exported, (await h.db.prepare('SELECT * FROM e_activity ORDER BY seq').all()).results)
 } finally { await service.exports.abort(exportId) }
 const immutable = (await h.db.prepare('SELECT * FROM e_activity ORDER BY seq').all()).results
 const snapshots = (await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results
 await h.command('member', { email: agent.actor, name: 'planner', role: 'contributor', departments: [department.id], active: false })
 const erased = await h.command('person-erase', { email: agent.actor })
 const erasedCsv = await h.send(`/api/easel/activity.csv?record=${proposal.id}`, undefined, h.owner)
 assert.ok(!erasedCsv.text.includes(agent.actor))
 assert.ok(!erasedCsv.text.includes('MCP client for planner'))
 assert.ok(erasedCsv.text.includes(`MCP client for ${erased.pseudonym}`))
 const erasedSheet = await workbook(`record=${proposal.id}`)
 assert.ok(!JSON.stringify(erasedSheet.getSheetValues()).includes('MCP client for planner'))
 assert.ok(JSON.stringify(erasedSheet.getSheetValues()).includes(`MCP client for ${erased.pseudonym}`))
 assert.equal((await prepare()).status, 401, 'An erased sponsor cannot replay the completed action')
 assert.deepEqual((await h.db.prepare('SELECT * FROM e_snapshots ORDER BY id').all()).results, snapshots)
 assert.deepEqual((await h.db.prepare('SELECT * FROM e_activity WHERE seq<=? ORDER BY seq').bind(immutable.at(-1).seq).all()).results, immutable)
})
