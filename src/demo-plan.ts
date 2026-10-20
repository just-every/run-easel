// Tallgrass Software (Kansas City, Missouri; 142 people, USD) on Wed Oct 14, 2026: moved in from Adaptive Planning on
// Oct 1 with its FY2026 budget, January to September actuals closed, the forecast rolled through December 2027, the Q4 reforecast
// saved, Ridgeway Logistics slipping a quarter, and three responses proposed for the March cash floor.
// Every amount enters through the normal commands; the dates are the story's, set by demo.ts per step.
import type { Context } from './easel/context'
import type { Calculation } from './easel/engine'
import { setup } from './easel/setup'
import { plan } from './easel/plan'
import { cycle } from './easel/cycle'
import { reforecasts } from './easel/reforecasts'
import { all, get, type Data } from './easel/types'
import { DEPARTMENTS, HIRES, roster, type Seat } from './demo-people'

/** The story's moments (UTC). Kansas City is UTC−6 in winter and UTC−5 from March to November. */
export const DEMO_TIMES = {
 budget: '2026-10-01T15:00:00.000Z', // Thu Oct 1, 10:00 am CT: the move-in, FY2026 budget brought over from Adaptive Planning
 history: '2026-10-02T19:30:00.000Z', // Fri Oct 2, 2:30 pm CT: January to August actuals in and closed
 september: '2026-10-05T11:00:00.000Z', // Mon Oct 5, 6:00 am CT: September in and closed
 plan2027: '2026-10-05T15:20:00.000Z', // Mon Oct 5, 10:20 am CT: the 2027 hires and spend join the forecast
 pack: '2026-10-09T20:10:00.000Z', // Fri Oct 9, 3:10 pm CT: the September review pack published
 reforecast: '2026-10-08T15:30:00.000Z', // Thu Oct 8, 10:30 am CT
 slip: '2026-10-12T21:47:00.000Z', // Mon Oct 12, 4:47 pm CT
 responses: '2026-10-13T07:06:00.000Z', // Tue Oct 13, 2:06 am CT
 now: '2026-10-14T13:38:00.000Z', // Wed Oct 14, 8:38 am CT
}
export const DEMO_START = '2026-01'
export const DEMO_CLOSED_THROUGH = '2026-09'
export const DEMO_OWNER = 'Rachel Kim'
/** Chosen so the forecast's lowest month, March 2027, closes at $1,910,000.00 after the Ridgeway slip. */
const OPENING_CASH = '5378447.90'

const LINES = [
 ['Subscription revenue', 'revenue', '4000'], ['Enterprise contracts', 'revenue', '4100'], ['Salaries and benefits', 'operating-expense', '6000', 'payroll'],
 ['Software and cloud hosting', 'operating-expense', '6200'], ['Events and paid media', 'operating-expense', '6100'],
 ['Rent and facilities', 'operating-expense', '6300'], ['Travel', 'operating-expense', '6400'],
 ['Professional services', 'operating-expense', '6500'], ['Interest', 'operating-expense', '6900'],
] as const

const MEMBERS = [
 ['Owen Brooks', 'owen@tallgrass.example', 'finance', ''],
 ['Marcus Hale', 'marcus@tallgrass.example', 'contributor', 'Sales'],
 ['Luis Moreno', 'luis@tallgrass.example', 'contributor', 'Sales'],
 ['Hannah Cole', 'hannah@tallgrass.example', 'contributor', 'Marketing'],
 ['Derek Okafor', 'derek@tallgrass.example', 'contributor', 'Customer Success'],
 ['Priya Raman', 'priya@tallgrass.example', 'contributor', 'Engineering'],
 ['Sam Whitaker', 'sam@tallgrass.example', 'contributor', 'Product'],
 ['Tasha Greene', 'tasha@tallgrass.example', 'contributor', 'Support'],
 ['Carla Jensen', 'carla@tallgrass.example', 'contributor', 'People'],
 ['Board of directors', 'board@tallgrass.example', 'viewer', ''],
] as const

const RECURRING = [
 ['Cloud hosting (AWS)', 'Software and cloud hosting', 'Engineering', '96000'],
 ['Business software', 'Software and cloud hosting', 'G&A', '34000'],
 ['Always-on paid media', 'Events and paid media', 'Marketing', '48000'],
 ['Kansas City office', 'Rent and facilities', 'G&A', '82000'],
 ['Customer visits', 'Travel', 'Sales', '26000'],
 ['Audit, legal and tax', 'Professional services', 'G&A', '31000'],
] as const

const ids = (c: Context) => ({
 department: (name: string) => all(c.s, 'department').find(d => d.name === name)!.id as string,
 line: (name: string) => all(c.s, 'line').find(l => l.name === name)!.id as string,
})

const position = (c: Context, scenario: string, seat: Seat) => {
 const id = ids(c)
 return plan(c, 'position', { scenario, title: seat.title, holder: seat.holder, department: id.department(seat.department), line: id.line('Salaries and benefits'), start: seat.start, annualSalary: String(seat.salary), onCostPercent: '25' })
}

