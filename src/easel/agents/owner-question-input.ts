// Explicit dated native inputs. Source ownership is reviewed, never inferred
// from a name, email address or historical outcome.
import { access, visibleInput } from '../access'
import { contractPeriod } from '../contract-revenue'
import { commissionPosition } from '../commissions'
import type { Context } from '../context'
import { datePeriod, periodForKey } from '../fiscal-calendar'
import { scenarioInputs, workspace } from '../model'
import { addMonths } from '../months'
import { all, get, requireThat, type Data } from '../types'

export const QUESTION_KINDS = ['revenue', 'position', 'expense'] as const
export function questionDate(value: unknown, label: string) {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must be YYYY-MM-DD`)
 const time = Date.parse(`${value}T00:00:00Z`)
 requireThat(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value, `${label} must be a real date`)
 return value
}
export function datedInputs(c: Context, scenario: string) {
 return QUESTION_KINDS.flatMap(kind => scenarioInputs(c.s, scenario, kind).flatMap(input => {
  const field = kind === 'revenue' && input.kind === 'contract' ? 'startDate' : kind === 'position' ? 'plannedStartDate' : kind === 'expense' && input.kind === 'one-off' && input.paymentMethod === 'date' ? 'paymentDate' : ''
  return field && input[field] && visibleInput(c.x, kind, input) ? [{ kind, field, value: input[field], originId: input.originId, name: input.name ?? input.title, department: input.department, ...(input.pipeline?{providerOwner:input.pipeline.member,ownershipSource:`${input.pipeline.provider} deal ${input.pipeline.deal}, CRM owner ${input.pipeline.owner}; finance-reviewed owner map; source assumption ${input.pipeline.assumptionVersion}`} : {}),input }] : []
 }))
}
export function linkedInput(c: Context, q: Data) {
 const input = datedInputs(c, q.scenario).find(r => r.kind === q.inputKind && r.originId === q.originId && r.field === q.field)
 requireThat(input, 'The dated input is no longer available to you', 409)
 return input
}
export async function questionOwner(c: Context, email: string, q: Data) {
 const person = await c.db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active'").bind(email).first<any>()
 if (!person) return false
 const x = access(c.s, { id: person.id, email: person.email, name: person.display_name, baseRole: person.role, version: person.version, session: '' })
 const input = scenarioInputs(c.s, q.scenario, q.inputKind).find(r => r.originId === q.originId)
 return x.role !== 'viewer' && !!input && visibleInput(x, q.inputKind, input)
}
export function changedDate(c: Context, q: Data, input: Data, value: string) {
 const date = questionDate(value, 'Assumption date'), w = workspace(c.s), forecast = get(c.s, 'scenario', q.scenario)
 const period = contractPeriod(input,date,w)
 requireThat(period >= w.planStart && period <= addMonths(w.planStart, (forecast.horizon ?? w.horizon) - 1), 'The answer must be inside the forecast horizon')
 requireThat(!forecast.actualsThrough || period > forecast.actualsThrough, 'An assumption cannot change a closed period', 409)
 const next: Data = { ...input, [q.field]: date }
 if (q.field !== 'paymentDate') {
  next.start = period
  if(input.pipeline)next.pipeline={...input.pipeline,fiscalPeriod:input.pipeline.fiscalPeriods?.find((p:Data)=>p.month===period)??null,collectionPeriod:undefined,dateRevision:undefined,ownerDate:date}
  if(input.commissionPosition)commissionPosition(scenarioInputs(c.s,forecast.id,'position'),next)
  requireThat(!input.end || input.end >= period, 'The answer falls after this input ends')
  if (q.inputKind === 'position') {
   for (const p of all(c.s, 'position').filter(p => p.scenario === forecast.id && p.backfillOrigin === input.originId)) requireThat(period < p.start, 'The answer must stay before the linked backfill')
   const before = all(c.s, 'position').find(p => p.scenario === forecast.id && p.originId === input.backfillOrigin)
   requireThat(!before || before.start < period, 'The backfill must remain after the replaced position')
  }
 }
 // Explicit payment dates retain expense recognition, but cannot precede it.
 if (q.field === 'paymentDate') requireThat(date >= periodForKey(w, input.start).startDate, 'A payment cannot precede its expense')
 return next
}
