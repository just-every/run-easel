import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import JSZip from 'jszip'
import { googleBook, googleHost } from './google-sheets-host.mjs'

async function runningEasel() {
 const worker = new Worker(new URL('./google-sheets-worker.mjs', import.meta.url)), pending = new Map()
 const [{ origin, owner }] = await once(worker, 'message')
 let sequence = 0
 worker.on('message', ({ id, value, error }) => { if (pending.has(id)) { const { resolve, reject } = pending.get(id); pending.delete(id); error ? reject(new Error(error)) : resolve(value) } })
 const rpc = (method, ...args) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); worker.postMessage({ id, method, args }) })
 const send = async (path, body, cookie = owner, expected = 200, headers = {}) => {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
  const value = await response.json(); assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`); return value
 }
 return { origin, owner, rpc, send, get: (path, cookie, expected) => send(path, undefined, cookie, expected),
  command: (op, body, cookie, expected) => send('/api/easel/command/' + op, body, cookie, expected),
  person: (...args) => rpc('person', ...args), close: async () => { await rpc('close'); await worker.terminate() } }
}
async function fixture() {
 const h = await runningEasel()
 await h.command('workspace', { name: 'Synthetic Sheets company', currency: 'USD', planStart: '2026-01' })
 const department = await h.command('department', { name: 'Sales' }), other = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Revenue', type: 'revenue' }), pay = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const scenario = (await h.get('/api/easel/state')).scenarios[0].id
 const row = await h.command('schedule', { scenario, name: 'Sales revenue', department: department.id, line: revenue.id, values: { '2026-01': '100', '2026-02': '200' } })
 const foreign = await h.command('schedule', { scenario, name: 'Operations revenue', department: other.id, line: revenue.id, values: { '2026-01': '400' } })
 await h.command('position', { scenario, title: 'Restricted role Cedar', holder: 'Restricted person Cedar', department: department.id, line: pay.id, start: '2026-01', annualSalary: '120000' })
 const contributor = await h.person('sheets-sales@example.test', 'contributor', [department.id], false), viewer = await h.person('sheets-board@example.test', 'viewer')
 const report = await h.command('report-save', { name: 'Sheets report', scenario, department: '', audience: 'board', report: { row: 'department', period: 'month', through: '2026-02', lines: [revenue.id, pay.id], comparisons: [], highlightBps: 1000 } })
 const book = googleBook(), host = await googleHost({ origin: h.origin, book })
 const admin = (op, body, cookie, expected) => h.send('/api/easel/connections/sheets-addon/' + op, body, cookie, expected)
 const connect = async (person, options = {}) => {
  const approved = await admin('connect', { label: 'Synthetic Sheets', person, spreadsheet: book.id, schedule: 'hourly', writeBack: true, ...options })
  assert.equal(approved.key, undefined, 'Finance cannot receive another person’s key')
  const cookie = person === 'sheets-sales@example.test' ? contributor : person === 'sheets-board@example.test' ? viewer : h.owner
  if (cookie !== h.owner) await admin('claim', { id: approved.id }, h.owner, 403)
  return admin('claim', { id: approved.id }, cookie)
 }
 const credential = await connect('sheets-sales@example.test')
 host.context.easelConfigure({ origin: 'https://easel.example.test', key: credential.key })
 const values = book.sheets[0]
 host.formula(1, 1, `=EASEL_VALUE("Revenue","Sales","2026-01","${scenario}",'_Easel_Data'!$A$1)`)
 host.formula(1, 2, `=EASEL_VALUE("Revenue","Sales","2026-02","${scenario}",'_Easel_Data'!$A$1)`)
 host.formula(1, 3, '=SUM(A1:B1)')
 const view = () => h.get('/api/easel/scenario/' + scenario)
 const payload = async (extra = {}) => { const current = await view(); return { scenario, revision: current.scenario.revision, schedule: current.inputs.schedule.find(r => r.originId === row.originId).id, month: '2026-01', value: '150', ...extra } }
 return { h, host, book, values, scenario, row, foreign, department, other, revenue, pay, viewer, contributor, report, admin, connect, credential, view, payload }
}

test('SHEET-002 Apps Script replays live values, report ranges, menu/open/closed-sheet trigger refresh, filtered viewer and reviewed entry/proposal write-back', async () => {
 const f = await fixture(), { h, host, book, scenario, row, foreign, department, viewer, contributor, report, view, payload } = f
 try {
  host.context.onOpen({}); host.context.onInstall({})
  host.context.easelRefresh(); assert.deepEqual(host.values()[0], [100, 200, 300])
  await h.command('excel-write', await payload({ value: '125' }))
  host.context.easelRefresh(); assert.deepEqual(host.values()[0], [125, 200, 325])
  await h.command('excel-write', await payload({ value: '175' }))
  host.close(); host.open(); host.fire('easelOpenRefresh'); assert.deepEqual(host.values()[0], [175, 200, 375])
  await h.command('excel-write', await payload({ value: '225' }))
  host.close(); host.fire('easelHourlyRefresh')
  assert.deepEqual(host.values()[0], [225, 200, 425], 'Installed time trigger updated the document with no active spreadsheet')
  host.open(); assert.deepEqual(host.values()[0], [225, 200, 425], 'Reopening sees the change already pulled while closed')
  await h.command('request-submissions', { scenario, departments: [department.id] })
  const before = (await view()).scenario.revision
  const direct = host.context.easelWrite(await payload({ value: '150' }))
  assert.equal(direct.mode, 'entry'); assert.equal(direct.revision, before + 1)
  assert.equal((await h.get('/api/easel/scenario/' + scenario, contributor)).inputs.schedule.find(r => r.id === row.id).values['2026-01'], 15000)
  assert.equal((await view()).inputs.schedule.find(r => r.id === row.id).gridRevisions['2026-01'].by, 'sheets-sales@example.test')
  host.context.easelRefresh(); assert.deepEqual(host.values()[0], [150, 200, 350])
  await h.command('submit', { scenario, department: department.id }, contributor)
  const submitted = (await view()).scenario.revision
  assert.equal((await h.get('/api/easel/state')).submissions.find(s => s.department === department.id).submittedRevision, before + 1)
  const proposal = host.context.easelWrite(await payload({ value: '160' }))
  assert.equal(proposal.mode, 'proposal'); assert.equal(proposal.revision, submitted)
  assert.equal((await view()).scenario.revision, submitted); assert.equal((await view()).inputs.schedule.find(r => r.originId === row.originId).values['2026-01'], 15000)
  const proposed = await h.get('/api/easel/scenario/' + proposal.proposal)
  assert.equal(proposed.scenario.branchedFrom.revision, submitted); assert.equal(proposed.scenario.proposalStatus, 'submitted'); assert.equal(proposed.inputs.schedule.find(r => r.originId === row.originId).values['2026-01'], 16000)
  assert.throws(() => host.context.easelWrite({ scenario, revision: 1, schedule: row.id, month: '2026-01', value: '1' }), /plan changed/i)
  assert.throws(() => host.context.easelWrite({ scenario, revision: submitted, schedule: foreign.id, month: '2026-01', value: '1' }), /own departments/i)
  const promoted = await h.command('proposal-promote', { id: proposal.proposal, revision: proposal.proposalRevision })
  assert.equal((await view()).inputs.schedule.find(r => r.originId === row.originId).values['2026-01'], 16000)
  await h.command('return-submission', { scenario, department: department.id, reason: 'Review revised revenue' })
  // A fresh requested/returned department receives another direct entry.
  assert.equal(host.context.easelWrite(await payload({ value: '180' })).mode, 'entry')
  await h.command('submit', { scenario, department: department.id }, contributor)
  const approved = await h.command('approve-budget', { scenario, revision: (await view()).scenario.revision })
  const frozen = await view()
  assert.throws(() => host.context.easelWrite({ scenario, revision: frozen.scenario.revision, schedule: row.id, month: '2026-01', value: '1' }), /read-only/i)
  const forecast = await h.get('/api/easel/scenario/' + approved.forecast.id)
  const kept = await h.command('reforecast-save', { from: approved.forecast.id, revision: forecast.scenario.revision, name: 'Kept Sheets forecast' })
  assert.throws(() => host.context.easelWrite({ scenario: kept.id, revision: kept.revision, schedule: row.id, month: '2026-01', value: '1' }), /read-only/i)
  // A new Google user refreshes the SAME document using only their own key.
  const viewerKey = await f.connect('sheets-board@example.test')
  const board = await googleHost({ origin: h.origin, book })
  board.context.easelConfigure({ origin: 'https://easel.example.test', key: viewerKey.key })
  board.formula(3, 1, `=EASEL_VALUE("Payroll","Sales","2026-01","${scenario}",'_Easel_Data'!$A$1)`)
  board.formula(5, 1, `=EASEL_REPORT("${report.id}","2026-01","budget",'_Easel_Data'!$A$1)`)
  board.context.easelRefresh()
  assert.deepEqual(board.values()[0], [180, 200, 380]); assert.equal(board.values()[2][0], 10000)
  assert.equal(board.values()[4][0][2][1], '$10,180.00')
  assert.doesNotMatch(JSON.stringify(book.getSheetByName('_Easel_Data').data), /Restricted|120000|inputs|sources|trace/)
  assert.throws(() => board.context.easelWrite({ scenario, revision: frozen.scenario.revision, schedule: row.id, month: '2026-01', value: '1' }), /does not allow write-back/i)
  await h.command('member', { email: 'sheets-board@example.test', name: 'Board', role: 'viewer', active: false })
  assert.throws(() => board.context.easelRefresh(), /not added/i)
  assert.match(board.values()[0][0], /#ERROR/); assert.match(board.values()[0][2], /#ERROR/)
  assert.equal(book.getSheetByName('_Easel_Data').data.length, 1, 'Revocation clears every previous successful value and report')
 } finally { await h.close() }
})

test('SHEET-002 custody, native administration, current Pay and scoped authority, trigger stop, failures, archive exclusion and authoritative key revocation', async () => {
 const f = await fixture(), { h, host, book, credential, admin, scenario, view, payload, department, pay } = f
 try {
  const raw = await h.rpc('secretRows')
  assert.ok(raw.results[0].sealed); assert.doesNotMatch(JSON.stringify(raw), new RegExp(credential.key)); assert.doesNotMatch(JSON.stringify(raw), /easgs_/)
  const status = await h.get('/api/easel/connections/sheets-addon')
  const connection = status.connections.find(c => c.id === credential.id)
  assert.equal(connection.credential, '••••' + credential.key.slice(-4)); assert.equal(connection.person, 'sheets-sales@example.test')
  assert.equal(connection.owner, 'owner@example.test'); assert.equal(connection.schedule, 'hourly'); assert.equal(connection.spreadsheet, book.id)
  for (const cookie of [f.contributor, f.viewer]) {
   await h.get('/api/easel/connections/sheets-addon', cookie, 403)
   await admin('disconnect', { id: credential.id }, cookie, 403)
   await admin('schedule', { id: credential.id, schedule: 'manual' }, cookie, 403)
  }
  const headers = { 'X-Easel-Sheets-Key': credential.key, 'X-Easel-Spreadsheet': book.id }
  await h.send('/api/easel/connections/sheets-addon/disconnect', { id: credential.id }, '', 403, headers)
  await h.send('/api/easel/command/proposal-promote', { id: 'invented', revision: 1 }, '', 403, headers)
  await h.send('/api/easel/google-sheets/refresh', { reason: 'menu', bindings: [] }, '', 403, { ...headers, 'X-Easel-Spreadsheet': 'different-spreadsheet' })
  await h.send('/api/easel/google-sheets/refresh', { reason: 'menu', bindings: [] }, '', 401, { ...headers, 'X-Easel-Sheets-Key': credential.key.slice(0, -1) + (credential.key.endsWith('0') ? '1' : '0') })
  await h.rpc('stepUp')
  const token = await h.send('/api/easel/tokens/issue', { label: 'Synthetic general integration', kind: 'personal', scope: 'write' })
  await h.send('/api/easel/connections/sheets-addon/disconnect', { id: credential.id }, '', 403, { authorization: `Bearer ${token.token}` })
  await h.send('/api/easel/google-sheets/refresh', { reason: 'menu', bindings: [] }, '', 403, { authorization: `Bearer ${token.token}` })
  host.context.easelRefresh()
  const health = (await h.get('/api/easel/connections/sheets-addon')).connections[0]
  assert.equal(health.rowCount, 2); assert.ok(health.lastRefresh); assert.equal(health.error, null); assert.equal(health.rateLimit, null)
  await admin('schedule', { id: credential.id, schedule: 'manual' })
  host.close(); host.fire('easelHourlyRefresh'); host.open()
  assert.deepEqual(host.values()[0], [100, 200, 300], 'A disabled hourly schedule makes no data pull')
  host.context.easelRefresh(); assert.deepEqual(host.values()[0], [100, 200, 300])
  host.fault({ status: 429, body: '{"error":"API request limit reached; try again after Retry-After seconds"}' })
  const count = host.calls.length
  assert.throws(() => host.context.easelRefresh(), /Retry-After/); assert.equal(host.calls.length, count + 1, 'No automatic retries, including on rate limits')
  assert.match(host.values()[0][0], /#ERROR/)
  host.fault(null); host.context.easelRefresh()
  host.fault({ throw: true }); assert.throws(() => host.context.easelWrite({ scenario, revision: 1, schedule: 'row', month: '2026-01', value: '1' }), /never retried/)
  host.fault(null)
  // No-pay contributor cannot turn the spreadsheet door into a payroll edit.
  const payRow = await h.command('schedule', { scenario, name: 'Private payroll input', department: department.id, line: pay.id, values: { '2026-01': '1000' } })
  await h.command('request-submissions', { scenario, departments: [department.id] })
  const payPayload = await payload({ schedule: payRow.id, value: '1' })
  assert.throws(() => host.context.easelWrite(payPayload), /Pay detail/i)
  // A complete archive contains metadata, never the sealed or raw add-on key.
  const exported = await fetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } })
  assert.equal(exported.status, 200)
  const zip = await JSZip.loadAsync(await exported.arrayBuffer())
  const contents = (await Promise.all(Object.values(zip.files).filter(f => !f.dir).map(f => f.async('string')))).join('')
  assert.doesNotMatch(contents, new RegExp(credential.key)); assert.doesNotMatch(contents, new RegExp(raw.results[0].sealed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const portable = await h.rpc('portableArchive')
  assert.ok(!JSON.parse(portable.trim().split('\n')[0]).tables.some(t => t.name === 'e_connection_secrets'))
  assert.ok(!portable.includes(credential.key) && !portable.includes(raw.results[0].sealed), 'The rer export archive policy excludes raw and sealed keys')
  await h.command('member', { email: 'sheets-sales@example.test', name: 'Sales planner', role: 'contributor', departments: [f.other.id] })
  host.context.easelRefresh(); assert.match(host.values()[0][0], /#ERROR/); assert.match(host.values()[0][2], /#ERROR/)
  await admin('disconnect', { id: credential.id })
  const disconnected = (await h.get('/api/easel/connections/sheets-addon')).connections[0]
  assert.equal(disconnected.connected, false); assert.equal(disconnected.credential, null); assert.equal(disconnected.providerRevocation.status, 'confirmed')
  assert.match(disconnected.providerRevocation.ownerAction, /Google Account/)
  assert.equal((await h.rpc('secretRows')).results.length, 0)
  assert.throws(() => host.context.easelRefresh(), /Reconnect/); assert.match(host.values()[0][0], /#ERROR/)
  const removed = host.context.easelDisconnect(); assert.match(removed.message, /Google authorization/); assert.equal(host.properties.size, 0); assert.equal(host.triggers.length, 0)
  const activity = await h.get('/api/easel/activity')
  assert.match(JSON.stringify(activity), /sheets-addon-connected/); assert.match(JSON.stringify(activity), /sheets-addon-schedule/); assert.match(JSON.stringify(activity), /sheets-addon-disconnected/)
  assert.doesNotMatch(JSON.stringify(activity), new RegExp(credential.key))
 } finally { await h.close() }
})