/** Thu Oct 1, 2026: the company, its structure and people, and the FY2026 budget, collected and approved. */
export async function demoBudget(c: Context) {
 const set = (op: string, body: Data) => setup(c, op, body)!
 set('workspace', { name: 'Tallgrass Software', currency: 'USD', fiscalYearStart: 1, planStart: DEMO_START, timeZone: 'America/Chicago', locale: 'en-US', dateFormat: 'MM/DD/YYYY' })
 for (const name of DEPARTMENTS) set('department', { name, shared: false })
 for (const [name, type, , payroll] of LINES) set('line', { name, type, payroll: payroll === 'payroll' })
 const id = ids(c)
 for (const [name, email, role, department] of MEMBERS) set('member', { name, email, role, departments: department ? [id.department(department)] : [] })
 for (const [name, , account] of LINES) set('account-map', { account, target: id.line(name) })
 set('account-map', { account: '1000', target: 'cash' })
 for (const name of DEPARTMENTS) set('department-map', { source: name, department: id.department(name) })
 set('department-map', { source: '', department: '' })
 set('cash-constraints', { floor: '2000000', runwayMinimum: '3' })
 const scenario = all(c.s, 'scenario').find(s => s.kind === 'budget')!.id
 await plan(c, 'scenario-cash', { scenario, basis: 'estimate', opening: OPENING_CASH, note: 'Bank balance at Dec 31, 2025 (Commerce Bank operating account)', receivables: '4120000', payables: '310000', collectionLag: 2, paymentLag: 1 })
 for (const seat of roster()) await position(c, scenario, seat)
 await plan(c, 'revenue', { scenario, name: 'Subscriptions', kind: 'customers', line: id.line('Subscription revenue'), department: id.department('Sales'), start: DEMO_START, startCustomers: '1660', newPerMonth: '8', newPerRep: '2.4', repDepartment: id.department('Sales'), rampMonths: 4, churnPercent: '1.2', arpa: '1150', collectionLag: 2 })
 for (const [name, line, department, amount] of RECURRING) await plan(c, 'expense', { scenario, name, line: id.line(line), department: id.department(department), amount, kind: 'recurring', start: DEMO_START })
 await plan(c, 'debt', { scenario, name: 'Credit line', debtKind: 'credit', line: id.line('Interest'), department: id.department('G&A'), start: DEMO_START, maturity: '2028-12', limit: '1000000', rateKind: 'fixed', annualRate: '9.5', draws: {}, repayments: {} })
 const departments = all(c.s, 'department').map(d => d.id as string)
 await cycle(c, 'request-submissions', { scenario, departments, due: '2026-10-01' })
 for (const department of departments) {
  const name = get(c.s, 'department', department).name
  if (name === 'Sales') await cycle(c, 'comment', { scenario, department, text: 'Twenty-two in Sales through 2026; the next AE class waits for the FY2027 plan.' })
  if (name === 'Engineering') await cycle(c, 'comment', { scenario, department, text: 'Hosting includes the reserve for the scheduling engine rewrite.' })
  await cycle(c, 'submit', { scenario, department, note: 'Department plan reviewed with finance.' })
 }
 const approved = (await cycle(c, 'approve-budget', { scenario, revision: get(c.s, 'scenario', scenario).revision, note: 'FY2026 operating budget, approved by the board.' }))!
 await cycle(c, 'forecast-window', { scenario: approved.forecast.id, revision: get(c.s, 'scenario', approved.forecast.id).revision, months: 15 })
 return approved.forecast.id as string
}

/** Mon Oct 5, 2026: with September closed, the 2027 plan joins the forecast, Ridgeway included. */
export async function demoForecast(c: Context, forecast: string) {
 const id = ids(c)
 for (const seat of HIRES) await position(c, forecast, seat)
 await plan(c, 'expense', { scenario: forecast, name: 'Heartland HR Expo', line: id.line('Events and paid media'), department: id.department('Marketing'), amount: '60000', kind: 'one-off', start: '2027-01' })
 await plan(c, 'expense', { scenario: forecast, name: 'Q1 paid search', line: id.line('Events and paid media'), department: id.department('Marketing'), amount: '10000', kind: 'recurring', start: '2026-12', end: '2027-02' })
 await plan(c, 'expense', { scenario: forecast, name: 'Annual software renewals', line: id.line('Software and cloud hosting'), department: id.department('Engineering'), amount: '180000', kind: 'one-off', start: '2027-01' })
 await plan(c, 'expense', { scenario: forecast, name: 'FY2026 annual bonuses', line: id.line('Salaries and benefits'), department: id.department('G&A'), amount: '612000', kind: 'one-off', start: '2027-03' })
 await plan(c, 'revenue', { scenario: forecast, name: 'Ridgeway Logistics (deal 18842, 90% of $310,000)', kind: 'contract', line: id.line('Enterprise contracts'), department: id.department('Sales'), start: '2026-12', startDate: '2026-12-18', contractValue: '279000', termMonths: 12, billingCadence: 'annual', dsoDays: 30 })
}

/** Thu Oct 8: the Q4 reforecast is saved from the forecast, the version the slip is measured against. */
export async function demoReforecast(c: Context, forecast: string) {
 await reforecasts(c, 'reforecast-save', { from: forecast, revision: get(c.s, 'scenario', forecast).revision, name: 'Q4 reforecast' })
}

