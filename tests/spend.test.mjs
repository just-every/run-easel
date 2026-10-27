import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { spendProvider, spendKeys, spendFixture } from './spend-fixture.mjs'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'

test('Reviewed Ramp cards and Purse POs replace one forecast assumption with exact nonduplicated department spend under native custody', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test', COASTER_ORIGIN: 'https://coaster.example.test' }, outbound: provider.outbound, now: () => '2026-02-15T12:00:00Z' }); t.after(() => h.close())
 const route = (...parts) => parts.join('/')
 const f = await spendFixture(h), post = async (path, body, status = 200, cookie = h.owner) => { const r = await h.send('/api/easel/' + path, body, cookie); assert.equal(r.status, status, r.text); return r.value }
 for (const p of ['ramp','purse','coaster','brex']) {
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: false }, 400)
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: true })
 }
 const secrets = await h.db.prepare('SELECT sealed FROM e_connection_secrets').all()
 assert.equal(secrets.results.length, 4)
 for (const key of Object.values(spendKeys)) assert.ok(!JSON.stringify(secrets).includes(key), 'Stored credentials are sealed')
 const status = await h.get('/api/easel/connections/spend/ramp')
 assert.equal(status.suffix, '1001'); assert.equal(status.scope, 'transactions:read'); assert.equal(status.schedule, 'Manual'); assert.ok(!JSON.stringify(status).includes(spendKeys.ramp))
 assert.equal(status.owner, 'owner@example.test')
 const before = await h.get('/api/easel/scenario/' + f.forecast.id)
 const preview = await post(route('spend','preview'), f.input)
 assert.deepEqual([preview.budget, preview.committed, preview.actual, preview.remaining, preview.forecast], [100000,37975,12025,50000,50000], 'A linked card is actual once and reduces its PO commitment once')
 assert.deepEqual(preview.rows.map(r => `${r.provider}:${r.id}`), ['ramp:synthetic-easel-101','purse:synthetic-easel-102'])
 assert.deepEqual(await h.get('/api/easel/scenario/' + f.forecast.id), before, 'Preview writes no forecast data')
 assert.deepEqual(await h.get('/api/easel/spend'), [])
 const unlinked = await post(route('spend','preview'), { ...f.input, mapping: f.input.mapping.map(({ order, ...m }) => m) })
 assert.deepEqual([unlinked.actual,unlinked.committed,unlinked.remaining,unlinked.forecast], [12025,50000,37975,62025], 'An unlinked card remains separate spend rather than silently releasing a PO')
 await post(route('spend','preview'), { ...f.input, mapping: [] }, 400)
 await post(route('spend','preview'), { ...f.input, mapping: f.input.mapping.map(r => ({ ...r, department: 'synthetic-easel-999' })) }, 400)
 provider.state.card = 12125
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint }, 409)
 provider.state.card = 12025
 provider.state.po = 10000; await post(route('spend','preview'), f.input, 409); provider.state.po = 50000
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint })
 const accepted = await h.get('/api/easel/scenario/' + f.forecast.id)
 assert.equal(accepted.calculation.cells.find(c => c.line === f.line.id && c.department === f.department.id && c.month === '2026-01').amount, 50000, 'Accepted source replaces the 100000-cent assumption rather than adding to it')
 assert.equal(accepted.inputs.expense.length, 1)
 const refreshed = await h.get('/api/easel/connections/spend/ramp'); assert.equal(refreshed.rowCount, 1); assert.equal(refreshed.lastRefresh, '2026-02-15T12:00:00Z')
 assert.equal((await h.get('/api/easel/spend'))[0].forecastChanged, false)
 await post(route('spend','accept'), { ...f.input, fingerprint: preview.fingerprint }, 409)
 const again = { ...f.input, revision: accepted.scenario.revision }, p2 = await post(route('spend','preview'), again)
 await post(route('spend','accept'), { ...again, fingerprint: p2.fingerprint })
 assert.equal((await h.get('/api/easel/scenario/' + f.forecast.id)).calculation.cells.find(c => c.line === f.line.id && c.month === '2026-01').amount, 50000, 'Repeated reviews never duplicate sources')
 assert.equal((await h.get('/api/easel/scenario/' + f.budget.id)).calculation.cells.find(c => c.line === f.line.id && c.month === '2026-01').amount, 100000, 'Approved budget remains frozen')
 provider.state.next = 'https://untrusted.example.test/'; await post(route('spend','preview'), { ...again, revision: accepted.scenario.revision + 1 }, 502); provider.state.next = null
 provider.state.currency = 'EUR'; await post(route('spend','preview'), { ...again, revision: accepted.scenario.revision + 1 }, 409); provider.state.currency = 'USD'
 for (const code of [302,429,500]) {
  provider.state.status = code; await post(route('spend','sources'), { orders: f.input.orders, month: f.input.month }, 502)
  if (code === 429) assert.match((await h.get('/api/easel/connections/spend/ramp')).rateLimit, /rate limit/)
 }
 assert.match((await h.get('/api/easel/connections/spend/ramp')).error, /HTTP 500/)
 assert.ok(provider.state.calls.every(url => !url.includes('untrusted')), 'Neither redirects nor pagination can send a credential to another origin')
 provider.state.status = 200
 const planner = await h.person('synthetic-easel-201@example.test', 'contributor', [f.department.id])
 await post(route('spend','preview'), again, 403, planner)
 const reader = await h.person('synthetic-easel-200@example.test', 'viewer')
 await post(route('spend','preview'), again, 403, reader)
 await h.get('/api/easel/connections/spend/ramp', reader, 403)
 for (const cookie of [planner, reader]) for (const p of ['ramp','purse','coaster','brex']) {
  await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: true }, 403, cookie)
  await post(route('connections','spend',p,'disconnect'), {}, 403, cookie)
 }
 await h.stepUp()
 const issued = await post(route('tokens','issue'), { label: 'Synthetic spend caller', kind: 'personal', scope: 'write', expiresInSeconds: 3600 })
 for (const path of [route('connections','spend','ramp'),'spend']) {
  const r = await h.mf.dispatchFetch(h.origin + '/api/easel/' + path, { headers: { authorization: `Bearer ${issued.token}` } }); assert.equal(r.status,403,'Finance API credentials cannot read native-only spend custody or source detail')
 }
 const tokenWrite = await h.mf.dispatchFetch(h.origin + '/api/easel/spend/accept', { method: 'POST', headers: { authorization: `Bearer ${issued.token}`, 'content-type': ['application','json'].join('/') }, body: JSON.stringify(again) }); assert.equal(tokenWrite.status,403)
 const tokenDisconnect = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/spend/ramp/disconnect', { method: 'POST', headers: { authorization: `Bearer ${issued.token}`, 'content-type': ['application','json'].join('/') }, body: '{}' }); assert.equal(tokenDisconnect.status,403)
 const cross = await h.mf.dispatchFetch(h.origin + '/api/easel/connections/spend/ramp/disconnect', { method: 'POST', headers: { cookie: h.owner, origin: 'https://untrusted.example.test', 'content-type': ['application','json'].join('/') }, body: '{}' }); assert.equal(cross.status, 403)
 const archive = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } }); assert.equal(archive.status, 200)
 const { default: JSZip } = await import('jszip'), zip = await JSZip.loadAsync(await archive.arrayBuffer())
 for (const file of Object.values(zip.files).filter(f => !f.dir)) { const body = await file.async('string'); for (const key of Object.values(spendKeys)) assert.ok(!body.includes(key), 'Open archive excludes plaintext credentials'); for (const row of secrets.results) assert.ok(!body.includes(row.sealed), 'Open archive excludes sealed credentials') }
 const portable = await createPortability({ db: h.db, policy: easelPolicy }), archiveId = await portable.exports.create()
 try {
  while ((await portable.exports.advance(archiveId, { maxParts: 16 })).phase === 'building') {}
  const body = await new Response(await portable.exports.download(archiveId)).text(), records = body.trim().split('\n').map(JSON.parse)
  assert.ok(!records[0].tables.some(t => t.name === 'e_connection_secrets'))
  for (const key of Object.values(spendKeys)) assert.ok(!body.includes(key))
  for (const row of secrets.results) assert.ok(!body.includes(row.sealed))
 } finally { await portable.exports.abort(archiveId) }
 // An archive restores connection metadata without the deliberately excluded credentials.
 await h.db.prepare('DELETE FROM e_connection_secrets').run()
 for (const p of ['ramp','purse','coaster','brex']) {
  const restored = await h.get('/api/easel/' + route('connections','spend',p))
  assert.equal(restored.connected, false); assert.equal(restored.canDisconnect, true); assert.match(restored.error, /Reconnect after restore/)
  const reconnected = await post(route('connections','spend',p,'connect'), { key: spendKeys[p], consent: true })
  assert.equal(reconnected.connected, true, 'Restored metadata cannot strand native reconnect when the excluded credential is absent')
 }
 for (const p of ['ramp','purse','coaster','brex']) { const disconnected = await post(route('connections','spend',p,'disconnect'), {}); assert.equal(disconnected.connected, false); assert.equal(disconnected.providerRevocation.status, 'unsupported'); assert.match(disconnected.ownerStep, /cannot confirm provider revocation/) }
 assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM e_connection_secrets').first()).n, 0)
 assert.equal((await h.get('/api/easel/spend')).length, 1, 'Disconnect retains accepted evidence')
 const activity = await h.get('/api/easel/activity'); assert.match(JSON.stringify(activity), /spend-connected/); assert.match(JSON.stringify(activity), /spend-disconnected/)
})

