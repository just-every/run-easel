// Harbour Analytics follows the existing browser journey and GL fixtures.
// Dates move with the visitor's demo; all amounts enter the normal commands.
import type { Context } from './easel/context'
import { setup } from './easel/setup'
import { plan } from './easel/plan'
import { cycle } from './easel/cycle'
import { addMonths } from './easel/months'
import { all, get, type Data } from './easel/types'

export async function demoPlan(c: Context, start: string) {
 const ids: Record<string, string> = {}
 const set = (op: string, body: Data) => setup(c, op, body)!
 const input = (op: string, body: Data) => plan(c, op, body)
 set('workspace', { name: 'Harbour Analytics', currency: 'AUD', fiscalYearStart: Number(start.slice(5)), planStart: start })
 for (const [name, shared] of [['Sales', false], ['Engineering', false], ['Marketing', false], ['Operations', true]] as const) ids[name] = set('department', { name, shared }).id
 for (const [name, type, payroll] of [
  ['Subscription revenue', 'revenue'], ['Services revenue', 'revenue'], ['Cloud hosting', 'cost-of-sales'],
  ['Salaries', 'operating-expense', true], ['Software', 'operating-expense'], ['Rent', 'operating-expense'],
  ['Advertising', 'operating-expense'], ['Travel', 'operating-expense'],
 ] as const) ids[name] = set('line', { name, type, payroll: !!payroll }).id
 for (const [name, email, role, department] of [
  ['Sam Chen', 'sam@harbour.example', 'contributor', 'Sales'],
  ['Eli Morgan', 'eli@harbour.example', 'contributor', 'Engineering'],
  ['Priya Shah', 'priya@harbour.example', 'contributor', 'Marketing'],
  ['Alex Rivers', 'alex@harbour.example', 'viewer', ''],
 ]) set('member', { name, email, role, departments: department ? [ids[department]] : [] })
 for (const [account, line] of Object.entries({ '200': 'Subscription revenue', '210': 'Services revenue', '310': 'Cloud hosting', '477': 'Salaries', '478': 'Salaries', '461': 'Software', '469': 'Rent', '400': 'Advertising', '493': 'Travel' })) set('account-map', { account, target: ids[line] })
 set('account-map', { account: '090', target: 'cash' })
 for (const name of ['Sales', 'Engineering', 'Marketing', 'Operations']) set('department-map', { source: name, department: ids[name] })
 set('department-map', { source: '', department: '' })
 const budget = all(c.s, 'scenario').find(s => s.kind === 'budget')!
 const scenario = budget.id
 await input('scenario-cash', { scenario, basis: 'estimate', opening: '850000', note: 'Illustrative opening bank balance for this sample company', receivables: '50000', payables: '20000', collectionLag: 1, paymentLag: 1 })
 for (const [title, holder, department, annualSalary, offset] of [
  ['Account executive', 'Sam Chen', 'Sales', '120000', 0], ['Account executive', '', 'Sales', '110000', 2],
  ['Senior engineer', 'Eli Morgan', 'Engineering', '180000', 0], ['Engineer', '', 'Engineering', '150000', 3],
  ['Growth lead', 'Priya Shah', 'Marketing', '130000', 0], ['Finance manager', 'Jordan Ellis', 'Operations', '145000', 0],
 ] as const) await input('position', { scenario, title, holder, department: ids[department], line: ids.Salaries, start: addMonths(start, offset), annualSalary, onCostPercent: '12' })
 await input('revenue', { scenario, name: 'Subscriptions', kind: 'customers', line: ids['Subscription revenue'], department: ids.Sales, start, startCustomers: '80', newPerMonth: '1', newPerRep: '1.5', repDepartment: ids.Sales, rampMonths: 3, churnPercent: '2', arpa: '1200', collectionLag: 1 })
 await input('revenue', { scenario, name: 'Implementation services', kind: 'volume', line: ids['Services revenue'], department: ids.Sales, start, startVolume: '1', growthPercent: '0', rate: '12000', collectionLag: 1 })
 for (const [name, line, department, amount, kind, offset] of [
  ['AWS production', 'Cloud hosting', 'Engineering', '15000', 'recurring', 0],
  ['Engineering tooling', 'Software', 'Engineering', '2400', 'recurring', 0],
  ['Office rent', 'Rent', 'Operations', '9000', 'recurring', 0],
  ['Demand generation', 'Advertising', 'Marketing', '7500', 'recurring', 0],
  ['Conference sponsorship', 'Advertising', 'Marketing', '7500', 'one-off', 2],
  ['Client travel', 'Travel', 'Sales', '1500', 'recurring', 0],
  ['Customer summit', 'Travel', 'Sales', '3000', 'one-off', 4],
 ] as const) await input('expense', { scenario, name, line: ids[line], department: ids[department], amount, kind, start: addMonths(start, offset) })
 await input('allocation', { scenario, name: 'Office by headcount', sourceDepartment: ids.Operations, basis: 'headcount', targets: ['Sales', 'Engineering', 'Marketing'].map(d => ({ department: ids[d] })) })
 await cycle(c, 'request-submissions', { scenario, departments: ['Sales', 'Engineering', 'Marketing', 'Operations'].map(d => ids[d]), due: start + '-01' })
 for (const department of ['Sales', 'Engineering', 'Marketing', 'Operations']) {
  await cycle(c, 'comment', { scenario, department: ids[department], text: department === 'Engineering' ? 'The next engineer joins after the platform launch; hosting includes a capacity reserve.' : 'Reviewed the assumptions with finance. Hiring and spend match the agreed growth plan.' })
  await cycle(c, 'submit', { scenario, department: ids[department], note: 'Department plan reviewed with finance.' })
 }
 const approved = (await cycle(c, 'approve-budget', { scenario, revision: get(c.s, 'scenario', scenario).revision, note: 'Illustrative approved budget for the demo workspace.' }))!
 const downside = (await input('branch', { from: approved.forecast.id, name: 'Downside · slower hiring' }))!
 const engineer = all(c.s, 'position').find(p => p.scenario === downside.id && p.title === 'Engineer')!
 // Commands take the same public input units as the planning forms.
 await input('position', { id: engineer.id, scenario: downside.id, title: engineer.title, holder: '', department: engineer.department, line: engineer.line, start: addMonths(start, 6), annualSalary: '150000', onCostPercent: '12' })
 const proposal = (await input('proposal-create', { from: approved.forecast.id, name: 'Protect runway · defer sales hire', request: 'Move the next account executive two months later while retaining the pipeline targets.' }))!
 const hire = all(c.s, 'position').find(p => p.scenario === proposal.id && p.department === ids.Sales && !p.holder)!
 await input('position', { id: hire.id, scenario: proposal.id, title: hire.title, holder: '', department: hire.department, line: hire.line, start: addMonths(start, 4), annualSalary: '110000', onCostPercent: '12' })
 await input('proposal-submit', { id: proposal.id, summary: 'Ready for finance to compare and approve; no change to the working forecast yet.' })
}