/** Mon Oct 12, 4:47 pm: Ridgeway's close moves from Fri Dec 18 to Fri Mar 19 on Net 45, so its cash lands in May. */
export async function demoSlip(c: Context, forecast: string) {
 const ridgeway = all(c.s, 'revenue').find(r => r.scenario === forecast && r.kind === 'contract')!
 await plan(c, 'revenue', { ...contractBody(ridgeway), id: ridgeway.id, scenario: forecast, start: '2027-03', startDate: '2027-03-19', dsoDays: 45 })
}

const contractBody = (r: Data) => ({ name: r.name, kind: 'contract', line: r.line, department: r.department, contractValue: (r.contractValueCents / 100).toFixed(2), termMonths: r.termMonths, billingCadence: r.billingCadence })

/** Tue Oct 13, 2:06 am: three responses that bring March back to the floor, each a proposal finance can promote. */
export async function demoResponses(c: Context, forecast: string) {
 const request = 'Bring March 2027 back to the $2,000,000 cash floor after Ridgeway Logistics slipped from December to March.'
 const propose = async (name: string, change: (p: string) => Promise<unknown>, summary: string) => {
  const p = (await plan(c, 'proposal-create', { from: forecast, name, request }))!
  await change(p.id)
  await plan(c, 'proposal-submit', { id: p.id, summary })
 }
 await propose('Option 1 · Draw on the credit line', async p => {
  const line = all(c.s, 'debt').find(d => d.scenario === p)!
  await plan(c, 'debt', { id: line.id, scenario: p, name: line.name, debtKind: line.debtKind, line: line.line, department: line.department, start: line.start, maturity: line.maturity, limit: (line.limitCents / 100).toFixed(2), rateKind: 'fixed', annualRate: '9.5', draws: { '2027-03': '100000' }, repayments: {} })
 }, 'Draw $100,000 on Mon Mar 1, 2027. Interest about $792 a month; debt appears on the board pack.')
 await propose('Option 2 · AE #4–6 start in May', async p => {
  for (const ae of all(c.s, 'position').filter(x => x.scenario === p && /AE #[456]\)/.test(x.title))) {
   await plan(c, 'position', { id: ae.id, scenario: p, title: ae.title, holder: '', department: ae.department, line: ae.line, start: '2027-05', annualSalary: (ae.annualSalaryCents / 100).toFixed(2), onCostPercent: '25' })
  }
 }, 'No debt, pipeline intact.')
 await propose('Option 3 · Cut events and paid media', async p => {
  for (const cut of all(c.s, 'expense').filter(x => x.scenario === p && ['Heartland HR Expo', 'Q1 paid search'].includes(x.name))) await plan(c, 'input-delete', { kind: 'expense', id: cut.id })
 }, 'Skip the Heartland HR Expo and Q1 paid search. Q2 pipeline about $360,000 lower.')
}

/** September's cloud hosting as the ledger has it: AWS, Datadog and Sentry, $420 over the $96,000 plan. */
const SEPTEMBER_HOSTING = [['AWS', '79180.00'], ['Datadog', '16240.00'], ['Sentry', '1000.00']]

/** Actuals from the ledger for `months`: one row per line and department, as QuickBooks Online exports them. */
export function demoActuals(calc: Calculation, months: string[], names: { line: Record<string, string>; department: Record<string, string> }) {
 const accounts = new Map(LINES.map(([name, type, account]) => [name as string, { account, revenue: type === 'revenue' }]))
 const rows: string[] = []
 const row = (month: string, account: string, department: string, amount: number, credit: boolean, text: string) => rows.push([`${month}-28`, account, department, credit ? '' : (amount / 100).toFixed(2), credit ? (amount / 100).toFixed(2) : '', text].join(','))
 for (const month of months) {
  let net = 0
  for (const cell of calc.cells.filter(x => x.month === month && x.amount !== 0)) {
   const lineName = names.line[cell.line], department = names.department[cell.department], line = accounts.get(lineName)!
   if (month === '2026-09' && lineName === 'Software and cloud hosting' && department === 'Engineering') {
    for (const [vendor, dollars] of SEPTEMBER_HOSTING) { const cents = Math.round(Number(dollars) * 100); net -= cents; row(month, line.account, department, cents, false, `${vendor} · ${department}`) }
    continue
   }
   net += line.revenue ? cell.amount : -cell.amount
   row(month, line.account, department, cell.amount, line.revenue, `${lineName} · ${department}`)
  }
  row(month, '1000', '', Math.abs(net), net < 0, 'Net operating cash movement')
 }
 const csv = ['Date,Account,Department,Debit,Credit,Description', ...rows].join('\n')
 return { csv, filename: `tallgrass-quickbooks-gl-${months[0]}-to-${months.at(-1)}.csv`, columns: { date: 'Date', account: 'Account', department: 'Department', debit: 'Debit', credit: 'Credit', description: 'Description' }, amountMode: 'debit-credit', dateFormat: 'YYYY-MM-DD' }
}