test('Reviewed refunds, authenticated Purse bill settlements and PO releases conserve exact spend without duplicate payments', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test' }, outbound: provider.outbound, now: () => '2026-02-15T12:00:00Z' }); t.after(() => h.close())
 const f = await spendFixture(h), post = async (op, b, status = 200) => { const r = await h.send('/api/easel/spend/' + op, b, h.owner); assert.equal(r.status, status, r.text); return r.value }
 for (const p of ['ramp','purse']) assert.equal((await h.send(`/api/easel/connections/spend/${p}/connect`, { key: spendKeys[p], consent: true }, h.owner)).status,200)
 provider.state.refunds = [-2025]
 const refundMap = { ...f.input.mapping[0], source: 'ramp:synthetic-easel-110' }, input = { ...f.input, mapping: [...f.input.mapping, refundMap] }
 let preview = await post('preview', input)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.released,preview.forecast],[10000,40000,50000,0,50000], 'A signed refund reopens its linked PO balance and reduces actual once')
 provider.state.bills = [{ id: 'synthetic-easel-401', reference: 'BILL-401', currency: 'USD', totalMinor: 12025, paymentStatus: 'unknown' }]
 assert.deepEqual((await post('preview',input)).rows.map(r => r.id), ['synthetic-easel-101','synthetic-easel-110','synthetic-easel-102'], 'A bill without authenticated payment is not actual spend')
 provider.state.bills[0].paymentStatus = 'paid'; provider.state.bills[0].paymentStatusAt = '2026-01-16T12:00:00Z'
 const billMap = { ...f.input.mapping[1], source: 'purse:synthetic-easel-102--synthetic-easel-401', duplicateOf: 'ramp:synthetic-easel-101' }
 const paid = { ...input, mapping: [...input.mapping,billMap] }
 preview = await post('preview', paid)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[10000,40000,50000,50000], 'The same paid bill and card expense count once after explicit equal-value reconciliation')
 await post('preview', { ...paid, mapping: paid.mapping.map(m => m.source === billMap.source ? { ...m, order: 'synthetic-easel-999' } : m) },400)
 provider.state.poStatus = 'closed'
 await post('accept',{ ...paid,fingerprint:preview.fingerprint },409)
 preview = await post('preview', paid)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.released,preview.forecast],[10000,0,90000,40000,10000], 'Closing a PO releases exactly the unpaid balance while retaining net paid actual')
 await post('accept',{ ...paid,fingerprint:preview.fingerprint })
 const view = await h.get('/api/easel/scenario/' + f.forecast.id)
 assert.equal(view.calculation.cells.find(r => r.line === f.line.id && r.department === f.department.id && r.month === '2026-01').amount,10000)
 assert.equal((await h.get('/api/easel/spend'))[0].released,40000)
 const fresh = { ...paid,revision:view.scenario.revision }
 provider.state.bills[0].totalMinor = 12026
 await post('preview',fresh,409)
 provider.state.bills[0].totalMinor = 12025; provider.state.bills[0].paymentStatusAt = null
 await post('preview',fresh,502)
 provider.state.bills = []; provider.state.refunds = [-12026]
 await post('preview',{...input,revision:view.scenario.revision},409)
 provider.state.card = Number.MAX_SAFE_INTEGER; provider.state.po = Number.MAX_SAFE_INTEGER; provider.state.poStatus = 'issued'; provider.state.refunds = [1,-1]
 await post('preview',{...input,revision:view.scenario.revision,mapping:[...f.input.mapping,refundMap,{...refundMap,source:'ramp:synthetic-easel-111'}]},409)
 assert.equal((await h.get('/api/easel/scenario/' + f.forecast.id)).scenario.revision,view.scenario.revision,'Refused corrections do not change the forecast')
})

