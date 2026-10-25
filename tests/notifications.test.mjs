import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

test('CYCLE-003 mentions, returns, pending approval and triggered tasks notify each person once by their chosen email, chat or digest',async t=>{
 let now='2026-10-26T15:00:00.000Z'
 const chats=[]
 const h=await harness({now:()=>now,
  bindings:{SLACK_WEBHOOK_URL:'https://hooks.slack.example.com/services/T1/B1/secret',TEAMS_WEBHOOK_URL:'https://workflows.teams.example.com/hooks/planning'},
  async outbound(request){ const url=new URL(request.url); chats.push({host:url.host,body:await request.text(),key:request.headers.get('idempotency-key')}); return url.host==='nook.example.com'?Response.json({id:'m'},{status:201}):new Response('ok') }})
 t.after(()=>h.close())
 const run=async at=>{now=at;await (await h.mf.getWorker()).scheduled({cron:'*/15 * * * *'})}
 const pref=async(cookie,body,status=200)=>{const r=await h.send('/api/easel/notifications/preference',body,cookie);assert.equal(r.status,status,JSON.stringify(r.value));return r.value}
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const eng=await h.command('department',{name:'Engineering'}),sales=await h.command('department',{name:'Sales'})
 const expense=await h.command('line',{name:'Cloud and software',type:'operating-expense'})
 const ec=await h.person('engineering@example.test','contributor',[eng.id])
 const writer=await h.person('writer@example.test','contributor',[eng.id])
 const ops=await h.person('ops@example.test','contributor',[eng.id])
 const sc=await h.person('sales@example.test','contributor',[sales.id])
 assert.equal((await h.send('/api/easel/connections/nook/connect',{origin:'https://nook.example.com',conversation:'planning',token:'nookit_abcdefghijklmnopqrstuvwxyz0123456789'},h.owner)).status,200)
 await h.command('calendar-schedule-save',{enabled:true,channels:[],revision:0})
 // One preference each; chat only to owner-connected channels.
 assert.deepEqual((await h.get('/api/easel/notifications',ec)).preference,{mode:'email',channel:null})
 assert.deepEqual((await h.get('/api/easel/notifications',ec)).channels,['slack','teams','nook'])
 await pref(ec,{mode:'chat',channel:'teams'})
 await pref(ops,{mode:'chat',channel:'nook'})
 await pref(sc,{mode:'digest'})
 await pref(sc,{mode:'chat',channel:'carrier-pigeon'},400)
 const mailFor=(to,from)=>h.messages.slice(from).filter(m=>m.to.includes(to))

 // Returned submission: every active contributor of the department, by preference.
 const budget=(await h.get('/api/easel/state')).scenarios[0]
 await h.command('request-submissions',{scenario:budget.id,departments:[eng.id,sales.id],due:'2026-10-30'})
 for(const [d,cookie]of[[eng.id,ec],[sales.id,sc]])await h.command('submit',{scenario:budget.id,department:d},cookie)
 let start=h.messages.length,chatStart=chats.length
 // Both departments submitted: finance gets one pending-approval email linking to the budget.
 const approvalMail=mailFor('owner@example.test',start-1).filter(m=>m.subject.startsWith('Budget ready for approval'))
 assert.equal(approvalMail.length,1)
 assert.match(approvalMail[0].text,new RegExp(`/app\\?tab=cycle&record=${budget.id}`))
 start=h.messages.length
 await h.command('return-submission',{scenario:budget.id,department:eng.id,reason:'Hosting is missing'})
 assert.equal(mailFor('engineering@example.test',start).length,0,'A Teams-only person receives no email')
 const returned=mailFor('writer@example.test',start)
 assert.equal(returned.length,1);assert.match(returned[0].subject,/Submission returned/);assert.match(returned[0].text,new RegExp(`tab=cycle&record=${encodeURIComponent(`${budget.id}|${eng.id}`)}`))
 const newChats=chats.slice(chatStart)
 assert.deepEqual(newChats.map(c=>c.host).sort(),['nook.example.com','workflows.teams.example.com'])
 for(const c of newChats){assert.match(c.body,/You have an Easel notification/);assert.doesNotMatch(c.body,/Hosting|Engineering|returned/)}
 let mine=(await h.get('/api/easel/notifications',ec)).notifications
 assert.equal(mine[0].status,'accepted');assert.equal(mine[0].label,'Accepted by the Teams workflow; delivery to the channel is not confirmed')
 await h.command('return-submission',{scenario:budget.id,department:sales.id,reason:'Events budget unclear'})
 assert.equal(mailFor('sales@example.test',start).length,0,'Digest-only waits for the digest')
 for(const [d,cookie]of[[eng.id,ec],[sales.id,sc]])await h.command('submit',{scenario:budget.id,department:d},cookie)

 // Triggered task to its owner (Nook) after close; mention in a variance explanation (email).
 for(const [department,amount]of[[eng.id,'1000'],[sales.id,'2000']])await h.command('expense',{scenario:budget.id,name:'Run rate',kind:'recurring',line:expense.id,department,start:'2026-01',amount})
 const approved=await h.command('approve-budget',{scenario:budget.id,revision:(await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision})
 await h.command('metric-rule-save',{kind:'overspend',name:'Engineering overspend',department:eng.id,owner:'ops@example.test',percent:'10',amount:'0',dueDays:3})
 await h.command('metric-rule-save',{kind:'overspend',name:'Sales overspend',department:sales.id,owner:'sales@example.test',percent:'10',amount:'0',dueDays:3})
 await h.command('account-map',{account:'500',target:expense.id})
 for(const d of[eng,sales])await h.command('department-map',{source:d.name,department:d.id})
 const body={filename:'january.csv',csv:'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,1300,Hosting\n2026-01-31,500,Sales,2600,Events\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',description:'Description'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 chatStart=chats.length
 await h.kit('actuals','commit',{...body,fingerprint:(await h.kit('actuals','preview',body)).fingerprint})
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const opsTask=(await h.get('/api/easel/notifications',ops)).notifications.find(n=>n.event==='metric-task')
 assert.equal(opsTask.status,'accepted');assert.equal(opsTask.channel,'nook');assert.equal(opsTask.tab,'cycle')
 assert.equal((await h.get('/api/easel/metric-tasks',ops)).tasks[0].id,opsTask.record,'The notification links to its task')
 assert.equal(chats.slice(chatStart).filter(c=>c.host==='nook.example.com'&&c.key===opsTask.key).length,1)
 start=h.messages.length
 await h.command('explanation',{month:'2026-01',line:expense.id,department:sales.id,text:'Ask @writer@example.test about events'},h.owner,400)
 const explanation=await h.command('explanation',{month:'2026-01',line:expense.id,department:eng.id,text:'Hosting rose; @writer@example.test please confirm'})
 const mention=mailFor('writer@example.test',start)
 assert.equal(mention.length,1);assert.match(mention[0].subject,/You were mentioned: Variance explanation · 2026-01 · Cloud and software/)
 assert.match(mention[0].text,new RegExp(`tab=review&record=${encodeURIComponent(explanation.month+'|'+expense.id+'|'+eng.id)}`))
 // Exactly once per event and recipient: rereading or rerunning delivers nothing new.
 const total=h.messages.length,chatTotal=chats.length
 await run('2026-10-27T11:59:00.000Z')
 assert.equal(h.messages.length,total,'07:59 EDT is before the digest')
 await run('2026-10-27T12:05:00.000Z')
 const digest=h.messages.slice(total)
 assert.equal(digest.length,1);assert.equal(digest[0].to[0],'sales@example.test')
 assert.match(digest[0].subject,/Easel daily digest: 2 notifications/)
 assert.match(digest[0].text,/Submission returned[\s\S]*Events budget unclear/);assert.match(digest[0].text,/New task assigned to you: Sales overspend · 2026-01/)
 assert.doesNotMatch(digest[0].text,/Engineering|Hosting/)
 await run('2026-10-27T12:20:00.000Z')
 assert.equal(h.messages.length,total+1);assert.equal(chats.length,chatTotal)
 const scList=(await h.get('/api/easel/notifications',sc)).notifications
 assert.ok(scList.every(n=>n.status==='digested'&&n.digest==='sales@example.test|2026-10-27'))
 const activity=await h.get('/api/easel/activity?action=notification-digest-queued')
 assert.equal(activity[0].detail.scheduledAt,'2026-10-27T12:00:00.000Z');assert.equal(activity[0].detail.zone,'America/New_York')
 assert.equal(activity[0].actor,'scheduler:calendar')
})

test('Private Slack notifications require the mapped native person’s consent and recheck exact human, team, private IM and live authority without fallback', async t => {
 const { privateSlackProvider } = await import('./private-slack-runtime.mjs')
 const provider = privateSlackProvider()
 let afterIdentity
 let now = '2026-11-01T12:00:00.000Z'
 const h = await harness({ now: () => now, outbound: async request => { const response = await provider.fetch(request); if (new URL(request.url).pathname === '/api/conversations.info' && afterIdentity) { const change = afterIdentity; afterIdentity = null; await change() } return response }, bindings: { SLACK_WEBHOOK_URL: 'https://chat.example.test/synthetic-easel-2' } }); t.after(() => h.close())
 const post = async (op, body, cookie = h.owner, status = 200) => { const r = await h.send(`/api/easel/slack-private/${op}`, body, cookie); assert.equal(r.status, status, `${op}: ${JSON.stringify(r.value)}`); return r.value }
 const status = cookie => h.get('/api/easel/slack-private', cookie)
 await h.command('workspace', { name: 'Private owner questions', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 24 })
 const sales = await h.command('department', { name: 'Sales' }), revenue = await h.command('line', { name: 'Service agreements', type: 'revenue' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '100000', collectionLag: 0, paymentLag: 0 })
 const contract = await h.command('revenue', { scenario: budget.id, name: 'Acme agreement', kind: 'contract', line: revenue.id, department: sales.id, start: '2026-12', startDate: '2026-12-15', termMonths: 12, contractValue: '120000', billingCadence: 'monthly', dsoDays: 0 })
 const forecast = (await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 const recipient = await h.person('sales@example.test', 'contributor', [sales.id]), other = await h.person('other@example.test', 'contributor', [sales.id])
 await h.command('owner-question-settings', { enabled: true })
 await post('connection/connect', { key: provider.key, consent: true, revision: '' }, recipient, 403)
 await post('connection/connect', { key: provider.key, consent: false, revision: '' }, h.owner, 400)
 provider.authOverride = { bot_id: undefined }
 await post('connection/connect', { key: provider.key, consent: true, revision: '' }, h.owner, 409)
 assert.equal(await h.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('slack:private-delivery').first(), null)
 provider.authOverride = {}
 await post('connection/connect', { key: provider.key, consent: true, revision: '' })
 let view = await status(), mapping
 const bind = async (email = 'sales@example.test', user = 'USALES') => {
  const v = await status(), prior = v.bindings.find(b => b.email === email)
  await post('bind', { email, user, revision: prior?.revision ?? '', connectionRevision: v.connection.revision })
  return (await status()).bindings.find(b => b.email === email)
 }
 // Every refusal goes through the same native mapping door; names never infer an identity.
 for (const userOverride of [{ id: 'UOTHER' }, { team_id: 'TOTHER' }, { profile: {} }, { profile: { email: 'Sales@example.test' } }, { profile: { email: 'other@example.test' } }, { is_bot: true }, { is_app_user: true }, { is_restricted: true }, { is_ultra_restricted: true }, { deleted: true }]) {
  provider.userOverride = userOverride
  await post('bind', { email: 'sales@example.test', user: 'USALES', revision: '', connectionRevision: view.connection.revision }, h.owner, 409)
 }
 provider.userOverride = {}; mapping = await bind()
 assert.equal(mapping.enabled, false)
 const consent = async (email = 'sales@example.test', cookie = recipient) => {
  const v = await status(cookie), b = v.bindings.find(x => x.email === email)
  return post('consent', { email, user: b.user, team: b.team, revision: b.revision, connectionRevision: v.connection.revision, consent: true }, cookie)
 }
 await post('consent', { email: mapping.email, user: mapping.user, team: mapping.team, revision: mapping.revision, connectionRevision: view.connection.revision, consent: true }, other, 403)
 assert.deepEqual((await status(other)).bindings, [], 'Another native member sees no mapping or consent identity')
 const sealed = (await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('slack:private-delivery').first()).sealed
 assert.ok(!sealed.includes(provider.key)); assert.ok(!JSON.stringify(await status()).includes(provider.key))
 const { createPortability } = await import('@runeditrun/rer/modules/portability'), { easelPolicy } = await import('../scripts/installer/easel-policy.mjs')
 const archiveService = await createPortability({ db: h.db, policy: easelPolicy }), archiveId = await archiveService.exports.create()
 try {
  while ((await archiveService.exports.advance(archiveId, { maxParts: 16 })).phase === 'building') {}
  const archive = await new Response(await archiveService.exports.download(archiveId)).text()
  assert.ok(!JSON.parse(archive.split('\n')[0]).tables.some(table => table.name === 'e_connection_secrets'))
  assert.ok(!archive.includes(provider.key)); assert.ok(!archive.includes(sealed))
 } finally { await archiveService.exports.abort(archiveId) }
 const ask = async (owner = 'sales@example.test') => {
  now = new Date(Date.parse(now) + 60_000).toISOString()
  const q = await h.command('owner-question-ask', { scenario: forecast.id, scenarioRevision: forecast.revision, kind: 'revenue', originId: contract.originId, field: 'startDate', owner, source: 'Reviewed agreement synthetic-easel-5; responsible account owner', question: 'Will Acme start on 15 December? Yes, No or a new date.', dueAt: '2026-11-30T12:00:00.000Z' })
  const notifications = (await h.get('/api/easel/notifications', owner === 'owner@example.test' ? h.owner : recipient)).notifications
  return { q, notification: notifications.find(n => n.record === q.id) }
 }
 const cancel = q => h.command('owner-question-cancel', { id: q.id, revision: q.revision, reason: 'Finished this explicit private-delivery check' })
 let asked = await ask()
 assert.equal(asked.notification.status, 'blocked'); assert.equal(provider.posts.length, 0)
 assert.ok(!h.messages.some(m => m.to.includes('sales@example.test') && /Confirm Acme/.test(m.subject)), 'No alternate email before native consent')
 await cancel(asked.q); await consent()
 asked = await ask()
 assert.equal(provider.posts.length, 1); assert.equal(asked.notification.status, 'accepted'); assert.match(asked.notification.label, /Accepted.*Slack.*not confirmed/)
 assert.equal(provider.posts[0].channel, 'DSALES')
 for (const part of ['Acme', '2026-12-15', 'Yes, No or a new date', 'Reviewed agreement synthetic-easel-5; responsible account owner', `/app?tab=review&record=${asked.q.id}`]) assert.ok(provider.posts[0].text.includes(part), part)
 assert.equal(provider.posts[0].mrkdwn, false); assert.equal(provider.posts[0].unfurl_links, false)
 const accepted = await h.command('owner-question-answer', { id: asked.q.id, revision: asked.q.revision, choice: 'new-date', date: '2027-01-15' }, recipient)
 assert.equal(accepted.answer.date, '2027-01-15'); assert.equal(accepted.answer.by, 'sales@example.test'); assert.ok(accepted.answer.source)
 assert.equal((await h.get(`/api/easel/scenario/${forecast.id}`)).inputs.revenue.find(r => r.originId === contract.originId).startDate, '2026-12-15')
 await h.command('owner-question-escalate', { id: accepted.id, revision: accepted.revision })
 assert.equal(provider.posts.length, 1, 'No-change check never sends a duplicate')
 for (const [target, change] of [['authOverride', { team_id: 'TOTHER' }], ['userOverride', { deleted: true }], ['userOverride', { profile: { email: 'other@example.test' } }], ['imOverride', { is_im: false, is_mpim: true }], ['imOverride', { user: 'UOTHER' }], ['imOverride', { is_ext_shared: true }]]) {
  provider[target] = change
  const before = provider.posts.length; asked = await ask()
  assert.equal(provider.posts.length, before, 'Changed identity or non-private IM never posts')
  assert.ok(['blocked', 'pending'].includes(asked.notification.status))
  await cancel(asked.q); provider[target] = {}
 }
 // A permission change while Slack verifies the IM is checked again before the post.
 const beforePermissionRace = provider.posts.length
 afterIdentity = () => h.command('member', { email: 'sales@example.test', name: 'Sales', role: 'contributor', departments: [], active: true })
 asked = await ask()
 assert.equal(provider.posts.length, beforePermissionRace, 'Removing source access during identity verification prevents the private post')
 await cancel(asked.q)
 await h.command('member', { email: 'sales@example.test', name: 'Sales', role: 'contributor', departments: [sales.id], active: true })
 // Known refusal is retryable only by explicit finance action, with captured body/key.
 provider.sendMode = 'refused'; asked = await ask(); assert.equal(asked.notification.status, 'pending')
 const refused = provider.posts.at(-1); provider.sendMode = 'accepted'
 assert.equal((await h.send(`/api/easel/notifications/${asked.notification.id}/retry`, {}, h.owner)).status, 200)
 assert.deepEqual(provider.posts.at(-1), refused)
 await cancel(asked.q)
 provider.sendMode = 'unknown'; asked = await ask(); assert.equal(asked.notification.status, 'uncertain')
 const unknownCount = provider.posts.length
 assert.equal((await h.send(`/api/easel/notifications/${asked.notification.id}/retry`, {}, h.owner)).status, 409)
 assert.equal(provider.posts.length, unknownCount); await cancel(asked.q); provider.sendMode = 'accepted'
 mapping = (await status(recipient)).bindings[0]
 await post('revoke', { email: mapping.email, revision: mapping.revision }, recipient)
 asked = await ask(); assert.equal(asked.notification.status, 'blocked'); assert.equal(provider.posts.length, unknownCount); await cancel(asked.q)
 await consent()
 provider.sendMode = 'refused'; asked = await ask(); assert.equal(asked.notification.status, 'pending'); provider.sendMode = 'accepted'
 const beforeRemoval = provider.posts.length
 await h.command('member', { email: 'sales@example.test', name: 'Sales', role: 'contributor', departments: [sales.id], active: false })
 await h.get('/api/easel/slack-private', recipient, 403)
 const afterRemoval = await h.send(`/api/easel/notifications/${asked.notification.id}/retry`, {}, h.owner)
 assert.equal(afterRemoval.status, 200); assert.equal(afterRemoval.value.status, 'blocked')
 assert.equal(provider.posts.length, beforeRemoval, 'Removed membership blocks the captured refused send')
 // REPORT-006 uses the same opted-in native finance identity, carrying numbers and cause privately.
 await bind('owner@example.test', 'UOWNER'); await consent('owner@example.test', h.owner)
 await h.command('cash-constraints', { floor: '200000', runwayMinimum: '0' })
 const beforeFinanceAlert = provider.posts.length
 await h.command('cash-alert-rule-save', { name: 'Private cash floor', kind: 'floor', enabled: true })
 assert.equal(provider.posts.length, beforeFinanceAlert + 1, 'One structured private financial alert for the new breach')
 const financial = provider.posts.at(-1)
 assert.equal(financial.channel, 'DOWNER'); assert.match(financial.text, /\$200,000\.00/); assert.match(financial.text, /\$100,000\.00/); assert.match(financial.text, /Cause:.*owner@example\.test/); assert.match(financial.text, /Jan 2026/); assert.match(financial.text, /\/app\?tab=overview&record=/)
 const financialCount = provider.posts.length
 await h.command('cash-alert-check', {}); assert.equal(provider.posts.length, financialCount)
 // Ordinary notices remain on the existing generic shared-channel preference.
 await h.send('/api/easel/notifications/preference', { mode: 'chat', channel: 'slack' }, other)
 await h.command('comment', { scenario: forecast.id, department: sales.id, text: '@other@example.test review this sensitive planning detail' })
 assert.ok(provider.shared.length > 0)
 for (const shared of provider.shared) { assert.match(shared.text, /You have an Easel notification/); assert.doesNotMatch(shared.text, /sensitive|Acme|200,000|Private cash/) }
 // Archive restore retains metadata, but absence of custody blocks until reconnect/rebind/consent.
 await h.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('slack:private-delivery').run()
 const missing = await status(); assert.equal(missing.connection.connected, false); assert.match(missing.connection.error, /Reconnect after restore/)
 await post('connection/connect', { revision: missing.connection.revision, consent: true, key: provider.key })
 assert.equal((await status()).bindings.find(b => b.email === 'owner@example.test').enabled, false)
 provider.revokeConfirmed = false
 view = await status(); await post('connection/disconnect', { revision: view.connection.revision, consent: true })
 assert.equal(await h.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('slack:private-delivery').first(), null)
 assert.match((await status()).connection.revocation, /unconfirmed/)
 assert.ok(provider.calls.some(c => c.method === 'auth.revoke'))
 assert.ok(!JSON.stringify(await h.get('/api/easel/activity')).includes(provider.key))
})

test('Native push consent binds the exact session, delivers generic Apple and Firebase events once and suppresses stale authority, revoked sessions and devices', async t => {
 const { createHash } = await import('node:crypto')
 const { mobilePushProvider } = await import('./mobile-push-provider.mjs')
 const provider = mobilePushProvider()
 let now = '2026-11-01T12:00:00.000Z'
 const h = await harness({ now: () => now, outbound: request => provider.fetch(request), bindings: provider.bindings }); t.after(() => h.close())
 const devices = cookie => h.get('/api/easel/mobile/devices', cookie)
 const register = async (cookie, platform, token, consent = true, expected = 200) => {
  const r = await h.send('/api/easel/mobile/devices/register', { platform, token, consent }, cookie)
  assert.equal(r.status, expected, JSON.stringify(r.value)); return r.value
 }
 const iosToken = createHash('sha256').update('synthetic-easel-3').digest('hex')
 const androidToken = 'synthetic-easel-4'
 await h.command('workspace', { name: 'synthetic-easel-5', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await h.command('department', { name: 'synthetic-easel-6' })
 const contributor = await h.person('synthetic-easel-7@example.test', 'contributor', [department.id])
 const other = await h.person('synthetic-easel-8@example.test', 'contributor', [department.id])
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await register('', 'ios', iosToken, true, 401)
 await register(h.owner, 'ios', iosToken, false, 400)
 const apple = await register(h.owner, 'ios', iosToken)
 const android = await register(contributor, 'android', androidToken)
 assert.equal((await register(h.owner, 'ios', iosToken)).id, apple.id, 'Repeated platform registration retains one device')
 assert.deepEqual((await devices(h.owner)).devices.map(d => d.id), [apple.id])
 assert.deepEqual((await devices(contributor)).devices.map(d => d.id), [android.id])
 assert.equal((await h.send('/api/easel/mobile/devices/revoke', { id: apple.id }, contributor)).status, 403)
 await h.stepUp(h.owner)
 const credential = await h.send('/api/easel/tokens/issue', { label: 'synthetic-easel-9', kind: 'personal', scope: 'write' }, h.owner)
 assert.equal(credential.status, 200)
 const bearerAttempt = await h.mf.dispatchFetch(h.origin + '/api/easel/mobile/devices/register', { method: 'POST', headers: { authorization: `Bearer ${credential.value.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'android', token: 'synthetic-easel-10', consent: true }) })
 assert.equal(bearerAttempt.status, 403, 'A scoped bearer cannot give person consent')
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '100000', collectionLag: 0, paymentLag: 0 })
 const cost = await h.command('line', { name: 'synthetic-easel-17', type: 'operating-expense' })
 await h.command('expense', { scenario: budget.id, name: 'synthetic-easel-18', kind: 'recurring', line: cost.id, department: department.id, start: '2026-01', amount: '100' })
 await h.command('approval-chain-save', { department: department.id, steps: [{ name: 'synthetic-easel-19', members: ['synthetic-easel-7@example.test'] }] })
 await h.command('request-submissions', { scenario: budget.id, departments: [department.id] })
 await h.command('submit', { scenario: budget.id, department: department.id }, other)
 assert.equal(provider.requests.length, 1, `The pending review reaches its opted-in current reviewer: ${JSON.stringify(await devices(contributor))}`)
 assert.equal(provider.requests[0].platform, 'android')
 const review = (await h.get(`/api/easel/approval-chains/${budget.id}`, contributor)).departments.find(d => d.department === department.id)
 await h.command('approval-step', { scenario: budget.id, department: department.id, step: review.steps[0].id, pass: review.submission.review.pass, digest: review.submission.review.content.digest }, contributor)
 assert.equal(provider.requests.length, 2, 'Completed department review notifies finance of pending global approval')
 assert.equal(provider.requests[1].platform, 'ios')
 const forecast = (await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 const proposal = await h.command('proposal-create', { from: forecast.id, name: 'synthetic-easel-22', request: 'synthetic-easel-23' }, other)
 const beforeProposal = provider.requests.length, mailBeforeProposal = h.messages.length
 await h.command('proposal-submit', { id: proposal.id }, other)
 assert.equal(provider.requests.length, beforeProposal + 1, 'A submitted proposal notifies opted-in finance')
 assert.equal(h.messages.length, mailBeforeProposal, 'The native proposal event introduces no automatic email route')
 assert.equal(provider.requests.at(-1).platform, 'ios')
 await h.command('proposal-submit', { id: proposal.id }, other, 409)
 assert.equal(provider.requests.length, beforeProposal + 1, 'A repeated submission cannot duplicate a push')
 await h.command('metric-rule-save', { kind: 'overspend', name: 'synthetic-easel-20', department: department.id, owner: 'synthetic-easel-7@example.test', percent: '10', amount: '0', dueDays: 3 })
 await h.command('account-map', { account: '500', target: cost.id })
 await h.command('department-map', { source: 'synthetic-easel-6', department: department.id })
 const actuals = { filename: 'synthetic-easel-21.csv', csv: 'Date,Account,Department,Amount\n2026-01-31,500,synthetic-easel-6,200\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 await h.kit('actuals', 'commit', { ...actuals, fingerprint: (await h.kit('actuals', 'preview', actuals)).fingerprint })
 const beforeMetric = provider.requests.length
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 assert.equal(provider.requests.length, beforeMetric + 1, 'A triggered metric task reaches its opted-in owner')
 assert.equal(provider.requests.at(-1).platform, 'android')
 await h.command('cash-constraints', { floor: '200000', runwayMinimum: '0' })
 const cashStart = provider.requests.length
 const emailBefore = h.messages.length
 await h.command('cash-alert-rule-save', { name: 'synthetic-easel-11', kind: 'floor', enabled: true })
 assert.equal(provider.requests.length, cashStart + 1)
 assert.equal(provider.requests.at(-1).platform, 'ios')
 assert.deepEqual(provider.requests.at(-1).body, { aps: { alert: { title: 'Easel notification', body: 'Easel notification' }, sound: 'default' } })
 assert.equal(h.messages.slice(emailBefore).filter(m => m.subject.startsWith('Cash alert:')).length, 1, 'Push preserves the existing email route')
 await h.command('cash-alert-check', {})
 assert.equal(provider.requests.length, cashStart + 1, 'Repeated evaluation does not duplicate push')
 const comment = () => h.command('comment', { scenario: budget.id, department: department.id, text: '@synthetic-easel-7@example.test confidential synthetic-easel-12' })
 await comment()
 assert.equal(provider.requests.length, cashStart + 2)
 assert.equal(provider.requests.at(-1).platform, 'android')
 assert.equal(provider.requests.at(-1).body.message.notification, undefined)
 assert.equal(provider.requests.at(-1).body.message.data.notice, 'Easel notification')
 assert.ok(provider.requests.at(-1).body.message.data.id)
 assert.equal(provider.requests.at(-1).body.message.token, androidToken)
 assert.ok((await devices(contributor)).deliveries.some(d => d.status === 'accepted'))
 assert.ok(provider.authorizations.some(a => a.platform === 'android') && provider.authorizations.some(a => a.platform === 'ios'))
 // The same flow retains unknown outcomes and never resends them on reads or ticks.
 provider.mode = 'unknown'; await comment(); provider.mode = 'accepted'
 const unknownCount = provider.requests.length
 assert.ok((await devices(contributor)).deliveries.some(d => d.status === 'uncertain'))
 await devices(contributor)
 await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 assert.equal(provider.requests.length, unknownCount)
 // A second device loses authority while the first request is at the provider edge.
 await register(contributor, 'ios', createHash('sha256').update('synthetic-easel-13').digest('hex'))
 provider.afterSend = () => h.command('member', { email: 'synthetic-easel-7@example.test', name: 'synthetic-easel-7', role: 'contributor', departments: [department.id], active: false })
 await comment()
 assert.equal(provider.requests.length, unknownCount + 1, 'Live membership removal suppresses the next device')
 await h.command('member', { email: 'synthetic-easel-7@example.test', name: 'synthetic-easel-7', role: 'contributor', departments: [department.id], active: true })
 assert.ok((await devices(contributor)).deliveries.some(d => d.status === 'blocked'))
 const contributorApple = (await devices(contributor)).devices.find(d => d.platform === 'ios')
 assert.equal((await h.send('/api/easel/mobile/devices/revoke', { id: contributorApple.id }, contributor)).status, 200)
 const beforeAuthorizationRace = provider.requests.length
 provider.afterAuthorize = () => h.command('member', { email: 'synthetic-easel-7@example.test', name: 'synthetic-easel-7', role: 'contributor', departments: [department.id], active: false })
 await comment()
 assert.equal(provider.requests.length, beforeAuthorizationRace, 'Authority removed during Google authorization is checked again before any push')
 await h.command('member', { email: 'synthetic-easel-7@example.test', name: 'synthetic-easel-7', role: 'contributor', departments: [department.id], active: true })
 // Revoking only the native session leaves metadata but prevents every further send.
 const session = await h.get('/auth/session', contributor)
 assert.equal((await h.send('/auth/session/revoke', { sessionId: session.id }, h.owner)).status, 204)
 const beforeSessionBlock = provider.requests.length
 await comment()
 assert.equal(provider.requests.length, beforeSessionBlock)
 assert.equal((await h.send('/api/easel/mobile/devices/register', { platform: 'android', token: androidToken, consent: true }, contributor)).status, 401)
 // Calendar tasks use the same opted-in route and live task owner check.
 await register(other, 'android', 'synthetic-easel-14')
 await h.command('calendar-schedule-save', { enabled: true, channels: [], revision: 0 })
 const beforeAssignment = provider.requests.length, mailBeforeAssignment = h.messages.length
 const calendarTask = await h.command('calendar-task-save', { name: 'synthetic-easel-15', kind: 'other', department: department.id, owner: 'synthetic-easel-8@example.test', due: '2026-11-03' })
 assert.equal(provider.requests.length, beforeAssignment + 1, 'Task assignment pushes immediately before its reminder is due')
 assert.equal(h.messages.length, mailBeforeAssignment, 'The native assignment event introduces no automatic email route')
 await h.command('calendar-task-save', { ...calendarTask, revision: 0 }, h.owner, 409)
 assert.equal(provider.requests.length, beforeAssignment + 1)
 now = '2026-11-02T15:00:00.000Z'
 await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' })
 assert.equal(provider.requests.length, beforeAssignment + 2, 'The calendar reminder is a separate opted-in occurrence')
 assert.ok((await devices(other)).deliveries.some(d => d.status === 'accepted'))
 const otherDevice = (await devices(other)).devices[0]
 assert.equal((await h.send('/api/easel/mobile/devices/revoke', { id: otherDevice.id }, other)).status, 200)
 assert.equal(await h.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(`mobile-push:${otherDevice.id}`).first(), null)
 const beforeRevoke = provider.requests.length
 await h.command('comment', { scenario: budget.id, department: department.id, text: '@synthetic-easel-8@example.test synthetic-easel-16' })
 assert.equal(provider.requests.length, beforeRevoke)
 // The public portability door retains metadata while excluding native custody.
 const { default: JSZip } = await import('jszip')
 const download = await h.mf.dispatchFetch(h.origin + '/api/easel/export', { headers: { cookie: h.owner } })
 assert.equal(download.status, 200)
 const archive = await JSZip.loadAsync(await download.arrayBuffer())
 assert.equal(archive.file('tables/e_connection_secrets.csv'), null)
 const exported = await archive.file('model.json').async('string')
 for (const secret of [iosToken, androidToken, credential.value.token, session.id, 'PRIVATE KEY', 'synthetic-easel-1@example.test', 'synthetic-easel-802']) assert.ok(!exported.includes(secret), 'Portable model never carries push custody')
 // Native sign-out also removes custody without exposing it in any read or audit.
 assert.equal((await h.send('/auth/signout', {}, h.owner)).status, 204)
 assert.equal(await h.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(`mobile-push:${apple.id}`).first(), null)
 const history = await h.db.prepare("SELECT detail FROM e_activity WHERE action LIKE 'mobile-push-%'").all()
 assert.ok(history.results.some(r => JSON.parse(r.detail).exactNativeSession === true))
 const visible = JSON.stringify(history.results)
 for (const secret of [iosToken, androidToken, credential.value.token, 'synthetic-easel-801', 'synthetic-easel-802']) assert.ok(!visible.includes(secret), 'Activity never carries delivery credentials')
})
