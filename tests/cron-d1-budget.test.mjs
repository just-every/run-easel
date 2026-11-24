import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

// Free D1 allows 5 million rows read a day for the whole account. A quiet */15 run and a state poll must read the
// model about once, however many runners the cron has and however much delivery history has built up.
test('D1 read budget: a quiet cron run and a state poll stay flat over 30 days of reminders and alerts, and finished history is pruned once a day', async t => {
 let now = '2026-03-02T12:00:00.000Z'
 const h = await harness({ entry: 'tests/easel-metered-worker.ts', now: () => now, bindings: { SLACK_WEBHOOK_URL: 'https://chat.example.test/synthetic-easel-1' }, outbound: async () => new Response('ok') }); t.after(() => h.close())
 const rows = async () => JSON.parse(await (await h.mf.dispatchFetch(h.origin + '/__reads?reset=1')).text()).reduce((n, r) => n + r.read, 0)
 const cron = async at => { now = at; await rows(); await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' }); return rows() }
 const count = async (sql, ...bind) => (await h.db.prepare(sql).bind(...bind).first()).n
 await h.command('workspace', { name: 'Larch Labs', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const ops = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Subscriptions', type: 'revenue' }), costs = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '520000', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario: budget.id, name: 'Plans', kind: 'volume', department: ops.id, line: revenue.id, start: '2026-01', startVolume: '100', rate: '1000', collectionLag: 0 })
 await h.command('expense', { scenario: budget.id, name: 'Running costs', kind: 'recurring', department: ops.id, line: costs.id, start: '2026-01', amount: '110000' })
 await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 await h.command('cash-constraints', { floor: '350000', runwayMinimum: '0' })
 await h.person('planner@example.test', 'contributor', [ops.id])
 await h.command('cash-alert-rule-save', { enabled: true, name: 'Floor', kind: 'floor' })
 await h.command('calendar-schedule-save', { enabled: true, channels: [], revision: 0 })
 const first = await h.command('calendar-task-save', { kind: 'review-headcount', name: 'Review headcount', department: ops.id, owner: 'planner@example.test', due: '2026-03-10' })
 const day = n => new Date(Date.parse('2026-03-02T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
 for (let d = 1; d <= 30; d++) {
  if (d % 5 === 0) await h.command('calendar-task-save', { kind: 'review-headcount', name: `Review headcount ${d}`, department: ops.id, owner: 'planner@example.test', due: day(d + 3) })
  for (const at of ['T08:15', 'T13:15', 'T14:15', 'T20:15']) await cron(`${day(d)}${at}:00.000Z`)
 }
 const records = await count('SELECT count(*) n FROM e_records')
 const ceiling = records * 2 + 100
 const quiet = await cron(`${day(30)}T21:00:00.000Z`)
 assert.ok(quiet <= ceiling, `a quiet cron run read ${quiet} rows for a model of ${records} records (ceiling ${ceiling})`)
 await rows(); await h.get('/api/easel/state')
 const poll = await rows()
 assert.ok(poll <= ceiling, `a state poll read ${poll} rows for a model of ${records} records (ceiling ${ceiling})`)

 // Finished deliveries and checks older than 60 days go; what still stops a repeat stays.
 await h.command('calendar-task-complete', { id: first.id, revision: first.revision })
 const deliveries = id => count("SELECT count(*) n FROM e_records WHERE kind='calendar-delivery' AND json_extract(value,'$.task') IS ?", id)
 const others = await count("SELECT count(*) n FROM e_records WHERE kind='calendar-delivery' AND json_extract(value,'$.task')<>?", first.id)
 assert.ok(await deliveries(first.id) > 0 && others > 0, 'both a finished and a still-open task have deliveries to start with')
 await cron(`${day(130)}T09:00:00.000Z`)
 assert.equal(await deliveries(first.id), 0, 'a finished task\'s old deliveries are removed')
 assert.ok(await count("SELECT count(*) n FROM e_records WHERE kind='calendar-delivery' AND json_extract(value,'$.task')<>?", first.id) >= others, 'a still-open task keeps its deliveries so escalations are not sent again')
 assert.ok(await count("SELECT count(*) n FROM e_records WHERE kind='cash-alert-check'") <= 15, 'only the checks the alerts page can show are kept')
 const again = await cron(`${day(130)}T09:15:00.000Z`)
 assert.ok(again <= quiet, `pruning runs once a day, so the next run is a normal quiet run (${again} rows)`)
})
