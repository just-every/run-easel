import { agentEnabled, requireAgent } from './governance'
// AGENT-001 (constraint watch, cash floor and runway slice): after every
// accepted or undone actuals refresh, month close, promoted proposal and
// change to the agreed constraints, the official working forecast is
// recalculated against the cash floor and runway minimum finance agreed. A
// breach opens one decision item that names the crossing month, the gap and
// the input changes since the last kept forecast (or the approved budget)
// that explain it, each traced to its input; the agent notifies the owner who
// agreed the constraint and changes nothing in the plan.
import { seesPayDetail } from '../access'
import { workingCalculation } from '../calculation'
import { CalculationPending } from '../calculation-status'
import type { Context } from '../context'
import { scenarioInputs } from '../model'
import { monthLabel } from '../months'
import { notify } from '../notify'
import { snapshot } from '../store'
import { all, Fault, find, put, type Data } from '../types'
import { formatHundredths, formatMoney } from '../units'
import { constraints } from './agent-evaluate'
import { workspace } from '../model'

const WATCH = new Set(['actuals-accepted', 'actuals-undone', 'close-month', 'proposal-promoted', 'cash-constraints', 'constraint-check', 'plaid-cash-refreshed', 'department-limit-save', 'department-limit-delete', 'debt-added', 'debt-changed', 'input-deleted','pipeline-refresh'])
export const needsConstraintCheck = (c: Context) => c.activity.some(e => WATCH.has(e.action))
export const CONSTRAINTS = { 'cash-floor': 'Cash floor', runway: 'Runway minimum' } as const
const KINDS = ['revenue', 'position', 'expense', 'schedule', 'debt'] as const
const IGNORED = new Set(['id', 'scenario', 'dimensions', 'revision', 'commissionPosition'])

const scalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
/** Input changes since a reference model: added, removed or edited rows, by origin, without pay detail for readers who may not see it. */
export function sourceChanges(c: Context, reference: Data, current: Data): Data[] {
 const out: Data[] = []
 for (const kind of KINDS) {
  const before = new Map<string, Data>((reference[kind] ?? []).map((r: Data) => [r.originId, r])), now = new Map<string, Data>((current[kind] ?? []).map((r: Data) => [r.originId, r]))
  for (const [origin, row] of now) {
   const prior = before.get(origin), pay = kind === 'position' && !seesPayDetail(c.x, row.department)
   const name = pay ? 'A planned hire' : row.title ?? row.name ?? origin
   if (!prior) { out.push({ kind, origin, name, change: 'added', fields: [] }); continue }
   const fields = Object.keys(row).filter(k => !IGNORED.has(k) && scalar(row[k]) && row[k] !== prior[k]).map(k => ({ field: k, from: pay && /salary|cents|holder|rate/i.test(k) ? null : prior[k], to: pay && /salary|cents|holder|rate/i.test(k) ? null : row[k] }))
   if(row.pipeline && prior.pipeline)for(const field of ['stage','probabilityBps','sourceCloseDate','slippageDays'])if(row.pipeline[field]!==prior.pipeline[field])fields.push({field:`CRM deal ${row.pipeline.deal}: ${field}`,from:prior.pipeline[field],to:row.pipeline[field]})
   if (fields.length) out.push({ kind, origin, name, change: 'changed', fields })
  }
  for (const [origin, row] of before) if (!now.has(origin)) out.push({ kind, origin, name: kind === 'position' && !seesPayDetail(c.x, row.department) ? 'A planned hire' : row.title ?? row.name ?? origin, change: 'removed', fields: [] })
 }
 return out.slice(0, 50)
}

/** A snapshot saved by an earlier request, or one this request is about to save. */
const body = async (c: Context, id: string): Promise<Data> => c.snapshots.find(s => s.id === id)?.body ?? (await snapshot(c.db, id)).body

async function referenceInputs(c: Context, forecast: Data) {
 const kept = forecast.priorForecasts?.at(-1)
 if (kept) return { label: `the forecast kept before closing ${monthLabel(kept.month)}`, inputs: (await body(c, kept.snapshot)).inputs as Data }
 if (forecast.budgetSnapshot) return { label: 'the approved budget', inputs: (await body(c, forecast.budgetSnapshot)).inputs as Data }
 return null
}

