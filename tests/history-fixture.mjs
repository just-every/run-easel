const decimal = cents => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`

export const historyFile = (filename, rows) => ({
 filename, csv: `Date,Account,Department,Amount,Description\n${rows.join('\n')}\n`,
 columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description' },
 dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive',
})

export async function acceptHistory(kit, body) {
 const preview = await kit('actuals', 'preview', body)
 let result = await kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint, acknowledgeRejected: preview.rejected.length })
 while (result.batch.status === 'importing') result = await kit('actuals', 'resume', { id: result.batch.id })
 return result
}

/** Public adapters: command(op, body), get(relativePath), kit(name, op, body). */
export async function historyFixture(command, get, kit) {
 await command('workspace', { name: 'History Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2025-01' })
 const sales = await command('department', { name: 'Sales' })
 const delivery = await command('department', { name: 'Delivery' })
 const revenue = await command('line', { name: 'Source revenue', type: 'revenue' })
 const cost = await command('line', { name: 'Source costs', type: 'operating-expense' })
 const projected = await command('line', { name: 'Projected revenue', type: 'revenue' })
 const smoothed = await command('line', { name: 'Smoothed costs', type: 'operating-expense' })
 const budget = (await get('state')).scenarios.find(s => s.kind === 'budget')
 await command('account-map', { account: '400', target: revenue.id })
 await command('account-map', { account: '500', target: cost.id })
 await command('department-map', { source: 'Sales', department: sales.id })
 const amounts = {}, months = [], rows = []
 for (let index = 0; index < 24; index++) {
  const month = `${2024 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
  // Explicit accepted zero tests availability independently of its amount.
  const revenueCents = index === 7 ? 0 : 100010 + index * 1003
  const costCents = 30002 + index * 701 + index % 2
  months.push(month); amounts[month] = { revenue: revenueCents, cost: costCents }
  rows.push(`${month}-15,400,Sales,${decimal(-revenueCents)},Revenue ${month}`)
  rows.push(`${month}-15,500,Sales,${decimal(costCents)},Costs ${month}`)
 }
 const body = historyFile('two-years.csv', rows)
 const imported = await acceptHistory(kit, body)
 return { budget, sales, delivery, revenue, cost, projected, smoothed, amounts, months, body, imported }
}
