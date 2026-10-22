import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
const csv = (month, rows) => ({ filename: `gl-${month}.csv`, csv: `Date,Account,Department,Amount\n${rows.map(([account, amount]) => `${month}-28,${account},Sales,${amount}`).join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' })

test('AGENT-004 deals that close 34 days late produce a backtested slippage proposal that changes nothing until finance promotes it', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Slippage Co', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const revenue = await h.command('line', { name: 'Contract revenue', type: 'revenue' })
 const software = await h.command('line', { name: 'Software', type: 'operating-expense' })
 await h.command('account-map', { account: '400', target: revenue.id })
 await h.command('account-map', { account: '461', target: software.id })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const contract = (month, startDate, scenario = budget.id, extra = {}) => ({ scenario, name: `Deal ${month}`, kind: 'contract', line: revenue.id, department: sales.id, start: startDate.slice(0, 7), startDate, termMonths: '12', contractValue: '12000', billingCadence: 'monthly', dsoDays: '0', ...extra })
 const planned = months.slice(0, 11).map(m => `${m}-10`)
 for (const [i, d] of planned.entries()) await h.command('revenue', contract(months[i], d))
 await h.command('expense', { scenario: budget.id, name: 'Tools', kind: 'recurring', department: sales.id, line: software.id, start: '2026-01', amount: '100' })
 // A one-off planned in March that really lands in April: a timing difference.
 await h.command('expense', { scenario: budget.id, name: 'Conference deposit', kind: 'one-off', department: sales.id, line: software.id, start: '2026-03', amount: '5000' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })

 // Reality: the same contracts all started 34 days after the forecast expected.
 const reality = await h.command('branch', { from: forecast.id, name: 'What actually happened' })
 for (const r of (await h.get(`/api/easel/scenario/${reality.id}`)).inputs.revenue) { const startDate = addDays(r.startDate, 34); await h.command('revenue', contract(r.name, startDate, reality.id, { id: r.id, name: r.name })) }
 const actualRevenue = (await h.get(`/api/easel/scenario/${reality.id}`)).calculation.lineTotals[revenue.id]

 for (const month of months.slice(0, 8)) {
  const rows = [['461', month === '2026-04' ? '5100.00' : '100.00']]
  if (actualRevenue[month]) rows.push(['400', `-${(actualRevenue[month] / 100).toFixed(2)}`])
  const body = csv(month, rows), preview = await h.kit('actuals', 'preview', body)
  await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
  await h.command('close-month', { scenario: forecast.id, month })
 }
 const learn = () => h.get(`/api/easel/forecast-learning/${forecast.id}`)
 const before = await learn()
 assert.equal(before.kept.length, 8)
 assert.deepEqual(before.measures, [], 'without deal history there is nothing measured')
 assert.ok(before.decomposition.length > 0)
 for (const k of before.kept) assert.equal(k.timing + k.driver + k.permanent, k.gross, `error split is exact for ${k.month}`)
 assert.deepEqual(before.kept.slice(0, 3).map(k => k.timing), [1000000, 1000000, 1000000], 'the deposit that moved from March to April nets to zero inside each window: timing, not permanent')
 assert.equal(before.kept[3].timing, 0)

 // Deal history: expected against actual close, averaging 34 days late.
 const slips = [30, 38, 34, 34, 34, 30, 38, 34, 34, 34, 34]
 await h.command('deal-outcomes-save', { rows: slips.map((d, i) => ({ deal: `synthetic-easel-${i + 1}`, name: `Deal ${months[i]}`, plannedClose: planned[i], actualClose: addDays(planned[i], d) })) })
 const analysis = await learn()
 const close = analysis.measures.find(m => m.key === 'close-slippage')
 assert.equal(close.samples, 11); assert.equal(close.meanDays, 34)
 assert.equal(close.backtest.keptForecasts, 8)
 assert.ok(close.backtest.revisedError < close.backtest.baselineError, 'lower error on past kept forecasts')
 assert.equal(close.backtest.worseOn, 0)
 assert.equal(close.suggestion.eligible, true, close.suggestion.reasons.join(';'))
 assert.ok(analysis.kept.some(k => k.driver > 0), 'part of the error is attributed to the measured driver')
 for (const k of analysis.kept) assert.equal(k.timing + k.driver + k.permanent, k.gross)

 // Only finance reads, proposes or records history.
 const viewer = await h.person('board@example.test', 'viewer')
 const contributor = await h.person('sales@example.test', 'contributor', [sales.id])
 for (const cookie of [viewer, contributor]) {
  await h.get(`/api/easel/forecast-learning/${forecast.id}`, cookie, 403)
  await h.command('deal-outcomes-save', { rows: [{ deal: 'x', name: 'x', plannedClose: '2026-01-01', actualClose: '2026-01-02' }] }, cookie, 403)
  await h.command('learning-propose', { scenario: forecast.id, measure: 'close-slippage', evidence: close.evidenceSha }, cookie, 403)
 }
 await h.command('deal-outcomes-save', { rows: [{ deal: 'bad', name: 'Bad', plannedClose: '2026-02-30', actualClose: '2026-03-01' }] }, h.owner, 400)

 // The agent proposes; nothing changes.
 const forecastBefore = await h.get(`/api/easel/scenario/${forecast.id}`)
 const keptBefore = await Promise.all(forecastBefore.scenario.priorForecasts.map(p => h.get(`/api/easel/snapshot/${p.snapshot}`)))
 await h.command('learning-propose', { scenario: forecast.id, measure: 'close-slippage', evidence: 'stale' }, h.owner, 409)
 const proposal = await h.command('learning-propose', { scenario: forecast.id, measure: 'close-slippage', evidence: close.evidenceSha })
 assert.equal(proposal.kind, 'proposal'); assert.equal(proposal.proposalStatus, 'draft')
 assert.equal(proposal.learning.days, 34)
 assert.equal(proposal.learning.changes.length, 3, 'only contracts that had not started by September move')
 assert.match(proposal.request, /34 days.*Backtest on 8 kept forecasts/)
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), forecastBefore)
 for (const sn of keptBefore) assert.deepEqual(await h.get(`/api/easel/snapshot/${sn.id}`), sn)
 const draft = await h.get(`/api/easel/scenario/${proposal.id}`)
 const moved = Object.fromEntries(draft.inputs.revenue.map(r => [r.name, r.startDate]))
 assert.deepEqual([moved['Deal 2026-08'], moved['Deal 2026-09'], moved['Deal 2026-11']], ['2026-08-10', '2026-10-14', '2026-12-14'], 'started deals keep their dates; open ones move 34 days')
 assert.deepEqual((await h.get('/api/easel/deal-history')).deals.length, 11)

 // Finance promotes the exact reviewed revision through the ordinary doors.
 const submitted = await h.command('proposal-submit', { id: proposal.id, summary: 'Learned from deal history' })
 await h.command('proposal-promote', { id: proposal.id, revision: submitted.revision })
 const after = await h.get(`/api/easel/scenario/${forecast.id}`)
 assert.notDeepEqual(after.calculation.lineTotals, forecastBefore.calculation.lineTotals)
 assert.equal(after.inputs.revenue.find(r => r.name === 'Deal 2026-09').startDate, '2026-10-14')
 for (const sn of keptBefore) assert.deepEqual(await h.get(`/api/easel/snapshot/${sn.id}`), sn, 'kept forecasts stay reproducible after promotion')
})

const GL = (month, rows) => csv(month, rows)
async function closeMonths(h, forecast, count, rowsFor) {
 for (const month of months.slice(0, count)) {
  const body = GL(month, rowsFor(month).filter(([, amount]) => Number(amount) !== 0)), preview = await h.kit('actuals', 'preview', body)
  await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
  await h.command('close-month', { scenario: forecast.id, month })
 }
}

test('AGENT-004 hire start slippage from accepted roster history and collection lag from paid invoices are backtested and proposed through the same doors', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Lag Co', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const eng = await h.command('department', { name: 'Sales' })
 const payroll = await h.command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const revenue = await h.command('line', { name: 'Contract revenue', type: 'revenue' })
 const software = await h.command('line', { name: 'Software', type: 'operating-expense' })
 for (const [account, target] of [['477', payroll.id], ['400', revenue.id], ['461', software.id]]) await h.command('account-map', { account, target })
 await h.command('department-map', { source: 'Sales', department: eng.id })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const hires = []
 for (const [i, month] of months.slice(0, 10).entries()) hires.push(await h.command('position', { scenario: budget.id, title: `Hire ${i + 1}`, department: eng.id, line: payroll.id, start: month, plannedStartDate: `${month}-05`, annualSalary: '120000', onCostPercent: '0' }))
 const contracts = []
 for (const [i, month] of months.slice(0, 9).entries()) contracts.push(await h.command('revenue', { scenario: budget.id, name: `Contract ${i + 1}`, kind: 'contract', line: revenue.id, department: eng.id, start: month, startDate: `${month}-10`, termMonths: '12', contractValue: '12000', billingCadence: 'monthly', dsoDays: '0' }))
 await h.command('expense', { scenario: budget.id, name: 'Tools', kind: 'recurring', department: eng.id, line: software.id, start: '2026-01', amount: '100' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })

 // Reality: every hire starts 40 days after the plan.
 const reality = await h.command('branch', { from: forecast.id, name: 'What actually happened' })
 for (const p of (await h.get(`/api/easel/scenario/${reality.id}`)).inputs.position) { const plannedStartDate = addDays(p.plannedStartDate, 40); await h.command('position', { scenario: reality.id, id: p.id, title: p.title, department: eng.id, line: payroll.id, start: plannedStartDate.slice(0, 7), plannedStartDate, annualSalary: '120000', onCostPercent: '0' }) }
 const actual = (await h.get(`/api/easel/scenario/${reality.id}`)).calculation.lineTotals
 const origins = Object.fromEntries((await h.get(`/api/easel/scenario/${forecast.id}`)).inputs.position.map(p => [p.title, p.originId]))
 const header = 'Employee ID,Name,Department,Title,Employment Type,Salary,Start,Termination\n'
 const staff = [1, 2, 3, 4].map(i => [`E${i}`, `Hire ${i}`, addDays(`${months[i - 1]}-05`, 40)])
 const roster = { scenario: forecast.id, kind: 'roster', provider: 'Justworks', asOf: '2026-05-31', filename: 'roster.csv', positionMap: Object.fromEntries(staff.map(([id, title]) => [id, origins[title]])), csv: header + staff.map(([id, title, start]) => `${id},Synthetic ${id},Sales,${title},W-2,120000,${start},`).join('\n') + '\n' }
 const rosterPreview = await h.kit('payroll', 'preview', roster)
 await h.kit('payroll', 'commit', { ...roster, fingerprint: rosterPreview.fingerprint })

 // Paid invoices: each monthly invoice was paid 20 days after its date although plans assume DSO 0.
 const deals = []
 for (const [i, c] of contracts.slice(0, 6).entries()) for (let j = 0; j < 12; j++) {
  const invoice = `${new Date(Date.UTC(2026, i + j, 10)).toISOString().slice(0, 10)}`
  deals.push({ deal: `synthetic-easel-${i + 1}-${j + 1}`, name: `Invoice ${i + 1}.${j + 1}`, plannedClose: `${months[i]}-10`, actualClose: `${months[i]}-10`, contract: c.originId, invoiceDate: invoice, paidDate: addDays(invoice, 20), amount: '1000' })
 }
 await h.command('deal-outcomes-save', { rows: deals })
 const planRevenue = (await h.get(`/api/easel/scenario/${forecast.id}`)).calculation.lineTotals[revenue.id]
 await closeMonths(h, forecast, 8, month => [['461', '100.00'], ['477', ((actual[payroll.id][month] ?? 0) / 100).toFixed(2)], ['400', `-${((planRevenue[month] ?? 0) / 100).toFixed(2)}`]])
 const learn = await h.get(`/api/easel/forecast-learning/${forecast.id}`)
 const hire = learn.measures.find(m => m.key === 'hire-slippage'), lag = learn.measures.find(m => m.key === 'collection-lag')
 assert.deepEqual([hire.samples, hire.meanDays], [4, 40])
 assert.ok(hire.backtest.revisedError < hire.backtest.baselineError); assert.equal(hire.backtest.worseOn, 0); assert.equal(hire.suggestion.eligible, true, hire.suggestion.reasons.join(';'))
 assert.deepEqual([lag.samples, lag.meanDays], [72, 20])
 assert.ok(lag.backtest.revisedError < lag.backtest.baselineError); assert.equal(lag.backtest.worseOn, 0); assert.equal(lag.suggestion.eligible, true, lag.suggestion.reasons.join(';'))
 assert.equal(learn.measures.find(m => m.key === 'close-slippage').meanDays, 0, 'deals that closed on time measure zero days')
 assert.equal(learn.measures.find(m => m.key === 'close-slippage').suggestion.eligible, false)

 // Hire slippage needs pay detail: a finance analyst without it sees neither the measure nor payroll error rows.
 const analyst = await h.person('analyst@example.test', 'finance', [], false)
 const safe = await h.get(`/api/easel/forecast-learning/${forecast.id}`, analyst)
 assert.deepEqual(safe.measures.map(m => m.key), ['close-slippage', 'collection-lag'])
 assert.ok(!safe.decomposition.some(r => r.line === payroll.id)); assert.doesNotMatch(JSON.stringify(safe), /Synthetic E|Hire [0-9]/)
 await h.command('learning-propose', { scenario: forecast.id, measure: 'hire-slippage', evidence: hire.evidenceSha }, analyst, 409)

 const before = await h.get(`/api/easel/scenario/${forecast.id}`)
 const hirePlan = await h.command('learning-propose', { scenario: forecast.id, measure: 'hire-slippage', evidence: hire.evidenceSha })
 const lagPlan = await h.command('learning-propose', { scenario: forecast.id, measure: 'collection-lag', evidence: lag.evidenceSha })
 assert.deepEqual(hirePlan.learning.changes.map(c => [c.name, c.from, c.to]).sort(), [['Hire 10', '2026-10', '2026-11'], ['Hire 9', '2026-09', '2026-10']])
 assert.deepEqual(lagPlan.learning.changes.map(c => [c.name, c.from, c.to]), [['Contract 9', 0, 20]])
 assert.deepEqual(await h.get(`/api/easel/scenario/${forecast.id}`), before)
})