test('Scoped final Coaster reports move from approved obligation to reimbursed actual with fresh reviewed provenance', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test', COASTER_ORIGIN: 'https://coaster.example.test' }, outbound: provider.outbound, now: () => '2026-02-15T12:00:00Z' }); t.after(() => h.close())
 const f = await spendFixture(h), post = async (op,b,status=200) => { const r = await h.send('/api/easel/spend/'+op,b,h.owner); assert.equal(r.status,status,r.text); return r.value }
 for (const p of ['ramp','purse','coaster','brex']) assert.equal((await h.send(`/api/easel/connections/spend/${p}/connect`,{key:spendKeys[p],consent:true},h.owner)).status,200)
 const input = { ...f.input,reports:['synthetic-easel-301'],mapping:[...f.input.mapping,{...f.input.mapping[1],source:'coaster:synthetic-easel-301'}] }
 let preview = await post('preview',input)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[12025,44986,42989,57011])
 assert.equal(preview.rows.find(r=>r.provider==='coaster').revision,2)
 await post('accept',{...input,fingerprint:preview.fingerprint})
 const accepted = await h.get('/api/easel/scenario/'+f.forecast.id), fresh = {...input,revision:accepted.scenario.revision}
 provider.state.reportStatus='reimbursed'
 await post('accept',{...fresh,fingerprint:preview.fingerprint},409)
 preview=await post('preview',fresh)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[19036,37975,42989,57011],'Reimbursement converts the same report from obligation to actual without changing total expense')
 assert.equal(preview.rows.find(r=>r.provider==='coaster').payment.source,'external-recording','External reimbursement recording is not claimed as bank settlement')
 await post('accept',{...fresh,fingerprint:preview.fingerprint})
 const current=await h.get('/api/easel/scenario/'+f.forecast.id), next={...input,revision:current.scenario.revision}
 const onlyReport = { ...next, providers:['coaster'], orders:[], mapping: next.mapping.filter(m => m.source.startsWith('coaster:')) }
 const callCount = provider.state.calls.length
 const isolated = await post('preview',onlyReport)
 assert.deepEqual([isolated.actual,isolated.committed,isolated.remaining,isolated.forecast],[7011,0,92989,7011])
 assert.equal(provider.state.calls.length,callCount+1,'A selected Coaster report never requires unrelated card or PO reads')
 provider.state.reportApproved=false; await post('preview',next,502)
 provider.state.reportApproved=true; provider.state.reportStatus='draft'; await post('preview',next,502)
 assert.equal((await h.get('/api/easel/scenario/'+f.forecast.id)).scenario.revision,current.scenario.revision)
})

