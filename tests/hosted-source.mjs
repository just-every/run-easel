import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Real Gauge records and its native review commands, never a provider fake. */
export async function sourceTime(context, origin) {
 const response = await context.request.post(origin + '/setup', { headers: { origin }, form: { confirm: 'yes', currency: 'USD', timezone: 'UTC' }, maxRedirects: 0 })
 assert.equal(response.status(), 303)
 const command = async (action, input = {}) => {
  const response = await context.request.post(origin + '/api/gauge/command', { headers: { origin }, data: { action, key: randomUUID(), ...input } })
  assert.equal(response.status(), 200, `Gauge ${action} succeeds through its native command door`)
  return response.json()
 }
 const person = await command('save:people', { name: 'Hosted refresh analyst', timezone: 'UTC' })
 const client = await command('save:clients', { name: 'Harbour Analytics' })
 const engagement = await command('save:engagements', { clientId: client.id, leadId: person.id, members: [person.id], name: 'Planning implementation', scope: 'Disposable hosted acceptance', timezone: 'UTC', currency: 'USD' })
 await command('save:calendars', { personId: person.id, from: '2026-10-01', to: '2026-10-31', dailySeconds: 28800, weekdays: '1,2,3,4,5', timezone: 'UTC', holidays: [] })
 const budget = await command('save:budgets', { engagementId: engagement.id, mode: 'hourly', amountMinor: 100000, effortSeconds: 28800, roundingSeconds: 1, reason: 'Disposable hosted acceptance' })
 await command('budget:approve', { id: budget.id, revision: budget.revision })
 await command('save:rates', { engagementId: engagement.id, service: 'Consulting', effective: '2026-10-01', billMinor: 10000 })
 const task = await command('save:tasks', { engagementId: engagement.id, name: 'Approved implementation', remainingSeconds: 3600, billable: true })
 const time = await command('time:save', { engagementId: engagement.id, personId: person.id, taskId: task.id, service: 'Consulting', start: '2026-10-01T09:00:00Z', end: '2026-10-01T10:00:00Z', timezone: 'UTC', notes: 'Disposable hosted acceptance', billable: true })
 const submitted = await command('time:submit', { id: time.id, revision: time.revision })
 await command('time:approve', { id: submitted.id, revision: submitted.revision })
 const key = await command('apikey:create', { label: 'Easel hosted refresh proof' })
 assert.ok(key.token)
 return key.token
}

export async function hostedPlan(context, origin) {
 const recipient = process.env.EASEL_INVITE_EMAIL
 assert.ok(recipient, 'Inject the controlled EASEL_INVITE_EMAIL sandbox recipient')
 const post = async (path, body) => {
  const response = await context.request.post(origin + path, { headers: { origin }, data: body })
  assert.equal(response.status(), 200, `${path}: ${await response.text()}`)
  return response.json()
 }
 const command = (name, body) => post('/api/easel/command/' + name, body)
 await command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', timeZone: 'UTC' })
 const department = await command('department', { name: 'Consulting' })
 const revenue = await command('line', { name: 'Implementation revenue', type: 'revenue' })
 const costs = await command('line', { name: 'Cloud hosting', type: 'operating-expense' })
 let state = await (await context.request.get(origin + '/api/easel/state')).json()
 let budget = state.scenarios.find(row => row.kind === 'budget')
 await command('revenue', { scenario: budget.id, name: 'Implementation services', line: revenue.id, department: department.id, kind: 'volume', startVolume: '1', rate: '10000', start: '2026-01' })
 await command('expense', { scenario: budget.id, name: 'Hosted operations', line: costs.id, department: department.id, kind: 'recurring', amount: '1200', start: '2026-01' })
 const reviewed = await (await context.request.get(`${origin}/api/easel/scenario/${budget.id}`)).json()
 await command('approve-budget', { scenario: budget.id, revision: reviewed.scenario.revision })
 await command('account-map', { account: '200', target: revenue.id })
 await command('account-map', { account: '300', target: costs.id })
 await command('department-map', { source: 'Consulting', department: department.id })
 const body = { csv: 'Date,Account,Department,Debit,Credit\n2026-01-31,200,Consulting,,10000.00\n2026-01-31,300,Consulting,1200.00,\n', filename: 'synthetic-easel-1.csv', columns: { date: 'Date', account: 'Account', department: 'Department', debit: 'Debit', credit: 'Credit' }, amountMode: 'debit-credit', dateFormat: 'YYYY-MM-DD' }
 const preview = await post('/api/easel/import/actuals/preview', body)
 await post('/api/easel/import/actuals/commit', { ...body, fingerprint: preview.fingerprint })
 state = await (await context.request.get(origin + '/api/easel/state')).json()
 const forecast = state.scenarios.find(row => row.kind === 'forecast')
 await command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await command('pack-create', { month: '2026-01' })
 await command('pack-decision', { pack: pack.id, text: 'Maintain the approved hosting budget', owner: 'Finance', due: '2026-11-01' })
 await command('pack-publish', { pack: pack.id })
 await command('member', { email: recipient, name: 'Hosted reviewer', role: 'viewer' })
}
