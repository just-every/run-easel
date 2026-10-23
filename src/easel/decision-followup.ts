import { agentEnabled, requireAgent } from './agents/governance'
// AGENT-006: published decisions followed through to results. Easel calls no
// model; the follow-up is deterministic. A decision may cite the promoted
// proposal that implemented it, whose promotion captured the forecast just
// before and after. The scheduled run chases each open action's owner before
// it falls due; owners revise or stop actions with a reason; finance approves
// any change to a decision; closed months compare realized results with the
// approved assumption. Published packs never change.
import type { Bindings } from '../auth.server'
import { access, requireFinance, requireMember } from './access'
import { addDays } from './calendar-time'
import { workingCalculation } from './calculation'
import type { Context } from './context'
import type { Calculation, Model } from './engine'
import { headcountView } from './headcount'
import { model, workspace } from './model'
import { canRead, notify } from './notify'
import { deliverNotifications } from './notify-dispatch'
import { load, save } from './store'
import { currentTime } from './time'
import { all, find, get, optionalText, put, requireThat, text, uid, type Actor, type Data, type State } from './types'
import { mulDiv } from './units'

/** Chases start this many company-zone calendar days before the due date. */
export const CHASE_DAYS = 3
const FLOWS = ['payroll', 'revenue', 'headcount', 'capacityHundredths'] as const
const OPS = ['action-revise', 'action-stop', 'decision-change', 'decision-change-decide']

type Metrics = { payroll: number; revenue: number; cash: number | null; headcount: number; capacityHundredths: number | null }

/** Monthly totals compared by follow-up. Payroll is payroll-line cells plus position costs on other lines;
 * capacity is active positions in each services driver's department × its monthly available hours. */
export function monthMetrics(m: Model, calc: Calculation, month: string): Metrics {
 const payrollLines = new Set(m.lines.filter(l => l.payroll).map(l => l.id))
 const payroll = calc.cells.filter(cell => cell.month === month).reduce((n, cell) => n + (payrollLines.has(cell.line) ? cell.amount : cell.sources.filter(src => src.kind === 'position').reduce((v, src) => v + src.amount, 0)), 0)
 const cash = calc.cash.find(x => x.month === month)
 const services = (m.inputs.revenue ?? []).filter(r => r.kind === 'services' && r.start <= month)
 return {
  payroll, revenue: calc.profit.find(p => p.month === month)?.revenue ?? 0,
  cash: cash && !cash.incompleteReasons?.length ? cash.closing : null,
  headcount: Object.values(calc.headcount).reduce((n, byMonth) => n + (byMonth[month] ?? 0), 0),
  capacityHundredths: services.length ? services.reduce((n, r) => n + (calc.headcount[r.department]?.[month] ?? 0) * r.monthlyHours, 0) : null,
 }
}

/** Captured inside promotion: every month whose payroll, revenue, headcount or capacity moved. */
export function promotionEffect(beforeModel: Model, before: Calculation, afterModel: Model, after: Calculation) {
 return { months: after.months.flatMap(month => {
  const b = monthMetrics(beforeModel, before, month), a = monthMetrics(afterModel, after, month)
  return FLOWS.some(k => b[k] !== a[k]) ? [{ month, before: b, approved: a }] : []
 }) }
}

export function linkedProposal(s: State, forecast: string, id: unknown) {
 const p = get(s, 'scenario', id, 'proposal')
 requireThat(p.kind === 'proposal' && p.proposalStatus === 'promoted' && p.promotedInto?.scenario === forecast, 'Link a proposal that was promoted into this forecast', 409)
 requireThat(p.promotedEffect?.months, 'This promotion has no captured forecast effect; link a proposal promoted since follow-up began', 409)
 return p
}

export const citesProposal = (s: State, id: string) => all(s, 'pack').some(p => (p.decisions ?? []).some((d: Data) => d.proposal === id)) || all(s, 'action-followup').some(f => f.proposal === id || (f.changes ?? []).some((ch: Data) => ch.proposal === id))

function current(s: State, pack: Data, decision: Data) {
 const f = find(s, 'action-followup', `${pack.id}|${decision.id}`) ?? {}
 const done = pack.progress?.[decision.id]?.status === 'done'
 return { pack: pack.id, month: pack.month, decision: decision.id, text: f.text ?? decision.text, proposal: f.proposal ?? decision.proposal ?? null, department: decision.department ?? '', owner: decision.owner ?? '', due: f.due ?? decision.due ?? '', status: f.status === 'stopped' ? 'stopped' : done ? 'done' : 'open', chases: f.chases ?? [], history: f.history ?? [], changes: f.changes ?? [] }
}