/** Same realistic accounts as fixtures/gl-detail-2026-07.csv, clean for a demo. */
export function demoActuals(start: string) {
 const rows = [
  ['200', 'Sales', '', '96000', 'Monthly subscriptions'], ['210', 'Sales', '', '12000', 'Implementation project'],
  ['310', 'Engineering', '15750', '', 'AWS production usage'], ['477', 'Sales', '11200', '', 'Sales payroll'],
  ['478', 'Engineering', '16800', '', 'Engineering payroll'], ['478', 'Marketing', '12133.33', '', 'Marketing payroll'],
  ['478', 'Operations', '13533.33', '', 'Finance payroll'], ['461', 'Engineering', '2650', '', 'Engineering tooling'],
  ['469', 'Operations', '9000', '', 'Office rent'], ['400', 'Marketing', '6800', '', 'Demand generation'],
  ['493', 'Sales', '1200', '', 'Client visits'],
 ]
 // A balancing cash line makes the source ledger reconcile, as a real GL does.
 const cash = '18933.34'
 const csv = ['Date,Account,Department,Debit,Credit,Description', ...rows.map(r => [start + '-28', ...r].join(',')), [start + '-28', '090', '', cash, '', 'Net operating cash movement'].join(',')].join('\n')
 return { csv, filename: `harbour-gl-${start}.csv`, columns: { date: 'Date', account: 'Account', department: 'Department', debit: 'Debit', credit: 'Credit', description: 'Description' }, amountMode: 'debit-credit', dateFormat: 'YYYY-MM-DD' }
}
