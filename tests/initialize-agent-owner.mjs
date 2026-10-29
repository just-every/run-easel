// Disposable verifier fixture: only the real native owner and planning doors.
export default async function ({ request, origin, claim, displayName, returnTo }) {
 const bootstrap = await request(new URL(claim.path, origin).href, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: claim.token, displayName, returnTo }) })
 if (bootstrap.status !== 303) throw new Error('Owner claim failed')
 const cookie = bootstrap.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
 const json = async (path, body) => {
  const response = await request(new URL(path, origin).href, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { origin, cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) throw new Error(`Native fixture failed: ${path} ${response.status}`)
  return response.json()
 }
 const command = (op, body) => json(`/api/easel/command/${op}`, body)
 await command('workspace', { name: 'Synthetic planning company', currency: 'USD', fiscalYearStart: 7, planStart: '2026-07' })
 const department = await command('department', { name: 'Sales' })
 const revenue = await command('line', { name: 'Revenue', type: 'revenue' })
 const cost = await command('line', { name: 'Operating cost', type: 'operating-expense' })
 const salary = await command('line', { name: 'Payroll', type: 'operating-expense', payroll: true })
 const budget = (await json('/api/easel/state')).scenarios.find(s => s.kind === 'budget')
 await command('position', { scenario: budget.id, department: department.id, line: salary.id, title: 'Sales planner', holder: 'Synthetic Employee', annualSalary: '60000', start: '2026-07' })
 await command('account-map', { account: '4000', target: revenue.id })
 await command('account-map', { account: '6000', target: cost.id })
 await command('account-map', { account: '1000', target: 'cash' })
 await command('department-map', { source: 'Sales', department: department.id })
 const input = { csv: 'Date,Account,Department,Amount\n2026-07-01,4000,Sales,-1000.00\n2026-07-01,6000,Sales,50.00\n2026-07-01,1000,Sales,950.00\n', filename: 'synthetic-actuals.csv', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, amountMode: 'debit-positive', dateFormat: 'YYYY-MM-DD' }
 const preview = await json('/api/easel/import/actuals/preview', input)
 await json('/api/easel/import/actuals/commit', { ...input, fingerprint: preview.fingerprint })
 const current = await json(`/api/easel/scenario/${budget.id}`)
 const approved = await command('approve-budget', { scenario: budget.id, revision: current.scenario.revision })
 await command('close-month', { scenario: approved.forecast.id, month: '2026-07' })
 return bootstrap
}