export async function followup(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!OPS.includes(op)) return undefined
 const { s, x } = c
 requireMember(x)
 const pack = get(s, 'pack', b.pack)
 requireThat(pack.status === 'published', 'Follow-up applies to published decisions; change the draft pack instead', 409)
 const decision = (pack.decisions as Data[]).find(d => d.id === b.decision)
 requireThat(decision, 'Action not found', 404)
 const id = `${pack.id}|${decision.id}`, record = find(s, 'action-followup', id) ?? { pack: pack.id, decision: decision.id, chases: [], history: [], changes: [] }
 const keep = (value: Data, detail: Data) => { put(s, 'action-followup', id, value); c.activity.push({ action: op, record: id, detail }); return current(s, pack, decision) }
 if (op === 'decision-change-decide') {
  requireFinance(x)
  const change = (record.changes as Data[]).find(ch => ch.id === b.change)
  requireThat(change, 'Change not found', 404)
  requireThat(change.status === 'pending', 'This change was already decided', 409)
  requireThat(typeof b.approve === 'boolean', 'Choose whether to approve the change')
  const decided = { ...change, status: b.approve ? 'approved' : 'rejected', decidedBy: x.actor.email, decidedAt: c.now, note: optionalText(b.note, 'Note', 1000) }
  const applied = b.approve ? { ...(change.text ? { text: change.text } : {}), ...(change.proposal ? { proposal: change.proposal } : {}) } : {}
  return keep({ ...record, ...applied, changes: record.changes.map((ch: Data) => ch.id === change.id ? decided : ch), history: [...record.history, { kind: `change-${decided.status}`, change: change.id, by: x.actor.email, at: c.now, reason: decided.note }] }, { change: change.id, status: decided.status })
 }
 const owner = x.actor.email === String(decision.owner ?? '').trim().toLowerCase()
 requireThat(owner || x.role === 'finance', 'Only the action owner or finance can follow up this action', 403)
 const reason = text(b.reason, 'Reason', 1000)
 if (op === 'decision-change') {
  const proposed = optionalText(b.text, 'Decision', 2000), proposal = b.proposal ? linkedProposal(s, pack.forecast, b.proposal).id : ''
  requireThat(proposed || proposal, 'Propose new decision text or a promoted proposal')
  const change = { id: uid(), text: proposed, proposal, reason, by: x.actor.email, at: c.now, status: 'pending' }
  return keep({ ...record, changes: [...record.changes, change], history: [...record.history, { kind: 'change-proposed', change: change.id, by: x.actor.email, at: c.now, reason }] }, { change: change.id })
 }
 const state = current(s, pack, decision)
 requireThat(state.status === 'open', `This action is ${state.status}`, 409)
 if (op === 'action-stop') return keep({ ...record, status: 'stopped', history: [...record.history, { kind: 'stopped', by: x.actor.email, at: c.now, reason }] }, { reason })
 requireThat(typeof b.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due) && addDays(b.due, 0) === b.due, 'Due date is a calendar date (YYYY-MM-DD)')
 return keep({ ...record, due: b.due, history: [...record.history, { kind: 'revised', from: state.due, to: b.due, by: x.actor.email, at: c.now, reason }] }, { from: state.due, to: b.due })
}

/** One chase per open action and due date, from CHASE_DAYS company-zone days before it until the day before. */
export async function planChases(c: Context) {
 if (!agentEnabled(c.s, 'chases')) return []
 const zone = workspace(c.s).timeZone ?? 'America/New_York'
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(c.now))
 const ids: string[] = []
 for (const pack of all(c.s, 'pack').filter(p => p.status === 'published')) for (const decision of pack.decisions as Data[]) {
  const f = current(c.s, pack, decision), owner = String(f.owner).trim().toLowerCase()
  if (f.status !== 'open' || !f.due || today < addDays(f.due, -CHASE_DAYS) || today >= f.due || f.chases.some((ch: Data) => ch.due === f.due)) continue
  if (!owner.includes('@') || !(await canRead(c, owner, f.department))) continue
  const sent = notify(c, 'action-chase', [owner], { title: `${f.text.slice(0, 160)} (due ${f.due})`, tab: 'review', record: pack.id, department: f.department })
  const id = `${pack.id}|${decision.id}`, record = find(c.s, 'action-followup', id) ?? { pack: pack.id, decision: decision.id, chases: [], history: [], changes: [] }
  put(c.s, 'action-followup', id, { ...record, chases: [...record.chases, { due: f.due, at: c.now, recipient: owner, notification: sent[0], zone }] })
  c.activity.push({ action: 'action-chased', record: id, detail: { agent: 'Action chases', person: c.x.actor.scheduler?.email ?? c.x.actor.email, due: f.due, recipient: owner, zone } })
  ids.push(...sent)
 }
 return ids
}

