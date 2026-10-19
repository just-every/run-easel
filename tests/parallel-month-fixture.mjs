// MOVE-004 synthetic old-tool month: one mapping difference in actuals and
// one formula difference in budget; every other amount agrees to the cent.
export async function seedParallelMonth(command, get, kit) {
 await command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const department = await command('department', { name: 'Consulting' })
 const revenue = await command('line', { name: 'Services', type: 'revenue' })
 const costs = await command('line', { name: 'Delivery costs', type: 'operating-expense' })
 const budget = (await get('state')).scenarios[0]
 const driver = { name: 'Retained contracts', kind: 'volume', department: department.id, line: revenue.id, start: '2026-01', startVolume: '10', rate: '100', collectionLag: 0 }
 await command('revenue', { scenario: budget.id, ...driver })
 await command('expense', { scenario: budget.id, name: 'Delivery', kind: 'recurring', department: department.id, line: costs.id, start: '2026-01', amount: '400' })
 const approved = await command('approve-budget', { scenario: budget.id, revision: (await get(`scenario/${budget.id}`)).scenario.revision })
 const forecast = approved.forecast
 const input = (await get(`scenario/${forecast.id}`)).inputs.revenue[0]
 await command('revenue', { ...driver, scenario: forecast.id, id: input.id, rate: '120' })
 await command('account-map', { account: '400', target: revenue.id })
 await command('account-map', { account: '500', target: costs.id })
 await command('department-map', { source: 'Consulting', department: department.id })
 const actuals = { filename: 'closed-january.csv', csv: 'Date,Account,Department,Amount\n2026-01-01,400,Consulting,-900\n2026-01-01,500,Consulting,450\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const p = await kit('preview', actuals)
 await kit('commit', { ...actuals, fingerprint: p.fingerprint })
 await command('close-month', { scenario: forecast.id, month: '2026-01' })
 const csv = `line,department,actual,budget,forecast\n${revenue.id},${department.id},950,1000,1200\n${costs.id},${department.id},450,410,400\n`
 return { department, revenue, costs, budget, forecast, driver, input, body: { month: '2026-01', name: 'January parallel run', filename: 'old-tool-january.csv', csv } }
}
