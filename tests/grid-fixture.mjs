import { acceptHistory, historyFile } from './history-fixture.mjs'

export async function gridFixture(command, get, kit) {
 await command('workspace', { name: 'Ridgeline Studio', currency: 'USD', fiscalYearStart: 1, planStart: '2025-01' })
 const department = await command('department', { name: 'Sales and marketing' })
 const other = await command('department', { name: 'Service delivery' })
 const scenario = (await get('state')).scenarios.find(s => s.kind === 'budget').id
 const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)
 const rows = []
 for (const [i, name] of ['Software subscriptions', 'Travel and events', 'Campaigns'].entries()) {
  const line = await command('line', { name, type: 'operating-expense' })
  rows.push(await command('schedule', { scenario, name, department: department.id, line: line.id, values: Object.fromEntries(months.map(m => [m, '0'])) }))
  await command('account-map', { account: String(500 + i), target: line.id })
 }
 const driver = await command('line', { name: 'Sales capacity', type: 'revenue' })
 await command('revenue', { scenario, name: 'Ramped sales', kind: 'volume', department: department.id, line: driver.id, start: months[0], startVolume: '12', rate: '125', growthPercent: '2' })
 await command('department-map', { source: 'Sales', department: department.id })
 await acceptHistory(kit, historyFile('prior-year-spend.csv', rows.flatMap((_, r) => months.map((m, i) => `2024${m.slice(4)}-15,${500 + r},Sales,${i + 1},Prior spend`))))
 await command('member', { email: 'sales@dev.localhost', name: 'Sam Sales', role: 'contributor', departments: [department.id] })
 await command('request-submissions', { scenario, departments: [department.id] })
 return { scenario, department, other, months, rows: rows.sort((a, b) => a.name.localeCompare(b.name)), driver }
}
