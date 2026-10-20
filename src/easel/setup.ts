// Installation-level commands: the planning calendar, departments, planning
// lines, people and their roles, and how source accounts map to lines.
import { accountRules } from './account-rules'
import { requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { cents, hundredths } from './units'
import { fiscalYearLabel, month } from './months'
import { departments, usesDepartment, usesLine, workspace } from './model'
import { all, choice, find, get, integer, put, remove, requireThat, text, uid, type Data } from './types'

export const LINE_TYPES = ['revenue', 'cost-of-sales', 'operating-expense'] as const

export function setup(c: Context, op: string, b: Data): Data | undefined {
 const rules = accountRules(c, op, b)
 if (rules) return rules
 const { s, x } = c
 if (op === 'cash-constraints') {
  requireFinance(x)
  const w = workspace(s)
  const cashAgreement = { floorCents: cents(b.floor, 'Agreed cash floor'), runwayMinimumHundredths: hundredths(b.runwayMinimum, 'Minimum runway'), currency: w.currency, by: x.actor.email, at: c.now }
  put(s, 'workspace', 'main', { ...w, cashAgreement })
  c.activity.push({ action: op, record: 'main', detail: { cashAgreement } })
  return cashAgreement
 }
 if (op === 'workspace') {
  requireFinance(x)
  const existing = find(s, 'workspace', 'main')
  const currency = text(b.currency ?? existing?.currency ?? 'USD', 'Currency').toUpperCase()
  requireThat(/^[A-Z]{3}$/.test(currency), 'Use a three-letter currency code such as AUD')
  const fiscalYearStart = integer(b.fiscalYearStart ?? existing?.fiscalYearStart ?? 1, 'Fiscal year start month', 1, 12)
  const timeZone = text(b.timeZone ?? existing?.timeZone ?? 'America/New_York', 'Company time zone')
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format() } catch { requireThat(false, 'Choose a valid IANA time zone') }
  const locale = choice(b.locale ?? existing?.locale ?? 'en-US', ['en-US', 'en-GB', 'en-AU'] as const, 'English locale')
  const dateFormat = choice(b.dateFormat ?? existing?.dateFormat ?? 'MM/DD/YYYY', ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const, 'date display')
  const planStart = month(b.planStart, 'First plan month')
  requireThat(Number(planStart.slice(5, 7)) === fiscalYearStart, 'The first plan month must be the first month of a fiscal year')
  requireThat(!existing || existing.planStart === planStart || !all(s, 'scenario').length, 'The plan year is fixed once scenarios exist', 409)
  put(s, 'workspace', 'main', { name: text(b.name, 'Company name'), currency, fiscalYearStart, planStart, horizon: 12, timeZone, locale, dateFormat, ...(existing?.cashAgreement ? { cashAgreement: existing.cashAgreement } : {}) })
  if (!all(s, 'scenario').some(sc => sc.kind === 'budget')) {
   const id = uid()
   put(s, 'scenario', id, { name: `${fiscalYearLabel(planStart)} budget`, kind: 'budget', status: 'working', revision: 1, createdBy: x.actor.email, createdAt: c.now, actualsThrough: null, cash: { openingCents: 0, basis: 'estimate', note: '', receivablesCents: 0, payablesCents: 0, collectionLag: 1, paymentLag: 1 } })
   c.activity.push({ action: 'scenario-created', record: id, scenario: id, after: 1, detail: { kind: 'budget' } })
  }
  c.activity.push({ action: 'workspace', record: 'main', detail: { currency, fiscalYearStart, planStart } })
  return get(s, 'workspace', 'main')
 }
 if (op === 'department') {
  requireFinance(x)
  const id = b.id ?? uid()
  if (b.id) get(s, 'department', id)
  const name = text(b.name, 'Department name')
  requireThat(!departments(s).some(d => d.id !== id && d.name.toLowerCase() === name.toLowerCase()), 'A department with this name exists')
  put(s, 'department', id, { name, shared: b.shared === true || b.shared === 'on' || b.shared === 'true' })
  c.activity.push({ action: op, record: id, detail: { name } })
  return get(s, 'department', id)
 }
 if (op === 'department-delete') {
  requireFinance(x)
  const d = get(s, 'department', b.id)
  requireThat(!usesDepartment(s, d.id), 'This department is used by plans, mappings or people; move those first', 409)
  remove(s, 'department', d.id)
  c.activity.push({ action: op, record: d.id, detail: { name: d.name } })
  return { removed: d.id }
 }
 if (op === 'line') {
  requireFinance(x)
  const id = b.id ?? uid()
  const prior = b.id ? get(s, 'line', id) : undefined
  const type = choice(b.type, LINE_TYPES, 'a line type')
  requireThat(!prior || prior.type === type || !usesLine(s, id), 'This line is in use; its type cannot change', 409)
  const checked = (v: unknown) => v === true || v === 'on' || v === 'true'
  requireThat(!all(s,'tax-policy').some(p=>p.line===id) || (type==='operating-expense'&&!checked(b.nonCash)&&!checked(b.payroll)), 'A tax-policy line in use must remain a cash, non-payroll operating expense line',409)
  const name = text(b.name, 'Line name')
  requireThat(!all(s, 'line').some(l => l.id !== id && l.name.toLowerCase() === name.toLowerCase()), 'A line with this name exists')
  if (prior?.payroll && !checked(b.payroll)) requirePayDetail(x)
  requireThat(!(checked(b.nonCash) && checked(b.payroll)), 'A payroll line cannot be non-cash')
  requireThat(!all(s, 'debt').some(debt => debt.line === id) || (type !== 'revenue' && !checked(b.nonCash) && !checked(b.payroll)), 'An interest line in use must remain a cash, non-payroll expense line', 409)
  put(s, 'line', id, { name, type, nonCash: type !== 'revenue' && (b.nonCash === true || b.nonCash === 'on' || b.nonCash === 'true'), payroll: type !== 'revenue' && (b.payroll === true || b.payroll === 'on' || b.payroll === 'true'), order: prior?.order ?? all(s, 'line').length })
  c.activity.push({ action: op, record: id, detail: { name, type } })
  return get(s, 'line', id)
 }
 if (op === 'line-delete') {
  requireFinance(x)
  const l = get(s, 'line', b.id)
  requireThat(!usesLine(s, l.id), 'This line is used by plans or account mappings; move those first', 409)
  remove(s, 'line', l.id)
  c.activity.push({ action: op, record: l.id, detail: { name: l.name } })
  return { removed: l.id }
 }
 if (op === 'pay-detail') {
  requireThat(x.actor.baseRole === 'owner' && !x.actor.token && !x.actor.agent, 'Only the signed-in owner grants Pay detail', 403)
  const member = get(s, 'member', text(b.email, 'Email').toLowerCase())
  requireThat(member.active && member.role !== 'viewer', 'Pay detail requires an active planner', 409)
  requireThat(typeof b.granted === 'boolean', 'Choose whether Pay detail is granted')
  put(s, 'pay-grant', member.email, { granted: b.granted, by: x.actor.email, at: c.now })
  c.activity.push({ action: op, record: member.email, detail: { granted: b.granted } })
  return { email: member.email, granted: b.granted }
 }
 if (op === 'member') {
  requireFinance(x)
  const email = text(b.email, 'Email').toLowerCase()
  requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Enter a valid email address')
  requireThat(email !== x.actor.email, 'You already plan as finance')
  const role = choice(b.role, ['finance', 'contributor', 'viewer'] as const, 'a role')
  const depts: string[] = role === 'contributor' ? (Array.isArray(b.departments) ? b.departments : [b.departments]).filter(Boolean).map((d: unknown) => get(s, 'department', d).id) : []
  requireThat(role !== 'contributor' || depts.length > 0, 'Choose the departments this contributor plans for')
  put(s, 'member', email, { email, name: text(b.name, 'Name'), role, departments: depts, active: b.active !== false && b.active !== 'false' })
  c.activity.push({ action: op, record: email, detail: { role, departments: depts } })
  return get(s, 'member', email)
 }
 if (op === 'account-map') {
  requireFinance(x)
  const account = text(b.account, 'Source account', 100)
  const target = b.target === 'excluded' || b.target === 'cash' ? b.target : get(s, 'line', b.target, 'planning line').id
  put(s, 'account-map', account, { target, name: typeof b.name === 'string' ? b.name.slice(0, 200) : find(s, 'account-map', account)?.name ?? '' })
  c.activity.push({ action: op, record: account, detail: { target } })
  return get(s, 'account-map', account)
 }
 if (op === 'department-map') {
  requireFinance(x)
  const source = typeof b.source === 'string' ? b.source.trim().slice(0, 100) : ''
  const target = b.department ? get(s, 'department', b.department).id : ''
  put(s, 'department-map', source || '(blank)', { department: target })
  c.activity.push({ action: op, record: source || '(blank)', detail: { department: target } })
  return get(s, 'department-map', source || '(blank)')
 }
 return undefined
}

export const planningReady = (c: Context) => { workspace(c.s); return true }
