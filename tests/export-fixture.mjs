// A realistic company created exclusively through Easel's public HTTP doors.
export async function exportFixture(h) {
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = (await h.command('department', { name: 'Sales' })).id
 const engineering = (await h.command('department', { name: 'Engineering' })).id
 const revenue = (await h.command('line', { name: 'Services', type: 'revenue' })).id
 const salary = (await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })).id
 const software = (await h.command('line', { name: 'Software', type: 'operating-expense' })).id
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('revenue', { scenario: budget.id, department: sales, line: revenue, name: 'Consulting', kind: 'volume', start: '2026-01', startVolume: '10', rate: '1000.01' })
 await h.command('position', { scenario: budget.id, department: engineering, line: salary, title: 'Principal engineer', holder: 'Morgan Private', start: '2026-01', annualSalary: '96000', onCostPercent: '10' })
 await h.command('expense', { scenario: budget.id, department: sales, line: software, name: '=untrusted vendor', kind: 'recurring', start: '2026-01', amount: '99.99' })
 await h.command('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: '500000' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const downside = await h.command('branch', { from: forecast.id, name: 'Downside' })
 await h.command('expense', { scenario: downside.id, department: sales, line: software, name: 'New vendor', kind: 'one-off', start: '2026-02', amount: '500' })
 await h.command('account-map', { account: '400', target: revenue })
 await h.command('department-map', { source: 'Sales', department: sales })
 const body = { csv: 'Date,Account,Department,Amount\n2026-01-31,400,Sales,-9000\n', filename: 'january-ledger.csv', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', body)
 await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await h.command('pack-create', { month: '2026-01' })
 await h.command('pack-decision', { pack: pack.id, text: 'Review service utilization', owner: 'Fran Finance', due: '2026-02-15' })
 await h.command('pack-publish', { pack: pack.id })
 return { budget, forecast, downside, pack, sales, engineering, revenue, body }
}
