import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness, agentMessage } from './harness.mjs'

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
 const secondResponse = await h.mf.dispatchFetch(`${h.origin}/api/easel/mcp`, { method: 'POST', headers: { origin: h.origin, cookie: finance, 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify(agentMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'comment', arguments: { scenario: budget.id, department: department.id, text: 'Synthetic independent finance review.' } } })) })
 assert.equal(secondResponse.status, 200)
 assert.ok(!(await secondResponse.json()).result.isError)
 const secondAgent = (await h.get('/api/easel/activity')).find(row => row.action === 'comment' && row.actor === ['finance', 'example.test'].join('@') && row.detail.authority?.type === 'agent')
 assert.equal(secondAgent.actor, ['finance', 'example.test'].join('@'))
 assert.equal(secondAgent.detail.authority.type, 'agent')
 assert.equal(secondAgent.detail.authority.via, 'mcp')
 assert.notEqual(secondAgent.detail.authority.id, agent.detail.authority.id)
 assert.notEqual(secondAgent.detail.authority.for.id, agent.detail.authority.for.id)
 assert.equal(secondAgent.detail.authority.for.name, 'finance')
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
})
