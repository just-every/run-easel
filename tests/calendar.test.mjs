import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const NOOK_TOKEN=['nookit', 'synthetic-easel-6789'].join('_')
test('CYCLE-001 planning calendar reminds owners in the company zone, cancels on submission, escalates to finance and stays private in shared chat',async t=>{
 let now='2026-10-26T12:00:00.000Z',teamsStatus=302,submissionMail=422,companyOverdueMail=200
 const chats=[]
 const h=await harness({now:()=>now,
  bindings:{SLACK_WEBHOOK_URL:'https://hooks.slack.example.com/services/T1/B1/secret',TEAMS_WEBHOOK_URL:'https://workflows.teams.example.com/hooks/planning'},
  async outbound(request){
   const url=new URL(request.url),body=await request.text()
   chats.push({host:url.host,path:url.pathname,body,authorization:request.headers.get('authorization'),key:request.headers.get('idempotency-key'),at:now})
   if(url.host==='workflows.teams.example.com')return teamsStatus===302?new Response(null,{status:302,headers:{location:'https://elsewhere.example.com/'}}):new Response(null,{status:teamsStatus})
   if(url.host==='nook.example.com')return Response.json({id:'m1'},{status:201})
   return new Response('ok')
  },
  mailResponse(message){
   if(message.subject.includes('Submit department budget · Engineering')&&message.subject.startsWith('Reminder'))return Response.json({message:'Mailbox rejected'},{status:submissionMail})
   if(message.subject.startsWith('Overdue: Confirm year-end variances'))return Response.json({message:'Outcome unknown'},{status:companyOverdueMail})
   return Response.json({id:crypto.randomUUID()})
  }})
 t.after(()=>h.close())
 const run=async at=>{now=at;await (await h.mf.getWorker()).scheduled({cron:'*/15 * * * *'})}
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const eng=await h.command('department',{name:'Engineering'}),sales=await h.command('department',{name:'Sales'})
 const expense=await h.command('line',{name:'Cloud and software',type:'operating-expense'})
 const ec=await h.person('engineering@example.test','contributor',[eng.id])
 const sc=await h.person('sales@example.test','contributor',[sales.id])
 const board=await h.person('board@example.test','viewer')
 const budget=(await h.get('/api/easel/state')).scenarios[0]
 await h.command('request-submissions',{scenario:budget.id,departments:[eng.id,sales.id],due:'2026-10-30'})

 // Finance alone sets dated tasks; owners must be eligible for the task's scope.
 await h.command('calendar-task-save',{kind:'review-headcount',name:'Review engineering headcount',department:eng.id,owner:'engineering@example.test',due:'2026-10-30'},ec,403)
 await h.command('calendar-task-save',{kind:'review-headcount',name:'Wrong owner',department:eng.id,owner:'sales@example.test',due:'2026-10-30'},h.owner,400)
 await h.command('calendar-task-save',{kind:'confirm-variances',name:'Wrong owner',owner:'engineering@example.test',due:'2026-10-30'},h.owner,400)
 await h.command('calendar-task-save',{kind:'review-headcount',name:'Bad date',department:eng.id,owner:'engineering@example.test',due:'2026-02-30'},h.owner,400)
 const review=await h.command('calendar-task-save',{kind:'review-headcount',name:'Review engineering headcount',department:eng.id,owner:'engineering@example.test',due:'2026-10-30'})
 const company=await h.command('calendar-task-save',{kind:'confirm-variances',name:'Confirm year-end variances',owner:'owner@example.test',due:'2026-10-30'})

 // Reads: assignees and finance only.
 const financeView=await h.get('/api/easel/calendar')
 assert.equal(financeView.zone,'America/New_York')
 assert.equal(financeView.tasks.length,4)
 const engReview=financeView.tasks.find(x=>x.id===review.id)
 assert.equal(engReview.reminderAt,'2026-10-29T13:00:00.000Z','Thursday 09:00 Eastern daylight time')
 assert.equal(engReview.escalationAt,'2026-11-02T14:00:00.000Z','Monday 09:00 Eastern standard time, after the DST change')
 assert.match(engReview.reminderLabel,/EDT/);assert.match(engReview.escalationLabel,/EST/)
 const engView=await h.get('/api/easel/calendar',ec)
 assert.deepEqual(engView.tasks.map(x=>x.name).sort(),['Review engineering headcount',`Submit department budget · Engineering · ${budget.name}`])
 assert.equal(engView.channels,null)
 assert.deepEqual((await h.get('/api/easel/calendar',sc)).tasks.map(x=>x.kind),['submission'])
 assert.deepEqual((await h.get('/api/easel/calendar',board)).tasks,[])
 await h.command('calendar-task-complete',{id:review.id,revision:review.revision},sc,403)

 // Chat channels: owner-entered destinations under the egress rule, Nook token sealed.
 await h.send('/api/easel/connections/nook/connect',{origin:'https://nook.example.com',conversation:'planning',token:NOOK_TOKEN},ec).then(r=>assert.equal(r.status,403))
 for(const origin of['http://nook.example.com','https://127.0.0.1','https://10.1.2.3','https://nook.internal','https://user:pw@nook.example.com'])assert.equal((await h.send('/api/easel/connections/nook/connect',{origin,conversation:'planning',token:NOOK_TOKEN},h.owner)).status,400,origin)
 assert.equal((await h.send('/api/easel/connections/nook/connect',{origin:'https://nook.example.com',conversation:'planning',token:'session=abc'},h.owner)).status,400)
 const nook=await h.send('/api/easel/connections/nook/connect',{origin:'https://nook.example.com',conversation:'planning',token:NOOK_TOKEN},h.owner)
 assert.equal(nook.status,200);assert.equal(nook.value.configured,true);assert.equal(nook.value.suffix,'6789')
 assert.doesNotMatch(JSON.stringify(await h.get('/api/easel/calendar')),new RegExp(NOOK_TOKEN))
 assert.doesNotMatch(JSON.stringify(await h.get('/api/easel/activity')),new RegExp(NOOK_TOKEN))
 await h.command('calendar-schedule-save',{enabled:true,channels:['slack','teams','nook']},ec,403)
 await h.command('calendar-schedule-save',{enabled:true,channels:['slack','teams','nook'],revision:0})

 // Wednesday: nothing is due. Sales submits before its reminder.
 await run('2026-10-28T13:15:00.000Z')
 assert.equal((await h.get('/api/easel/calendar')).deliveries.length,0)
 await h.command('submit',{scenario:budget.id,department:sales.id},sc)
 await run('2026-10-29T12:59:00.000Z')
 assert.equal((await h.get('/api/easel/calendar')).deliveries.length,0)
 const mailBefore=h.messages.length

 // Thursday 09:05 Eastern: reminders for every open task; the submitted department's reminder is canceled.
 await run('2026-10-29T13:05:00.000Z')
 let view=await h.get('/api/easel/calendar')
 const reminders=view.deliveries.filter(d=>d.kind==='reminder')
 const canceled=reminders.find(d=>d.status==='canceled')
 assert.equal(canceled.task,`submission:${budget.id}|${sales.id}`);assert.equal(canceled.reason,'Submitted before the reminder')
 assert.ok(reminders.filter(d=>d.channel==='email').every(d=>d.scheduledAt==='2026-10-29T13:00:00.000Z'&&d.dispatchedAt==='2026-10-29T13:05:00.000Z'&&d.zone==='America/New_York'&&/EDT/.test(d.scheduledLabel)))
 const mail=h.messages.slice(mailBefore)
 assert.deepEqual(mail.map(m=>`${m.to[0]} ${m.subject}`).sort(),[
  `engineering@example.test Reminder: Review engineering headcount is due 2026-10-30`,
  `engineering@example.test Reminder: Submit department budget · Engineering · ${budget.name} is due 2026-10-30`,
  `owner@example.test Reminder: Confirm year-end variances is due 2026-10-30`])
 assert.ok(mail.every(m=>!/Sales|sales@/.test(m.text)),'No other department detail reaches an assignee')
 assert.equal(reminders.find(d=>d.channel==='email'&&d.recipient==='owner@example.test').label,'Accepted by the mail provider; delivery is not confirmed')
 const engSubmission=reminders.find(d=>d.channel==='email'&&d.task===`submission:${budget.id}|${eng.id}`)
 assert.equal(engSubmission.status,'pending')
 // Shared channels receive only the generic text and a sign-in link, one per open task.
 assert.equal(chats.length,9)
 for(const chat of chats){assert.match(chat.body,/Easel planning task reminder/);assert.doesNotMatch(chat.body,/Engineering|Sales|headcount|variances|Submit|2026-10-30/);assert.match(chat.body,new RegExp(`${h.origin}/app`))}
 const nookPosts=chats.filter(c=>c.host==='nook.example.com')
 assert.equal(nookPosts.length,3);assert.ok(nookPosts.every(c=>c.path==='/api/conversations/planning/messages'&&c.authorization===`Bearer ${NOOK_TOKEN}`&&/^[A-Za-z0-9._:-]{1,64}$/.test(c.key)))
 assert.deepEqual(JSON.parse(nookPosts[0].body),{body:`Easel planning task reminder\n${h.origin}/app`})
 assert.ok(view.deliveries.filter(d=>d.channel==='slack').every(d=>d.status==='accepted'&&d.label==='Accepted by the Slack webhook; delivery to the channel is not confirmed'))
 assert.ok(view.deliveries.filter(d=>d.channel==='teams').every(d=>d.status==='pending'&&d.reason==='redirect_refused'),'Redirects are refused')
 const activity=await h.get('/api/easel/activity?actor=scheduler:calendar')
 assert.ok(activity.length>0&&activity.every(a=>a.detail.authority.type==='scheduler'&&a.detail.authority.attributedTo==='owner@example.test'))
 // Idempotent per occurrence.
 const sent=h.messages.length,posted=chats.length
 await run('2026-10-29T13:20:00.000Z')
 assert.equal(h.messages.length,sent);assert.equal(chats.length,posted)

 // Explicit finance retry: same captured message; live authority rechecked first.
 const teams=view.deliveries.find(d=>d.channel==='teams'&&d.task===review.id)
 await h.command('calendar-delivery-retry',{id:teams.id},ec,403)
 teamsStatus=202
 await h.command('calendar-delivery-retry',{id:teams.id})
 assert.equal(chats.at(-1).body,chats.find(c=>c.host==='workflows.teams.example.com').body)
 assert.equal((await h.get('/api/easel/calendar')).deliveries.find(d=>d.id===teams.id).label,'Accepted by the Teams workflow; delivery to the channel is not confirmed')
 await h.command('calendar-delivery-retry',{id:teams.id},h.owner,409)
 await h.command('member',{email:'engineering@example.test',name:'Engineering',role:'contributor',departments:[eng.id],active:false})
 const beforeBlocked=h.messages.length
 await h.command('calendar-delivery-retry',{id:engSubmission.id})
 assert.equal(h.messages.length,beforeBlocked,'A revoked owner is never mailed')
 assert.equal((await h.get('/api/easel/calendar')).deliveries.find(d=>d.id===engSubmission.id).status,'blocked')
 await h.command('member',{email:'engineering@example.test',name:'Engineering',role:'contributor',departments:[eng.id],active:true})
 const engDeliveries=(await h.get('/api/easel/calendar',ec)).deliveries
 assert.ok(engDeliveries.length>0&&engDeliveries.every(d=>d.channel==='email'&&d.recipient==='engineering@example.test'))

 // The owner completes their task; reminders and escalation stop for it.
 await h.command('calendar-task-complete',{id:review.id,revision:review.revision},ec)
 await run('2026-10-30T13:05:00.000Z')
 await run('2026-11-02T13:30:00.000Z')
 assert.equal((await h.get('/api/easel/calendar')).deliveries.filter(d=>d.kind==='escalation').length,0,'08:30 EST Monday is before escalation')
 companyOverdueMail=500
 const beforeEscalation=h.messages.length
 await run('2026-11-02T14:05:00.000Z')
 view=await h.get('/api/easel/calendar')
 const escalations=view.deliveries.filter(d=>d.kind==='escalation'&&d.channel==='email')
 assert.deepEqual(escalations.map(d=>d.task).sort(),[company.id,`submission:${budget.id}|${eng.id}`].sort())
 assert.ok(escalations.every(d=>d.recipient==='owner@example.test'&&d.scheduledAt==='2026-11-02T14:00:00.000Z'&&/EST/.test(d.scheduledLabel)))
 assert.deepEqual(h.messages.slice(beforeEscalation).map(m=>m.subject).sort(),[`Overdue: Confirm year-end variances (due 2026-10-30)`,`Overdue: Submit department budget · Engineering · ${budget.name} (due 2026-10-30)`])
 const uncertain=escalations.find(d=>d.task===company.id)
 assert.equal(uncertain.status,'uncertain')
 await h.command('calendar-delivery-retry',{id:uncertain.id},h.owner,409)

 // Inherited REPORT-005: open department calendar tasks appear only in that department's statement.
 await h.command('submit',{scenario:budget.id,department:eng.id},ec)
 await h.command('calendar-task-save',{kind:'other',name:'Engineering vendor renewals',department:eng.id,owner:'engineering@example.test',due:'2026-11-20'})
 await h.command('calendar-task-save',{kind:'other',name:'Sales commission plan',department:sales.id,owner:'sales@example.test',due:'2026-11-20'})
 for(const [department,amount]of[[eng.id,'1000'],[sales.id,'2000']])await h.command('expense',{scenario:budget.id,name:'Run rate',kind:'recurring',line:expense.id,department,start:'2026-01',amount})
 const approved=await h.command('approve-budget',{scenario:budget.id,revision:(await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision})
 await h.command('account-map',{account:'500',target:expense.id})
 for(const d of[eng,sales])await h.command('department-map',{source:d.name,department:d.id})
 const body={filename:'january.csv',csv:'Date,Account,Department,Amount,Description\n2026-01-31,500,Engineering,1300,Hosting\n2026-01-31,500,Sales,2600,Events\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount',description:'Description'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive'}
 await h.kit('actuals','commit',{...body,fingerprint:(await h.kit('actuals','preview',body)).fingerprint})
 const beforeClose=h.messages.length
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const statements=h.messages.slice(beforeClose).filter(m=>m.subject.startsWith('Monthly statement'))
 const engMail=statements.find(m=>m.to.includes('engineering@example.test')),salesMail=statements.find(m=>m.to.includes('sales@example.test'))
 assert.match(engMail.text,/Engineering vendor renewals/);assert.doesNotMatch(engMail.text,/Sales commission plan|Confirm year-end variances/)
 assert.match(salesMail.text,/Sales commission plan/);assert.doesNotMatch(salesMail.text,/Engineering vendor renewals/)
 const engStatement=(await h.get('/api/easel/department-statements',ec))[0]
 const engDetail=await h.get(`/api/easel/department-statements/${engStatement.id}`,ec)
 assert.ok(engDetail.tasks.some(x=>x.name==='Engineering vendor renewals'));assert.ok(!engDetail.tasks.some(x=>x.name==='Sales commission plan'))
})