/** The cron entry point: acts for the first still-active owner/admin who published a pack. */
export async function runActionChases(env: Bindings) {
 const db = env.DB, { state } = await load(db)
 const publishers = [...new Set(all(state, 'pack').filter(p => p.status === 'published').map(p => p.publishedBy))]
 let operator: any = null
 for (const email of publishers) if (!operator) operator = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(email).first<any>()
 if (!operator) return { queued: 0 }
 const actor: Actor = { id: operator.id, email: 'scheduler:actions', name: operator.display_name, session: '', version: operator.version, baseRole: operator.role, scheduler: { operator: operator.id, email: operator.email } }
 const open = async () => { const { state, revision } = await load(db); return { s: state, before: new Map(state), revision, x: access(state, actor), db, activity: [], snapshots: [], now: await currentTime(env) } as Context & { revision: number; before: State } }
 const commit = async (ctx: Context & { revision: number; before: State }) => {
  const changed = [...ctx.s].filter(([k, r]) => ctx.before.get(k)?.revision !== r.revision).map(([, r]) => r.kind)
  requireThat(changed.every(k => ['action-followup', 'notification'].includes(k)) && [...ctx.before.keys()].every(k => ctx.s.has(k)), 'The scheduler only records action chases', 500)
  if (changed.length || ctx.activity.length) await save(db, actor, ctx.before, ctx.s, ctx.revision, ctx.activity)
 }
 const c = await open(), ids = await planChases(c)
 await commit(c)
 await deliverNotifications(ids, env, open, commit)
 return { queued: ids.length }
}

/** Realized headcount comes only from reviewed roster files (PEOPLE-006); otherwise it is unavailable. */
async function rosterHeadcount(c: Context, scenario: string) {
 const months = new Map<string, number | null>()
 for (const row of (await headcountView(c, scenario)).months) {
  const prior = months.has(row.month) ? months.get(row.month)! : 0
  months.set(row.month, prior === null || row.actualHeadcount === null ? null : prior + row.actualHeadcount)
 }
 return months
}

/** Realized capacity comes only from accepted Gauge available time on every services driver (REV-003). */
function gaugeCapacity(m: Model, month: string) {
 const services = (m.inputs.revenue ?? []).filter(r => r.kind === 'services' && r.start <= month)
 if (!services.length || services.some(r => !r.gaugeActuals?.[month])) return null
 return services.reduce((n, r) => n + mulDiv(r.gaugeActuals[month].source.availableSeconds, 100, 3600), 0)
}

async function outcome(c: Context, proposalId: string) {
 const p = find(c.s, 'scenario', proposalId)
 if (!p?.promotedEffect?.months) return { unavailable: 'The linked promotion has no captured forecast effect' }
 const forecast = get(c.s, 'scenario', p.promotedInto.scenario), through: string | null = forecast.actualsThrough ?? null
 const closed = (month: string) => through !== null && month <= through
 const realized = new Map<string, Data>()
 if (p.promotedEffect.months.some((e: Data) => closed(e.month))) {
  const m = model(c.s, forecast.id), calc = await workingCalculation(c, forecast.id), roster = await rosterHeadcount(c, forecast.id)
  for (const e of p.promotedEffect.months.filter((e: Data) => closed(e.month))) realized.set(e.month, { ...monthMetrics(m, calc, e.month), headcount: roster.get(e.month) ?? null, capacityHundredths: gaugeCapacity(m, e.month) })
 }
 const months = p.promotedEffect.months.map((e: Data) => ({ ...e, closed: closed(e.month), realized: realized.get(e.month) ?? null }))
 const change = (key: 'payroll' | 'revenue') => {
  const moved = months.filter((e: Data) => e.before[key] !== e.approved[key]), done = moved.filter((e: Data) => e.closed)
  const sum = (rows: Data[], f: (e: Data) => number) => rows.reduce((n, e) => n + f(e), 0)
  const approvedThroughClose = sum(done, e => e.approved[key] - e.before[key]), real = done.length ? sum(done, e => e.realized[key] - e.before[key]) : null
  return { months: moved.map((e: Data) => e.month), approved: sum(moved, e => e.approved[key] - e.before[key]), approvedThroughClose, realized: real, difference: real === null ? null : real - approvedThroughClose, complete: moved.length > 0 && done.length === moved.length }
 }
 const payroll = change('payroll')
 return {
  proposal: { id: p.id, name: p.name, request: p.request, revision: p.revision, promotedAt: p.promotedAt, promotedInto: p.promotedInto }, forecast: forecast.id, actualsThrough: through, months,
  payrollSaving: { months: payroll.months, approved: -payroll.approved, approvedThroughClose: -payroll.approvedThroughClose, realized: payroll.realized === null ? null : -payroll.realized, difference: payroll.difference === null ? null : -payroll.difference, complete: payroll.complete },
  revenueChange: change('revenue'),
  basis: 'Approved values are the forecast as promoted; before values are the forecast just before promotion; realized values are closed-month accepted actuals, reviewed roster-file headcount and accepted Gauge available hours, otherwise unavailable.',
 }
}

/** Every published decision with its follow-up and, when it cites a promotion, approved against realized results. */
export async function decisionFollowups(c: Context) {
 requireMember(c.x)
 const decisions = []
 for (const pack of all(c.s, 'pack').filter(p => p.status === 'published').sort((a, b) => a.month.localeCompare(b.month))) for (const decision of pack.decisions as Data[]) {
  const f = current(c.s, pack, decision)
  decisions.push({ ...f, outcome: f.proposal ? await outcome(c, f.proposal) : null })
 }
 return { chaseDays: CHASE_DAYS, decisions }
}
