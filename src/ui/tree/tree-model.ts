// The cash driver tree, computed from /api/easel/drivers views: the forecast's lowest open month at the root, the
// cash that moves it from the last closed month split into collections, payroll, spend and financing, and the leaves
// under each (inputs, departments or lines). Every node is a sum of the engine's tagged cash, so the leaves add up to
// their driver and the drivers add up to the root. Changes are measured against a baseline (the last saved
// reforecast, else the approved budget) and against each proposed option.
import type { D } from '../shared'
import { addMonths, monthLabel } from '../shared'

export const DRIVERS = ['collections', 'payroll', 'spend', 'financing'] as const
export type DriverKind = (typeof DRIVERS)[number]
export const driverLabel: Record<DriverKind, string> = { collections: 'Collections', payroll: 'Payroll', spend: 'Spend', financing: 'Financing' }
/** How many leaves a driver shows before the rest join one "other" leaf, so every driver still adds up. Spend shows the
 * line a plan moves first, the rest as one leaf, so the whole tree and its decision fit one desktop screen. */
const SHOWN: Record<DriverKind, number> = { collections: 3, payroll: 2, spend: 1, financing: 2 }

export type View = D
export type Leaf = {
 key: string; driver: DriverKind; label: string; detail: string; value: number
 base: number | null; option: number | null
 /** Inputs behind the leaf (forecast ids), for the change text and the activity trail. */
 inputs: D[]; department?: string; other?: number
 /** Options other than the selected one that change this leaf: the alternatives. */
 alternatives: string[]
}
export type DriverNode = { driver: DriverKind; value: number; base: number | null; option: number | null; leaves: Leaf[] }
export type Tree = {
 month: string; from: string; start: number; startMonth: string | null
 value: number; base: number | null; option: number | null
 floor: number | null; drivers: DriverNode[]; exception: Leaf | null
}

const rowKey = (row: D, inputs: Map<string, D>) => {
 if (row.driver === 'payroll') return `dept:${row.department}`
 if (row.driver === 'spend') return row.line ? `line:${row.line}` : `label:${row.label}`
 if (row.source && inputs.has(row.source)) return `input:${row.source}`
 if (row.label === 'Actuals') return `actuals:${row.line}|${row.department}`
 return row.line ? `line:${row.line}|${row.department}` : `label:${row.label}`
}

/** Sum each leaf's cash over [from, to] in one view. */
function sums(view: View | null, from: string, to: string) {
 const out = new Map<string, { driver: DriverKind; amount: number; row: D }>()
 if (!view?.drivers) return out
 const inputs = new Map<string, D>(view.inputs.map((i: D) => [i.origin, i]))
 for (const row of view.drivers) {
  if (row.month < from || row.month > to) continue
  const key = `${row.driver}|${rowKey(row, inputs)}`
  const prior = out.get(key)
  out.set(key, { driver: row.driver, amount: (prior?.amount ?? 0) + row.amount, row: prior?.row ?? row })
 }
 return out
}

/** A month that never breaks across lines inside a leaf: "Dec 2027". */
const monthText = (m: string) => monthLabel(m).replace(' ', '\u00a0')

export const closingAt = (view: View | null, month: string) => view?.cash.find((m: D) => m.month === month)?.closing ?? null

/** The lowest closing cash among the open (not yet closed) months; the whole plan if every month is closed. */
export function lowestOpenMonth(view: View) {
 const open = view.cash.filter((m: D) => !view.actualsThrough || m.month > view.actualsThrough)
 const list = open.length ? open : view.cash
 return list.reduce((low: D | null, m: D) => !low || m.closing < low.closing ? m : low, null)?.month as string | undefined
}

export function headcountAt(view: View, department: string | null, month: string) {
 const by = view.headcount as Record<string, Record<string, number>>
 return Object.entries(by).filter(([d]) => !department || d === department).reduce((n, [, months]) => n + (months[month] ?? 0), 0)
}

