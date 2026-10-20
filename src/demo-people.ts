// Tallgrass Software's roster for the demo: 142 people across eight departments in Kansas City, and the
// 26 hires of the 2027 plan that take it to 168. Names are invented; salaries are annual USD before the
// 25% on-costs (benefits and employer payroll taxes) the demo enters for every position.

export const DEPARTMENTS = ['Sales', 'Marketing', 'Customer Success', 'Engineering', 'Product', 'Support', 'People', 'G&A'] as const
export type DepartmentName = (typeof DEPARTMENTS)[number]

/** The people named in Easel's story: department heads, the analyst and the account executive. */
const NAMED: Record<DepartmentName, [string, string, number][]> = {
 Sales: [['VP Sales', 'Luis Moreno', 240000], ['Account executive', 'Marcus Hale', 180000]],
 Marketing: [['VP Marketing', 'Hannah Cole', 220000]],
 'Customer Success': [['VP Customer Success', 'Derek Okafor', 205000]],
 Engineering: [['VP Engineering', 'Priya Raman', 260000]],
 Product: [['VP Product', 'Sam Whitaker', 245000]],
 Support: [['Director of Support', 'Tasha Greene', 165000]],
 People: [['VP People', 'Carla Jensen', 190000]],
 'G&A': [['VP Finance', 'Rachel Kim', 235000], ['FP&A analyst', 'Owen Brooks', 115000]],
}

/** Headcount at Wed Oct 14, 2026, and the usual title and salary for everyone else in the department. */
const TEAMS: Record<DepartmentName, { count: number; title: string; salary: number }> = {
 Sales: { count: 22, title: 'Account executive', salary: 150000 },
 Marketing: { count: 12, title: 'Marketing manager', salary: 118000 },
 'Customer Success': { count: 18, title: 'Customer success manager', salary: 102000 },
 Engineering: { count: 46, title: 'Software engineer', salary: 158000 },
 Product: { count: 10, title: 'Product manager', salary: 152000 },
 Support: { count: 16, title: 'Support specialist', salary: 66000 },
 People: { count: 6, title: 'People partner', salary: 96000 },
 'G&A': { count: 12, title: 'Finance and operations', salary: 98000 },
}

const FIRST = ['Avery', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Drew', 'Reese', 'Quinn', 'Parker', 'Rowan', 'Hayden', 'Emerson', 'Logan', 'Cameron', 'Elliot', 'Skyler', 'Dakota', 'Blake', 'Kendall', 'Shawn', 'Robin', 'Jesse']
const LAST = ['Anderson', 'Bishop', 'Carter', 'Dalton', 'Ellis', 'Foster', 'Grant', 'Holloway', 'Iverson', 'Jacobs', 'Keller', 'Lawson', 'Mercer', 'Nolan', 'Ortiz', 'Pruitt', 'Ramsey', 'Sutton', 'Tate', 'Underwood', 'Vance', 'Whitfield', 'Yates', 'Zimmer']

export type Seat = { title: string; holder: string; department: DepartmentName; salary: number; start: string }

/** Everyone on payroll when the plan starts (Jan 2026), 142 seats, each with a person. */
export function roster(): Seat[] {
 const seats: Seat[] = []
 let n = 0
 for (const department of DEPARTMENTS) {
  const named = NAMED[department], team = TEAMS[department]
  for (const [title, holder, salary] of named) seats.push({ title, holder, department, salary, start: '2026-01' })
  for (let i = named.length; i < team.count; i++, n++) {
   // Small, deterministic steps around the department's usual salary.
   seats.push({ title: team.title, holder: `${FIRST[n % FIRST.length]} ${LAST[(n * 7 + 3) % LAST.length]}`, department, salary: team.salary + ((n % 5) - 2) * 4000, start: '2026-01' })
  }
 }
 return seats
}

/** The 2027 plan's 26 hires (142 → 168). AE #4–6 start in February; Option 2 moves them to May. */
export const HIRES: Seat[] = [
 ...[4, 5, 6].map(k => ({ title: `Account executive (AE #${k})`, holder: '', department: 'Sales' as const, salary: 180000, start: '2027-02' })),
 ...[7, 8].map(k => ({ title: `Account executive (AE #${k})`, holder: '', department: 'Sales' as const, salary: 180000, start: '2027-06' })),
 ...[1, 2, 3].map(k => ({ title: `Sales development rep ${k}`, holder: '', department: 'Sales' as const, salary: 80000, start: '2027-07' })),
 ...[1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ title: `Software engineer ${k}`, holder: '', department: 'Engineering' as const, salary: 158000, start: k <= 4 ? '2027-06' : '2027-08' })),
 ...[1, 2, 3].map(k => ({ title: `Customer success manager ${k}`, holder: '', department: 'Customer Success' as const, salary: 102000, start: '2027-05' })),
 ...[1, 2, 3].map(k => ({ title: `Support specialist ${k}`, holder: '', department: 'Support' as const, salary: 66000, start: '2027-06' })),
 { title: 'Product designer', holder: '', department: 'Product', salary: 140000, start: '2027-05' },
 { title: 'Product manager', holder: '', department: 'Product', salary: 152000, start: '2027-09' },
 { title: 'Demand generation manager', holder: '', department: 'Marketing', salary: 118000, start: '2027-06' },
 { title: 'Revenue accountant', holder: '', department: 'G&A', salary: 105000, start: '2027-07' },
]
