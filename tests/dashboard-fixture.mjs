// Synthetic planning inputs shared by REPORT-002's HTTP and browser journeys.
export async function dashboardFixture(command, get) {
 await command('workspace', { name: 'Cardinal Advisory', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await command('department', { name: 'Sales' }), delivery = await command('department', { name: 'Delivery' })
 const revenue = await command('line', { name: 'Customer revenue', type: 'revenue' })
 const cost = await command('line', { name: 'Hosting', type: 'cost-of-sales' })
 const pay = await command('line', { name: 'People costs', type: 'operating-expense', payroll: true })
 const budget = (await get('state')).scenarios[0]
 await command('scenario-cash', { scenario: budget.id, opening: '100000', basis: 'estimate' })
 for (const [department, salary] of [[sales.id, '120000'], [delivery.id, '90000']]) await command('position', { scenario: budget.id, title: 'Private compensation', holder: 'Private Salary Person', department, line: pay.id, annualSalary: salary, start: '2026-01' })
 const base = { scenario: budget.id, line: revenue.id, department: sales.id, start: '2026-01' }
 await command('revenue', { ...base, name: 'Seat subscriptions', kind: 'seats', startSeats: '200', expansionPercent: '0', price: '40' })
 await command('revenue', { ...base, name: 'Customer subscriptions', kind: 'customers', startCustomers: '100', arpa: '20' })
 await command('revenue', { ...base, name: 'Nonrecurring work on the same line', kind: 'volume', startVolume: '5', rate: '1000' })
 await command('expense', { scenario: budget.id, name: 'Platform hosting', department: sales.id, line: cost.id, kind: 'recurring', start: '2026-01', amount: '3000' })
 return { sales, delivery, revenue, cost, pay, budget,
  body: { name: 'Board operating outlook', scenario: budget.id, department: '', audience: 'board', widgets: [{ metric: 'runway', display: 'tile' }, { metric: 'arr', display: 'chart' }, { metric: 'headcount', display: 'table' }] } }
}