export function buildTree(home: View, baseline: View | null, option: View | null, others: View[], money: (n: number) => string): Tree | null {
 const month = lowestOpenMonth(home)
 if (!month || !home.drivers) return null
 const from = home.actualsThrough && home.actualsThrough < month ? addMonths(home.actualsThrough, 1) : home.months[0]
 const startMonth = from === home.months[0] ? null : addMonths(from, -1)
 const start = startMonth ? closingAt(home, startMonth)! : home.opening
 // A view saved before Easel tagged its cash (an older snapshot) has no drivers: it shows no change rather than a false one.
 const f = sums(home, from, month), b = baseline?.drivers ? sums(baseline, from, month) : null, o = option?.drivers ? sums(option, from, month) : null
 const alt = others.filter(v => v.drivers).map(v => ({ name: v.scenario.name as string, sums: sums(v, from, month) }))
 const inputs = new Map<string, D>(home.inputs.map((i: D) => [i.origin, i]))
 const lines = new Map<string, D>(home.lines.map((l: D) => [l.id, l]))
 const departments = new Map<string, string>(home.departments.map((d: D) => [d.id, d.name]))
 const keys = new Set([...f.keys(), ...(b?.keys() ?? []), ...(o?.keys() ?? []), ...alt.flatMap(a => [...a.sums.keys()])])
 // Every debt facility is a financing leaf, drawn or not: it is where a draw would land.
 for (const debt of home.inputs.filter((i: D) => i.kind === 'debt')) keys.add(`financing|input:${debt.origin}`)
 const end = home.months.at(-1)!
 const leaves: Leaf[] = [...keys].map(key => {
  const [driver, ...rest] = key.split('|') as [DriverKind, ...string[]]
  const id = rest.join('|'), sample = (f.get(key) ?? b?.get(key) ?? o?.get(key))?.row
  const amount = (m: Map<string, { amount: number }> | null) => m ? m.get(key)?.amount ?? 0 : null
  const value = amount(f)!
  let label = sample?.label ?? '', detail = '', department: string | undefined
  let behind: D[] = []
  if (id.startsWith('dept:')) {
   department = id.slice(5)
   label = departments.get(department) ?? 'Payroll'
   detail = `${headcountAt(home, department, from)}\u00a0→\u00a0${headcountAt(home, department, end)} by\u00a0${monthText(end)}`
   behind = home.inputs.filter((i: D) => i.kind === 'position' && i.department === department)
  } else if (id.startsWith('line:') && driver === 'spend') {
   const line = id.slice(5)
   label = lines.get(line)?.name ?? label
   behind = home.inputs.filter((i: D) => i.kind === 'expense' && i.line === line)
  } else if (id.startsWith('input:')) {
   const input = inputs.get(id.slice(6))
   if (input) { label = input.name; behind = [input]; detail = inputDetail(input, home, option, money) }
  } else if (id.startsWith('actuals:')) {
   const [line, dept] = id.slice(8).split('|')
   label = `${lines.get(line)?.name ?? 'Actuals'}${departments.get(dept) ? ` · ${departments.get(dept)}` : ''}`
   detail = 'from closed months'
  } else if (id.startsWith('line:')) {
   const [line, dept] = id.slice(5).split('|')
   label = `${lines.get(line)?.name ?? 'Line'}${departments.get(dept) ? ` · ${departments.get(dept)}` : ''}`
  }
  const alternatives = alt.filter(a => (a.sums.get(key)?.amount ?? 0) !== value).map(a => a.name)
  return { key, driver, label, detail, value, base: amount(b), option: amount(o), inputs: behind, department, alternatives }
 })
 const drivers: DriverNode[] = DRIVERS.map(driver => {
  const all = leaves.filter(l => l.driver === driver)
  const moved = (l: Leaf) => (l.option !== null && l.option !== l.value) || (l.base !== null && l.base !== l.value) || l.alternatives.length > 0
  const ranked = [...all].sort((p, q) => Number(moved(q)) - Number(moved(p)) || Math.abs(q.value) - Math.abs(p.value))
  let shown = ranked.slice(0, SHOWN[driver])
  const rest = ranked.slice(SHOWN[driver])
  if (driver === 'payroll') {
   // Departments a plan moves stand alone; the rest are the company's headcount.
   const changed = ranked.filter(moved).slice(0, SHOWN.payroll)
   const others = ranked.filter(l => !changed.includes(l))
   shown = changed
   if (others.length) shown = [{ ...merge(others, 'payroll', 'Headcount'), detail: `${headcountAt(home, null, from)}\u00a0→\u00a0${headcountAt(home, null, end)} by\u00a0${monthText(end)}` }, ...changed]
  } else if (rest.length) shown = [...shown, merge(rest, driver, `${rest.length} other ${driver === 'spend' ? (rest.length === 1 ? 'line' : 'lines') : (rest.length === 1 ? 'source' : 'sources')}`)]
  const sum = (pick: (l: Leaf) => number | null) => all.some(l => pick(l) === null) ? null : all.reduce((n, l) => n + pick(l)!, 0)
  return { driver, value: sum(l => l.value)!, base: b ? sum(l => l.base) : null, option: o ? sum(l => l.option) : null, leaves: shown }
 })
 const floor = home.health.agreementStatus === 'applied' ? home.health.agreement.floorCents as number : null
 const all = drivers.flatMap(d => d.leaves)
 const exception = b ? all.filter(l => l.base !== null && l.value - l.base < 0 && !l.other).sort((p, q) => (p.value - p.base!) - (q.value - q.base!))[0] ?? null : null
 return { month, from, start, startMonth, value: closingAt(home, month)!, base: closingAt(baseline, month), option: closingAt(option, month), floor, drivers, exception }
}

