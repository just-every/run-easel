import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const list = '/api/easel/cash-alerts'
const file = (filename, rows) => ({ filename, csv: `Date,Account,Department,Amount\n${rows.join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' })

test('REPORT-006 cash alerts: floor, below-plan and runway rules alert once per breach on refresh, re-alert on worsening or after the interval on the company-zone schedule, and record acknowledgment', async t => {
 let now = '2026-03-02T15:00:00.000Z'
 const h = await harness({ now: () => now }); t.after(() => h.close())
 const run = async at => { now = at; await (await h.mf.getWorker()).scheduled({ cron: '*/15 * * * *' }) }
 const accept = async f => { const p = await h.kit('actuals', 'preview', f); return h.kit('actuals', 'commit', { ...f, fingerprint: p.fingerprint }) }
 const alertMail = () => h.messages.filter(m => /^Cash alert: /.test(m.subject))
 await h.command('workspace', { name: 'Larch Labs', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const ops = await h.command('department', { name: 'Operations' })
 const revenue = await h.command('line', { name: 'Subscriptions', type: 'revenue' }), costs = await h.command('line', { name: 'Operating costs', type: 'operating-expense' })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 // Plan: $520,000 opening cash, $100,000 in and $110,000 out every month, no lags.
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '520000', collectionLag: 0, paymentLag: 0 })
 await h.command('revenue', { scenario: budget.id, name: 'Plans', kind: 'volume', department: ops.id, line: revenue.id, start: '2026-01', startVolume: '100', rate: '1000', collectionLag: 0 })
 await h.command('expense', { scenario: budget.id, name: 'Running costs', kind: 'recurring', department: ops.id, line: costs.id, start: '2026-01', amount: '110000' })
 const forecast = (await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })).forecast
 await h.command('account-map', { account: '400', target: revenue.id }); await h.command('account-map', { account: '500', target: costs.id })
 await h.command('department-map', { source: 'Operations', department: ops.id })
 await h.command('cash-constraints', { floor: '350000', runwayMinimum: '0' })
 const planner = await h.person('planner@example.test', 'contributor', [ops.id]), viewer = await h.person('viewer@example.test', 'viewer')
 const rule = body => h.command('cash-alert-rule-save', { intervalDays: 7, enabled: true, ...body })
 for (const cookie of [planner, viewer]) {
  await h.command('cash-alert-rule-save', { name: 'Not finance', kind: 'floor', intervalDays: 7 }, cookie, 403)
  await h.command('cash-alert-check', {}, cookie, 403)
  await h.get(list, cookie, 403)
 }
 const floor = await rule({ name: 'Cash floor', kind: 'floor' })
 const amount = await rule({ name: 'Cash $50k under plan', kind: 'below-plan', basis: 'amount', amount: '50000' })
 const percent = await rule({ name: 'Cash 10% under plan', kind: 'below-plan', basis: 'percent', percent: '10' })
 const runway = await rule({ name: 'Runway under 12 months', kind: 'runway', runway: '12' })
 let v = await h.get(list)
 assert.deepEqual(v.alerts, [], 'the approved plan meets every rule')
 assert.match(v.rules.find(r => r.id === amount.id).blocked, /No month is closed/, 'no actual cash yet: blocked, never a zero')

 // A January far below plan: $40,000 collected, $110,000 paid. Accepting an open month changes no forecast cash; closing it does.
 await accept(file('january.csv', ['2026-01-31,400,Operations,-40000', '2026-01-31,500,Operations,110000']))
 assert.deepEqual((await h.get(list)).alerts, [])
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 v = await h.get(list)
 const alertOf = (r, view = v) => view.alerts.filter(a => a.rule === r.id)
 for (const r of [floor, amount, percent, runway]) assert.equal(alertOf(r).length, 1, `${r.name}: one alert`)
 assert.deepEqual(alertOf(floor)[0].sends.map(s => s.reason), ['breach'])
 const floorNumbers = alertOf(floor)[0].current
 assert.deepEqual([floorNumbers.crossingMonth, floorNumbers.lowestMonth, floorNumbers.lowestCents, floorNumbers.floorCents, floorNumbers.gapCents], ['2026-12', '2026-12', 34000000, 35000000, 1000000], 'Jan closes at $450,000 and then burns $10,000 a month')
 for (const r of [amount, percent]) {
  const n = alertOf(r)[0].current
  assert.deepEqual([n.month, n.planCents, n.actualCents, n.shortfallCents, n.shortfallBps], ['2026-01', 51000000, 45000000, 6000000, 1176], `${r.name}: $60,000 (11.76%) below plan`)
 }
 const rn = alertOf(runway)[0].current
 assert.deepEqual([rn.month, rn.closingCents, rn.trailingNetBurnCents, rn.trailingMonths, rn.runwayHundredths], ['2026-02', 44000000, 8000000, 2, 1100], 'runway falls to 11 months in February')
 let mail = alertMail()
 assert.equal(mail.length, 4, 'one email per alert to the only active finance person')
 const floorMail = mail.find(m => m.subject.includes('Cash floor'))
 assert.deepEqual(floorMail.to, ['owner@example.test'])
 for (const part of ['Dec 2026', '$340,000.00', '$350,000.00', 'Cause: owner@example.test closed Jan 2026.', `/app?tab=overview&record=${alertOf(floor)[0].id}`]) assert.ok(floorMail.text.includes(part), `floor email names ${part}`)
 assert.ok(mail.find(m => m.subject.includes('$50k')).text.includes('$60,000.00'))

 // A refresh with no change sends nothing; neither does an explicit check.
 await accept(file('january-zero.csv', ['2026-01-31,500,Operations,0']))
 assert.deepEqual((await h.command('cash-alert-check', {})).sent, [])
 v = await h.get(list)
 for (const r of [floor, amount, percent, runway]) assert.equal(alertOf(r)[0].sends.length, 1)
 assert.equal(alertMail().length, 4)

 // A refresh that worsens every breach (another $5,000 of January cost) re-alerts each once.
 await accept(file('january-late.csv', ['2026-01-31,500,Operations,5000']))
 v = await h.get(list)
 for (const r of [floor, amount, percent, runway]) assert.deepEqual(alertOf(r)[0].sends.map(s => s.reason), ['breach', 'worse'], r.name)
 assert.deepEqual([alertOf(floor)[0].current.crossingMonth, alertOf(floor)[0].current.lowestCents, alertOf(amount)[0].current.shortfallCents, alertOf(runway)[0].current.runwayHundredths], ['2026-11', 33500000, 6500000, 1024])
 assert.match(alertMail().at(-1).text, /Cause: owner@example\.test accepted actuals file january-late\.csv\./)
 await accept(file('january-zero-2.csv', ['2026-01-30,500,Operations,0']))
 assert.equal(alertMail().length, 8)

 // The daily check runs at 08:00 company time: before it nothing is recorded; an
 // unchanged breach waits for its seven-day interval, which spans the DST change.
 await run('2026-03-03T12:59:00.000Z')
 assert.deepEqual((await h.get(list)).checks, [])
 await run('2026-03-03T13:05:00.000Z')
 await run('2026-03-03T13:20:00.000Z')
 v = await h.get(list)
 assert.equal(v.zone, 'America/New_York')
 assert.deepEqual(v.checks.map(c => [c.date, c.scheduledAt, c.ranAt, c.sent.length]), [['2026-03-03', '2026-03-03T13:00:00.000Z', '2026-03-03T13:05:00.000Z', 0]])
 await run('2026-03-09T11:59:00.000Z')
 assert.equal((await h.get(list)).checks.length, 1, '07:59 EDT is before the daylight-saving 08:00 check')
 await run('2026-03-09T12:05:00.000Z')
 v = await h.get(list)
 assert.deepEqual(v.checks[0].scheduledAt, '2026-03-09T12:00:00.000Z')
 for (const r of [floor, amount, percent, runway]) assert.deepEqual(alertOf(r)[0].sends.map(s => s.reason), ['breach', 'worse', 'interval'], r.name)
 mail = alertMail()
 assert.equal(mail.length, 12)
 assert.match(mail.at(-1).text, /Still breached 7 company-zone days after the last alert/)
 assert.match(mail.at(-1).text, /Cause: scheduled check for Mon, 03\/09\/2026, 08:00\sAM\sEDT\./)

 // Acknowledgment is recorded against the latest send, once, at the exact revision.
 const open = alertOf(floor)[0]
 await h.command('cash-alert-acknowledge', { id: open.id, revision: open.revision }, viewer, 403)
 await h.command('cash-alert-acknowledge', { id: open.id, revision: open.revision + 1 }, h.owner, 409)
 const acked = await h.command('cash-alert-acknowledge', { id: open.id, revision: open.revision })
 assert.deepEqual(acked.acknowledgments.map(a => [a.by, a.at, a.send]), [['owner@example.test', '2026-03-09T12:05:00.000Z', 3]])
 await h.command('cash-alert-acknowledge', { id: open.id, revision: acked.revision }, h.owner, 409)
 assert.ok((await h.get(`/api/easel/activity?record=${open.id}`)).some(e => e.action === 'cash-alert-acknowledge' && e.actor === 'owner@example.test'))

 // Recovery ends each breach without a message; a later breach would open a new alert.
 await accept(file('january-revenue.csv', ['2026-01-31,400,Operations,-100000']))
 v = await h.get(list)
 for (const r of [floor, amount, percent, runway]) assert.deepEqual(alertOf(r).map(a => a.status), ['ended'], r.name)
 assert.equal(alertMail().length, 12)
})
