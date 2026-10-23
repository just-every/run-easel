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

const WATCH = new Set(['actuals-accepted', 'actuals-undone', 'close-month', 'proposal-promoted', 'cash-constraints', 'constraint-check', 'plaid-cash-refreshed'])
export const needsConstraintCheck = (c: Context) => c.activity.some(e => WATCH.has(e.action))
export const CONSTRAINTS = { 'cash-floor': 'Cash floor', runway: 'Runway minimum' } as const
const KINDS = ['revenue', 'position', 'expense', 'schedule'] as const
const IGNORED = new Set(['id', 'scenario', 'dimensions', 'revision'])

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
 if (!forecast || !agreement) return []
 let calc
 try { calc = await workingCalculation(c, forecast.id) } catch (error) { if (error instanceof CalculationPending || error instanceof Fault) return []; throw error }
 const k = constraints(c, calc, forecast)
 const money = (n: number) => formatMoney(n, calc.currency)
 const found: Record<string, Data | null> = { 'cash-floor': k.floorBreach, runway: k.runwayBreach }
 const reference = (k.floorBreach || k.runwayBreach) ? await referenceInputs(c, forecast) : null
 const current = { revenue: scenarioInputs(c.s, forecast.id, 'revenue'), position: scenarioInputs(c.s, forecast.id, 'position'), expense: scenarioInputs(c.s, forecast.id, 'expense'), schedule: scenarioInputs(c.s, forecast.id, 'schedule') }
 const opened: string[] = []
 for (const type of Object.keys(CONSTRAINTS) as (keyof typeof CONSTRAINTS)[]) {
  const id = `${forecast.id}|${type}`, item = find(c.s, 'decision-item', id), breach = found[type]
  if (!breach) {
   if (item?.status === 'open' || item?.status === 'rejected') {
    put(c.s, 'decision-item', id, { ...item, status: 'cleared', clearedAt: c.now, clearedAtRevision: forecast.revision })
    c.activity.push({ action: 'decision-item-cleared', record: id, detail: { constraint: type } })
   }
   continue
  }
  const summary = type === 'cash-floor'
   ? `Forecast cash falls below the ${money(breach.floorCents)} floor in ${monthLabel(breach.month)}; lowest ${money(breach.lowestCents)} in ${monthLabel(breach.lowestMonth)}, ${money(breach.gapCents)} short.`
   : `Runway falls to ${breach.runwayHundredths === null ? 'zero (cash exhausted)' : `${formatHundredths(breach.runwayHundredths)} months`} in ${monthLabel(breach.month)}, below the ${formatHundredths(breach.minimumHundredths)}-month minimum.`
  const causes = reference ? { reference: reference.label, changes: sourceChanges(c, reference.inputs, current) } : { reference: null, changes: [] }
  const open = !item || item.status === 'cleared'
  if (item?.status === 'rejected') { put(c.s, 'decision-item', id, { ...item, breach, summary, causes, forecastRevision: forecast.revision, updatedAt: c.now }); continue }
  put(c.s, 'decision-item', id, { ...(open ? { responses: [] } : item), id, forecast: forecast.id, constraint: type, status: 'open', month: breach.month, breach, summary, causes, forecastRevision: forecast.revision, owner: agreement.by, openedAt: open ? c.now : item!.openedAt, updatedAt: c.now })
  if (open) {
   c.activity.push({ action: 'decision-item-opened', record: id, detail: { constraint: type, month: breach.month, forecastRevision: forecast.revision } })
   notify(c, 'decision-item', [agreement.by], { title: `${CONSTRAINTS[type]}: ${summary}`, tab: 'review', record: id, department: '' }, { includeActor: true })
   opened.push(id)
  }
 }
 return opened
}

export const decisionItems = (c: Context) => all(c.s, 'decision-item').sort((a, b) => b.openedAt.localeCompare(a.openedAt))