/** Opens, refreshes or clears the decision items of the official working forecast. */
export async function watchConstraints(c: Context) {
 if (!agentEnabled(c.s, 'constraints')) return []
 const forecast = all(c.s, 'scenario').find(s => s.kind === 'forecast' && s.status === 'working' && !s.alternativeBudget)
 const agreement = workspace(c.s).cashAgreement
 if (!forecast) return []
 let calc
 try { calc = await workingCalculation(c, forecast.id) } catch (error) { if (error instanceof CalculationPending || error instanceof Fault) return []; throw error }
 const k = constraints(c, calc, forecast)
 const money = (n: number) => formatMoney(n, calc.currency)
 const found: Record<string, Data | null> = { 'cash-floor': k.floorBreach, runway: k.runwayBreach }
 const labels: Record<string, string> = { ...CONSTRAINTS }, owners: Record<string, string> = {}
 for (const row of calc.financing?.covenants ?? []) {
  if (forecast.actualsThrough && row.month <= forecast.actualsThrough) continue
  const type = `covenant:${row.sourceId}:${row.kind}`
  labels[type] = `Covenant ${row.kind}`
  if (!(type in found)) found[type] = null
  if (!found[type] && row.status === 'breach') found[type] = { ...row, gap: row.kind === 'maximum-leverage' ? (row.denominator > 0 ? Number(BigInt(row.numerator) - BigInt(row.threshold) * BigInt(row.denominator) / 10000n) : row.numerator) : row.threshold - row.numerator }
 }
 for (const rule of all(c.s, 'department-limit')) {
  const type = `department:${rule.id}`
  labels[type] = `${getDepartment(rule.department)} budget limit`; owners[type] = rule.owner
  const cells = calc.cells.filter(cell => cell.department === rule.department && cell.month === rule.month && getLine(cell.line).type !== 'revenue')
  const amount = cells.reduce((sum, cell) => sum + cell.amount, 0)
  found[type] = (!forecast.actualsThrough || rule.month > forecast.actualsThrough) && amount > rule.limitCents ? { month: rule.month, amountCents: amount, limitCents: rule.limitCents, gapCents: amount - rule.limitCents, department: rule.department, rows: cells.flatMap(cell => cell.sources.map(row => ({ kind: row.kind, origin: row.id }))) } : null
 }
 // Removed constraints clear their existing items on the next check.
 for (const item of all(c.s, 'decision-item').filter(item => item.forecast === forecast.id)) if (!(item.constraint in found)) found[item.constraint] = null
 function getDepartment(id: string) { return find(c.s, 'department', id)?.name ?? 'Department' }
 function getLine(id: string) { return find(c.s, 'line', id) ?? {} }
 const reference = Object.values(found).some(Boolean) ? await referenceInputs(c, forecast) : null
 const current = { revenue: scenarioInputs(c.s, forecast.id, 'revenue'), position: scenarioInputs(c.s, forecast.id, 'position'), expense: scenarioInputs(c.s, forecast.id, 'expense'), schedule: scenarioInputs(c.s, forecast.id, 'schedule'), debt: scenarioInputs(c.s, forecast.id, 'debt') }
 const opened: string[] = []
 for (const type of Object.keys(found)) {
  const id = `${forecast.id}|${type}`, item = find(c.s, 'decision-item', id), breach = found[type]
  if (!breach) {
   if (item?.status === 'open' || item?.status === 'rejected') {
    put(c.s, 'decision-item', id, { ...item, status: 'cleared', clearedAt: c.now, clearedAtRevision: forecast.revision })
    c.activity.push({ action: 'decision-item-cleared', record: id, detail: { constraint: type } })
   }
   continue
  }
  const notice = type.startsWith('covenant:') ? `${labels[type]} breaks in ${monthLabel(breach.month)}; gap ${breach.gap} cents of ${breach.kind === 'maximum-leverage' ? 'debt above the permitted amount' : 'required minimum'}.`
   : type.startsWith('department:') ? `${labels[type]} breaks in ${monthLabel(breach.month)}; spend ${money(breach.amountCents)}, limit ${money(breach.limitCents)}, ${money(breach.gapCents)} over.`
   : type === 'cash-floor'
   ? `Forecast cash falls below the ${money(breach.floorCents)} floor in ${monthLabel(breach.month)}; lowest ${money(breach.lowestCents)} in ${monthLabel(breach.lowestMonth)}, ${money(breach.gapCents)} short.`
   : `Runway falls to ${breach.runwayHundredths === null ? 'zero (cash exhausted)' : `${formatHundredths(breach.runwayHundredths)} months`} in ${monthLabel(breach.month)}, below the ${formatHundredths(breach.minimumHundredths)}-month minimum.`
  // Financing source traces stay in the authenticated decision item, not outbound mail.
  const summary = breach.trace ? `${notice} ${breach.trace}` : notice
  const causes = reference ? { reference: reference.label, changes: sourceChanges(c, reference.inputs, current) } : { reference: null, changes: [] }
  const open = !item || item.status === 'cleared'
  if (item?.status === 'rejected') { put(c.s, 'decision-item', id, { ...item, breach, summary, causes, forecastRevision: forecast.revision, updatedAt: c.now }); continue }
  put(c.s, 'decision-item', id, { ...(open ? { responses: [] } : item), id, forecast: forecast.id, constraint: type, label: labels[type], status: 'open', month: breach.month, breach, summary, causes, forecastRevision: forecast.revision, owner: owners[type] ?? agreement?.by ?? forecast.createdBy, openedAt: open ? c.now : item!.openedAt, updatedAt: c.now })
  if (open) {
   c.activity.push({ action: 'decision-item-opened', record: id, detail: { constraint: type, month: breach.month, forecastRevision: forecast.revision } })
   notify(c, 'decision-item', [owners[type] ?? agreement?.by ?? forecast.createdBy], { title: `${labels[type]}: ${notice}`, tab: 'review', record: id, department: '' }, { includeActor: true })
   opened.push(id)
  }
 }
 return opened
}

export const decisionItems = (c: Context) => all(c.s, 'decision-item').map(item => c.x.payDetail === true ? item : {
 ...item,
 breach: { ...item.breach, ...(item.breach.rows ? { rows: item.breach.rows.map((row: Data) => ({ kind: row.kind, origin: row.origin })) } : {}) },
 causes: { ...item.causes, changes: (item.causes?.changes ?? []).map((row: Data) => row.kind === 'position' ? { ...row, name: 'A planned hire', fields: row.fields.filter((field: Data) => !/salary|cents|holder|rate/i.test(field.field)) } : row) },
}).sort((a, b) => b.openedAt.localeCompare(a.openedAt))