test('Reviewed ledger matches remove only explicit equal source overlaps and preserve additional actuals without posting entries', async t => {
 const provider=spendProvider(),h=await harness({bindings:{PURSE_ORIGIN:'https://purse.example.test'},outbound:provider.outbound,now:()=> '2026-02-15T12:00:00Z'}); t.after(()=>h.close())
 const f=await spendFixture(h),post=async(op,b,status=200)=>{const r=await h.send('/api/easel/spend/'+op,b,h.owner);assert.equal(r.status,status,r.text);return r.value}
 for(const p of ['ramp','purse']) assert.equal((await h.send(`/api/easel/connections/spend/${p}/connect`,{key:spendKeys[p],consent:true},h.owner)).status,200)
 await h.command('account-map',{account:'500',target:f.line.id});await h.command('department-map',{source:'Operations',department:f.department.id})
 const actuals={filename:'synthetic-easel-501.csv',csv:'Date,Account,Department,Amount,Reference\n2026-01-15,500,Operations,120.25,synthetic-easel-502\n2026-01-16,500,Operations,20.00,synthetic-easel-503\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',reference:'Reference'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 const planned=await h.kit('actuals','preview',actuals);await h.kit('actuals','commit',{...actuals,fingerprint:planned.fingerprint})
 const before=await h.get('/api/easel/scenario/'+f.forecast.id),input={...f.input,revision:before.scenario.revision}
 const ledger=await post('ledger',input)
 assert.equal(ledger.total,14025);assert.deepEqual(ledger.rows.map(r=>r.amount),[12025,2000])
 await post('preview',input,409)
 const reconciled={...input,ledgerConfirmed:true,ledgerMapping:ledger.rows.map((r,i)=>({row:r.id,source:i===0?'ramp:synthetic-easel-101':null}))}
 let preview=await post('preview',reconciled)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[14025,37975,48000,52000],'Matched card is not counted again and an independent ledger expense remains')
 await post('preview',{...reconciled,ledgerConfirmed:false},409)
 await post('preview',{...reconciled,ledgerMapping:reconciled.ledgerMapping.map(r=>({...r,source:'ramp:synthetic-easel-101'}))},409)
 const parts = {...input,ledgerConfirmed:true,ledgerMapping:[{row:ledger.rows[0].id,matches:[{source:'ramp:synthetic-easel-101',amount:'100.25'}]},{row:ledger.rows[1].id,matches:[{source:'ramp:synthetic-easel-101',amount:'20.00'}]}]}
 const split = await post('preview',parts)
 assert.deepEqual([split.actual,split.committed,split.remaining,split.forecast],[14025,37975,48000,52000],'A card payment split across ledger rows is removed exactly once and the unmatched amount remains actual')
 assert.deepEqual(split.ledgerRows.map(r=>[r.matches[0].amount,r.additionalAmount]),[[10025,2000],[2000,0]])
 const overmatched=structuredClone(parts);overmatched.ledgerMapping[0].matches[0].amount='100.26';await post('preview',overmatched,409)
 const reversed=structuredClone(parts);reversed.ledgerMapping[0].matches[0].amount='-100.25';await post('preview',reversed,409)
 const repeated=structuredClone(parts);repeated.ledgerMapping[0].matches.push({source:'ramp:synthetic-easel-101',amount:'1.00'});await post('preview',repeated,409)
 provider.state.refunds=[6000]
 const combined={...input,ledgerConfirmed:true,mapping:[...input.mapping,{...input.mapping[0],source:'ramp:synthetic-easel-110'}],ledgerMapping:[{row:ledger.rows[0].id,matches:[{source:'ramp:synthetic-easel-101',amount:'100.25'},{source:'ramp:synthetic-easel-110',amount:'20.00'}]},{row:ledger.rows[1].id,matches:[{source:'ramp:synthetic-easel-101',amount:'20.00'}]}]}
 const combinedPreview=await post('preview',combined)
 assert.deepEqual([combinedPreview.actual,combinedPreview.committed,combinedPreview.remaining,combinedPreview.forecast],[18025,31975,50000,50000],'Several source actuals may reconcile one ledger row without removing a provider amount twice')
 assert.deepEqual(combinedPreview.ledgerRows.map(r=>r.additionalAmount),[0,0])
 provider.state.refunds=[]
 const allocatedResidual=structuredClone(parts);allocatedResidual.ledgerMapping[0].order='synthetic-easel-102'
 const residual=await post('preview',allocatedResidual);assert.deepEqual([residual.actual,residual.committed,residual.remaining,residual.forecast],[14025,35975,50000,50000],'Only the unmatched ledger remainder reduces the linked PO in addition to the provider payment')
 const noResidual=structuredClone(parts);noResidual.ledgerMapping[1].order='synthetic-easel-102';await post('preview',noResidual,409)
 const linked={...reconciled,ledgerMapping:reconciled.ledgerMapping.map((r,i)=>i===1?{...r,order:'synthetic-easel-102'}:r)}
 await post('accept',{...linked,fingerprint:preview.fingerprint},409)
 preview=await post('preview',linked)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[14025,35975,50000,50000],'An explicit independent ledger payment reduces its PO once')
 const count=await h.db.prepare('SELECT COUNT(*) n FROM e_actuals').first()
 await post('accept',{...linked,fingerprint:preview.fingerprint})
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) n FROM e_actuals').first(),count,'Spend review never posts accounting entries')
 const accepted=await h.get('/api/easel/scenario/'+f.forecast.id)
 assert.equal(accepted.calculation.cells.find(r=>r.line===f.line.id&&r.department===f.department.id&&r.month==='2026-01').amount,50000)
 assert.equal((await h.get('/api/easel/spend'))[0].ledgerRows.length,2)
 const reader=await h.person('synthetic-easel-504@example.test','viewer')
 const refused=await h.send('/api/easel/spend/ledger',{...linked,revision:accepted.scenario.revision},reader);assert.equal(refused.status,403)
 await h.command('close-month',{scenario:f.forecast.id,month:'2026-01'})
 await post('ledger',{...linked,revision:(await h.get('/api/easel/scenario/'+f.forecast.id)).scenario.revision},409)
})


