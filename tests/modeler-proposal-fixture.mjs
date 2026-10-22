// A model-edge fixture only: application calculations remain real.
export function modelerProposalFixture(source) {
 const department = source.departments.find(d => d.name === 'Southeast sales').id
 const payroll = source.lines.find(l => l.name === 'Payroll').id, revenue = source.lines.find(l => l.name === 'Southeast revenue').id, support = source.lines.find(l => l.name === 'Support costs').id
 const month = '2026-04', amount = line => source.cells.find(c => c.line === line && c.department === department && c.month === month)?.amount ?? 0
 const decimal = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
 const cell = (line, expected) => ({ target: 'cell', line, department, driver: '', month, expected })
 const driver = (name, expected) => ({ target: 'driver', line: '', department, driver: name, month, expected })
 return {
  name: 'Southeast expansion',
  positions: ['Southeast account executive A', 'Southeast account executive B'].map(title => ({ title, department, line: payroll, start: month, end: '', annualSalary: '120000', onCostPercent: '0' })),
  revenues: [{ sourceOrigin: '', name: 'Southeast contracts', department, line: revenue, start: month, startVolume: '10', rate: '1000', growthPercent: '0', collectionLag: 0 }],
  formulas: [
   { sourceOrigin: '', name: 'Regional capacity', unit: 'count', department, line: '', start: month, end: '', formula: '2' },
   { sourceOrigin: '', name: 'Regional support', unit: 'money', department, line: support, start: month, end: '', formula: 'DRIVER("Regional capacity") * 125.25' },
  ],
  tests: [cell(payroll, decimal(amount(payroll) + 2000000)), cell(revenue, decimal(amount(revenue) + 1000000)), cell(support, decimal(amount(support) + 25050)), driver('Regional capacity', '2'), driver('Regional support', '250.50')],
 }
}