function merge(list: Leaf[], driver: DriverKind, label: string): Leaf {
 const sum = (pick: (l: Leaf) => number | null) => list.some(l => pick(l) === null) ? null : list.reduce((n, l) => n + pick(l)!, 0)
 return { key: `${driver}|merged`, driver, label, detail: list.length > 2 ? `${list[0].label} and ${list.length - 1} more` : list.map(l => l.label).join(' and '), value: sum(l => l.value)!, base: sum(l => l.base), option: sum(l => l.option), inputs: list.flatMap(l => l.inputs), alternatives: [...new Set(list.flatMap(l => l.alternatives))], other: list.length }
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? (bps % 10 ? 2 : 1) : 0)}%`

function inputDetail(input: D, home: View, option: View | null, money: (n: number) => string) {
 if (input.kind === 'revenue' && input.startDate) return `${money(input.contractValueCents)} · starts ${dateText(input.startDate)} · Net ${input.dsoDays}`
 if (input.kind === 'revenue' && input.arpaCents !== undefined) return `churn ${pct(input.churnBps)}/mo · ${money(input.arpaCents)} a customer`
 if (input.kind === 'revenue' && input.rateCents !== undefined) return `${money(input.rateCents)} a unit`
 if (input.kind === 'debt') {
  const drawn = (view: View | null) => Object.values(view?.inputs.find((i: D) => i.origin === input.origin)?.drawsCents ?? {}).reduce((n: number, v: any) => n + Number(v), 0) + (input.openingCents ?? 0)
  return `${money(option ? drawn(option) : drawn(home))} of ${money(input.limitCents)} · ${pct(input.annualRateBps ?? 0)}`
 }
 return ''
}

/** What changed between two versions of the same inputs, in words: "start Feb 2027 → May 2027", "removed". */
export function changeText(before: D[], after: D[]) {
 const byOrigin = new Map(after.map(i => [i.origin, i]))
 const parts: string[] = []
 const moved = new Map<string, string[]>()
 for (const old of before) {
  const now = byOrigin.get(old.origin)
  if (!now) { parts.push(`${old.name} removed`); continue }
  const fields: string[] = []
  if (old.startDate && now.startDate && old.startDate !== now.startDate) fields.push(`Starts ${dateText(old.startDate)} → ${dateText(now.startDate)}`)
  else if (old.start !== now.start) fields.push(`Start ${monthText(old.start)} →\u00a0${monthText(now.start)}`)
  if (old.dsoDays !== now.dsoDays) fields.push(`Net ${old.dsoDays} → Net ${now.dsoDays}`)
  if (old.amountCents !== now.amountCents) fields.push(`amount changed`)
  if (JSON.stringify(old.drawsCents ?? {}) !== JSON.stringify(now.drawsCents ?? {})) fields.push(Object.entries(now.drawsCents ?? {}).map(([m, v]) => `draw ${monthLabel(m)}`).join(', ') || 'draws removed')
  if (!fields.length) continue
  const text = fields.join(' · ')
  moved.set(text, [...(moved.get(text) ?? []), old.name])
 }
 for (const now of after) if (!before.some(b => b.origin === now.origin)) parts.push(`${now.name} added`)
 for (const [text, names] of moved) parts.unshift(names.length > 1 ? `${names.length} ${before[0]?.kind === 'position' ? 'positions' : 'inputs'}: ${text}` : `${names[0]}: ${text}`)
 return parts.join('; ')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** A calendar date as "Fri Dec 18" (the year only when it is not the year of `now`). */
export function dateText(iso: string, now = new Date()) {
 const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
 return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${d.getUTCFullYear() !== now.getUTCFullYear() ? `, ${d.getUTCFullYear()}` : ''}`
}
/** An instant in the company's time zone as "Tue Oct 13, 2:06 am". */
export function momentText(at: string, timeZone: string, dateFormat?: string) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(at)).map(p => [p.type, p.value]))
 const date = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)).map(p => [p.type, p.value]))
 const day = dateFormat === 'DD/MM/YYYY' ? `${date.day}/${date.month}/${date.year}` : dateFormat === 'YYYY-MM-DD' ? `${date.year}-${date.month}-${date.day}` : dateFormat ? `${date.month}/${date.day}/${date.year}` : `${parts.weekday} ${parts.month} ${parts.day}`
 return { day, time: `${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}` }
}
/** The company's time zone abbreviation for an instant, e.g. "CT" for America/Chicago. */
export function zoneText(timeZone: string) {
 const names: Record<string, string> = { 'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Phoenix': 'MST', 'America/Los_Angeles': 'PT', 'America/Anchorage': 'AKT', 'Pacific/Honolulu': 'HT' }
 return names[timeZone] ?? timeZone
}