test('Reviewed Brex settlements and exact recurring allocations replace all selected months atomically while preserving unreviewed assumptions', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test' }, outbound: provider.outbound, now: () => '2026-03-15T12:00:00Z' }); t.after(() => h.close())
 const f = await spendFixture(h, { recurring: true }), post = async (op, b, status = 200, cookie = h.owner) => { const r = await h.send('/api/easel/spend/' + op, b, cookie); assert.equal(r.status, status, r.text); return r.value }
 for (const p of ['ramp','purse','brex']) assert.equal((await h.send(`/api/easel/connections/spend/${p}/connect`, { key: spendKeys[p], consent: true }, h.owner)).status, 200)
 const months = ['2026-01','2026-02'], amounts = { 'ramp:synthetic-easel-101': ['120.25','0.00'], 'purse:synthetic-easel-102': ['300.00','200.00'], 'brex:synthetic-easel-601': ['0.00','80.00'], 'brex:synthetic-easel-602': ['0.00','-10.00'] }
 const input = { ...f.input, providers: ['ramp','purse','brex'], months, mapping: Object.entries(amounts).map(([source, values]) => ({ source, line: f.line.id, department: f.department.id, month: '2026-01', ...(source.startsWith('purse:') ? {} : { order: 'synthetic-easel-102' }), allocations: Object.fromEntries(months.map((m, i) => [m, values[i]])) })) }
 const sources = await post('sources', { providers: ['brex'], month: '2026-02' })
 assert.deepEqual(sources.map(r => [r.id,r.amount,r.rawAmount,r.status]), [['synthetic-easel-601',8000,-8000,'PURCHASE'],['synthetic-easel-602',-1000,1000,'REFUND']], 'Brex transaction type determines spend direction; account collections never become an expense')
 assert.deepEqual(await post('sources', { providers: ['brex'], month: '2026-01' }), [], 'Posted dates select the requested accounting month')
 provider.state.brexType='BNPL_FEE'; assert.equal((await post('sources',{providers:['brex'],month:'2026-02'}))[0].amount,8000,'A settled card fee remains expense rather than an account transfer'); provider.state.brexType='PURCHASE'
 const status = await h.get('/api/easel/connections/spend/brex'); assert.equal(status.scope,'transactions.card.readonly'); assert.equal(status.suffix,'1004')
 const before = await h.get('/api/easel/scenario/' + f.forecast.id)
 let preview = await post('preview', input)
 assert.deepEqual(preview.cells.map(r => [r.month,r.budget,r.actual,r.committed,r.remaining,r.forecast]), [['2026-01',100000,12025,17975,70000,30000],['2026-02',100000,7000,13000,80000,20000]], 'Every source is allocated exactly once across the independently expected monthly cells')
 assert.deepEqual(await h.get('/api/easel/scenario/' + f.forecast.id),before,'The complete schedule preview writes nothing')
 provider.state.bills = [{id:'synthetic-easel-623',reference:'BILL-623',currency:'USD',totalMinor:10000,paymentStatus:'paid',paymentStatusAt:'2026-01-16T12:00:00Z'}]
 const splitBill = {...input,mapping:[...input.mapping,{...input.mapping[1],source:'purse:synthetic-easel-102--synthetic-easel-623',allocations:{'2026-01':'100.00','2026-02':'0.00'},duplicateOf:'ramp:synthetic-easel-101',duplicateAmounts:{'2026-01':'100.00','2026-02':'0.00'}}]}
 const scheduledMatch = await post('preview',splitBill)
 assert.deepEqual(scheduledMatch.cells.map(r=>[r.month,r.actual,r.committed,r.remaining]),[['2026-01',12025,17975,70000],['2026-02',7000,13000,80000]],'Duplicate parts reconcile only the explicitly matching monthly allocations')
 const shifted = structuredClone(splitBill); shifted.mapping[4].duplicateAmounts={'2026-01':'99.00','2026-02':'1.00'}; await post('preview',shifted,409)
 const incompleteMatch = structuredClone(splitBill); delete incompleteMatch.mapping[4].duplicateAmounts['2026-02']; await post('preview',incompleteMatch,409)
 provider.state.bills = []
 const changed = structuredClone(input); changed.mapping[1].allocations['2026-02'] = '199.99'; await post('preview',changed,409)
 const unsafe = structuredClone(input); unsafe.mapping[0].allocations = {'2026-01':'121.25','2026-02':'-1.00'}; await post('preview',unsafe,409)
 const missing = structuredClone(input); delete missing.mapping[1].allocations['2026-02']; await post('preview',missing,400)
 await post('preview',{...input,months:['2026-02','2026-01']},400)
 await post('preview',{...input,months:undefined},409)
 provider.state.brexDate = '2026-02-16'; await post('accept',{...input,fingerprint:preview.fingerprint},409); provider.state.brexDate = '2026-02-15'
 const remapped = structuredClone(input); remapped.mapping[1].allocations = {'2026-01':'310.00','2026-02':'190.00'}; await post('accept',{...remapped,fingerprint:preview.fingerprint},409)
 const reader = await h.person('synthetic-easel-620@example.test','viewer'); await post('preview',input,403,reader)
 await post('accept',{...input,fingerprint:preview.fingerprint})
 let accepted = await h.get('/api/easel/scenario/' + f.forecast.id)
 assert.deepEqual(accepted.calculation.cells.filter(r => r.line === f.line.id && r.department === f.department.id && ['2026-01','2026-02','2026-03'].includes(r.month)).map(r => [r.month,r.amount]), [['2026-01',30000],['2026-02',20000],['2026-03',100000]], 'Only reviewed recurring months change; later assumptions retain the original amount')
 assert.deepEqual(accepted.inputs.expense[0].spendMonths, {'2026-01':30000,'2026-02':20000})
 assert.equal(accepted.inputs.expense[0].amountCents,100000)
 assert.deepEqual((await h.get('/api/easel/spend'))[0].cells.map(r => [r.month,r.actual,r.committed]), [['2026-01',12025,17975],['2026-02',7000,13000]])
 const fresh = {...input,revision:accepted.scenario.revision}
 await post('preview',{...fresh,months:['2026-01']},409)
 preview = await post('preview',fresh); await post('accept',{...fresh,fingerprint:preview.fingerprint})
 accepted = await h.get('/api/easel/scenario/' + f.forecast.id)
 assert.deepEqual(accepted.inputs.expense[0].spendMonths,{'2026-01':30000,'2026-02':20000},'Repeated source reads replace rather than append')
 const otherLine = await h.command('line',{name:'Other supplier cost',type:'operating-expense'})
 await h.command('expense',{scenario:f.forecast.id,name:'Other assumption',kind:'recurring',line:otherLine.id,department:f.department.id,start:'2026-01',amount:'1000'})
 const updated = await h.get('/api/easel/scenario/' + f.forecast.id), other = updated.inputs.expense.find(r => r.line === otherLine.id)
 await post('preview',{...input,revision:updated.scenario.revision,driver:other.id,mapping:input.mapping.map(r=>({...r,line:otherLine.id}))},409)
 for (const type of ['CHARGEBACK','UNRECOGNIZED']) { provider.state.brexType = type; await post('sources',{providers:['brex'],month:'2026-02'},502) }
 provider.state.brexType = 'PURCHASE'; provider.state.brexCurrency = 'EUR'; await post('preview',{...input,revision:updated.scenario.revision},409); provider.state.brexCurrency = 'USD'
 provider.state.brexAmount = 0.1; await post('sources',{providers:['brex'],month:'2026-02'},502); provider.state.brexAmount = -8000
 provider.state.status = 302; await post('sources',{providers:['brex'],month:'2026-02'},502); provider.state.status = 200
 assert.ok(!provider.state.calls.some(u=>u.includes('untrusted')))
 assert.equal((await h.get('/api/easel/connections/spend/ramp')).error,null,'A failed Brex-only read does not mark an unread Ramp connection unhealthy')
 await h.command('account-map',{account:'500',target:f.line.id}); await h.command('department-map',{source:'Operations',department:f.department.id})
 const closeData = {filename:'synthetic-easel-621.csv',csv:'Date,Account,Department,Amount,Reference\n2026-01-15,500,Operations,0.01,synthetic-easel-622\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',reference:'Reference'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 const closePreview = await h.kit('actuals','preview',closeData); await h.kit('actuals','commit',{...closeData,fingerprint:closePreview.fingerprint})
 await h.command('close-month',{scenario:f.forecast.id,month:'2026-01'})
 await post('accept',{...input,revision:(await h.get('/api/easel/scenario/'+f.forecast.id)).scenario.revision,fingerprint:preview.fingerprint},409)
 assert.deepEqual((await h.get('/api/easel/scenario/'+f.budget.id)).calculation.cells.filter(r=>r.line===f.line.id&&['2026-01','2026-02'].includes(r.month)).map(r=>r.amount),[100000,100000],'The approved recurring budget remains immutable')
})


