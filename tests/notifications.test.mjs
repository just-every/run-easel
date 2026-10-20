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
