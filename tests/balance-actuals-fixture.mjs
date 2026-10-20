export const balanceSource = {
 filename: 'harbour-ledger.csv', dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive',
 columns: { date: 'Date', account: 'Account', accountType: 'Type', amount: 'Amount', description: 'Description' },
 csv: 'Date,Account,Type,Amount,Description\n' + [
  ['2025-12-31', '1000', 'Bank', '100000', 'Opening bank'],
  ['2025-12-31', '1100', 'Receivable', '12000', 'Opening trade receivables'],
  ['2025-12-31', '1200', 'Prepaid', '2400', 'Opening insurance prepaid'],
  ['2025-12-31', 'FA-01', 'Fixed asset', '18000', 'Opening equipment net book value'],
  ['2025-12-31', '2000', 'Payable', '-8000', 'Opening trade payables'],
  ['2025-12-31', '2100', 'Accrual', '-3000', 'Opening earned payroll'],
  ['2025-12-31', '2200', 'Deferred', '-6000', 'Opening deferred service revenue'],
  ['2025-12-31', '2300', 'Debt', '-20000', 'Opening loan principal'],
  ['2025-12-31', '3000', 'Equity', '-95400', 'Opening equity'],
  ['2026-01-15', '1101', 'Receivable', '10000', 'January invoice'],
  ['2026-01-15', '4000', 'Income', '-10000', 'January services'],
  ['2026-01-20', '5000', 'Expense', '4000', 'January software'],
  ['2026-01-20', '1000', 'Bank', '-4000', 'Software payment'],
 ].map(r => r.join(',')).join('\n') + '\n',
}
export const balanceMappings = [
 ['1000', 'cash'], ['2000', 'bs:payables'], ['2100', 'bs:accrued-liabilities'],
 ['2200', 'bs:deferred-revenue'], ['2300', 'bs:debt'], ['3000', 'bs:equity'],
]
export async function seedBalanceActuals(command) {
 await command('workspace', { name: 'Harbour Services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const revenue = await command('line', { name: 'Services revenue', type: 'revenue' })
 const expense = await command('line', { name: 'Software', type: 'operating-expense' })
 await command('department-map', { source: '', department: '' })
 for (const [account, target] of [...balanceMappings, ['4000', revenue.id], ['5000', expense.id]]) await command('account-map', { account, target })
 const receivables = await command('account-rule', { match: 'range', from: '1100', to: '1199', target: 'bs:receivables' })
 await command('account-rule', { match: 'type', from: 'Prepaid', target: 'bs:prepaid' })
 await command('account-rule', { match: 'prefix', from: 'FA-', target: 'bs:fixed-assets' })
 return { revenue, expense, receivables }
}