test('Explicit cross-provider payment parts conserve residual actuals and refuse duplicate capacity reuse through reviewed acceptance', async t => {
 const provider = spendProvider(), h = await harness({ bindings: { PURSE_ORIGIN: 'https://purse.example.test' }, outbound: provider.outbound, now: () => '2026-02-15T12:00:00Z' }); t.after(() => h.close())
 const f = await spendFixture(h), post = async (op, b, status = 200) => { const r = await h.send('/api/easel/spend/' + op, b, h.owner); assert.equal(r.status, status, r.text); return r.value }
 for (const p of ['ramp','purse']) assert.equal((await h.send(`/api/easel/connections/spend/${p}/connect`, { key: spendKeys[p], consent: true }, h.owner)).status, 200)
 provider.state.refunds = [7975]
 provider.state.bills = [
  { id: 'synthetic-easel-701', reference: 'BILL-701', currency: 'USD', totalMinor: 17000, paymentStatus: 'paid', paymentStatusAt: '2026-01-16T12:00:00Z' },
  { id: 'synthetic-easel-702', reference: 'BILL-702', currency: 'USD', totalMinor: 5000, paymentStatus: 'paid', paymentStatusAt: '2026-01-17T12:00:00Z' },
 ]
 const billA = 'purse:synthetic-easel-102--synthetic-easel-701', billB = 'purse:synthetic-easel-102--synthetic-easel-702', cardA = 'ramp:synthetic-easel-101', cardB = 'ramp:synthetic-easel-110'
 const input = { ...f.input, mapping: [...f.input.mapping, { ...f.input.mapping[0], source: cardB },
  { ...f.input.mapping[1], source: billA, duplicateMatches: [{ source: cardA, amount: '120.25' }, { source: cardB, amount: '29.75' }] },
  { ...f.input.mapping[1], source: billB, duplicateOf: cardB, duplicateAmount: '50.00' },
 ] }
 const before = await h.get('/api/easel/scenario/' + f.forecast.id)
 let preview = await post('preview', input)
 assert.deepEqual([preview.budget,preview.actual,preview.committed,preview.remaining,preview.forecast], [100000,22000,28000,50000,50000], 'Two card payments and two bill representations retain exactly 2000 unmatched bill cents')
 assert.deepEqual(preview.rows.map(r => [r.id,r.duplicateAmount,r.countedAmount]), [['synthetic-easel-101',0,12025],['synthetic-easel-110',0,7975],['synthetic-easel-102',0,50000],['synthetic-easel-102--synthetic-easel-701',15000,2000],['synthetic-easel-102--synthetic-easel-702',5000,0]])
 assert.deepEqual(preview.rows.find(r => r.id.endsWith('--synthetic-easel-701')).duplicateMatches, [{source:cardA,amount:12025},{source:cardB,amount:2975}])
 assert.deepEqual(await h.get('/api/easel/scenario/' + f.forecast.id), before)
 for (const change of [
  b => { b.mapping[3].duplicateMatches[0].amount = '120.26' },
  b => { b.mapping[3].duplicateMatches[1].amount = '29.76' },
  b => { b.mapping[4].duplicateAmount = '50.01' },
  b => { b.mapping[3].duplicateMatches.push({ source: cardA, amount: '1.00' }) },
  b => { b.mapping[3].duplicateMatches[0].amount = '-120.25' },
  b => { b.mapping[0].duplicateOf = billA },
  b => { b.mapping[0].order = null },
  b => { b.mapping[0].duplicateOf = cardB; b.mapping[0].duplicateAmount = '1.00' },
  b => { delete b.mapping[4].duplicateAmount },
  b => { b.mapping[3].duplicateMatches = [null] },
 ]) { const invalid = structuredClone(input); change(invalid); await post('preview', invalid, 409) }
 provider.state.bills[0].totalMinor = 10000; await post('preview',input,409); provider.state.bills[0].totalMinor = 17000
 const changed = structuredClone(input); changed.mapping[3].duplicateMatches[1].amount = '19.75'
 await post('accept',{...changed,fingerprint:preview.fingerprint},409)
 provider.state.bills[0].totalMinor = 17001; await post('accept',{...input,fingerprint:preview.fingerprint},409); provider.state.bills[0].totalMinor = 17000
 await h.command('account-map',{account:'500',target:f.line.id}); await h.command('department-map',{source:'Operations',department:f.department.id})
 const actuals = { filename:'synthetic-easel-703.csv',csv:'Date,Account,Department,Amount,Reference\n2026-01-16,500,Operations,20.00,synthetic-easel-704\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',reference:'Reference'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive' }
 const actualPreview = await h.kit('actuals','preview',actuals); await h.kit('actuals','commit',{...actuals,fingerprint:actualPreview.fingerprint})
 const fresh = {...input,revision:(await h.get('/api/easel/scenario/'+f.forecast.id)).scenario.revision}, ledger = await post('ledger',fresh)
 assert.deepEqual(ledger.rows.map(r=>r.amount),[2000])
 const reconciled = {...fresh,ledgerConfirmed:true,ledgerMapping:[{row:ledger.rows[0].id,source:billA}]}
 preview = await post('preview',reconciled)
 assert.deepEqual([preview.actual,preview.committed,preview.remaining,preview.forecast],[22000,28000,50000,50000], 'The ledger matches only the residual bill amount after provider overlap is removed')
 assert.deepEqual(preview.ledgerRows.map(r=>r.additionalAmount),[0])
 await post('preview',{...reconciled,ledgerMapping:[{row:ledger.rows[0].id,source:billB}]},409)
 const entries = await h.db.prepare('SELECT COUNT(*) n FROM e_actuals').first()
 await post('accept',{...reconciled,fingerprint:preview.fingerprint})
 const accepted = await h.get('/api/easel/scenario/'+f.forecast.id)
 assert.equal(accepted.calculation.cells.find(r=>r.line===f.line.id&&r.month==='2026-01').amount,50000)
 assert.deepEqual(await h.db.prepare('SELECT COUNT(*) n FROM e_actuals').first(),entries)
 assert.deepEqual((await h.get('/api/easel/spend'))[0].rows.find(r=>r.id.endsWith('--synthetic-easel-701')).duplicateMatches,[{source:cardA,amount:12025},{source:cardB,amount:2975}])
 // Refund overlaps keep their negative direction and retain the unmatched credit.
 assert.equal((await h.send('/api/easel/connections/spend/brex/connect',{key:spendKeys.brex,consent:true},h.owner)).status,200)
 provider.state.bills = []; provider.state.refunds = [-2025]; provider.state.brexDate = '2026-01-20'
 const refundInput = {...f.input,revision:accepted.scenario.revision,providers:['ramp','purse','brex'],ledgerConfirmed:true,ledgerMapping:[{row:ledger.rows[0].id,source:cardA}],mapping:[...f.input.mapping,
  {...f.input.mapping[0],source:'ramp:synthetic-easel-110'},
  {...f.input.mapping[0],source:'brex:synthetic-easel-601'},
  {...f.input.mapping[0],source:'brex:synthetic-easel-602',duplicateOf:'ramp:synthetic-easel-110',duplicateAmount:'-5.00'},
 ]}
 const refundPreview = await post('preview',refundInput)
 assert.deepEqual([refundPreview.actual,refundPreview.committed,refundPreview.remaining],[17500,32500,50000],'A partial refund overlap removes only the duplicated credit and retains the unmatched negative actual')
 assert.deepEqual(refundPreview.rows.find(r=>r.provider==='brex'&&r.id==='synthetic-easel-602').duplicateMatches,[{source:'ramp:synthetic-easel-110',amount:-500}])
 assert.equal(refundPreview.rows.find(r=>r.provider==='brex'&&r.id==='synthetic-easel-602').countedAmount,-500)
 const wrongRefund = structuredClone(refundInput); wrongRefund.mapping[4].duplicateAmount='5.00'; await post('preview',wrongRefund,409)
 assert.equal((await h.get('/api/easel/scenario/'+f.budget.id)).calculation.cells.find(r=>r.line===f.line.id&&r.month==='2026-01').amount,100000)
})
