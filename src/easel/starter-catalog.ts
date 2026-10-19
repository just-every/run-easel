// Real editable planning assumptions, never imported actuals. This catalog is
// data only so setup can show the same assumptions the command installs.
export const STARTER_IDS = ['saas', 'services', 'project', 'wholesale'] as const
export type StarterId = typeof STARTER_IDS[number]
type Input = { key?: string; op: 'revenue' | 'position' | 'expense'; values: Record<string, unknown> }
type Starter = {
 name: string; description: string; assumptions: string; cashTiming: string; openingCash: string
 collectionLag: number; paymentLag: number
 departments: Record<string, string>
 lines: Record<string, { name: string; type: 'revenue' | 'cost-of-sales' | 'operating-expense'; payroll?: boolean }>
 inputs: Input[]
 metrics: ('revenue' | 'grossMargin' | 'headcount' | 'arr' | 'burn' | 'runway' | 'closingCash')[]
}

export const STARTERS: Record<StarterId, Starter> = {
 saas: {
  name: 'SaaS', description: 'Subscription ARR, customer churn, acquisition cost and a separate seat-based product.',
  assumptions: '100 subscription customers, 10 new customers/month, 2% monthly churn, $200 monthly revenue/customer and $500 CAC. A separate seat product starts at 200 seats × $25/month, expanding 1%/month. Three positions; hosting $2,500/month; overhead $4,000/month.',
  cashTiming: 'Revenue collected in the month earned; non-payroll costs paid one month later; payroll paid in its month. Opening receivables and payables are zero.',
  openingCash: '250000', collectionLag: 0, paymentLag: 1,
  departments: { sales: 'Sales and marketing', engineering: 'Engineering', operations: 'Operations' },
  lines: { subscriptions: { name: 'Subscriptions', type: 'revenue' }, seats: { name: 'Seat subscriptions', type: 'revenue' }, hosting: { name: 'Hosting', type: 'cost-of-sales' }, payroll: { name: 'Payroll', type: 'operating-expense', payroll: true }, acquisition: { name: 'Customer acquisition', type: 'operating-expense' }, overhead: { name: 'Overhead', type: 'operating-expense' } },
  inputs: [
   { key: 'subscriptions', op: 'revenue', values: { name: 'Starter assumption · subscription customers', line: 'subscriptions', department: 'sales', kind: 'customers', startCustomers: '100', newPerMonth: '10', churnPercent: '2', arpa: '200' } },
   { op: 'revenue', values: { name: 'Starter assumption · separate seat product', line: 'seats', department: 'sales', kind: 'seats', startSeats: '200', expansionPercent: '1', price: '25' } },
   { op: 'expense', values: { name: 'Starter assumption · customer acquisition', line: 'acquisition', department: 'sales', kind: 'acquisition', revenueOrigin: 'subscriptions', cac: '500' } },
   { op: 'position', values: { title: 'Starter assumption · engineer', line: 'payroll', department: 'engineering', annualSalary: '120000', onCostPercent: '18' } },
   { op: 'position', values: { title: 'Starter assumption · product engineer', line: 'payroll', department: 'engineering', annualSalary: '100000', onCostPercent: '18' } },
   { op: 'position', values: { title: 'Starter assumption · account executive', line: 'payroll', department: 'sales', annualSalary: '90000', onCostPercent: '18' } },
   { op: 'expense', values: { name: 'Starter assumption · hosting', line: 'hosting', department: 'engineering', kind: 'recurring', amount: '2500' } },
   { op: 'expense', values: { name: 'Starter assumption · overhead', line: 'overhead', department: 'operations', kind: 'recurring', amount: '4000' } },
  ], metrics: ['revenue', 'arr', 'headcount', 'burn', 'runway', 'closingCash'],
 },
 services: {
  name: 'Professional services', description: 'Billable headcount × monthly available hours × utilization × hourly rate.',
  assumptions: 'Three billable consultants at $95,000 annual salary plus 18% on-costs; 160 available hours/person/month, 75% utilization and $150/hour. One operations position at $72,000 plus 18% on-costs; overhead $3,000/month. Operations headcount does not generate billable revenue.',
  cashTiming: 'Revenue collected one month after earned; non-payroll costs paid one month later; payroll paid in its month. Opening receivables and payables are zero.',
  openingCash: '150000', collectionLag: 1, paymentLag: 1,
  departments: { billable: 'Billable delivery', operations: 'Operations' },
  lines: { fees: { name: 'Professional fees', type: 'revenue' }, delivery: { name: 'Billable payroll', type: 'cost-of-sales', payroll: true }, payroll: { name: 'Operations payroll', type: 'operating-expense', payroll: true }, overhead: { name: 'Overhead', type: 'operating-expense' } },
  inputs: [
   ...['Consultant 1', 'Consultant 2', 'Consultant 3'].map(title => ({ op: 'position' as const, values: { title: `Starter assumption · ${title}`, line: 'delivery', department: 'billable', annualSalary: '95000', onCostPercent: '18' } })),
   { op: 'revenue', values: { name: 'Starter assumption · billable delivery', line: 'fees', department: 'billable', kind: 'services', monthlyHours: '160', utilizationPercent: '75', hourlyRate: '150' } },
   { op: 'position', values: { title: 'Starter assumption · operations manager', line: 'payroll', department: 'operations', annualSalary: '72000', onCostPercent: '18' } },
   { op: 'expense', values: { name: 'Starter assumption · overhead', line: 'overhead', department: 'operations', kind: 'recurring', amount: '3000' } },
  ], metrics: ['revenue', 'grossMargin', 'headcount', 'burn', 'runway', 'closingCash'],
 },
 project: {
  name: 'Project or backlog', description: 'Named milestone projects plus a separate recurring backlog of work.',
  assumptions: 'Milestones recognize $20,000 in January, $40,000 in April, $40,000 in July and $50,000 in October. Separate backlog opens at $240,000, adds $15,000/month and recognizes 20%/month. Two delivery positions at $90,000 plus 18% on-costs; subcontractors $8,000/month and overhead $2,500/month.',
  cashTiming: 'Milestone and backlog revenue collected one month after recognition; non-payroll costs paid one month later; payroll paid in its month. Opening receivables and payables are zero.',
  openingCash: '300000', collectionLag: 1, paymentLag: 1,
  departments: { delivery: 'Project delivery', operations: 'Operations' },
  lines: { milestones: { name: 'Project milestones', type: 'revenue' }, backlog: { name: 'Backlog delivery', type: 'revenue' }, payroll: { name: 'Delivery payroll', type: 'cost-of-sales', payroll: true }, subcontractors: { name: 'Subcontractors', type: 'cost-of-sales' }, overhead: { name: 'Overhead', type: 'operating-expense' } },
  inputs: [
   { op: 'revenue', values: { name: 'Starter assumption · milestone projects', line: 'milestones', department: 'delivery', kind: 'milestones', milestones: [{ name: 'Kickoff', offset: 0, amount: '20000' }, { name: 'Design approved', offset: 3, amount: '40000' }, { name: 'Delivery', offset: 6, amount: '40000' }, { name: 'Acceptance', offset: 9, amount: '50000' }] } },
   { op: 'revenue', values: { name: 'Starter assumption · separate backlog', line: 'backlog', department: 'delivery', kind: 'backlog', openingBacklog: '240000', monthlyAdditions: '15000', burnPercent: '20' } },
   ...['Project lead', 'Delivery specialist'].map(title => ({ op: 'position' as const, values: { title: `Starter assumption · ${title}`, line: 'payroll', department: 'delivery', annualSalary: '90000', onCostPercent: '18' } })),
   { op: 'expense', values: { name: 'Starter assumption · subcontractors', line: 'subcontractors', department: 'delivery', kind: 'recurring', amount: '8000' } },
   { op: 'expense', values: { name: 'Starter assumption · overhead', line: 'overhead', department: 'operations', kind: 'recurring', amount: '2500' } },
  ], metrics: ['revenue', 'grossMargin', 'headcount', 'burn', 'runway', 'closingCash'],
 },
 wholesale: {
  name: 'Wholesale or ecommerce', description: 'Units × selling price, linked unit costs and inventory days that change cash timing.',
  assumptions: '1,000 units/month growing 2%/month at $80/unit; linked COGS of $45/unit and 45 inventory days. One operations position at $60,000 plus 18% on-costs; fulfillment $4,000/month and overhead $2,000/month.',
  cashTiming: 'Sales collected one month after earned. Inventory starts at zero; purchases cover COGS plus the change to a closing inventory buffer of monthly COGS × 45 ÷ calendar days, rounded to cents. Purchases and other non-payroll costs paid one month later; payroll paid in its month. Opening receivables and payables are zero.',
  openingCash: '250000', collectionLag: 1, paymentLag: 1,
  departments: { sales: 'Wholesale sales', operations: 'Operations' },
  lines: { sales: { name: 'Product sales', type: 'revenue' }, goods: { name: 'Cost of goods sold', type: 'cost-of-sales' }, fulfillment: { name: 'Fulfillment', type: 'cost-of-sales' }, payroll: { name: 'Operations payroll', type: 'operating-expense', payroll: true }, overhead: { name: 'Overhead', type: 'operating-expense' } },
  inputs: [
   { key: 'units', op: 'revenue', values: { name: 'Starter assumption · product units and price', line: 'sales', department: 'sales', kind: 'volume', startVolume: '1000', growthPercent: '2', rate: '80' } },
   { op: 'expense', values: { name: 'Starter assumption · unit COGS and inventory days', line: 'goods', department: 'sales', kind: 'inventory', revenueOrigin: 'units', unitCost: '45', inventoryDays: 45 } },
   { op: 'position', values: { title: 'Starter assumption · operations manager', line: 'payroll', department: 'operations', annualSalary: '60000', onCostPercent: '18' } },
   { op: 'expense', values: { name: 'Starter assumption · fulfillment', line: 'fulfillment', department: 'operations', kind: 'recurring', amount: '4000' } },
   { op: 'expense', values: { name: 'Starter assumption · overhead', line: 'overhead', department: 'operations', kind: 'recurring', amount: '2000' } },
  ], metrics: ['revenue', 'grossMargin', 'headcount', 'burn', 'runway', 'closingCash'],
 },
}
